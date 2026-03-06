import { invoke } from '@tauri-apps/api/core';

export interface PersistedSession {
  id: string;
  type: string;
  title: string;
  shell?: string;
  cwd?: string;
  args?: string[];
  created_at: number;
  last_used_at: number;
}

export interface PersistedLayout {
  preset: string;
  pane_ids: string[];
}

export async function listSessions(): Promise<PersistedSession[]> {
  return invoke('session_list');
}

export async function saveSession(session: PersistedSession): Promise<void> {
  return invoke('session_save', { session });
}

export async function deleteSession(id: string): Promise<void> {
  return invoke('session_delete', { id });
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  return invoke('session_update_title', { id, title });
}

export async function touchSession(id: string): Promise<void> {
  return invoke('session_touch', { id });
}

export async function saveLayout(layout: PersistedLayout): Promise<void> {
  return invoke('layout_save', { layout });
}

export async function loadLayout(): Promise<PersistedLayout> {
  return invoke('layout_load');
}
