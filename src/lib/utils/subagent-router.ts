// Subagent routing — manages subagent pane creation and message routing
// Extracted from agent-dispatcher.ts (SRP: subagent lifecycle concern)

import type { ToolCallContent } from '../adapters/claude-messages';
import {
  createAgentSession,
  updateAgentStatus,
  findChildByToolUseId,
} from '../stores/agents.svelte';
import { addPane, getPanes } from '../stores/layout.svelte';
import { getSessionProjectId } from './session-persistence';

// Tool names that indicate a subagent spawn
const SUBAGENT_TOOL_NAMES = new Set(['Agent', 'Task', 'dispatch_agent']);

// Map toolUseId -> child session pane id for routing
const toolUseToChildPane = new Map<string, string>();

/** Check if a tool call is a subagent spawn */
export function isSubagentToolCall(toolName: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(toolName);
}

/** Get the child pane ID for a given toolUseId */
export function getChildPaneId(toolUseId: string): string | undefined {
  return toolUseToChildPane.get(toolUseId);
}

/** Check if a toolUseId has been mapped to a child pane */
export function hasChildPane(toolUseId: string): boolean {
  return toolUseToChildPane.has(toolUseId);
}

export function spawnSubagentPane(parentSessionId: string, tc: ToolCallContent): void {
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
  if (!getSessionProjectId(parentSessionId)) {
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

/** Clear subagent routing maps — called on dispatcher shutdown */
export function clearSubagentRoutes(): void {
  toolUseToChildPane.clear();
}
