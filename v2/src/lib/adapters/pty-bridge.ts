// PTY Bridge — IPC wrapper for Rust PTY backend
// Phase 2: terminal spawn, resize, input/output streaming

export interface PtyOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * Spawn a new PTY session via Tauri IPC.
 * Phase 2: implement with @tauri-apps/api invoke
 */
export async function spawnPty(_options: PtyOptions): Promise<string> {
  throw new Error('Not implemented — Phase 2');
}

export async function writePty(_id: string, _data: string): Promise<void> {
  throw new Error('Not implemented — Phase 2');
}

export async function resizePty(_id: string, _cols: number, _rows: number): Promise<void> {
  throw new Error('Not implemented — Phase 2');
}

export async function killPty(_id: string): Promise<void> {
  throw new Error('Not implemented — Phase 2');
}
