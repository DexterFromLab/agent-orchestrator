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
}

let sessions = $state<AgentSession[]>([]);

export function getAgentSessions(): AgentSession[] {
  return sessions;
}

export function getAgentSession(id: string): AgentSession | undefined {
  return sessions.find(s => s.id === id);
}

export function createAgentSession(id: string, prompt: string): void {
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
  });
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

export function removeAgentSession(id: string): void {
  sessions = sessions.filter(s => s.id !== id);
}
