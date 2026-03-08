// Agent Dispatcher — connects sidecar bridge events to agent store
// Single listener that routes sidecar messages to the correct agent session

import { onSidecarMessage, onSidecarExited, restartAgent, type SidecarMessage } from './adapters/agent-bridge';
import { adaptSDKMessage } from './adapters/sdk-messages';
import type { InitContent, CostContent, ToolCallContent } from './adapters/sdk-messages';
import {
  updateAgentStatus,
  setAgentSdkSessionId,
  setAgentModel,
  appendAgentMessages,
  updateAgentCost,
  getAgentSessions,
  getAgentSession,
  createAgentSession,
  findChildByToolUseId,
} from './stores/agents.svelte';
import { addPane, getPanes } from './stores/layout.svelte';
import { notify } from './stores/notifications.svelte';
import {
  saveProjectAgentState,
  saveAgentMessages,
  type AgentMessageRecord,
} from './adapters/groups-bridge';

let unlistenMsg: (() => void) | null = null;
let unlistenExit: (() => void) | null = null;

// Map sessionId -> projectId for persistence routing
const sessionProjectMap = new Map<string, string>();

export function registerSessionProject(sessionId: string, projectId: string): void {
  sessionProjectMap.set(sessionId, projectId);
}

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

    const sessionId = msg.sessionId;
    if (!sessionId) return;

    switch (msg.type) {
      case 'agent_started':
        updateAgentStatus(sessionId, 'running');
        break;

      case 'agent_event':
        if (msg.event) handleAgentEvent(sessionId, msg.event);
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

// Tool names that indicate a subagent spawn
const SUBAGENT_TOOL_NAMES = new Set(['Agent', 'Task', 'dispatch_agent']);

// Map toolUseId -> child session pane id for routing
const toolUseToChildPane = new Map<string, string>();

function handleAgentEvent(sessionId: string, event: Record<string, unknown>): void {
  const messages = adaptSDKMessage(event);

  // Route messages with parentId to the appropriate child pane
  const mainMessages: typeof messages = [];
  const childBuckets = new Map<string, typeof messages>();

  for (const msg of messages) {
    if (msg.parentId && toolUseToChildPane.has(msg.parentId)) {
      const childPaneId = toolUseToChildPane.get(msg.parentId)!;
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
        break;
      }

      case 'tool_call': {
        const tc = msg.content as ToolCallContent;
        if (SUBAGENT_TOOL_NAMES.has(tc.name)) {
          spawnSubagentPane(sessionId, tc);
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
        if (cost.isError) {
          updateAgentStatus(sessionId, 'error', cost.errors?.join('; '));
          notify('error', `Agent failed: ${cost.errors?.[0] ?? 'Unknown error'}`);
        } else {
          updateAgentStatus(sessionId, 'done');
          notify('success', `Agent done — $${cost.totalCostUsd.toFixed(4)}, ${cost.numTurns} turns`);
        }
        // Persist session state for project-scoped sessions
        persistSessionForProject(sessionId);
        break;
      }
    }
  }

  if (mainMessages.length > 0) {
    appendAgentMessages(sessionId, mainMessages);
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

function spawnSubagentPane(parentSessionId: string, tc: ToolCallContent): void {
  // Don't create duplicate pane for same tool_use
  if (toolUseToChildPane.has(tc.toolUseId)) return;
  const existing = findChildByToolUseId(parentSessionId, tc.toolUseId);
  if (existing) {
    toolUseToChildPane.set(tc.toolUseId, existing.id);
    return;
  }

  const childId = crypto.randomUUID();
  const prompt = typeof tc.input === 'object' && tc.input !== null
    ? (tc.input as Record<string, unknown>).prompt as string ?? tc.name
    : tc.name;
  const label = typeof tc.input === 'object' && tc.input !== null
    ? (tc.input as Record<string, unknown>).name as string ?? tc.name
    : tc.name;

  // Register routing
  toolUseToChildPane.set(tc.toolUseId, childId);

  // Create agent session with parent link
  createAgentSession(childId, prompt, {
    sessionId: parentSessionId,
    toolUseId: tc.toolUseId,
  });
  updateAgentStatus(childId, 'running');

  // For project-scoped sessions, subagents render in TeamAgentsPanel (no layout pane)
  // For non-project sessions (detached mode), create a layout pane
  if (!sessionProjectMap.has(parentSessionId)) {
    const parentPane = getPanes().find(p => p.id === parentSessionId);
    const groupName = parentPane?.title ?? `Agent ${parentSessionId.slice(0, 8)}`;
    addPane({
      id: childId,
      type: 'agent',
      title: `Sub: ${label}`,
      group: groupName,
    });
  }
}

/** Persist session state + messages to SQLite for the project that owns this session */
async function persistSessionForProject(sessionId: string): Promise<void> {
  const projectId = sessionProjectMap.get(sessionId);
  if (!projectId) return; // Not a project-scoped session

  const session = getAgentSession(sessionId);
  if (!session) return;

  try {
    // Save agent state
    await saveProjectAgentState({
      project_id: projectId,
      last_session_id: sessionId,
      sdk_session_id: session.sdkSessionId ?? null,
      status: session.status,
      cost_usd: session.costUsd,
      input_tokens: session.inputTokens,
      output_tokens: session.outputTokens,
      last_prompt: session.prompt,
      updated_at: Date.now(),
    });

    // Save messages
    const records: AgentMessageRecord[] = session.messages.map((m, i) => ({
      id: i,
      session_id: sessionId,
      project_id: projectId,
      sdk_session_id: session.sdkSessionId ?? null,
      message_type: m.type,
      content: JSON.stringify(m.content),
      parent_id: m.parentId ?? null,
      created_at: Date.now(),
    }));

    if (records.length > 0) {
      await saveAgentMessages(sessionId, projectId, session.sdkSessionId, records);
    }
  } catch (e) {
    console.warn('Failed to persist agent session:', e);
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
  toolUseToChildPane.clear();
  sessionProjectMap.clear();
}
