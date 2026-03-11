// Tests for anchor-serializer.ts — turn grouping, observation masking, token budgets

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  groupMessagesIntoTurns,
  selectAutoAnchors,
  serializeAnchorsForInjection,
} from './anchor-serializer';
import type { AgentMessage } from '../adapters/claude-messages';

function msg(type: AgentMessage['type'], content: unknown, id?: string): AgentMessage {
  return {
    id: id ?? crypto.randomUUID(),
    type,
    content,
    timestamp: Date.now(),
  };
}

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up', () => {
    expect(estimateTokens('ab')).toBe(1); // ceil(2/4) = 1
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
  });
});

describe('groupMessagesIntoTurns', () => {
  it('returns empty for no messages', () => {
    expect(groupMessagesIntoTurns([])).toEqual([]);
  });

  it('groups text + tool_call + tool_result + cost into one turn', () => {
    const messages: AgentMessage[] = [
      msg('text', { text: 'I will help you.' }),
      msg('tool_call', { toolUseId: 'tc1', name: 'Read', input: { file_path: '/foo.ts' } }),
      msg('tool_result', { toolUseId: 'tc1', output: 'file content here' }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].index).toBe(0);
    expect(turns[0].assistantText).toBe('I will help you.');
    expect(turns[0].toolSummaries).toHaveLength(1);
    expect(turns[0].toolSummaries[0]).toContain('[Read');
    expect(turns[0].toolSummaries[0]).toContain('/foo.ts');
  });

  it('splits turns on cost events', () => {
    const messages: AgentMessage[] = [
      msg('text', { text: 'First response' }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
      msg('text', { text: 'Second response' }),
      msg('cost', { totalCostUsd: 0.02, durationMs: 200, inputTokens: 200, outputTokens: 100, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0].assistantText).toBe('First response');
    expect(turns[1].assistantText).toBe('Second response');
    expect(turns[0].index).toBe(0);
    expect(turns[1].index).toBe(1);
  });

  it('handles session without final cost event', () => {
    const messages: AgentMessage[] = [
      msg('text', { text: 'Working on it...' }),
      msg('tool_call', { toolUseId: 'tc1', name: 'Bash', input: { command: 'npm test' } }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toBe('Working on it...');
    expect(turns[0].toolSummaries[0]).toContain('[Bash');
  });

  it('skips init, thinking, compaction, status messages', () => {
    const messages: AgentMessage[] = [
      msg('init', { sessionId: 's1', model: 'claude', cwd: '/', tools: [] }),
      msg('thinking', { text: 'Hmm...' }),
      msg('text', { text: 'Here is the plan.' }),
      msg('status', { subtype: 'progress' }),
      msg('compaction', { trigger: 'auto', preTokens: 50000 }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toBe('Here is the plan.');
  });

  it('compacts tool summaries for Write with line count', () => {
    const messages: AgentMessage[] = [
      msg('text', { text: 'Creating file.' }),
      msg('tool_call', { toolUseId: 'tc1', name: 'Write', input: { file_path: '/app.ts', content: 'line1\nline2\nline3' } }),
      msg('tool_result', { toolUseId: 'tc1', output: 'ok' }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns[0].toolSummaries[0]).toContain('[Write');
    expect(turns[0].toolSummaries[0]).toContain('/app.ts');
    expect(turns[0].toolSummaries[0]).toContain('3 lines');
  });

  it('compacts Bash tool with truncated command', () => {
    const longCmd = 'a'.repeat(100);
    const messages: AgentMessage[] = [
      msg('text', { text: 'Running command.' }),
      msg('tool_call', { toolUseId: 'tc1', name: 'Bash', input: { command: longCmd } }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    // Command should be truncated to 80 chars
    expect(turns[0].toolSummaries[0].length).toBeLessThan(longCmd.length);
  });

  it('concatenates multiple text messages in same turn', () => {
    const messages: AgentMessage[] = [
      msg('text', { text: 'Part 1.' }),
      msg('text', { text: 'Part 2.' }),
      msg('cost', { totalCostUsd: 0.01, durationMs: 100, inputTokens: 100, outputTokens: 50, numTurns: 1, isError: false }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns[0].assistantText).toBe('Part 1.\nPart 2.');
  });
});

describe('selectAutoAnchors', () => {
  const makeSessionMessages = (turnCount: number): AgentMessage[] => {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < turnCount; i++) {
      messages.push(msg('text', { text: `Response for turn ${i + 1}` }));
      messages.push(msg('cost', {
        totalCostUsd: 0.01,
        durationMs: 100,
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        isError: false,
      }));
    }
    return messages;
  };

  it('selects first N turns up to maxTurns', () => {
    const messages = makeSessionMessages(10);
    const { turns } = selectAutoAnchors(messages, 'Build auth module', 3, 50000);
    expect(turns).toHaveLength(3);
  });

  it('injects session prompt as turn 0 user prompt', () => {
    const messages = makeSessionMessages(3);
    const { turns } = selectAutoAnchors(messages, 'Build auth module', 3, 50000);
    expect(turns[0].userPrompt).toBe('Build auth module');
  });

  it('respects token budget', () => {
    const messages = makeSessionMessages(10);
    // Very small budget — should only fit 1-2 turns
    const { turns } = selectAutoAnchors(messages, 'task', 10, 30);
    expect(turns.length).toBeLessThan(10);
    expect(turns.length).toBeGreaterThan(0);
  });

  it('returns empty for no messages', () => {
    const { turns, totalTokens } = selectAutoAnchors([], 'task', 3, 6000);
    expect(turns).toHaveLength(0);
    expect(totalTokens).toBe(0);
  });
});

describe('serializeAnchorsForInjection', () => {
  it('produces session-anchors XML wrapper', () => {
    const turns = [{
      index: 0,
      userPrompt: 'Build auth',
      assistantText: 'I will create auth.ts',
      toolSummaries: ['[Write /auth.ts → 50 lines]'],
      estimatedTokens: 30,
    }];

    const result = serializeAnchorsForInjection(turns, 6000, 'my-project');
    expect(result).toContain('<session-anchors');
    expect(result).toContain('project="my-project"');
    expect(result).toContain('</session-anchors>');
    expect(result).toContain('Build auth');
    expect(result).toContain('auth.ts');
  });

  it('respects token budget by truncating turns', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      userPrompt: `Prompt ${i}`,
      assistantText: 'A'.repeat(200), // ~50 tokens each
      toolSummaries: [],
      estimatedTokens: 80,
    }));

    // Budget for ~3 turns
    const result = serializeAnchorsForInjection(turns, 300);
    // Should not contain all 10 turns
    expect(result).toContain('Prompt 0');
    expect(result).not.toContain('Prompt 9');
  });

  it('works without project name', () => {
    const turns = [{
      index: 0,
      userPrompt: 'Hello',
      assistantText: 'Hi',
      toolSummaries: [],
      estimatedTokens: 5,
    }];

    const result = serializeAnchorsForInjection(turns, 6000);
    expect(result).toContain('<session-anchors>');
    expect(result).not.toContain('project=');
  });
});
