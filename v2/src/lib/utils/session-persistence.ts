// Session persistence — maps session IDs to projects/providers and persists state to SQLite
// Extracted from agent-dispatcher.ts (SRP: persistence concern)

import type { SessionId as SessionIdType, ProjectId as ProjectIdType } from '../types/ids';
import type { ProviderId } from '../providers/types';
import { getAgentSession } from '../stores/agents.svelte';
import {
  saveProjectAgentState,
  saveAgentMessages,
  saveSessionMetric,
  type AgentMessageRecord,
} from '../adapters/groups-bridge';

// Map sessionId -> projectId for persistence routing
const sessionProjectMap = new Map<SessionIdType, ProjectIdType>();

// Map sessionId -> provider for message adapter routing
const sessionProviderMap = new Map<SessionIdType, ProviderId>();

// Map sessionId -> start timestamp for metrics
const sessionStartTimes = new Map<SessionIdType, number>();

// In-flight persistence counter — prevents teardown from racing with async saves
let pendingPersistCount = 0;

export function registerSessionProject(sessionId: SessionIdType, projectId: ProjectIdType, provider: ProviderId = 'claude'): void {
  sessionProjectMap.set(sessionId, projectId);
  sessionProviderMap.set(sessionId, provider);
}

export function getSessionProjectId(sessionId: SessionIdType): ProjectIdType | undefined {
  return sessionProjectMap.get(sessionId);
}

export function getSessionProvider(sessionId: SessionIdType): ProviderId {
  return sessionProviderMap.get(sessionId) ?? 'claude';
}

export function recordSessionStart(sessionId: SessionIdType): void {
  sessionStartTimes.set(sessionId, Date.now());
}

/** Wait until all in-flight persistence operations complete */
export async function waitForPendingPersistence(): Promise<void> {
  while (pendingPersistCount > 0) {
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Persist session state + messages to SQLite for the project that owns this session */
export async function persistSessionForProject(sessionId: SessionIdType): Promise<void> {
  const projectId = sessionProjectMap.get(sessionId);
  if (!projectId) return; // Not a project-scoped session

  const session = getAgentSession(sessionId);
  if (!session) return;

  pendingPersistCount++;
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
      updated_at: Math.floor(Date.now() / 1000),
    });

    // Save messages (use seconds to match session.rs convention)
    const nowSecs = Math.floor(Date.now() / 1000);
    const records: AgentMessageRecord[] = session.messages.map((m, i) => ({
      id: i,
      session_id: sessionId,
      project_id: projectId,
      sdk_session_id: session.sdkSessionId ?? null,
      message_type: m.type,
      content: JSON.stringify(m.content),
      parent_id: m.parentId ?? null,
      created_at: nowSecs,
    }));

    if (records.length > 0) {
      await saveAgentMessages(sessionId, projectId, session.sdkSessionId, records);
    }

    // Persist session metric for historical tracking
    const toolCallCount = session.messages.filter(m => m.type === 'tool_call').length;
    const startTime = sessionStartTimes.get(sessionId) ?? Math.floor(Date.now() / 1000);
    await saveSessionMetric({
      project_id: projectId,
      session_id: sessionId,
      start_time: Math.floor(startTime / 1000),
      end_time: nowSecs,
      peak_tokens: session.inputTokens + session.outputTokens,
      turn_count: session.numTurns,
      tool_call_count: toolCallCount,
      cost_usd: session.costUsd,
      model: session.model ?? null,
      status: session.status,
      error_message: session.error ?? null,
    });
  } catch (e) {
    console.warn('Failed to persist agent session:', e);
  } finally {
    pendingPersistCount--;
  }
}

/** Clear all session maps — called on dispatcher shutdown */
export function clearSessionMaps(): void {
  sessionProjectMap.clear();
  sessionProviderMap.clear();
  sessionStartTimes.clear();
}
