import { invoke } from '@tauri-apps/api/core';
import type { GroupsFile, ProjectConfig, GroupConfig } from '../types/groups';
import type { SessionId, ProjectId } from '../types/ids';

export type { GroupsFile, ProjectConfig, GroupConfig };

export interface MdFileEntry {
  name: string;
  path: string;
  priority: boolean;
}

export interface AgentMessageRecord {
  id: number;
  session_id: SessionId;
  project_id: ProjectId;
  sdk_session_id: string | null;
  message_type: string;
  content: string;
  parent_id: string | null;
  created_at: number;
}

export interface ProjectAgentState {
  project_id: ProjectId;
  last_session_id: SessionId;
  sdk_session_id: string | null;
  status: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  last_prompt: string | null;
  updated_at: number;
}

// --- Group config ---

export async function loadGroups(): Promise<GroupsFile> {
  return invoke('groups_load');
}

export async function saveGroups(config: GroupsFile): Promise<void> {
  return invoke('groups_save', { config });
}

// --- Markdown discovery ---

export async function discoverMarkdownFiles(cwd: string): Promise<MdFileEntry[]> {
  return invoke('discover_markdown_files', { cwd });
}

// --- Agent message persistence ---

export async function saveAgentMessages(
  sessionId: SessionId,
  projectId: ProjectId,
  sdkSessionId: string | undefined,
  messages: AgentMessageRecord[],
): Promise<void> {
  return invoke('agent_messages_save', {
    sessionId,
    projectId,
    sdkSessionId: sdkSessionId ?? null,
    messages,
  });
}

export async function loadAgentMessages(projectId: ProjectId): Promise<AgentMessageRecord[]> {
  return invoke('agent_messages_load', { projectId });
}

// --- Project agent state ---

export async function saveProjectAgentState(state: ProjectAgentState): Promise<void> {
  return invoke('project_agent_state_save', { state });
}

export async function loadProjectAgentState(projectId: ProjectId): Promise<ProjectAgentState | null> {
  return invoke('project_agent_state_load', { projectId });
}

// --- Session metrics ---

export interface SessionMetric {
  id: number;
  project_id: ProjectId;
  session_id: SessionId;
  start_time: number;
  end_time: number;
  peak_tokens: number;
  turn_count: number;
  tool_call_count: number;
  cost_usd: number;
  model: string | null;
  status: string;
  error_message: string | null;
}

export async function saveSessionMetric(metric: Omit<SessionMetric, 'id'>): Promise<void> {
  return invoke('session_metric_save', { metric: { id: 0, ...metric } });
}

export async function loadSessionMetrics(projectId: ProjectId, limit = 20): Promise<SessionMetric[]> {
  return invoke('session_metrics_load', { projectId, limit });
}

// --- CLI arguments ---

export async function getCliGroup(): Promise<string | null> {
  return invoke('cli_get_group');
}
