import { describe, it, expect } from 'vitest';
import { adaptCodexMessage } from './codex-messages';

describe('adaptCodexMessage', () => {
  describe('thread.started', () => {
    it('maps to init message with thread_id as sessionId', () => {
      const result = adaptCodexMessage({
        type: 'thread.started',
        thread_id: 'thread-abc-123',
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('init');
      expect((result[0].content as any).sessionId).toBe('thread-abc-123');
    });
  });

  describe('turn.started', () => {
    it('maps to status message', () => {
      const result = adaptCodexMessage({ type: 'turn.started' });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('status');
      expect((result[0].content as any).subtype).toBe('turn_started');
    });
  });

  describe('turn.completed', () => {
    it('maps to cost message with token usage', () => {
      const result = adaptCodexMessage({
        type: 'turn.completed',
        usage: { input_tokens: 1000, output_tokens: 200, cached_input_tokens: 800 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('cost');
      const content = result[0].content as any;
      expect(content.inputTokens).toBe(1000);
      expect(content.outputTokens).toBe(200);
      expect(content.totalCostUsd).toBe(0);
    });
  });

  describe('turn.failed', () => {
    it('maps to error message', () => {
      const result = adaptCodexMessage({
        type: 'turn.failed',
        error: { message: 'Rate limit exceeded' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('error');
      expect((result[0].content as any).message).toBe('Rate limit exceeded');
    });
  });

  describe('item.completed — agent_message', () => {
    it('maps to text message', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: { id: 'item_3', type: 'agent_message', text: 'Done. I updated foo.ts.' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0].content as any).text).toBe('Done. I updated foo.ts.');
    });

    it('ignores item.started for agent_message', () => {
      const result = adaptCodexMessage({
        type: 'item.started',
        item: { type: 'agent_message', text: '' },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('item.completed — reasoning', () => {
    it('maps to thinking message', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: { type: 'reasoning', text: 'Let me think about this...' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('thinking');
      expect((result[0].content as any).text).toBe('Let me think about this...');
    });
  });

  describe('item — command_execution', () => {
    it('maps item.started to tool_call', () => {
      const result = adaptCodexMessage({
        type: 'item.started',
        item: { id: 'item_1', type: 'command_execution', command: 'ls -la', status: 'in_progress' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_call');
      expect((result[0].content as any).name).toBe('Bash');
      expect((result[0].content as any).input.command).toBe('ls -la');
    });

    it('maps item.completed to tool_call + tool_result pair', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'ls -la',
          aggregated_output: 'total 48\ndrwxr-xr-x',
          exit_code: 0,
          status: 'completed',
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('tool_call');
      expect(result[1].type).toBe('tool_result');
      expect((result[1].content as any).output).toBe('total 48\ndrwxr-xr-x');
    });

    it('ignores item.updated for command_execution', () => {
      const result = adaptCodexMessage({
        type: 'item.updated',
        item: { type: 'command_execution', command: 'ls', status: 'in_progress' },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('item.completed — file_change', () => {
    it('maps file changes to tool_call + tool_result pairs', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: {
          type: 'file_change',
          changes: [
            { path: 'src/foo.ts', kind: 'update' },
            { path: 'src/bar.ts', kind: 'add' },
          ],
          status: 'completed',
        },
      });
      expect(result).toHaveLength(4);
      expect(result[0].type).toBe('tool_call');
      expect((result[0].content as any).name).toBe('Edit');
      expect(result[1].type).toBe('tool_result');
      expect(result[2].type).toBe('tool_call');
      expect((result[2].content as any).name).toBe('Write');
    });

    it('maps delete to Bash tool name', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: {
          type: 'file_change',
          changes: [{ path: 'old.ts', kind: 'delete' }],
          status: 'completed',
        },
      });
      expect(result).toHaveLength(2);
      expect((result[0].content as any).name).toBe('Bash');
    });

    it('returns empty for no changes', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: { type: 'file_change', changes: [], status: 'completed' },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('item.completed — mcp_tool_call', () => {
    it('maps to tool_call + tool_result with server:tool name', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: {
          id: 'mcp_1',
          type: 'mcp_tool_call',
          server: 'filesystem',
          tool: 'read_file',
          arguments: { path: '/tmp/test.txt' },
          result: { content: 'file contents' },
          status: 'completed',
        },
      });
      expect(result).toHaveLength(2);
      expect((result[0].content as any).name).toBe('filesystem:read_file');
      expect((result[0].content as any).input.path).toBe('/tmp/test.txt');
    });

    it('maps error result to error message in tool_result', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: {
          id: 'mcp_2',
          type: 'mcp_tool_call',
          server: 'fs',
          tool: 'write',
          arguments: {},
          error: { message: 'Permission denied' },
          status: 'completed',
        },
      });
      expect(result).toHaveLength(2);
      expect((result[1].content as any).output).toBe('Permission denied');
    });
  });

  describe('item.completed — web_search', () => {
    it('maps to WebSearch tool_call', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: { id: 'ws_1', type: 'web_search', query: 'ollama api docs' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_call');
      expect((result[0].content as any).name).toBe('WebSearch');
      expect((result[0].content as any).input.query).toBe('ollama api docs');
    });
  });

  describe('item — error', () => {
    it('maps to error message', () => {
      const result = adaptCodexMessage({
        type: 'item.completed',
        item: { type: 'error', message: 'Sandbox violation' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('error');
      expect((result[0].content as any).message).toBe('Sandbox violation');
    });
  });

  describe('top-level error', () => {
    it('maps to error message', () => {
      const result = adaptCodexMessage({
        type: 'error',
        message: 'Connection lost',
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('error');
      expect((result[0].content as any).message).toBe('Connection lost');
    });
  });

  describe('unknown event type', () => {
    it('maps to unknown message preserving raw data', () => {
      const result = adaptCodexMessage({ type: 'custom.event', data: 42 });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('unknown');
      expect((result[0].content as any).data).toBe(42);
    });
  });
});
