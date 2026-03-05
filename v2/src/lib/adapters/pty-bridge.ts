import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PtyOptions {
  shell?: string;
  cwd?: string;
  args?: string[];
  cols?: number;
  rows?: number;
}

export async function spawnPty(options: PtyOptions): Promise<string> {
  return invoke<string>('pty_spawn', { options });
}

export async function writePty(id: string, data: string): Promise<void> {
  return invoke('pty_write', { id, data });
}

export async function resizePty(id: string, cols: number, rows: number): Promise<void> {
  return invoke('pty_resize', { id, cols, rows });
}

export async function killPty(id: string): Promise<void> {
  return invoke('pty_kill', { id });
}

export async function onPtyData(id: string, callback: (data: string) => void): Promise<UnlistenFn> {
  return listen<string>(`pty-data-${id}`, (event) => {
    callback(event.payload);
  });
}

export async function onPtyExit(id: string, callback: () => void): Promise<UnlistenFn> {
  return listen(`pty-exit-${id}`, () => {
    callback();
  });
}
