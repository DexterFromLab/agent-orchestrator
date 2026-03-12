// LLM Judge — evaluates test outcomes via Claude API
// Uses raw fetch (no SDK dep). Requires ANTHROPIC_API_KEY env var.
// Skips gracefully when API key is absent.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // Fast + cheap for test judging
const MAX_TOKENS = 512;

export interface JudgeVerdict {
  pass: boolean;
  reasoning: string;
  confidence: number; // 0-1
}

/**
 * Check if the LLM judge is available (API key set).
 */
export function isJudgeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Ask Claude to evaluate whether `actual` output satisfies `criteria`.
 *
 * Returns a structured verdict with pass/fail, reasoning, and confidence.
 * Throws if API call fails (caller should catch and handle).
 */
export async function judge(
  criteria: string,
  actual: string,
  context?: string,
): Promise<JudgeVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — LLM judge unavailable');
  }

  const systemPrompt = `You are a test assertion judge for a terminal emulator application called BTerminal.
Your job is to evaluate whether actual output from the application meets the given criteria.
Respond with EXACTLY this JSON format, nothing else:
{"pass": true/false, "reasoning": "brief explanation", "confidence": 0.0-1.0}`;

  const userPrompt = [
    '## Criteria',
    criteria,
    '',
    '## Actual Output',
    actual,
    ...(context ? ['', '## Additional Context', context] : []),
    '',
    'Does the actual output satisfy the criteria? Respond with JSON only.',
  ].join('\n');

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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';

  // Extract JSON from response (may have markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM judge returned non-JSON: ${text}`);
  }

  const verdict = JSON.parse(jsonMatch[0]) as JudgeVerdict;

  // Validate structure
  if (typeof verdict.pass !== 'boolean') {
    throw new Error(`LLM judge returned invalid verdict: ${text}`);
  }
  verdict.confidence = Number(verdict.confidence) || 0;
  verdict.reasoning = String(verdict.reasoning || '');

  return verdict;
}

/**
 * Convenience: judge with a minimum confidence threshold.
 * Returns true only if pass=true AND confidence >= threshold.
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
