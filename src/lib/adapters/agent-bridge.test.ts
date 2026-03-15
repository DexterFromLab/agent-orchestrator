import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to declare mocks that are accessible inside vi.mock factories
const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

import {
  queryAgent,
  stopAgent,
  isAgentReady,
  restartAgent,
  onSidecarMessage,
  onSidecarExited,
  type AgentQueryOptions,
} from './agent-bridge';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent-bridge', () => {
  describe('queryAgent', () => {
    it('invokes agent_query with options', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const options: AgentQueryOptions = {
        session_id: 'sess-1',
        prompt: 'Hello Claude',
        cwd: '/tmp',
        max_turns: 10,
        max_budget_usd: 1.0,
      };

      await queryAgent(options);

      expect(mockInvoke).toHaveBeenCalledWith('agent_query', { options });
    });

    it('passes minimal options (only required fields)', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const options: AgentQueryOptions = {
        session_id: 'sess-2',
        prompt: 'Do something',
      };

      await queryAgent(options);

      expect(mockInvoke).toHaveBeenCalledWith('agent_query', { options });
    });

    it('propagates invoke errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Sidecar not running'));

      await expect(
        queryAgent({ session_id: 'sess-3', prompt: 'test' }),
      ).rejects.toThrow('Sidecar not running');
    });
  });

  describe('stopAgent', () => {
    it('invokes agent_stop with session ID', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await stopAgent('sess-1');

      expect(mockInvoke).toHaveBeenCalledWith('agent_stop', { sessionId: 'sess-1' });
    });
  });

  describe('isAgentReady', () => {
    it('returns true when sidecar is ready', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await isAgentReady();

      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('agent_ready');
    });

    it('returns false when sidecar is not ready', async () => {
      mockInvoke.mockResolvedValue(false);

      const result = await isAgentReady();

      expect(result).toBe(false);
    });
  });

  describe('restartAgent', () => {
    it('invokes agent_restart', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await restartAgent();

      expect(mockInvoke).toHaveBeenCalledWith('agent_restart');
    });
  });

  describe('onSidecarMessage', () => {
    it('registers listener on sidecar-message event', async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);

      const callback = vi.fn();
      const result = await onSidecarMessage(callback);

      expect(mockListen).toHaveBeenCalledWith('sidecar-message', expect.any(Function));
      expect(result).toBe(unlisten);
    });

    it('extracts payload and passes to callback', async () => {
      mockListen.mockImplementation(async (_event: string, handler: (e: unknown) => void) => {
        // Simulate Tauri event delivery
        handler({
          payload: {
            type: 'agent_event',
            sessionId: 'sess-1',
            event: { type: 'system', subtype: 'init' },
          },
        });
        return vi.fn();
      });

      const callback = vi.fn();
      await onSidecarMessage(callback);

      expect(callback).toHaveBeenCalledWith({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'system', subtype: 'init' },
      });
    });
  });

  describe('onSidecarExited', () => {
    it('registers listener on sidecar-exited event', async () => {
      const unlisten = vi.fn();
      mockListen.mockResolvedValue(unlisten);

      const callback = vi.fn();
      const result = await onSidecarExited(callback);

      expect(mockListen).toHaveBeenCalledWith('sidecar-exited', expect.any(Function));
      expect(result).toBe(unlisten);
    });

    it('invokes callback without arguments on exit', async () => {
      mockListen.mockImplementation(async (_event: string, handler: () => void) => {
        handler();
        return vi.fn();
      });

      const callback = vi.fn();
      await onSidecarExited(callback);

      expect(callback).toHaveBeenCalledWith();
    });
  });
});
