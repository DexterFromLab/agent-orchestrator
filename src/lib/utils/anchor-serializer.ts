// Anchor Serializer — converts agent messages into observation-masked anchor text
// Observation masking: preserve user prompts + assistant reasoning, compact tool results

import type { AgentMessage, TextContent, ToolCallContent, ToolResultContent } from '../adapters/claude-messages';

/** Estimate token count from text (~4 chars per token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** A turn group: one user prompt + assistant response + tool interactions */
export interface TurnGroup {
  index: number;
  userPrompt: string;
  assistantText: string;
  toolSummaries: string[];
  estimatedTokens: number;
}

/**
 * Group messages into turns. A new turn starts at each 'cost' event boundary
 * or at session start. The first turn includes messages from init to the first cost event.
 */
export function groupMessagesIntoTurns(messages: AgentMessage[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  let currentTurn: { userPrompt: string; assistantText: string; toolSummaries: string[]; messages: AgentMessage[] } = {
    userPrompt: '',
    assistantText: '',
    toolSummaries: [],
    messages: [],
  };
  let turnIndex = 0;

  // Build a map of toolUseId -> tool_result for compact summaries
  const toolResults = new Map<string, AgentMessage>();
  for (const msg of messages) {
    if (msg.type === 'tool_result') {
      const tr = msg.content as ToolResultContent;
      toolResults.set(tr.toolUseId, msg);
    }
  }

  for (const msg of messages) {
    switch (msg.type) {
      case 'text': {
        const text = (msg.content as TextContent).text;
        currentTurn.assistantText += (currentTurn.assistantText ? '\n' : '') + text;
        break;
      }
      case 'tool_call': {
        const tc = msg.content as ToolCallContent;
        const result = toolResults.get(tc.toolUseId);
        const summary = compactToolSummary(tc, result);
        currentTurn.toolSummaries.push(summary);
        break;
      }
      case 'cost': {
        // End of turn — finalize and start new one
        if (currentTurn.assistantText || currentTurn.toolSummaries.length > 0) {
          const serialized = serializeTurn(turnIndex, currentTurn);
          turns.push({
            index: turnIndex,
            userPrompt: currentTurn.userPrompt,
            assistantText: currentTurn.assistantText,
            toolSummaries: currentTurn.toolSummaries,
            estimatedTokens: estimateTokens(serialized),
          });
          turnIndex++;
        }
        currentTurn = { userPrompt: '', assistantText: '', toolSummaries: [], messages: [] };
        break;
      }
      // Skip init, thinking, compaction, status, etc.
    }
  }

  // Finalize last turn if it has content (session may not have ended with cost)
  if (currentTurn.assistantText || currentTurn.toolSummaries.length > 0) {
    const serialized = serializeTurn(turnIndex, currentTurn);
    turns.push({
      index: turnIndex,
      userPrompt: currentTurn.userPrompt,
      assistantText: currentTurn.assistantText,
      toolSummaries: currentTurn.toolSummaries,
      estimatedTokens: estimateTokens(serialized),
    });
  }

  return turns;
}

/** Compact a tool_call + optional tool_result into a short summary */
function compactToolSummary(tc: ToolCallContent, result?: AgentMessage): string {
  const name = tc.name;
  const input = tc.input as Record<string, unknown> | undefined;

  // Extract key info based on tool type
  let detail = '';
  if (input) {
    if (name === 'Read' || name === 'read_file') {
      detail = ` ${input.file_path ?? input.path ?? ''}`;
    } else if (name === 'Write' || name === 'write_file') {
      const path = input.file_path ?? input.path ?? '';
      const content = typeof input.content === 'string' ? input.content : '';
      detail = ` ${path} → ${content.split('\n').length} lines`;
    } else if (name === 'Edit' || name === 'edit_file') {
      detail = ` ${input.file_path ?? input.path ?? ''}`;
    } else if (name === 'Bash' || name === 'execute_bash') {
      const cmd = typeof input.command === 'string' ? input.command.slice(0, 80) : '';
      detail = ` \`${cmd}\``;
    } else if (name === 'Glob' || name === 'Grep') {
      const pattern = input.pattern ?? '';
      detail = ` ${pattern}`;
    }
  }

  // Add compact result indicator
  let resultNote = '';
  if (result) {
    const output = result.content as ToolResultContent;
    const outStr = typeof output.output === 'string' ? output.output : JSON.stringify(output.output ?? '');
    const lineCount = outStr.split('\n').length;
    resultNote = ` → ${lineCount} lines`;
  }

  return `[${name}${detail}${resultNote}]`;
}

/** Serialize a single turn to observation-masked text */
function serializeTurn(
  index: number,
  turn: { userPrompt: string; assistantText: string; toolSummaries: string[] },
): string {
  const parts: string[] = [];

  if (turn.userPrompt) {
    parts.push(`[Turn ${index + 1}] User: "${turn.userPrompt}"`);
  }
  if (turn.assistantText) {
    // Preserve assistant reasoning in full — research consensus (JetBrains NeurIPS 2025,
    // SWE-agent, OpenDev ACC) is that agent reasoning must never be truncated;
    // only tool outputs (observations) get masked
    parts.push(`[Turn ${index + 1}] Assistant: "${turn.assistantText}"`);
  }
  if (turn.toolSummaries.length > 0) {
    parts.push(`[Turn ${index + 1}] Tools: ${turn.toolSummaries.join(' ')}`);
  }

  return parts.join('\n');
}

/**
 * Serialize turns into anchor text for system prompt re-injection.
 * Respects token budget — stops adding turns when budget would be exceeded.
 */
export function serializeAnchorsForInjection(
  turns: TurnGroup[],
  tokenBudget: number,
  projectName?: string,
): string {
  const header = `<session-anchors${projectName ? ` project="${projectName}"` : ''}>`;
  const footer = '</session-anchors>';
  const headerTokens = estimateTokens(header + '\n' + footer);

  let remaining = tokenBudget - headerTokens;
  const lines: string[] = [header];
  lines.push('Key decisions and context from earlier in this project:');
  lines.push('');

  for (const turn of turns) {
    const text = serializeTurn(turn.index, turn);
    const tokens = estimateTokens(text);
    if (tokens > remaining) break;
    lines.push(text);
    lines.push('');
    remaining -= tokens;
  }

  lines.push(footer);
  return lines.join('\n');
}

/**
 * Select turns for auto-anchoring on first compaction.
 * Takes first N turns up to token budget, using the session's original prompt as turn 0 user prompt.
 */
export function selectAutoAnchors(
  messages: AgentMessage[],
  sessionPrompt: string,
  maxTurns: number,
  tokenBudget: number,
): { turns: TurnGroup[]; totalTokens: number } {
  const allTurns = groupMessagesIntoTurns(messages);

  // Inject session prompt as user prompt for turn 0
  if (allTurns.length > 0 && !allTurns[0].userPrompt) {
    allTurns[0].userPrompt = sessionPrompt;
  }

  const selected: TurnGroup[] = [];
  let totalTokens = 0;

  for (const turn of allTurns) {
    if (selected.length >= maxTurns) break;
    if (totalTokens + turn.estimatedTokens > tokenBudget) break;
    selected.push(turn);
    totalTokens += turn.estimatedTokens;
  }

  return { turns: selected, totalTokens };
}
