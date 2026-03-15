/**
 * Plugin Host — Web Worker sandbox for BTerminal plugins.
 *
 * Each plugin runs in a dedicated Web Worker, providing true process-level
 * isolation from the main thread. The Worker has no access to the DOM,
 * Tauri IPC, or any main-thread state.
 *
 * Communication:
 * - Main → Worker: plugin code, permissions, callback invocations
 * - Worker → Main: API call proxies (palette, tasks, messages, events)
 *
 * On unload, the Worker is terminated — all plugin state is destroyed.
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
  worker: Worker;
  callbacks: Map<string, () => void>;
  eventSubscriptions: Array<{ event: string; handler: (data: unknown) => void }>;
  cleanup: () => void;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

/**
 * Build the Worker script as an inline blob.
 * The Worker receives plugin code + permissions and builds a sandboxed bterminal API
 * that proxies all calls to the main thread via postMessage.
 */
function buildWorkerScript(): string {
  return `
"use strict";

// Callback registry for palette commands and event handlers
const _callbacks = new Map();
let _callbackId = 0;

function _nextCallbackId() {
  return '__cb_' + (++_callbackId);
}

// Pending RPC calls (for async APIs like tasks.list)
const _pending = new Map();
let _rpcId = 0;

function _rpc(method, args) {
  return new Promise((resolve, reject) => {
    const id = '__rpc_' + (++_rpcId);
    _pending.set(id, { resolve, reject });
    self.postMessage({ type: 'rpc', id, method, args });
  });
}

// Handle messages from main thread
self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'init') {
    const permissions = msg.permissions || [];
    const meta = msg.meta;

    // Build the bterminal API based on permissions
    const api = { meta: Object.freeze(meta) };

    if (permissions.includes('palette')) {
      api.palette = {
        registerCommand(label, callback) {
          if (typeof label !== 'string' || !label.trim()) {
            throw new Error('Command label must be a non-empty string');
          }
          if (typeof callback !== 'function') {
            throw new Error('Command callback must be a function');
          }
          const cbId = _nextCallbackId();
          _callbacks.set(cbId, callback);
          self.postMessage({ type: 'palette-register', label, callbackId: cbId });
        },
      };
    }

    if (permissions.includes('bttask:read')) {
      api.tasks = {
        list() { return _rpc('tasks.list', {}); },
        comments(taskId) { return _rpc('tasks.comments', { taskId }); },
      };
    }

    if (permissions.includes('btmsg:read')) {
      api.messages = {
        inbox() { return _rpc('messages.inbox', {}); },
        channels() { return _rpc('messages.channels', {}); },
      };
    }

    if (permissions.includes('events')) {
      api.events = {
        on(event, callback) {
          if (typeof event !== 'string' || typeof callback !== 'function') {
            throw new Error('event.on requires (string, function)');
          }
          const cbId = _nextCallbackId();
          _callbacks.set(cbId, callback);
          self.postMessage({ type: 'event-on', event, callbackId: cbId });
        },
        off(event, callbackId) {
          // Worker-side off is a no-op for now (main thread handles cleanup on terminate)
          self.postMessage({ type: 'event-off', event, callbackId });
        },
      };
    }

    Object.freeze(api);

    // Execute the plugin code
    try {
      const fn = (0, eval)(
        '(function(bterminal) { "use strict"; ' + msg.code + '\\n})'
      );
      fn(api);
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }

  if (msg.type === 'invoke-callback') {
    const cb = _callbacks.get(msg.callbackId);
    if (cb) {
      try {
        cb(msg.data);
      } catch (err) {
        self.postMessage({ type: 'callback-error', callbackId: msg.callbackId, message: String(err) });
      }
    }
  }

  if (msg.type === 'rpc-result') {
    const pending = _pending.get(msg.id);
    if (pending) {
      _pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
  }
};
`;
}

let workerBlobUrl: string | null = null;

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([buildWorkerScript()], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

/**
 * Load and execute a plugin in a Web Worker sandbox.
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

  const worker = new Worker(getWorkerBlobUrl(), { type: 'classic' });
  const callbacks = new Map<string, () => void>();
  const eventSubscriptions: Array<{ event: string; handler: (data: unknown) => void }> = [];

  // Set up message handler before sending init
  const loadResult = await new Promise<void>((resolve, reject) => {
    const onMessage = async (e: MessageEvent) => {
      const msg = e.data;

      switch (msg.type) {
        case 'loaded':
          resolve();
          break;

        case 'error':
          // Clean up any commands/events registered before the crash
          removePluginCommands(meta.id);
          for (const sub of eventSubscriptions) {
            pluginEventBus.off(sub.event, sub.handler);
          }
          worker.terminate();
          reject(new Error(`Plugin '${meta.id}' execution failed: ${msg.message}`));
          break;

        case 'palette-register': {
          const cbId = msg.callbackId as string;
          const invokeCallback = () => {
            worker.postMessage({ type: 'invoke-callback', callbackId: cbId });
          };
          callbacks.set(cbId, invokeCallback);
          addPluginCommand(meta.id, msg.label, invokeCallback);
          break;
        }

        case 'event-on': {
          const cbId = msg.callbackId as string;
          const handler = (data: unknown) => {
            worker.postMessage({ type: 'invoke-callback', callbackId: cbId, data });
          };
          eventSubscriptions.push({ event: msg.event, handler });
          pluginEventBus.on(msg.event, handler);
          break;
        }

        case 'event-off': {
          const idx = eventSubscriptions.findIndex(s => s.event === msg.event);
          if (idx >= 0) {
            pluginEventBus.off(eventSubscriptions[idx].event, eventSubscriptions[idx].handler);
            eventSubscriptions.splice(idx, 1);
          }
          break;
        }

        case 'rpc': {
          const { id, method, args } = msg;
          try {
            let result: unknown;
            switch (method) {
              case 'tasks.list':
                result = await listTasks(groupId);
                break;
              case 'tasks.comments':
                result = await getTaskComments(args.taskId);
                break;
              case 'messages.inbox':
                result = await getUnreadMessages(agentId);
                break;
              case 'messages.channels':
                result = await getChannels(groupId);
                break;
              default:
                throw new Error(`Unknown RPC method: ${method}`);
            }
            worker.postMessage({ type: 'rpc-result', id, result });
          } catch (err) {
            worker.postMessage({
              type: 'rpc-result',
              id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case 'callback-error':
          console.error(`Plugin '${meta.id}' callback error:`, msg.message);
          break;
      }
    };

    worker.onmessage = onMessage;
    worker.onerror = (err) => {
      reject(new Error(`Plugin '${meta.id}' worker error: ${err.message}`));
    };

    // Send init message with plugin code, permissions, and meta
    worker.postMessage({
      type: 'init',
      code,
      permissions: meta.permissions,
      meta: { id: meta.id, name: meta.name, version: meta.version, description: meta.description },
    });
  });

  // If we get here, the plugin loaded successfully
  const cleanup = () => {
    removePluginCommands(meta.id);
    for (const sub of eventSubscriptions) {
      pluginEventBus.off(sub.event, sub.handler);
    }
    eventSubscriptions.length = 0;
    callbacks.clear();
    worker.terminate();
  };

  loadedPlugins.set(meta.id, { meta, worker, callbacks, eventSubscriptions, cleanup });
}

/**
 * Unload a plugin, terminating its Worker.
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
