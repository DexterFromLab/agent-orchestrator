// Plugin discovery and file access — Tauri IPC adapter

import { invoke } from '@tauri-apps/api/core';

export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  permissions: string[];
}

/** Discover all plugins in ~/.config/bterminal/plugins/ */
export async function discoverPlugins(): Promise<PluginMeta[]> {
  return invoke<PluginMeta[]>('plugins_discover');
}

/** Read a file from a plugin's directory (path-traversal safe) */
export async function readPluginFile(pluginId: string, filename: string): Promise<string> {
  return invoke<string>('plugin_read_file', { pluginId, filename });
}
