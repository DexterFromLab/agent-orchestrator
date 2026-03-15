import { describe, it, expect } from 'vitest';
import { adaptOllamaMessage } from './ollama-messages';

describe('adaptOllamaMessage', () => {
  describe('system init', () => {
    it('maps to init message', () => {
      const result = adaptOllamaMessage({
        type: 'system',
        subtype: 'init',
        session_id: 'sess-123',
        model: 'qwen3:8b',
        cwd: '/home/user/project',
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('init');
      const content = result[0].content as any;
      expect(content.sessionId).toBe('sess-123');
      expect(content.model).toBe('qwen3:8b');
      expect(content.cwd).toBe('/home/user/project');
    });
  });

  describe('system status', () => {
    it('maps non-init subtypes to status message', () => {
      const result = adaptOllamaMessage({
        type: 'system',
        subtype: 'model_loaded',
        status: 'Model loaded successfully',
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('status');
      expect((result[0].content as any).subtype).toBe('model_loaded');
      expect((result[0].content as any).message).toBe('Model loaded successfully');
    });
  });

  describe('chunk — text content', () => {
    it('maps streaming text to text message', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: 'Hello world' },
        done: false,
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0].content as any).text).toBe('Hello world');
    });

    it('ignores empty content', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: '' },
        done: false,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('chunk — thinking content', () => {
    it('maps thinking field to thinking message', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: '', thinking: 'Let me reason about this...' },
        done: false,
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('thinking');
      expect((result[0].content as any).text).toBe('Let me reason about this...');
    });

    it('emits both thinking and text when both present', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: 'Answer', thinking: 'Reasoning' },
        done: false,
      });
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('thinking');
      expect(result[1].type).toBe('text');
    });
  });

  describe('chunk — done with token counts', () => {
    it('maps final chunk to cost message', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 500,
        eval_count: 120,
        eval_duration: 2_000_000_000,
        total_duration: 3_000_000_000,
      });
      // Should have cost message (no text since content is empty)
      const costMsg = result.find(m => m.type === 'cost');
      expect(costMsg).toBeDefined();
      const content = costMsg!.content as any;
      expect(content.inputTokens).toBe(500);
      expect(content.outputTokens).toBe(120);
      expect(content.durationMs).toBe(2000);
      expect(content.totalCostUsd).toBe(0);
      expect(content.isError).toBe(false);
    });

    it('marks error done_reason as isError', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'error',
        prompt_eval_count: 0,
        eval_count: 0,
      });
      const costMsg = result.find(m => m.type === 'cost');
      expect(costMsg).toBeDefined();
      expect((costMsg!.content as any).isError).toBe(true);
    });

    it('includes text + cost when final chunk has content', () => {
      const result = adaptOllamaMessage({
        type: 'chunk',
        message: { role: 'assistant', content: '.' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5,
      });
      expect(result.some(m => m.type === 'text')).toBe(true);
      expect(result.some(m => m.type === 'cost')).toBe(true);
    });
  });

  describe('error event', () => {
    it('maps to error message', () => {
      const result = adaptOllamaMessage({
        type: 'error',
        message: 'model not found',
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('error');
      expect((result[0].content as any).message).toBe('model not found');
    });
  });

  describe('unknown event type', () => {
    it('maps to unknown message preserving raw data', () => {
      const result = adaptOllamaMessage({ type: 'something_else', data: 'test' });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('unknown');
    });
  });
});
