import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PtyOptions {
  shell?: string;
  cwd?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  remote_machine_id?: string;
}

export async function spawnPty(options: PtyOptions): Promise<string> {
  if (options.remote_machine_id) {
    const { remote_machine_id: machineId, ...ptyOptions } = options;
    return invoke<string>('remote_pty_spawn', { machineId, options: ptyOptions });
  }
  return invoke<string>('pty_spawn', { options });
}

export async function writePty(id: string, data: string, remoteMachineId?: string): Promise<void> {
  if (remoteMachineId) {
    return invoke('remote_pty_write', { machineId: remoteMachineId, id, data });
  }
  return invoke('pty_write', { id, data });
}

export async function resizePty(id: string, cols: number, rows: number, remoteMachineId?: string): Promise<void> {
  if (remoteMachineId) {
    return invoke('remote_pty_resize', { machineId: remoteMachineId, id, cols, rows });
  }
  return invoke('pty_resize', { id, cols, rows });
}

export async function killPty(id: string, remoteMachineId?: string): Promise<void> {
  if (remoteMachineId) {
    return invoke('remote_pty_kill', { machineId: remoteMachineId, id });
  }
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
