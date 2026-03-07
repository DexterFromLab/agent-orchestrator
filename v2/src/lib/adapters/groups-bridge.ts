import { invoke } from '@tauri-apps/api/core';
import type { GroupsFile, ProjectConfig, GroupConfig } from '../types/groups';

export type { GroupsFile, ProjectConfig, GroupConfig };

export interface MdFileEntry {
  name: string;
  path: string;
  priority: boolean;
}

export interface AgentMessageRecord {
  id: number;
  session_id: string;
  project_id: string;
  sdk_session_id: string | null;
  message_type: string;
  content: string;
  parent_id: string | null;
  created_at: number;
}

export interface ProjectAgentState {
  project_id: string;
  last_session_id: string;
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
  sessionId: string,
  projectId: string,
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

export async function loadAgentMessages(projectId: string): Promise<AgentMessageRecord[]> {
  return invoke('agent_messages_load', { projectId });
}

// --- Project agent state ---

export async function saveProjectAgentState(state: ProjectAgentState): Promise<void> {
  return invoke('project_agent_state_save', { state });
}

export async function loadProjectAgentState(projectId: string): Promise<ProjectAgentState | null> {
  return invoke('project_agent_state_load', { projectId });
}

// --- CLI arguments ---

export async function getCliGroup(): Promise<string | null> {
  return invoke('cli_get_group');
}
