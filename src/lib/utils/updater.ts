// Auto-update checker — uses Tauri updater plugin
// Requires signing key to be configured in tauri.conf.json before use

import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  date?: string;
  currentVersion?: string;
}

// Cache the last check result for UI access
let lastCheckResult: UpdateInfo | null = null;
let lastCheckTimestamp: number | null = null;
let cachedUpdate: Update | null = null;

export function getLastCheckResult(): UpdateInfo | null {
  return lastCheckResult;
}

export function getLastCheckTimestamp(): number | null {
  return lastCheckTimestamp;
}

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return '0.0.0';
  }
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const [update, currentVersion] = await Promise.all([check(), getCurrentVersion()]);
    lastCheckTimestamp = Date.now();

    if (update) {
      cachedUpdate = update;
      lastCheckResult = {
        available: true,
        version: update.version,
        notes: update.body ?? undefined,
        date: update.date ?? undefined,
        currentVersion,
      };
    } else {
      cachedUpdate = null;
      lastCheckResult = {
        available: false,
        currentVersion,
      };
    }

    return lastCheckResult;
  } catch {
    // Updater not configured or network error — silently skip
    lastCheckResult = { available: false };
    lastCheckTimestamp = Date.now();
    return lastCheckResult;
  }
}

export async function installUpdate(): Promise<void> {
  // Use cached update from last check if available
  const update = cachedUpdate ?? (await check());
  if (update) {
    // downloadAndInstall will restart the app after installation
    await update.downloadAndInstall();
    // If we reach here, the app should relaunch automatically
  }
}
