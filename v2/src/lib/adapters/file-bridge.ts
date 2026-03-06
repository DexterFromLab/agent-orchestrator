import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface FileChangedPayload {
  pane_id: string;
  path: string;
  content: string;
}

/** Start watching a file; returns initial content */
export async function watchFile(paneId: string, path: string): Promise<string> {
  return invoke('file_watch', { paneId, path });
}

export async function unwatchFile(paneId: string): Promise<void> {
  return invoke('file_unwatch', { paneId });
}

export async function readFile(path: string): Promise<string> {
  return invoke('file_read', { path });
}

export async function onFileChanged(
  callback: (payload: FileChangedPayload) => void
): Promise<UnlistenFn> {
  return listen<FileChangedPayload>('file-changed', (event) => {
    callback(event.payload);
  });
}
