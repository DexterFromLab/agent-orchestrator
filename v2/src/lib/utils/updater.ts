// Auto-update checker — uses Tauri updater plugin
// Requires signing key to be configured in tauri.conf.json before use

import { check } from '@tauri-apps/plugin-updater';

export async function checkForUpdates(): Promise<{
  available: boolean;
  version?: string;
  notes?: string;
}> {
  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        version: update.version,
        notes: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch {
    // Updater not configured or network error — silently skip
    return { available: false };
  }
}

export async function installUpdate(): Promise<void> {
  const update = await check();
  if (update) {
    await update.downloadAndInstall();
  }
}
