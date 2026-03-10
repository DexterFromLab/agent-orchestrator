// Filesystem watcher bridge — listens for inotify-based write events from Rust
// Part of S-1 Phase 2: real-time filesystem write detection

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface FsWriteEvent {
  project_id: string;
  file_path: string;
  timestamp_ms: number;
}

/** Start watching a project's CWD for filesystem writes */
export function fsWatchProject(projectId: string, cwd: string): Promise<void> {
  return invoke('fs_watch_project', { projectId, cwd });
}

/** Stop watching a project's CWD */
export function fsUnwatchProject(projectId: string): Promise<void> {
  return invoke('fs_unwatch_project', { projectId });
}

/** Listen for filesystem write events from all watched projects */
export function onFsWriteDetected(
  callback: (event: FsWriteEvent) => void,
): Promise<UnlistenFn> {
  return listen<FsWriteEvent>('fs-write-detected', (e) => callback(e.payload));
}
