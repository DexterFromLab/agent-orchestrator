import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks ---

const {
  capturedCallbacks,
  mockUnlistenMsg,
  mockUnlistenExit,
  mockRestartAgent,
  mockUpdateAgentStatus,
  mockSetAgentSdkSessionId,
  mockSetAgentModel,
  mockAppendAgentMessages,
  mockUpdateAgentCost,
  mockGetAgentSessions,
  mockCreateAgentSession,
  mockFindChildByToolUseId,
  mockAddPane,
  mockGetPanes,
  mockNotify,
} = vi.hoisted(() => ({
  capturedCallbacks: {
    msg: null as ((msg: any) => void) | null,
    exit: null as (() => void) | null,
  },
  mockUnlistenMsg: vi.fn(),
  mockUnlistenExit: vi.fn(),
  mockRestartAgent: vi.fn(),
  mockUpdateAgentStatus: vi.fn(),
  mockSetAgentSdkSessionId: vi.fn(),
  mockSetAgentModel: vi.fn(),
  mockAppendAgentMessages: vi.fn(),
  mockUpdateAgentCost: vi.fn(),
  mockGetAgentSessions: vi.fn().mockReturnValue([]),
  mockCreateAgentSession: vi.fn(),
  mockFindChildByToolUseId: vi.fn().mockReturnValue(undefined),
  mockAddPane: vi.fn(),
  mockGetPanes: vi.fn().mockReturnValue([]),
  mockNotify: vi.fn(),
}));

vi.mock('./adapters/agent-bridge', () => ({
  onSidecarMessage: vi.fn(async (cb: (msg: any) => void) => {
    capturedCallbacks.msg = cb;
    return mockUnlistenMsg;
  }),
  onSidecarExited: vi.fn(async (cb: () => void) => {
    capturedCallbacks.exit = cb;
    return mockUnlistenExit;
  }),
  restartAgent: (...args: unknown[]) => mockRestartAgent(...args),
}));

vi.mock('./adapters/sdk-messages', () => ({
  adaptSDKMessage: vi.fn((raw: Record<string, unknown>) => {
    if (raw.type === 'system' && raw.subtype === 'init') {
      return [{
        id: 'msg-1',
        type: 'init',
        content: { sessionId: 'sdk-sess', model: 'claude-sonnet-4-20250514', cwd: '/tmp', tools: [] },
        timestamp: Date.now(),
      }];
    }
    if (raw.type === 'result') {
      return [{
        id: 'msg-2',
        type: 'cost',
        content: {
          totalCostUsd: 0.05,
          durationMs: 5000,
          inputTokens: 500,
          outputTokens: 200,
          numTurns: 2,
          isError: false,
        },
        timestamp: Date.now(),
      }];
    }
    if (raw.type === 'assistant') {
      return [{
        id: 'msg-3',
        type: 'text',
        content: { text: 'Hello' },
        timestamp: Date.now(),
      }];
    }
    // Subagent tool_call (Agent/Task)
    if (raw.type === 'tool_call_agent') {
      return [{
        id: 'msg-tc-agent',
        type: 'tool_call',
        content: {
          toolUseId: raw.toolUseId ?? 'tu-123',
          name: raw.toolName ?? 'Agent',
          input: raw.toolInput ?? { prompt: 'Do something', name: 'researcher' },
        },
        timestamp: Date.now(),
      }];
    }
    // Non-subagent tool_call
    if (raw.type === 'tool_call_normal') {
      return [{
        id: 'msg-tc-normal',
        type: 'tool_call',
        content: {
          toolUseId: 'tu-normal',
          name: 'Read',
          input: { file: 'test.ts' },
        },
        timestamp: Date.now(),
      }];
    }
    // Message with parentId (routed to child)
    if (raw.type === 'child_message') {
      return [{
        id: 'msg-child',
        type: 'text',
        parentId: raw.parentId as string,
        content: { text: 'Child output' },
        timestamp: Date.now(),
      }];
    }
    // Child init message
    if (raw.type === 'child_init') {
      return [{
        id: 'msg-child-init',
        type: 'init',
        parentId: raw.parentId as string,
        content: { sessionId: 'child-sdk-sess', model: 'claude-sonnet-4-20250514', cwd: '/tmp', tools: [] },
        timestamp: Date.now(),
      }];
    }
    // Child cost message
    if (raw.type === 'child_cost') {
      return [{
        id: 'msg-child-cost',
        type: 'cost',
        parentId: raw.parentId as string,
        content: {
          totalCostUsd: 0.02,
          durationMs: 2000,
          inputTokens: 200,
          outputTokens: 100,
          numTurns: 1,
          isError: false,
        },
        timestamp: Date.now(),
      }];
    }
    return [];
  }),
}));

vi.mock('./stores/agents.svelte', () => ({
  updateAgentStatus: (...args: unknown[]) => mockUpdateAgentStatus(...args),
  setAgentSdkSessionId: (...args: unknown[]) => mockSetAgentSdkSessionId(...args),
  setAgentModel: (...args: unknown[]) => mockSetAgentModel(...args),
  appendAgentMessages: (...args: unknown[]) => mockAppendAgentMessages(...args),
  updateAgentCost: (...args: unknown[]) => mockUpdateAgentCost(...args),
  getAgentSessions: () => mockGetAgentSessions(),
  createAgentSession: (...args: unknown[]) => mockCreateAgentSession(...args),
  findChildByToolUseId: (...args: unknown[]) => mockFindChildByToolUseId(...args),
}));

vi.mock('./stores/layout.svelte', () => ({
  addPane: (...args: unknown[]) => mockAddPane(...args),
  getPanes: () => mockGetPanes(),
}));

vi.mock('./stores/notifications.svelte', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock('./stores/conflicts.svelte', () => ({
  recordFileWrite: vi.fn().mockReturnValue(false),
  clearSessionWrites: vi.fn(),
  setSessionWorktree: vi.fn(),
}));

vi.mock('./utils/tool-files', () => ({
  extractWritePaths: vi.fn().mockReturnValue([]),
  extractWorktreePath: vi.fn().mockReturnValue(null),
}));

// Use fake timers to control setTimeout in sidecar crash recovery
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capturedCallbacks.msg = null;
  capturedCallbacks.exit = null;
  mockRestartAgent.mockResolvedValue(undefined);
  mockGetAgentSessions.mockReturnValue([]);
});

// We need to dynamically import the dispatcher in each test to get fresh module state.
// However, vi.mock is module-scoped so the mocks persist. The module-level restartAttempts
// and sidecarAlive variables persist across tests since they share the same module instance.
// We work around this by resetting via the exported setSidecarAlive and stopAgentDispatcher.

import {
  startAgentDispatcher,
  stopAgentDispatcher,
  isSidecarAlive,
  setSidecarAlive,
  waitForPendingPersistence,
} from './agent-dispatcher';

// Stop any previous dispatcher between tests so `unlistenMsg` is null and start works
beforeEach(() => {
  stopAgentDispatcher();
});

afterEach(async () => {
  vi.useRealTimers();
});

// Need afterEach import
import { afterEach } from 'vitest';

describe('agent-dispatcher', () => {
  describe('startAgentDispatcher', () => {
    it('registers sidecar message and exit listeners', async () => {
      await startAgentDispatcher();

      expect(capturedCallbacks.msg).toBeTypeOf('function');
      expect(capturedCallbacks.exit).toBeTypeOf('function');
    });

    it('does not register duplicate listeners on repeated calls', async () => {
      await startAgentDispatcher();
      await startAgentDispatcher(); // second call should be no-op

      const { onSidecarMessage } = await import('./adapters/agent-bridge');
      expect(onSidecarMessage).toHaveBeenCalledTimes(1);
    });

    it('sets sidecarAlive to true on start', async () => {
      setSidecarAlive(false);
      await startAgentDispatcher();
      expect(isSidecarAlive()).toBe(true);
    });
  });

  describe('message routing', () => {
    beforeEach(async () => {
      await startAgentDispatcher();
    });

    it('routes agent_started to updateAgentStatus(running)', () => {
      capturedCallbacks.msg!({
        type: 'agent_started',
        sessionId: 'sess-1',
      });

      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-1', 'running');
    });

    it('routes agent_stopped to updateAgentStatus(done) and notifies', () => {
      capturedCallbacks.msg!({
        type: 'agent_stopped',
        sessionId: 'sess-1',
      });

      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-1', 'done');
      expect(mockNotify).toHaveBeenCalledWith('success', expect.stringContaining('completed'));
    });

    it('routes agent_error to updateAgentStatus(error) with message', () => {
      capturedCallbacks.msg!({
        type: 'agent_error',
        sessionId: 'sess-1',
        message: 'Process crashed',
      });

      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-1', 'error', 'Process crashed');
      expect(mockNotify).toHaveBeenCalledWith('error', expect.stringContaining('Process crashed'));
    });

    it('ignores messages without sessionId', () => {
      capturedCallbacks.msg!({
        type: 'agent_started',
      });

      expect(mockUpdateAgentStatus).not.toHaveBeenCalled();
    });

    it('handles agent_log silently (no-op)', () => {
      capturedCallbacks.msg!({
        type: 'agent_log',
        sessionId: 'sess-1',
        message: 'Debug info',
      });

      expect(mockUpdateAgentStatus).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe('agent_event routing via SDK adapter', () => {
    beforeEach(async () => {
      await startAgentDispatcher();
    });

    it('routes init event to setAgentSdkSessionId and setAgentModel', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'system', subtype: 'init' },
      });

      expect(mockSetAgentSdkSessionId).toHaveBeenCalledWith('sess-1', 'sdk-sess');
      expect(mockSetAgentModel).toHaveBeenCalledWith('sess-1', 'claude-sonnet-4-20250514');
      expect(mockAppendAgentMessages).toHaveBeenCalled();
    });

    it('routes cost event to updateAgentCost and updateAgentStatus', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'result' },
      });

      expect(mockUpdateAgentCost).toHaveBeenCalledWith('sess-1', {
        costUsd: 0.05,
        inputTokens: 500,
        outputTokens: 200,
        numTurns: 2,
        durationMs: 5000,
      });
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-1', 'done');
    });

    it('appends messages to agent session', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'assistant' },
      });

      expect(mockAppendAgentMessages).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({ type: 'text', content: { text: 'Hello' } }),
      ]);
    });

    it('does not append when adapter returns empty array', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'unknown_event' },
      });

      expect(mockAppendAgentMessages).not.toHaveBeenCalled();
    });
  });

  describe('sidecar exit handling', () => {
    beforeEach(async () => {
      await startAgentDispatcher();
    });

    it('marks running sessions as errored on exit', async () => {
      mockGetAgentSessions.mockReturnValue([
        { id: 'sess-1', status: 'running' },
        { id: 'sess-2', status: 'done' },
        { id: 'sess-3', status: 'starting' },
      ]);

      // Trigger exit -- don't await, since it has internal setTimeout
      const exitPromise = capturedCallbacks.exit!();
      // Advance past the backoff delay (up to 4s)
      await vi.advanceTimersByTimeAsync(5000);
      await exitPromise;

      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-1', 'error', 'Sidecar crashed');
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('sess-3', 'error', 'Sidecar crashed');
      // sess-2 (done) should not be updated with 'error'/'Sidecar crashed'
      const calls = mockUpdateAgentStatus.mock.calls;
      const sess2Calls = calls.filter((c: unknown[]) => c[0] === 'sess-2');
      expect(sess2Calls).toHaveLength(0);
    });

    it('attempts auto-restart and notifies with warning', async () => {
      const exitPromise = capturedCallbacks.exit!();
      await vi.advanceTimersByTimeAsync(5000);
      await exitPromise;

      expect(mockRestartAgent).toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith('warning', expect.stringContaining('restarting'));
    });
  });

  describe('stopAgentDispatcher', () => {
    it('calls unlisten functions', async () => {
      await startAgentDispatcher();
      stopAgentDispatcher();

      expect(mockUnlistenMsg).toHaveBeenCalled();
      expect(mockUnlistenExit).toHaveBeenCalled();
    });

    it('allows re-registering after stop', async () => {
      await startAgentDispatcher();
      stopAgentDispatcher();
      await startAgentDispatcher();

      const { onSidecarMessage } = await import('./adapters/agent-bridge');
      expect(onSidecarMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('isSidecarAlive / setSidecarAlive', () => {
    it('defaults to true after start', async () => {
      await startAgentDispatcher();
      expect(isSidecarAlive()).toBe(true);
    });

    it('can be set manually', () => {
      setSidecarAlive(false);
      expect(isSidecarAlive()).toBe(false);
      setSidecarAlive(true);
      expect(isSidecarAlive()).toBe(true);
    });
  });

  describe('subagent routing', () => {
    beforeEach(async () => {
      await startAgentDispatcher();
      mockGetPanes.mockReturnValue([
        { id: 'sess-1', type: 'agent', title: 'Agent 1', focused: false },
      ]);
      mockFindChildByToolUseId.mockReturnValue(undefined);
    });

    it('spawns a subagent pane when Agent tool_call is detected', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-agent-1', toolName: 'Agent', toolInput: { prompt: 'Research X', name: 'researcher' } },
      });

      expect(mockCreateAgentSession).toHaveBeenCalledWith(
        expect.any(String),
        'Research X',
        { sessionId: 'sess-1', toolUseId: 'tu-agent-1' },
      );
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith(expect.any(String), 'running');
      expect(mockAddPane).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent',
        title: 'Sub: researcher',
        group: 'Agent 1',
      }));
    });

    it('spawns a subagent pane for Task tool_call', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-task-1', toolName: 'Task', toolInput: { prompt: 'Build it', name: 'builder' } },
      });

      expect(mockCreateAgentSession).toHaveBeenCalled();
      expect(mockAddPane).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Sub: builder',
      }));
    });

    it('does not spawn pane for non-subagent tool_calls', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_normal' },
      });

      expect(mockCreateAgentSession).not.toHaveBeenCalled();
      expect(mockAddPane).not.toHaveBeenCalled();
    });

    it('does not spawn duplicate pane for same toolUseId', () => {
      // First call — spawns pane
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-dup', toolName: 'Agent', toolInput: { prompt: 'test', name: 'dup' } },
      });

      // Second call with same toolUseId — should not create another
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-dup', toolName: 'Agent', toolInput: { prompt: 'test', name: 'dup' } },
      });

      expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
      expect(mockAddPane).toHaveBeenCalledTimes(1);
    });

    it('reuses existing child session from findChildByToolUseId', () => {
      mockFindChildByToolUseId.mockReturnValue({ id: 'existing-child' });

      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-existing', toolName: 'Agent', toolInput: { prompt: 'test' } },
      });

      // Should not create a new session or pane
      expect(mockCreateAgentSession).not.toHaveBeenCalled();
      expect(mockAddPane).not.toHaveBeenCalled();
    });

    it('routes messages with parentId to the child pane', () => {
      // First spawn a subagent
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-route', toolName: 'Agent', toolInput: { prompt: 'test', name: 'worker' } },
      });

      const childId = mockCreateAgentSession.mock.calls[0][0];

      // Now send a message with parentId matching the toolUseId
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'child_message', parentId: 'tu-route' },
      });

      // The child message should go to child pane, not main session
      expect(mockAppendAgentMessages).toHaveBeenCalledWith(
        childId,
        [expect.objectContaining({ type: 'text', content: { text: 'Child output' } })],
      );
    });

    it('routes child init message and updates child session', () => {
      // Spawn subagent
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-cinit', toolName: 'Agent', toolInput: { prompt: 'test', name: 'init-test' } },
      });

      const childId = mockCreateAgentSession.mock.calls[0][0];
      mockUpdateAgentStatus.mockClear();

      // Send child init
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'child_init', parentId: 'tu-cinit' },
      });

      expect(mockSetAgentSdkSessionId).toHaveBeenCalledWith(childId, 'child-sdk-sess');
      expect(mockSetAgentModel).toHaveBeenCalledWith(childId, 'claude-sonnet-4-20250514');
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith(childId, 'running');
    });

    it('routes child cost message and marks child done', () => {
      // Spawn subagent
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-ccost', toolName: 'Agent', toolInput: { prompt: 'test', name: 'cost-test' } },
      });

      const childId = mockCreateAgentSession.mock.calls[0][0];

      // Send child cost
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'child_cost', parentId: 'tu-ccost' },
      });

      expect(mockUpdateAgentCost).toHaveBeenCalledWith(childId, {
        costUsd: 0.02,
        inputTokens: 200,
        outputTokens: 100,
        numTurns: 1,
        durationMs: 2000,
      });
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith(childId, 'done');
    });

    it('uses tool name as fallback when input has no prompt/name', () => {
      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-fallback', toolName: 'dispatch_agent', toolInput: 'raw string input' },
      });

      expect(mockCreateAgentSession).toHaveBeenCalledWith(
        expect.any(String),
        'dispatch_agent',
        expect.any(Object),
      );
      expect(mockAddPane).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Sub: dispatch_agent',
      }));
    });

    it('uses parent fallback title when parent pane not found', () => {
      mockGetPanes.mockReturnValue([]); // no panes found

      capturedCallbacks.msg!({
        type: 'agent_event',
        sessionId: 'sess-1',
        event: { type: 'tool_call_agent', toolUseId: 'tu-noparent', toolName: 'Agent', toolInput: { prompt: 'test', name: 'orphan' } },
      });

      expect(mockAddPane).toHaveBeenCalledWith(expect.objectContaining({
        group: 'Agent sess-1',
      }));
    });
  });

  describe('waitForPendingPersistence', () => {
    it('resolves immediately when no persistence is in-flight', async () => {
      vi.useRealTimers();
      await expect(waitForPendingPersistence()).resolves.toBeUndefined();
    });
  });
});
