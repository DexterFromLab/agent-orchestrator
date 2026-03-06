import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adaptSDKMessage } from './sdk-messages';
import type { InitContent, TextContent, ThinkingContent, ToolCallContent, ToolResultContent, StatusContent, CostContent, ErrorContent } from './sdk-messages';

// Mock crypto.randomUUID for deterministic IDs when uuid is missing
beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => 'fallback-uuid',
  });
});

describe('adaptSDKMessage', () => {
  describe('system/init messages', () => {
    it('adapts a system init message', () => {
      const raw = {
        type: 'system',
        subtype: 'init',
        uuid: 'sys-001',
        session_id: 'sess-abc',
        model: 'claude-sonnet-4-20250514',
        cwd: '/home/user/project',
        tools: ['Read', 'Write', 'Bash'],
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sys-001');
      expect(result[0].type).toBe('init');
      const content = result[0].content as InitContent;
      expect(content.sessionId).toBe('sess-abc');
      expect(content.model).toBe('claude-sonnet-4-20250514');
      expect(content.cwd).toBe('/home/user/project');
      expect(content.tools).toEqual(['Read', 'Write', 'Bash']);
    });

    it('defaults tools to empty array when missing', () => {
      const raw = {
        type: 'system',
        subtype: 'init',
        uuid: 'sys-002',
        session_id: 'sess-abc',
        model: 'claude-sonnet-4-20250514',
        cwd: '/tmp',
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as InitContent;
      expect(content.tools).toEqual([]);
    });
  });

  describe('system/status messages (non-init subtypes)', () => {
    it('adapts a system status message', () => {
      const raw = {
        type: 'system',
        subtype: 'api_key_check',
        uuid: 'sys-003',
        status: 'API key is valid',
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('status');
      const content = result[0].content as StatusContent;
      expect(content.subtype).toBe('api_key_check');
      expect(content.message).toBe('API key is valid');
    });

    it('handles missing status field', () => {
      const raw = {
        type: 'system',
        subtype: 'some_event',
        uuid: 'sys-004',
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as StatusContent;
      expect(content.subtype).toBe('some_event');
      expect(content.message).toBeUndefined();
    });
  });

  describe('assistant/text messages', () => {
    it('adapts a single text block', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-001',
        message: {
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect(result[0].id).toBe('asst-001-text-0');
      const content = result[0].content as TextContent;
      expect(content.text).toBe('Hello, world!');
    });

    it('preserves parentId on assistant messages', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-002',
        parent_tool_use_id: 'tool-parent-123',
        message: {
          content: [{ type: 'text', text: 'subagent response' }],
        },
      };

      const result = adaptSDKMessage(raw);
      expect(result[0].parentId).toBe('tool-parent-123');
    });
  });

  describe('assistant/thinking messages', () => {
    it('adapts a thinking block with thinking field', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-003',
        message: {
          content: [{ type: 'thinking', thinking: 'Let me consider...', text: 'fallback' }],
        },
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('thinking');
      expect(result[0].id).toBe('asst-003-think-0');
      const content = result[0].content as ThinkingContent;
      expect(content.text).toBe('Let me consider...');
    });

    it('falls back to text field when thinking is absent', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-004',
        message: {
          content: [{ type: 'thinking', text: 'Thinking via text field' }],
        },
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as ThinkingContent;
      expect(content.text).toBe('Thinking via text field');
    });
  });

  describe('assistant/tool_use messages', () => {
    it('adapts a tool_use block', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-005',
        message: {
          content: [{
            type: 'tool_use',
            id: 'toolu_abc123',
            name: 'Read',
            input: { file_path: '/src/main.ts' },
          }],
        },
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_call');
      expect(result[0].id).toBe('asst-005-tool-0');
      const content = result[0].content as ToolCallContent;
      expect(content.toolUseId).toBe('toolu_abc123');
      expect(content.name).toBe('Read');
      expect(content.input).toEqual({ file_path: '/src/main.ts' });
    });
  });

  describe('assistant messages with multiple content blocks', () => {
    it('produces one AgentMessage per content block', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-multi',
        message: {
          content: [
            { type: 'thinking', thinking: 'Hmm...' },
            { type: 'text', text: 'Here is the answer.' },
            { type: 'tool_use', id: 'toolu_xyz', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('thinking');
      expect(result[0].id).toBe('asst-multi-think-0');
      expect(result[1].type).toBe('text');
      expect(result[1].id).toBe('asst-multi-text-1');
      expect(result[2].type).toBe('tool_call');
      expect(result[2].id).toBe('asst-multi-tool-2');
    });

    it('skips unknown content block types silently', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-unk-block',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', data: 'base64...' },
          ],
        },
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
    });
  });

  describe('user/tool_result messages', () => {
    it('adapts a tool_result block', () => {
      const raw = {
        type: 'user',
        uuid: 'user-001',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_abc123',
            content: 'file contents here',
          }],
        },
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_result');
      expect(result[0].id).toBe('user-001-result-0');
      const content = result[0].content as ToolResultContent;
      expect(content.toolUseId).toBe('toolu_abc123');
      expect(content.output).toBe('file contents here');
    });

    it('falls back to tool_use_result when block content is missing', () => {
      const raw = {
        type: 'user',
        uuid: 'user-002',
        tool_use_result: { status: 'success', output: 'done' },
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_def456',
            // no content field
          }],
        },
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as ToolResultContent;
      expect(content.output).toEqual({ status: 'success', output: 'done' });
    });

    it('preserves parentId on user messages', () => {
      const raw = {
        type: 'user',
        uuid: 'user-003',
        parent_tool_use_id: 'parent-tool-id',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_ghi',
            content: 'ok',
          }],
        },
      };

      const result = adaptSDKMessage(raw);
      expect(result[0].parentId).toBe('parent-tool-id');
    });
  });

  describe('result/cost messages', () => {
    it('adapts a full result message', () => {
      const raw = {
        type: 'result',
        uuid: 'res-001',
        total_cost_usd: 0.0125,
        duration_ms: 4500,
        usage: { input_tokens: 1000, output_tokens: 500 },
        num_turns: 3,
        is_error: false,
        result: 'Task completed successfully.',
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('cost');
      expect(result[0].id).toBe('res-001');
      const content = result[0].content as CostContent;
      expect(content.totalCostUsd).toBe(0.0125);
      expect(content.durationMs).toBe(4500);
      expect(content.inputTokens).toBe(1000);
      expect(content.outputTokens).toBe(500);
      expect(content.numTurns).toBe(3);
      expect(content.isError).toBe(false);
      expect(content.result).toBe('Task completed successfully.');
      expect(content.errors).toBeUndefined();
    });

    it('defaults numeric fields to 0 when missing', () => {
      const raw = {
        type: 'result',
        uuid: 'res-002',
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as CostContent;
      expect(content.totalCostUsd).toBe(0);
      expect(content.durationMs).toBe(0);
      expect(content.inputTokens).toBe(0);
      expect(content.outputTokens).toBe(0);
      expect(content.numTurns).toBe(0);
      expect(content.isError).toBe(false);
    });

    it('includes errors array when present', () => {
      const raw = {
        type: 'result',
        uuid: 'res-003',
        is_error: true,
        errors: ['Rate limit exceeded', 'Retry failed'],
      };

      const result = adaptSDKMessage(raw);
      const content = result[0].content as CostContent;
      expect(content.isError).toBe(true);
      expect(content.errors).toEqual(['Rate limit exceeded', 'Retry failed']);
    });
  });

  describe('edge cases', () => {
    it('returns unknown type for unrecognized message types', () => {
      const raw = {
        type: 'something_new',
        uuid: 'unk-001',
        data: 'arbitrary',
      };

      const result = adaptSDKMessage(raw);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('unknown');
      expect(result[0].id).toBe('unk-001');
      expect(result[0].content).toBe(raw);
    });

    it('uses crypto.randomUUID when uuid is missing', () => {
      const raw = {
        type: 'result',
        total_cost_usd: 0.001,
      };

      const result = adaptSDKMessage(raw);
      expect(result[0].id).toBe('fallback-uuid');
    });

    it('returns empty array when assistant message has no message field', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-empty',
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when assistant message.content is not an array', () => {
      const raw = {
        type: 'assistant',
        uuid: 'asst-bad-content',
        message: { content: 'not-an-array' },
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when user message has no message field', () => {
      const raw = {
        type: 'user',
        uuid: 'user-empty',
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when user message.content is not an array', () => {
      const raw = {
        type: 'user',
        uuid: 'user-bad',
        message: { content: 'string' },
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(0);
    });

    it('ignores non-tool_result blocks in user messages', () => {
      const raw = {
        type: 'user',
        uuid: 'user-text',
        message: {
          content: [
            { type: 'text', text: 'User typed something' },
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
          ],
        },
      };

      const result = adaptSDKMessage(raw);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_result');
    });

    it('sets timestamp on every message', () => {
      const before = Date.now();
      const result = adaptSDKMessage({
        type: 'system',
        subtype: 'init',
        uuid: 'ts-test',
        session_id: 's',
        model: 'm',
        cwd: '/',
      });
      const after = Date.now();

      expect(result[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(result[0].timestamp).toBeLessThanOrEqual(after);
    });
  });
});
