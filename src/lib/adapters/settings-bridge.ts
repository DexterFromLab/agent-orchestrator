import { invoke } from '@tauri-apps/api/core';

export async function getSetting(key: string): Promise<string | null> {
  return invoke('settings_get', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('settings_set', { key, value });
}

export async function listSettings(): Promise<[string, string][]> {
  return invoke('settings_list');
}
