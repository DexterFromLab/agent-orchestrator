import { invoke } from '@tauri-apps/api/core';

export interface SshSession {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  key_file: string;
  folder: string;
  color: string;
  created_at: number;
  last_used_at: number;
}

export async function listSshSessions(): Promise<SshSession[]> {
  return invoke('ssh_session_list');
}

export async function saveSshSession(session: SshSession): Promise<void> {
  return invoke('ssh_session_save', { session });
}

export async function deleteSshSession(id: string): Promise<void> {
  return invoke('ssh_session_delete', { id });
}
