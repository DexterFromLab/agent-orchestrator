// LLM Judge — evaluates test outcomes via Claude.
//
// Two backends, configurable via LLM_JUDGE_BACKEND env var:
//   "cli"  — Claude CLI (default, no API key needed)
//   "api"  — Anthropic REST API (requires ANTHROPIC_API_KEY)
//
// CLI backend: spawns `claude` with --output-format text, parses JSON verdict.
// API backend: raw fetch to messages API, same JSON verdict parsing.
//
// Skips gracefully when neither backend is available.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 512;

// CLI search paths (in order)
const CLI_PATHS = [
  `${process.env.HOME}/.local/bin/claude`,
  `${process.env.HOME}/.claude/local/claude`,
  '/usr/local/bin/claude',
  '/usr/bin/claude',
];

export type JudgeBackend = 'cli' | 'api';

export interface JudgeVerdict {
  pass: boolean;
  reasoning: string;
  confidence: number; // 0-1
}

/**
 * Find the Claude CLI binary path, or null if not installed.
 */
function findClaudeCli(): string | null {
  for (const p of CLI_PATHS) {
    if (existsSync(p)) return p;
  }
  // Fallback: check PATH
  try {
    const which = execSync('which claude 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (which) return which;
  } catch {
    // not found
  }
  return null;
}

/**
 * Determine which backend to use.
 * Env var LLM_JUDGE_BACKEND overrides auto-detection.
 * Auto: CLI if available, then API if key set, else null.
 */
function resolveBackend(): JudgeBackend | null {
  const explicit = process.env.LLM_JUDGE_BACKEND?.toLowerCase();
  if (explicit === 'cli') return findClaudeCli() ? 'cli' : null;
  if (explicit === 'api') return process.env.ANTHROPIC_API_KEY ? 'api' : null;

  // Auto-detect: CLI first, API fallback
  if (findClaudeCli()) return 'cli';
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  return null;
}

/**
 * Check if the LLM judge is available (CLI installed or API key set).
 */
export function isJudgeAvailable(): boolean {
  return resolveBackend() !== null;
}

/**
 * Build the prompt for the judge.
 */
function buildPrompt(criteria: string, actual: string, context?: string): { system: string; user: string } {
  const system = `You are a test assertion judge for a terminal emulator application called BTerminal.
Your job is to evaluate whether actual output from the application meets the given criteria.
Respond with EXACTLY this JSON format, nothing else:
{"pass": true/false, "reasoning": "brief explanation", "confidence": 0.0-1.0}`;

  const user = [
    '## Criteria',
    criteria,
    '',
    '## Actual Output',
    actual,
    ...(context ? ['', '## Additional Context', context] : []),
    '',
    'Does the actual output satisfy the criteria? Respond with JSON only.',
  ].join('\n');

  return { system, user };
}

/**
 * Extract and validate a JudgeVerdict from raw text output.
 */
function parseVerdict(text: string): JudgeVerdict {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM judge returned non-JSON: ${text}`);
  }

  const verdict = JSON.parse(jsonMatch[0]) as JudgeVerdict;

  if (typeof verdict.pass !== 'boolean') {
    throw new Error(`LLM judge returned invalid verdict: ${text}`);
  }
  verdict.confidence = Number(verdict.confidence) || 0;
  verdict.reasoning = String(verdict.reasoning || '');

  return verdict;
}

/**
 * Judge via Claude CLI (spawns subprocess).
 * Unsets CLAUDECODE to avoid nested session errors.
 */
async function judgeCli(
  criteria: string,
  actual: string,
  context?: string,
): Promise<JudgeVerdict> {
  const cliPath = findClaudeCli();
  if (!cliPath) throw new Error('Claude CLI not found');

  const { system, user } = buildPrompt(criteria, actual, context);

  const output = execFileSync(cliPath, [
    '-p', user,
    '--model', MODEL,
    '--output-format', 'text',
    '--system-prompt', system,
    '--setting-sources', 'user',   // skip project CLAUDE.md
  ], {
    encoding: 'utf-8',
    timeout: 60_000,
    cwd: '/tmp',                   // avoid loading project CLAUDE.md
    env: { ...process.env, CLAUDECODE: '' },
    maxBuffer: 1024 * 1024,
  });

  return parseVerdict(output);
}

/**
 * Judge via Anthropic REST API (raw fetch).
 */
async function judgeApi(
  criteria: string,
  actual: string,
  context?: string,
): Promise<JudgeVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const { system, user } = buildPrompt(criteria, actual, context);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';

  return parseVerdict(text);
}

/**
 * Ask Claude to evaluate whether `actual` output satisfies `criteria`.
 *
 * Uses CLI backend by default, falls back to API. Override with
 * LLM_JUDGE_BACKEND env var ("cli" or "api").
 *
 * Returns a structured verdict with pass/fail, reasoning, and confidence.
 * Throws if no backend available or call fails.
 */
export async function judge(
  criteria: string,
  actual: string,
  context?: string,
): Promise<JudgeVerdict> {
  const backend = resolveBackend();
  if (!backend) {
    throw new Error('LLM judge unavailable — no Claude CLI found and ANTHROPIC_API_KEY not set');
  }

  if (backend === 'cli') {
    return judgeCli(criteria, actual, context);
  }
  return judgeApi(criteria, actual, context);
}

/**
 * Convenience: judge with a minimum confidence threshold.
 * Returns pass=true only if verdict.pass=true AND confidence >= threshold.
 */
export async function assertWithJudge(
  criteria: string,
  actual: string,
  options: { context?: string; minConfidence?: number } = {},
): Promise<JudgeVerdict> {
  const { context, minConfidence = 0.7 } = options;
  const verdict = await judge(criteria, actual, context);

  if (verdict.pass && verdict.confidence < minConfidence) {
    verdict.pass = false;
    verdict.reasoning += ` (confidence ${verdict.confidence} below threshold ${minConfidence})`;
  }

  return verdict;
}
