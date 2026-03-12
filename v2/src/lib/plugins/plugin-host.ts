/**
 * Plugin Host — sandboxed runtime for BTerminal plugins.
 *
 * Plugins run via `new Function()` with a controlled API object (`bterminal`).
 * Dangerous globals are shadowed via `var` declarations inside strict mode.
 *
 * SECURITY BOUNDARY: Best-effort sandbox, NOT a security boundary.
 * `new Function()` executes in the same JS realm. Known limitations:
 *  - `arguments.callee.constructor('return this')()` can recover the real global
 *    object — this is inherent to `new Function()` and cannot be fully blocked
 *    without a separate realm (iframe, Worker, or wasm-based isolate).
 *  - Prototype chain walking (e.g., `({}).constructor.constructor`) can also
 *    reach Function and thus the global scope.
 *  - Plugins MUST be treated as UNTRUSTED. This sandbox reduces the attack
 *    surface but does not eliminate it. Defense in depth comes from the Rust
 *    backend's Landlock sandbox and permission-gated Tauri commands.
 */

import type { PluginMeta } from '../adapters/plugins-bridge';
import { readPluginFile } from '../adapters/plugins-bridge';
import { listTasks, getTaskComments } from '../adapters/bttask-bridge';
import {
  getUnreadMessages,
  getChannels,
} from '../adapters/btmsg-bridge';
import {
  addPluginCommand,
  removePluginCommands,
  pluginEventBus,
} from '../stores/plugins.svelte';
import type { GroupId, AgentId } from '../types/ids';

interface LoadedPlugin {
  meta: PluginMeta;
  cleanup: () => void;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

/**
 * Build the sandboxed API object for a plugin.
 * Only exposes capabilities matching the plugin's declared permissions.
 */
function buildPluginAPI(meta: PluginMeta, groupId: GroupId, agentId: AgentId): Record<string, unknown> {
  const api: Record<string, unknown> = {
    meta: Object.freeze({ ...meta }),
  };

  // palette permission — register command palette commands
  if (meta.permissions.includes('palette')) {
    api.palette = {
      registerCommand(label: string, callback: () => void) {
        if (typeof label !== 'string' || !label.trim()) {
          throw new Error('Command label must be a non-empty string');
        }
        if (typeof callback !== 'function') {
          throw new Error('Command callback must be a function');
        }
        addPluginCommand(meta.id, label, callback);
      },
    };
  }

  // bttask:read permission — read-only task access
  if (meta.permissions.includes('bttask:read')) {
    api.tasks = {
      async list() {
        return listTasks(groupId);
      },
      async comments(taskId: string) {
        return getTaskComments(taskId);
      },
    };
  }

  // btmsg:read permission — read-only message access
  if (meta.permissions.includes('btmsg:read')) {
    api.messages = {
      async inbox() {
        return getUnreadMessages(agentId);
      },
      async channels() {
        return getChannels(groupId);
      },
    };
  }

  // events permission — subscribe to app events
  if (meta.permissions.includes('events')) {
    const subscriptions: Array<{ event: string; callback: (data: unknown) => void }> = [];

    api.events = {
      on(event: string, callback: (data: unknown) => void) {
        if (typeof event !== 'string' || typeof callback !== 'function') {
          throw new Error('event.on requires (string, function)');
        }
        pluginEventBus.on(event, callback);
        subscriptions.push({ event, callback });
      },
      off(event: string, callback: (data: unknown) => void) {
        pluginEventBus.off(event, callback);
        const idx = subscriptions.findIndex(s => s.event === event && s.callback === callback);
        if (idx >= 0) subscriptions.splice(idx, 1);
      },
    };

    // Return a cleanup function that removes all subscriptions
    const originalCleanup = () => {
      for (const sub of subscriptions) {
        pluginEventBus.off(sub.event, sub.callback);
      }
      subscriptions.length = 0;
    };
    // Attach to meta for later use
    (api as { _eventCleanup?: () => void })._eventCleanup = originalCleanup;
  }

  return api;
}

/**
 * Load and execute a plugin in a sandboxed context.
 */
export async function loadPlugin(
  meta: PluginMeta,
  groupId: GroupId,
  agentId: AgentId,
): Promise<void> {
  if (loadedPlugins.has(meta.id)) {
    console.warn(`Plugin '${meta.id}' is already loaded`);
    return;
  }

  // Read the plugin's entry file
  let code: string;
  try {
    code = await readPluginFile(meta.id, meta.main);
  } catch (e) {
    throw new Error(`Failed to read plugin '${meta.id}' entry file '${meta.main}': ${e}`);
  }

  const api = buildPluginAPI(meta, groupId, agentId);

  // Execute the plugin code in a sandbox via new Function().
  // The plugin receives `bterminal` as its only external reference.
  // No access to window, document, fetch, globalThis, etc.
  try {
    const sandbox = new Function(
      'bterminal',
      // Explicitly shadow dangerous globals.
      // `var` declarations in strict mode shadow the outer scope names,
      // making direct references resolve to `undefined`.
      // See file-level JSDoc for known limitations of this approach.
      `"use strict";
       var window = undefined;
       var document = undefined;
       var fetch = undefined;
       var globalThis = undefined;
       var self = undefined;
       var XMLHttpRequest = undefined;
       var WebSocket = undefined;
       var Function = undefined;
       var importScripts = undefined;
       var require = undefined;
       var process = undefined;
       var Deno = undefined;
       var __TAURI__ = undefined;
       var __TAURI_INTERNALS__ = undefined;
       ${code}`,
    );
    // Bind `this` to undefined so plugin code cannot use `this` to reach
    // the global scope. In strict mode, `this` remains undefined.
    sandbox.call(undefined, Object.freeze(api));
  } catch (e) {
    // Clean up any partially registered commands
    removePluginCommands(meta.id);
    throw new Error(`Plugin '${meta.id}' execution failed: ${e}`);
  }

  const cleanup = () => {
    removePluginCommands(meta.id);
    const eventCleanup = (api as { _eventCleanup?: () => void })._eventCleanup;
    if (eventCleanup) eventCleanup();
  };

  loadedPlugins.set(meta.id, { meta, cleanup });
}

/**
 * Unload a plugin, removing all its registered commands and event subscriptions.
 */
export function unloadPlugin(id: string): void {
  const plugin = loadedPlugins.get(id);
  if (!plugin) return;
  plugin.cleanup();
  loadedPlugins.delete(id);
}

/**
 * Get all currently loaded plugins.
 */
export function getLoadedPlugins(): PluginMeta[] {
  return Array.from(loadedPlugins.values()).map(p => p.meta);
}

/**
 * Unload all plugins.
 */
export function unloadAllPlugins(): void {
  for (const [id] of loadedPlugins) {
    unloadPlugin(id);
  }
}
