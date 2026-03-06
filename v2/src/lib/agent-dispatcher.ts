// Agent Dispatcher — connects sidecar bridge events to agent store
// Single listener that routes sidecar messages to the correct agent session

import { onSidecarMessage, type SidecarMessage } from './adapters/agent-bridge';
import { adaptSDKMessage } from './adapters/sdk-messages';
import type { InitContent, CostContent } from './adapters/sdk-messages';
import {
  updateAgentStatus,
  setAgentSdkSessionId,
  setAgentModel,
  appendAgentMessages,
  updateAgentCost,
} from './stores/agents.svelte';

let unlistenFn: (() => void) | null = null;

export async function startAgentDispatcher(): Promise<void> {
  if (unlistenFn) return;

  unlistenFn = await onSidecarMessage((msg: SidecarMessage) => {
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
        break;

      case 'agent_error':
        updateAgentStatus(sessionId, 'error', msg.message);
        break;

      case 'agent_log':
        // Debug logging — could route to a log panel later
        break;
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
        } else {
          updateAgentStatus(sessionId, 'done');
        }
        break;
      }
    }
  }

  // Append all messages to the session history
  if (messages.length > 0) {
    appendAgentMessages(sessionId, messages);
  }
}

export function stopAgentDispatcher(): void {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}
