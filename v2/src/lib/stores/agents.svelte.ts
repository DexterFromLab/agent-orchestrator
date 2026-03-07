// Agent tracking state — Svelte 5 runes
// Manages agent session lifecycle and message history

import type { AgentMessage } from '../adapters/sdk-messages';

export type AgentStatus = 'idle' | 'starting' | 'running' | 'done' | 'error';

export interface AgentSession {
  id: string;
  sdkSessionId?: string;
  status: AgentStatus;
  model?: string;
  prompt: string;
  messages: AgentMessage[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  durationMs: number;
  error?: string;
  // Agent Teams: parent/child hierarchy
  parentSessionId?: string;
  parentToolUseId?: string;
  childSessionIds: string[];
}

let sessions = $state<AgentSession[]>([]);

export function getAgentSessions(): AgentSession[] {
  return sessions;
}

export function getAgentSession(id: string): AgentSession | undefined {
  return sessions.find(s => s.id === id);
}

export function createAgentSession(id: string, prompt: string, parent?: { sessionId: string; toolUseId: string }): void {
  sessions.push({
    id,
    status: 'starting',
    prompt,
    messages: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    numTurns: 0,
    durationMs: 0,
    parentSessionId: parent?.sessionId,
    parentToolUseId: parent?.toolUseId,
    childSessionIds: [],
  });

  // Register as child of parent
  if (parent) {
    const parentSession = sessions.find(s => s.id === parent.sessionId);
    if (parentSession) {
      parentSession.childSessionIds.push(id);
    }
  }
}

export function updateAgentStatus(id: string, status: AgentStatus, error?: string): void {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.status = status;
  if (error) session.error = error;
}

export function setAgentSdkSessionId(id: string, sdkSessionId: string): void {
  const session = sessions.find(s => s.id === id);
  if (session) session.sdkSessionId = sdkSessionId;
}

export function setAgentModel(id: string, model: string): void {
  const session = sessions.find(s => s.id === id);
  if (session) session.model = model;
}

export function appendAgentMessage(id: string, message: AgentMessage): void {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.messages.push(message);
}

export function appendAgentMessages(id: string, messages: AgentMessage[]): void {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.messages.push(...messages);
}

export function updateAgentCost(
  id: string,
  cost: { costUsd: number; inputTokens: number; outputTokens: number; numTurns: number; durationMs: number },
): void {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.costUsd = cost.costUsd;
  session.inputTokens = cost.inputTokens;
  session.outputTokens = cost.outputTokens;
  session.numTurns = cost.numTurns;
  session.durationMs = cost.durationMs;
}

/** Find a child session that was spawned by a specific tool_use */
export function findChildByToolUseId(parentId: string, toolUseId: string): AgentSession | undefined {
  return sessions.find(s => s.parentSessionId === parentId && s.parentToolUseId === toolUseId);
}

/** Get all child sessions for a given parent */
export function getChildSessions(parentId: string): AgentSession[] {
  return sessions.filter(s => s.parentSessionId === parentId);
}

/** Aggregate cost of a session plus all its children (recursive) */
export function getTotalCost(id: string): { costUsd: number; inputTokens: number; outputTokens: number } {
  const session = sessions.find(s => s.id === id);
  if (!session) return { costUsd: 0, inputTokens: 0, outputTokens: 0 };

  let costUsd = session.costUsd;
  let inputTokens = session.inputTokens;
  let outputTokens = session.outputTokens;

  for (const childId of session.childSessionIds) {
    const childCost = getTotalCost(childId);
    costUsd += childCost.costUsd;
    inputTokens += childCost.inputTokens;
    outputTokens += childCost.outputTokens;
  }

  return { costUsd, inputTokens, outputTokens };
}

export function clearAllAgentSessions(): void {
  sessions = [];
}

export function removeAgentSession(id: string): void {
  // Also remove from parent's childSessionIds
  const session = sessions.find(s => s.id === id);
  if (session?.parentSessionId) {
    const parent = sessions.find(s => s.id === session.parentSessionId);
    if (parent) {
      parent.childSessionIds = parent.childSessionIds.filter(cid => cid !== id);
    }
  }
  sessions = sessions.filter(s => s.id !== id);
}
