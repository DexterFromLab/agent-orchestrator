// Agent Dispatcher — connects sidecar bridge events to agent store
// Single listener that routes sidecar messages to the correct agent session

import { onSidecarMessage, onSidecarExited, restartAgent, type SidecarMessage } from './adapters/agent-bridge';
import { adaptSDKMessage } from './adapters/sdk-messages';
import type { InitContent, CostContent } from './adapters/sdk-messages';
import {
  updateAgentStatus,
  setAgentSdkSessionId,
  setAgentModel,
  appendAgentMessages,
  updateAgentCost,
  getAgentSessions,
} from './stores/agents.svelte';
import { notify } from './stores/notifications.svelte';

let unlistenMsg: (() => void) | null = null;
let unlistenExit: (() => void) | null = null;

// Sidecar liveness — checked by UI components
let sidecarAlive = true;

// Sidecar crash recovery state
const MAX_RESTART_ATTEMPTS = 3;
let restartAttempts = 0;
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

    const sessionId = msg.sessionId;
    if (!sessionId) return;

    switch (msg.type) {
      case 'agent_started':
        updateAgentStatus(sessionId, 'running');
        break;

      case 'agent_event':
        handleAgentEvent(sessionId, msg.event!);
        break;

      case 'agent_stopped':
        updateAgentStatus(sessionId, 'done');
        notify('success', `Agent ${sessionId.slice(0, 8)} completed`);
        break;

      case 'agent_error':
        updateAgentStatus(sessionId, 'error', msg.message);
        notify('error', `Agent error: ${msg.message ?? 'Unknown'}`);
        break;

      case 'agent_log':
        break;
    }
  });

  unlistenExit = await onSidecarExited(async () => {
    sidecarAlive = false;
    // Mark all running sessions as errored
    for (const session of getAgentSessions()) {
      if (session.status === 'running' || session.status === 'starting') {
        updateAgentStatus(session.id, 'error', 'Sidecar crashed');
      }
    }

    // Attempt auto-restart with exponential backoff
    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      const delayMs = 1000 * Math.pow(2, restartAttempts - 1); // 1s, 2s, 4s
      notify('warning', `Sidecar crashed, restarting (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
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
  });
}

function handleAgentEvent(sessionId: string, event: Record<string, unknown>): void {
  const messages = adaptSDKMessage(event);

  for (const msg of messages) {
    switch (msg.type) {
      case 'init': {
        const init = msg.content as InitContent;
        setAgentSdkSessionId(sessionId, init.sessionId);
        setAgentModel(sessionId, init.model);
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
        if (cost.isError) {
          updateAgentStatus(sessionId, 'error', cost.errors?.join('; '));
          notify('error', `Agent failed: ${cost.errors?.[0] ?? 'Unknown error'}`);
        } else {
          updateAgentStatus(sessionId, 'done');
          notify('success', `Agent done — $${cost.totalCostUsd.toFixed(4)}, ${cost.numTurns} turns`);
        }
        break;
      }
    }
  }

  if (messages.length > 0) {
    appendAgentMessages(sessionId, messages);
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
}
