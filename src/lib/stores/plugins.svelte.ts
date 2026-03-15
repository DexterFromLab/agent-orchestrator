/**
 * Plugin store — tracks plugin commands, event bus, and plugin state.
 * Uses Svelte 5 runes for reactivity.
 */

import type { PluginMeta } from '../adapters/plugins-bridge';
import { discoverPlugins } from '../adapters/plugins-bridge';
import { getSetting, setSetting } from '../adapters/settings-bridge';
import { loadPlugin, unloadPlugin, unloadAllPlugins, getLoadedPlugins } from '../plugins/plugin-host';
import type { GroupId, AgentId } from '../types/ids';

// --- Plugin command registry (for CommandPalette) ---

export interface PluginCommand {
  pluginId: string;
  label: string;
  callback: () => void;
}

let commands = $state<PluginCommand[]>([]);

/** Get all plugin-registered commands (reactive). */
export function getPluginCommands(): PluginCommand[] {
  return commands;
}

/** Register a command from a plugin. Called by plugin-host. */
export function addPluginCommand(pluginId: string, label: string, callback: () => void): void {
  commands = [...commands, { pluginId, label, callback }];
}

/** Remove all commands registered by a specific plugin. Called on unload. */
export function removePluginCommands(pluginId: string): void {
  commands = commands.filter(c => c.pluginId !== pluginId);
}

// --- Plugin event bus (simple pub/sub) ---

type EventCallback = (data: unknown) => void;

class PluginEventBusImpl {
  private listeners = new Map<string, Set<EventCallback>>();

  on(event: string, callback: EventCallback): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (e) {
        console.error(`Plugin event handler error for '${event}':`, e);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const pluginEventBus = new PluginEventBusImpl();

// --- Plugin discovery and lifecycle ---

export type PluginStatus = 'discovered' | 'loaded' | 'error' | 'disabled';

export interface PluginEntry {
  meta: PluginMeta;
  status: PluginStatus;
  error?: string;
}

let pluginEntries = $state<PluginEntry[]>([]);

/** Get all discovered plugins with their status (reactive). */
export function getPluginEntries(): PluginEntry[] {
  return pluginEntries;
}

/** Settings key for plugin enabled state */
function pluginEnabledKey(pluginId: string): string {
  return `plugin_enabled_${pluginId}`;
}

/** Check if a plugin is enabled in settings (default: true for new plugins) */
async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const val = await getSetting(pluginEnabledKey(pluginId));
  if (val === null || val === undefined) return true; // enabled by default
  return val === 'true' || val === '1';
}

/** Set plugin enabled state */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  await setSetting(pluginEnabledKey(pluginId), enabled ? 'true' : 'false');

  // Update in-memory state
  if (enabled) {
    const entry = pluginEntries.find(e => e.meta.id === pluginId);
    if (entry && entry.status === 'disabled') {
      await loadSinglePlugin(entry);
    }
  } else {
    unloadPlugin(pluginId);
    pluginEntries = pluginEntries.map(e =>
      e.meta.id === pluginId ? { ...e, status: 'disabled' as PluginStatus, error: undefined } : e,
    );
  }
}

/** Load a single plugin entry, updating its status */
async function loadSinglePlugin(
  entry: PluginEntry,
  groupId?: GroupId,
  agentId?: AgentId,
): Promise<void> {
  const gid = groupId ?? ('' as GroupId);
  const aid = agentId ?? ('admin' as AgentId);

  try {
    await loadPlugin(entry.meta, gid, aid);
    pluginEntries = pluginEntries.map(e =>
      e.meta.id === entry.meta.id ? { ...e, status: 'loaded' as PluginStatus, error: undefined } : e,
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to load plugin '${entry.meta.id}':`, errorMsg);
    pluginEntries = pluginEntries.map(e =>
      e.meta.id === entry.meta.id ? { ...e, status: 'error' as PluginStatus, error: errorMsg } : e,
    );
  }
}

/**
 * Discover and load all enabled plugins.
 * Called at app startup or when reloading plugins.
 */
export async function loadAllPlugins(groupId?: GroupId, agentId?: AgentId): Promise<void> {
  // Unload any currently loaded plugins first
  unloadAllPlugins();
  pluginEventBus.clear();
  commands = [];

  let discovered: PluginMeta[];
  try {
    discovered = await discoverPlugins();
  } catch (e) {
    console.error('Failed to discover plugins:', e);
    pluginEntries = [];
    return;
  }

  // Build entries with initial status
  const entries: PluginEntry[] = [];
  for (const meta of discovered) {
    const enabled = await isPluginEnabled(meta.id);
    entries.push({
      meta,
      status: enabled ? 'discovered' : 'disabled',
    });
  }
  pluginEntries = entries;

  // Load enabled plugins
  for (const entry of pluginEntries) {
    if (entry.status === 'discovered') {
      await loadSinglePlugin(entry, groupId, agentId);
    }
  }
}

/**
 * Reload all plugins (re-discover and re-load).
 */
export async function reloadAllPlugins(groupId?: GroupId, agentId?: AgentId): Promise<void> {
  await loadAllPlugins(groupId, agentId);
}

/**
 * Clean up all plugins and state.
 */
export function destroyAllPlugins(): void {
  unloadAllPlugins();
  pluginEventBus.clear();
  commands = [];
  pluginEntries = [];
}
