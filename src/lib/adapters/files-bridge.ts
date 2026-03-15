import { invoke } from '@tauri-apps/api/core';

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  ext: string;
}

export type FileContent =
  | { type: 'Text'; content: string; lang: string }
  | { type: 'Binary'; message: string }
  | { type: 'TooLarge'; size: number };

export function listDirectoryChildren(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('list_directory_children', { path });
}

export function readFileContent(path: string): Promise<FileContent> {
  return invoke<FileContent>('read_file_content', { path });
}

export function writeFileContent(path: string, content: string): Promise<void> {
  return invoke<void>('write_file_content', { path, content });
}
