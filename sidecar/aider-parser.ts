// aider-parser.ts — Pure parsing functions extracted from aider-runner.ts
// Exported for unit testing. aider-runner.ts imports from here.

import { execSync } from 'child_process';

// --- Types ---

export interface TurnBlock {
  type: 'thinking' | 'text' | 'shell' | 'cost';
  content: string;
}

// --- Constants ---

// Prompt detection: Aider with --no-pretty --no-fancy-input shows prompts like:
//   >  or  aider>  or  repo-name>
export const PROMPT_RE = /^[a-zA-Z0-9._-]*> $/;

// Lines to suppress from UI (aider startup noise)
export const SUPPRESS_RE = [
  /^Aider v\d/,
  /^Main model:/,
  /^Weak model:/,
  /^Git repo:/,
  /^Repo-map:/,
  /^Use \/help/,
];

// Known shell command patterns — commands from btmsg/bttask/common tools
export const SHELL_CMD_RE = /^(btmsg |bttask |cat |ls |find |grep |mkdir |cd |cp |mv |rm |pip |npm |git |curl |wget |python |node |bash |sh )/;

// --- Pure parsing functions ---

/**
 * Detects whether the last non-empty line of a buffer looks like an Aider prompt.
 * Aider with --no-pretty --no-fancy-input shows prompts like: `> `, `aider> `, `repo-name> `
 */
export function looksLikePrompt(buffer: string): boolean {
  const lines = buffer.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.trim() === '') continue;
    return PROMPT_RE.test(l);
  }
  return false;
}

/**
 * Returns true for lines that should be suppressed from the UI output.
 * Covers Aider startup noise and empty lines.
 */
export function shouldSuppress(line: string): boolean {
  const t = line.trim();
  return t === '' || SUPPRESS_RE.some(p => p.test(t));
}

/**
 * Parses complete Aider turn output into structured blocks.
 * Handles thinking sections, text, shell commands extracted from code blocks
 * or inline, cost lines, and suppresses startup noise.
 */
export function parseTurnOutput(buffer: string): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  const lines = buffer.split('\n');

  let thinkingLines: string[] = [];
  let answerLines: string[] = [];
  let inThinking = false;
  let inAnswer = false;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    const t = line.trim();

    // Skip suppressed lines
    if (shouldSuppress(line) && !inCodeBlock) continue;

    // Prompt markers — skip
    if (PROMPT_RE.test(t)) continue;

    // Thinking block markers (handle various unicode arrows and spacing)
    if (/^[►▶⯈❯>]\s*THINKING$/i.test(t)) {
      inThinking = true;
      inAnswer = false;
      continue;
    }
    if (/^[►▶⯈❯>]\s*ANSWER$/i.test(t)) {
      if (thinkingLines.length > 0) {
        blocks.push({ type: 'thinking', content: thinkingLines.join('\n') });
        thinkingLines = [];
      }
      inThinking = false;
      inAnswer = true;
      continue;
    }

    // Code block detection (```bash, ```shell, ```)
    if (t.startsWith('```') && !inCodeBlock) {
      inCodeBlock = true;
      codeBlockLang = t.slice(3).trim().toLowerCase();
      codeBlockLines = [];
      continue;
    }
    if (t === '```' && inCodeBlock) {
      inCodeBlock = false;
      // If this was a bash/shell code block, extract commands
      if (['bash', 'shell', 'sh', ''].includes(codeBlockLang)) {
        for (const cmdLine of codeBlockLines) {
          const cmd = cmdLine.trim().replace(/^\$ /, '');
          if (cmd && SHELL_CMD_RE.test(cmd)) {
            if (answerLines.length > 0) {
              blocks.push({ type: 'text', content: answerLines.join('\n') });
              answerLines = [];
            }
            blocks.push({ type: 'shell', content: cmd });
          }
        }
      }
      codeBlockLines = [];
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Cost line
    if (/^Tokens: .+Cost:/.test(t)) {
      blocks.push({ type: 'cost', content: t });
      continue;
    }

    // Shell command ($ prefix or Running prefix)
    if (t.startsWith('$ ') || t.startsWith('Running ')) {
      if (answerLines.length > 0) {
        blocks.push({ type: 'text', content: answerLines.join('\n') });
        answerLines = [];
      }
      blocks.push({ type: 'shell', content: t.replace(/^(Running |\$ )/, '') });
      continue;
    }

    // Detect bare btmsg/bttask commands in answer text
    if (inAnswer && SHELL_CMD_RE.test(t) && !t.includes('`') && !t.startsWith('#')) {
      if (answerLines.length > 0) {
        blocks.push({ type: 'text', content: answerLines.join('\n') });
        answerLines = [];
      }
      blocks.push({ type: 'shell', content: t });
      continue;
    }

    // Aider's "Applied edit" / flake8 output — suppress from answer text
    if (/^Applied edit to |^Fix any errors|^Running: /.test(t)) continue;

    // Accumulate into thinking or answer
    if (inThinking) {
      thinkingLines.push(line);
    } else {
      answerLines.push(line);
    }
  }

  // Flush remaining
  if (thinkingLines.length > 0) {
    blocks.push({ type: 'thinking', content: thinkingLines.join('\n') });
  }
  if (answerLines.length > 0) {
    blocks.push({ type: 'text', content: answerLines.join('\n').trim() });
  }

  return blocks;
}

/**
 * Extracts session cost from a raw turn buffer.
 * Returns 0 when no cost line is present.
 */
export function extractSessionCost(buffer: string): number {
  const match = buffer.match(/Cost: \$([0-9.]+) message, \$([0-9.]+) session/);
  return match ? parseFloat(match[2]) : 0;
}

// --- I/O helpers (require real child_process; mock in tests) ---

function log(message: string) {
  process.stderr.write(`[aider-parser] ${message}\n`);
}

/**
 * Runs a CLI command and returns its trimmed stdout, or null on failure/empty.
 */
export function runCmd(cmd: string, env: Record<string, string>, cwd: string): string | null {
  try {
    const result = execSync(cmd, { env, cwd, timeout: 5000, encoding: 'utf-8' }).trim();
    log(`[prefetch] ${cmd} → ${result.length} chars`);
    return result || null;
  } catch (e: unknown) {
    log(`[prefetch] ${cmd} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Pre-fetches btmsg inbox and bttask board context.
 * Returns formatted markdown with both sections.
 */
export function prefetchContext(env: Record<string, string>, cwd: string): string {
  log(`[prefetch] BTMSG_AGENT_ID=${env.BTMSG_AGENT_ID ?? 'NOT SET'}, cwd=${cwd}`);
  const parts: string[] = [];

  const inbox = runCmd('btmsg inbox', env, cwd);
  if (inbox) {
    parts.push(`## Your Inbox\n\`\`\`\n${inbox}\n\`\`\``);
  } else {
    parts.push('## Your Inbox\nNo messages (or btmsg unavailable).');
  }

  const board = runCmd('bttask board', env, cwd);
  if (board) {
    parts.push(`## Task Board\n\`\`\`\n${board}\n\`\`\``);
  } else {
    parts.push('## Task Board\nNo tasks (or bttask unavailable).');
  }

  return parts.join('\n\n');
}

/**
 * Executes a shell command and returns stdout + exit code.
 * On failure, returns stderr/error message with a non-zero exit code.
 */
export function execShell(cmd: string, env: Record<string, string>, cwd: string): { stdout: string; exitCode: number } {
  try {
    const result = execSync(cmd, { env, cwd, timeout: 30000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout: result.trim(), exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { stdout: (err.stdout ?? err.stderr ?? String(e)).trim(), exitCode: err.status ?? 1 };
  }
}
