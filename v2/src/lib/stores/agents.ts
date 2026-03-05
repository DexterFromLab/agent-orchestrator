// Agent tracking state — Svelte 5 runes
// Phase 3: SDK agent lifecycle, subagent tree

export type AgentStatus = 'idle' | 'running' | 'thinking' | 'waiting' | 'done' | 'error';

export interface AgentState {
  id: string;
  sessionId: string;
  parentId?: string;
  status: AgentStatus;
  model?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
}

let agents = $state<AgentState[]>([]);

export function getAgents() {
  return agents;
}

export function getAgentTree(rootId: string): AgentState[] {
  const result: AgentState[] = [];
  const root = agents.find(a => a.id === rootId);
  if (!root) return result;

  result.push(root);
  const children = agents.filter(a => a.parentId === rootId);
  for (const child of children) {
    result.push(...getAgentTree(child.id));
  }
  return result;
}
