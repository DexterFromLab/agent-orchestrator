// Agent Dispatcher — connects sidecar bridge events to agent store
// Thin coordinator that routes sidecar messages to specialized modules

import { SessionId, type SessionId as SessionIdType } from './types/ids';
import { onSidecarMessage, onSidecarExited, restartAgent, type SidecarMessage } from './adapters/agent-bridge';
import { adaptMessage } from './adapters/message-adapters';
import type { InitContent, CostContent, ToolCallContent } from './adapters/claude-messages';
import {
  updateAgentStatus,
  setAgentSdkSessionId,
  setAgentModel,
  appendAgentMessages,
  updateAgentCost,
  getAgentSessions,
  getAgentSession,
} from './stores/agents.svelte';
import { notify, addNotification } from './stores/notifications.svelte';
import { classifyError } from './utils/error-classifier';
import { tel } from './adapters/telemetry-bridge';
import { recordActivity, recordToolDone, recordTokenSnapshot } from './stores/health.svelte';
import { recordFileWrite, clearSessionWrites, setSessionWorktree } from './stores/conflicts.svelte';
import { extractWritePaths, extractWorktreePath } from './utils/tool-files';
import { hasAutoAnchored, markAutoAnchored } from './stores/anchors.svelte';
import { detectWorktreeFromCwd } from './utils/worktree-detection';
import {
  getSessionProjectId,
  getSessionProvider,
  recordSessionStart,
  persistSessionForProject,
  clearSessionMaps,
} from './utils/session-persistence';
import { triggerAutoAnchor } from './utils/auto-anchoring';
import {
  isSubagentToolCall,
  getChildPaneId,
  spawnSubagentPane,
  clearSubagentRoutes,
} from './utils/subagent-router';
import { indexMessage } from './adapters/search-bridge';
import { recordHeartbeat } from './adapters/btmsg-bridge';
import { logAuditEvent } from './adapters/audit-bridge';
import type { AgentId } from './types/ids';

// Re-export public API consumed by other modules
export { registerSessionProject, waitForPendingPersistence } from './utils/session-persistence';

let unlistenMsg: (() => void) | null = null;
let unlistenExit: (() => void) | null = null;

// Sidecar liveness — checked by UI components
let sidecarAlive = true;

// Sidecar crash recovery state
const MAX_RESTART_ATTEMPTS = 3;
let restartAttempts = 0;
let restarting = false;
export function isSidecarAlive(): boolean {
  return sidecarAlive;
}
export function setSidecarAlive(alive: boolean): void {
  sidecarAlive = alive;
}

export async function startAgentDispatcher(): Promise<void> {
  if (unlistenMsg) return;

  sidecarAlive = true;

  unlistenMsg = await onSidecarMessage((msg: SidecarMessage) => {
    sidecarAlive = true;
    // Reset restart counter on any successful message — sidecar recovered
    if (restartAttempts > 0) {
      notify('success', 'Sidecar recovered');
      restartAttempts = 0;
    }

    if (!msg.sessionId) return;
    const sessionId = SessionId(msg.sessionId);

    // Record heartbeat on any agent activity (best-effort, fire-and-forget)
    const hbProjectId = getSessionProjectId(sessionId);
    if (hbProjectId) {
      recordHeartbeat(hbProjectId as unknown as AgentId).catch(() => {});
    }

    switch (msg.type) {
      case 'agent_started':
        updateAgentStatus(sessionId, 'running');
        recordSessionStart(sessionId);
        tel.info('agent_started', { sessionId });
        if (hbProjectId) {
          logAuditEvent(hbProjectId as unknown as AgentId, 'status_change', `Agent started (session ${sessionId.slice(0, 8)})`).catch(() => {});
        }
        break;

      case 'agent_event':
        if (msg.event) handleAgentEvent(sessionId, msg.event);
        break;

      case 'agent_stopped':
        updateAgentStatus(sessionId, 'done');
        tel.info('agent_stopped', { sessionId });
        notify('success', `Agent ${sessionId.slice(0, 8)} completed`);
        addNotification('Agent complete', `Session ${sessionId.slice(0, 8)} finished`, 'agent_complete', getSessionProjectId(sessionId) ?? undefined);
        if (hbProjectId) {
          logAuditEvent(hbProjectId as unknown as AgentId, 'status_change', `Agent completed (session ${sessionId.slice(0, 8)})`).catch(() => {});
        }
        break;

      case 'agent_error': {
        const errorMsg = msg.message ?? 'Unknown';
        const classified = classifyError(errorMsg);
        updateAgentStatus(sessionId, 'error', errorMsg);
        tel.error('agent_error', { sessionId, error: errorMsg, errorType: classified.type });

        // Show type-specific toast
        if (classified.type === 'rate_limit') {
          notify('warning', `Rate limited. ${classified.retryDelaySec > 0 ? `Retrying in ~${classified.retryDelaySec}s...` : ''}`);
        } else if (classified.type === 'auth') {
          notify('error', 'API key invalid or expired. Check Settings.');
        } else if (classified.type === 'quota') {
          notify('error', 'API quota exceeded. Check your billing.');
        } else if (classified.type === 'overloaded') {
          notify('warning', 'API overloaded. Will retry shortly...');
        } else if (classified.type === 'network') {
          notify('error', 'Network error. Check your connection.');
        } else {
          notify('error', `Agent error: ${errorMsg}`);
        }

        addNotification('Agent error', classified.message, 'agent_error', getSessionProjectId(sessionId) ?? undefined);
        if (hbProjectId) {
          logAuditEvent(hbProjectId as unknown as AgentId, 'status_change', `Agent error (${classified.type}): ${errorMsg} (session ${sessionId.slice(0, 8)})`).catch(() => {});
        }
        break;
      }

      case 'agent_log':
        break;
    }
  });

  unlistenExit = await onSidecarExited(async () => {
    sidecarAlive = false;
    tel.error('sidecar_crashed', { restartAttempts });

    // Guard against re-entrant exit handler (double-restart race)
    if (restarting) return;
    restarting = true;

    // Mark all running sessions as errored
    for (const session of getAgentSessions()) {
      if (session.status === 'running' || session.status === 'starting') {
        updateAgentStatus(session.id, 'error', 'Sidecar crashed');
      }
    }

    // Attempt auto-restart with exponential backoff
    try {
      if (restartAttempts < MAX_RESTART_ATTEMPTS) {
        restartAttempts++;
        const delayMs = 1000 * Math.pow(2, restartAttempts - 1); // 1s, 2s, 4s
        notify('warning', `Sidecar crashed, restarting (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
        addNotification('Sidecar crashed', `Restarting (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`, 'system');
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          await restartAgent();
          sidecarAlive = true;
          // Note: restartAttempts is reset when next sidecar message arrives
        } catch {
          if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            notify('error', `Sidecar restart failed after ${MAX_RESTART_ATTEMPTS} attempts`);
          }
        }
      } else {
        notify('error', `Sidecar restart failed after ${MAX_RESTART_ATTEMPTS} attempts`);
      }
    } finally {
      restarting = false;
    }
  });
}

function handleAgentEvent(sessionId: SessionIdType, event: Record<string, unknown>): void {
  const provider = getSessionProvider(sessionId);
  const messages = adaptMessage(provider, event);

  // Route messages with parentId to the appropriate child pane
  const mainMessages: typeof messages = [];
  const childBuckets = new Map<string, typeof messages>();

  for (const msg of messages) {
    const childPaneId = msg.parentId ? getChildPaneId(msg.parentId) : undefined;
    if (childPaneId) {
      if (!childBuckets.has(childPaneId)) childBuckets.set(childPaneId, []);
      childBuckets.get(childPaneId)!.push(msg);
    } else {
      mainMessages.push(msg);
    }
  }

  // Process main session messages
  for (const msg of mainMessages) {
    switch (msg.type) {
      case 'init': {
        const init = msg.content as InitContent;
        setAgentSdkSessionId(sessionId, init.sessionId);
        setAgentModel(sessionId, init.model);
        // CWD-based worktree detection for conflict suppression
        if (init.cwd) {
          const wtPath = detectWorktreeFromCwd(init.cwd);
          if (wtPath) {
            setSessionWorktree(sessionId, wtPath);
          }
        }
        break;
      }

      case 'tool_call': {
        const tc = msg.content as ToolCallContent;
        if (isSubagentToolCall(tc.name)) {
          spawnSubagentPane(sessionId, tc);
        }
        // Health: record tool start
        const projId = getSessionProjectId(sessionId);
        if (projId) {
          recordActivity(projId, tc.name);
          // Worktree tracking
          const wtPath = extractWorktreePath(tc);
          if (wtPath) {
            setSessionWorktree(sessionId, wtPath);
          }
          // Conflict detection: track file writes
          const writePaths = extractWritePaths(tc);
          for (const filePath of writePaths) {
            const isNewConflict = recordFileWrite(projId, sessionId, filePath);
            if (isNewConflict) {
              const shortName = filePath.split('/').pop() ?? filePath;
              notify('warning', `File conflict: ${shortName} — multiple agents writing`);
            }
          }
        }
        break;
      }

      case 'compaction': {
        // Auto-anchor on first compaction for this project
        const compactProjId = getSessionProjectId(sessionId);
        if (compactProjId && !hasAutoAnchored(compactProjId)) {
          markAutoAnchored(compactProjId);
          const session = getAgentSession(sessionId);
          if (session) {
            triggerAutoAnchor(compactProjId, session.messages, session.prompt);
          }
        }
        break;
      }

      case 'cost': {
        const cost = msg.content as CostContent;
        updateAgentCost(sessionId, {
          costUsd: cost.totalCostUsd,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          numTurns: cost.numTurns,
          durationMs: cost.durationMs,
        });
        tel.info('agent_cost', {
          sessionId,
          costUsd: cost.totalCostUsd,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          numTurns: cost.numTurns,
          durationMs: cost.durationMs,
          isError: cost.isError,
        });
        if (cost.isError) {
          const costErrorMsg = cost.errors?.join('; ') ?? 'Unknown error';
          const costClassified = classifyError(costErrorMsg);
          updateAgentStatus(sessionId, 'error', costErrorMsg);

          if (costClassified.type === 'rate_limit') {
            notify('warning', `Rate limited. ${costClassified.retryDelaySec > 0 ? `Retrying in ~${costClassified.retryDelaySec}s...` : ''}`);
          } else if (costClassified.type === 'auth') {
            notify('error', 'API key invalid or expired. Check Settings.');
          } else if (costClassified.type === 'quota') {
            notify('error', 'API quota exceeded. Check your billing.');
          } else {
            notify('error', `Agent failed: ${cost.errors?.[0] ?? 'Unknown error'}`);
          }
        } else {
          updateAgentStatus(sessionId, 'done');
          notify('success', `Agent done — $${cost.totalCostUsd.toFixed(4)}, ${cost.numTurns} turns`);
        }
        // Health: record token snapshot + tool done
        const costProjId = getSessionProjectId(sessionId);
        if (costProjId) {
          recordTokenSnapshot(costProjId, cost.inputTokens + cost.outputTokens, cost.totalCostUsd);
          recordToolDone(costProjId);
          // Conflict tracking: clear session writes on completion
          clearSessionWrites(costProjId, sessionId);
        }
        // Persist session state for project-scoped sessions
        persistSessionForProject(sessionId);
        break;
      }
    }
  }

  // Health: record general activity for non-tool messages (text, thinking)
  if (mainMessages.length > 0) {
    const actProjId = getSessionProjectId(sessionId);
    if (actProjId) {
      const hasToolResult = mainMessages.some(m => m.type === 'tool_result');
      if (hasToolResult) recordToolDone(actProjId);
      else recordActivity(actProjId);
    }
    appendAgentMessages(sessionId, mainMessages);

    // Index searchable text content into FTS5 search database
    for (const msg of mainMessages) {
      if (msg.type === 'text' && typeof msg.content === 'string' && msg.content.trim()) {
        indexMessage(sessionId, 'assistant', msg.content).catch(() => {});
      }
    }
  }

  // Append messages to child panes and update their status
  for (const [childPaneId, childMsgs] of childBuckets) {
    for (const msg of childMsgs) {
      if (msg.type === 'init') {
        const init = msg.content as InitContent;
        setAgentSdkSessionId(childPaneId, init.sessionId);
        setAgentModel(childPaneId, init.model);
        updateAgentStatus(childPaneId, 'running');
      } else if (msg.type === 'cost') {
        const cost = msg.content as CostContent;
        updateAgentCost(childPaneId, {
          costUsd: cost.totalCostUsd,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          numTurns: cost.numTurns,
          durationMs: cost.durationMs,
        });
        updateAgentStatus(childPaneId, cost.isError ? 'error' : 'done');
      }
    }
    appendAgentMessages(childPaneId, childMsgs);
  }
}

export function stopAgentDispatcher(): void {
  if (unlistenMsg) {
    unlistenMsg();
    unlistenMsg = null;
  }
  if (unlistenExit) {
    unlistenExit();
    unlistenExit = null;
  }
  // Clear routing maps to prevent unbounded memory growth
  clearSubagentRoutes();
  clearSessionMaps();
}
