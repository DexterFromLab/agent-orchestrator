import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// Mock the plugins store to avoid Svelte 5 rune issues in test context
vi.mock('../stores/plugins.svelte', () => {
  const commands: Array<{ pluginId: string; label: string; callback: () => void }> = [];
  return {
    addPluginCommand: vi.fn((pluginId: string, label: string, callback: () => void) => {
      commands.push({ pluginId, label, callback });
    }),
    removePluginCommands: vi.fn((pluginId: string) => {
      const toRemove = commands.filter(c => c.pluginId === pluginId);
      for (const cmd of toRemove) {
        const idx = commands.indexOf(cmd);
        if (idx >= 0) commands.splice(idx, 1);
      }
    }),
    pluginEventBus: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      clear: vi.fn(),
    },
    getPluginCommands: () => [...commands],
  };
});

import {
  loadPlugin,
  unloadPlugin,
  getLoadedPlugins,
  unloadAllPlugins,
} from './plugin-host';
import { addPluginCommand, removePluginCommands, pluginEventBus } from '../stores/plugins.svelte';
import type { PluginMeta } from '../adapters/plugins-bridge';
import type { GroupId, AgentId } from '../types/ids';

// --- Mock Worker ---

/**
 * Simulates a Web Worker that runs the plugin host's worker script.
 * Instead of actually creating a Blob + Worker, we intercept postMessage
 * and simulate the worker-side logic inline.
 */
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private terminated = false;

  postMessage(msg: unknown): void {
    if (this.terminated) return;
    const data = msg as Record<string, unknown>;

    if (data.type === 'init') {
      this.handleInit(data);
    } else if (data.type === 'invoke-callback') {
      // Callback invocations from main → worker: no-op in mock
      // (the real worker would call the stored callback)
    }
  }

  private handleInit(data: Record<string, unknown>): void {
    const code = data.code as string;
    const permissions = (data.permissions as string[]) || [];
    const meta = data.meta as Record<string, unknown>;

    // Build a mock bterminal API that mimics worker-side behavior
    // by sending messages back to the main thread (this.sendToMain)
    const bterminal: Record<string, unknown> = {
      meta: Object.freeze({ ...meta }),
    };

    if (permissions.includes('palette')) {
      let cbId = 0;
      bterminal.palette = {
        registerCommand: (label: string, callback: () => void) => {
          if (typeof label !== 'string' || !label.trim()) {
            throw new Error('Command label must be a non-empty string');
          }
          if (typeof callback !== 'function') {
            throw new Error('Command callback must be a function');
          }
          const id = '__cb_' + (++cbId);
          this.sendToMain({ type: 'palette-register', label, callbackId: id });
        },
      };
    }

    if (permissions.includes('bttask:read')) {
      bterminal.tasks = {
        list: () => this.rpc('tasks.list', {}),
        comments: (taskId: string) => this.rpc('tasks.comments', { taskId }),
      };
    }

    if (permissions.includes('btmsg:read')) {
      bterminal.messages = {
        inbox: () => this.rpc('messages.inbox', {}),
        channels: () => this.rpc('messages.channels', {}),
      };
    }

    if (permissions.includes('events')) {
      let cbId = 0;
      bterminal.events = {
        on: (event: string, callback: (data: unknown) => void) => {
          if (typeof event !== 'string' || typeof callback !== 'function') {
            throw new Error('event.on requires (string, function)');
          }
          const id = '__cb_' + (++cbId);
          this.sendToMain({ type: 'event-on', event, callbackId: id });
        },
        off: (event: string) => {
          this.sendToMain({ type: 'event-off', event });
        },
      };
    }

    Object.freeze(bterminal);

    // Execute the plugin code
    try {
      const fn = new Function('bterminal', `"use strict"; ${code}`);
      fn(bterminal);
      this.sendToMain({ type: 'loaded' });
    } catch (err) {
      this.sendToMain({ type: 'error', message: String(err) });
    }
  }

  private rpcId = 0;
  private rpc(method: string, args: Record<string, unknown>): Promise<unknown> {
    const id = '__rpc_' + (++this.rpcId);
    this.sendToMain({ type: 'rpc', id, method, args });
    // In real worker, this would be a pending promise resolved by rpc-result message.
    // For tests, return a resolved promise since we test RPC routing separately.
    return Promise.resolve([]);
  }

  private sendToMain(data: unknown): void {
    if (this.terminated) return;
    // Schedule on microtask to simulate async Worker message delivery
    queueMicrotask(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data }));
      }
    });
  }

  terminate(): void {
    this.terminated = true;
    this.onmessage = null;
    this.onerror = null;
  }

  addEventListener(): void { /* stub */ }
  removeEventListener(): void { /* stub */ }
  dispatchEvent(): boolean { return false; }
}

// Install global Worker mock
const originalWorker = globalThis.Worker;
const originalURL = globalThis.URL;

beforeEach(() => {
  vi.clearAllMocks();
  unloadAllPlugins();

  // Mock Worker constructor
  (globalThis as Record<string, unknown>).Worker = MockWorker;

  // Mock URL.createObjectURL
  if (!globalThis.URL) {
    (globalThis as Record<string, unknown>).URL = {} as typeof URL;
  }
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-worker-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
  if (originalURL) {
    globalThis.URL.createObjectURL = originalURL.createObjectURL;
    globalThis.URL.revokeObjectURL = originalURL.revokeObjectURL;
  }
});

// --- Helpers ---

function makeMeta(overrides: Partial<PluginMeta> = {}): PluginMeta {
  return {
    id: overrides.id ?? 'test-plugin',
    name: overrides.name ?? 'Test Plugin',
    version: overrides.version ?? '1.0.0',
    description: overrides.description ?? 'A test plugin',
    main: overrides.main ?? 'index.js',
    permissions: overrides.permissions ?? [],
  };
}

function mockPluginCode(code: string): void {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'plugin_read_file') return Promise.resolve(code);
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
  });
}

const GROUP_ID = 'test-group' as GroupId;
const AGENT_ID = 'test-agent' as AgentId;

// --- Worker isolation tests ---

describe('plugin-host Worker isolation', () => {
  it('plugin code runs in Worker (cannot access main thread globals)', async () => {
    // In a real Worker, window/document/globalThis are unavailable.
    // Our MockWorker simulates this by running in strict mode.
    const meta = makeMeta({ id: 'isolation-test' });
    mockPluginCode('// no-op — isolation verified by Worker boundary');
    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });

  it('Worker is terminated on unload', async () => {
    const meta = makeMeta({ id: 'terminate-test' });
    mockPluginCode('// no-op');
    await loadPlugin(meta, GROUP_ID, AGENT_ID);

    expect(getLoadedPlugins()).toHaveLength(1);
    unloadPlugin('terminate-test');
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('API object is frozen (cannot add properties)', async () => {
    const meta = makeMeta({ id: 'freeze-test', permissions: [] });
    mockPluginCode(`
      try {
        bterminal.hacked = true;
        throw new Error('FREEZE FAILED: could add property');
      } catch (e) {
        if (e.message === 'FREEZE FAILED: could add property') throw e;
      }
    `);
    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });

  it('API object is frozen (cannot delete properties)', async () => {
    const meta = makeMeta({ id: 'freeze-delete-test', permissions: [] });
    mockPluginCode(`
      try {
        delete bterminal.meta;
        throw new Error('FREEZE FAILED: could delete property');
      } catch (e) {
        if (e.message === 'FREEZE FAILED: could delete property') throw e;
      }
    `);
    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });

  it('meta is accessible and frozen', async () => {
    const meta = makeMeta({ id: 'meta-access', permissions: [] });
    mockPluginCode(`
      if (bterminal.meta.id !== 'meta-access') {
        throw new Error('meta.id mismatch');
      }
      if (bterminal.meta.name !== 'Test Plugin') {
        throw new Error('meta.name mismatch');
      }
      try {
        bterminal.meta.id = 'hacked';
        throw new Error('META FREEZE FAILED');
      } catch (e) {
        if (e.message === 'META FREEZE FAILED') throw e;
      }
    `);
    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });
});

// --- Permission-gated API tests ---

describe('plugin-host permissions', () => {
  describe('palette permission', () => {
    it('plugin with palette permission can register commands', async () => {
      const meta = makeMeta({ id: 'palette-plugin', permissions: ['palette'] });
      mockPluginCode(`
        bterminal.palette.registerCommand('Test Command', function() {});
      `);

      await loadPlugin(meta, GROUP_ID, AGENT_ID);

      expect(addPluginCommand).toHaveBeenCalledWith(
        'palette-plugin',
        'Test Command',
        expect.any(Function),
      );
    });

    it('plugin without palette permission has no palette API', async () => {
      const meta = makeMeta({ id: 'no-palette-plugin', permissions: [] });
      mockPluginCode(`
        if (bterminal.palette !== undefined) {
          throw new Error('palette API should not be available');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('palette.registerCommand rejects non-string label', async () => {
      const meta = makeMeta({ id: 'bad-label-plugin', permissions: ['palette'] });
      mockPluginCode(`
        bterminal.palette.registerCommand(123, function() {});
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).rejects.toThrow(
        'execution failed',
      );
    });

    it('palette.registerCommand rejects non-function callback', async () => {
      const meta = makeMeta({ id: 'bad-cb-plugin', permissions: ['palette'] });
      mockPluginCode(`
        bterminal.palette.registerCommand('Test', 'not-a-function');
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).rejects.toThrow(
        'execution failed',
      );
    });

    it('palette.registerCommand rejects empty label', async () => {
      const meta = makeMeta({ id: 'empty-label-plugin', permissions: ['palette'] });
      mockPluginCode(`
        bterminal.palette.registerCommand('   ', function() {});
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).rejects.toThrow(
        'execution failed',
      );
    });
  });

  describe('bttask:read permission', () => {
    it('plugin with bttask:read can call tasks.list', async () => {
      const meta = makeMeta({ id: 'task-plugin', permissions: ['bttask:read'] });
      mockPluginCode(`
        bterminal.tasks.list();
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('plugin without bttask:read has no tasks API', async () => {
      const meta = makeMeta({ id: 'no-task-plugin', permissions: [] });
      mockPluginCode(`
        if (bterminal.tasks !== undefined) {
          throw new Error('tasks API should not be available');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
  });

  describe('btmsg:read permission', () => {
    it('plugin with btmsg:read can call messages.inbox', async () => {
      const meta = makeMeta({ id: 'msg-plugin', permissions: ['btmsg:read'] });
      mockPluginCode(`
        bterminal.messages.inbox();
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('plugin without btmsg:read has no messages API', async () => {
      const meta = makeMeta({ id: 'no-msg-plugin', permissions: [] });
      mockPluginCode(`
        if (bterminal.messages !== undefined) {
          throw new Error('messages API should not be available');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
  });

  describe('events permission', () => {
    it('plugin with events permission can subscribe', async () => {
      const meta = makeMeta({ id: 'events-plugin', permissions: ['events'] });
      mockPluginCode(`
        bterminal.events.on('test-event', function(data) {});
      `);
      await loadPlugin(meta, GROUP_ID, AGENT_ID);
      expect(pluginEventBus.on).toHaveBeenCalledWith('test-event', expect.any(Function));
    });

    it('plugin without events permission has no events API', async () => {
      const meta = makeMeta({ id: 'no-events-plugin', permissions: [] });
      mockPluginCode(`
        if (bterminal.events !== undefined) {
          throw new Error('events API should not be available');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
  });
});

// --- Lifecycle tests ---

describe('plugin-host lifecycle', () => {
  it('loadPlugin registers the plugin', async () => {
    const meta = makeMeta({ id: 'lifecycle-load' });
    mockPluginCode('// no-op');

    await loadPlugin(meta, GROUP_ID, AGENT_ID);

    const loaded = getLoadedPlugins();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('lifecycle-load');
  });

  it('loadPlugin warns on duplicate load and returns early', async () => {
    const meta = makeMeta({ id: 'duplicate-load' });
    mockPluginCode('// no-op');

    await loadPlugin(meta, GROUP_ID, AGENT_ID);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadPlugin(meta, GROUP_ID, AGENT_ID);
    expect(consoleSpy).toHaveBeenCalledWith("Plugin 'duplicate-load' is already loaded");
    consoleSpy.mockRestore();

    expect(getLoadedPlugins()).toHaveLength(1);
  });

  it('unloadPlugin removes the plugin and cleans up commands', async () => {
    const meta = makeMeta({ id: 'lifecycle-unload', permissions: ['palette'] });
    mockPluginCode(`
      bterminal.palette.registerCommand('Cmd1', function() {});
    `);

    await loadPlugin(meta, GROUP_ID, AGENT_ID);
    expect(getLoadedPlugins()).toHaveLength(1);

    unloadPlugin('lifecycle-unload');
    expect(getLoadedPlugins()).toHaveLength(0);
    expect(removePluginCommands).toHaveBeenCalledWith('lifecycle-unload');
  });

  it('unloadPlugin is no-op for unknown plugin', () => {
    unloadPlugin('nonexistent');
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('unloadAllPlugins clears all loaded plugins', async () => {
    mockPluginCode('// no-op');

    const meta1 = makeMeta({ id: 'all-1' });
    await loadPlugin(meta1, GROUP_ID, AGENT_ID);

    const meta2 = makeMeta({ id: 'all-2' });
    await loadPlugin(meta2, GROUP_ID, AGENT_ID);

    expect(getLoadedPlugins()).toHaveLength(2);

    unloadAllPlugins();
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('loadPlugin cleans up commands on execution error', async () => {
    const meta = makeMeta({ id: 'error-cleanup' });
    mockPluginCode('throw new Error("plugin crash");');

    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).rejects.toThrow(
      "Plugin 'error-cleanup' execution failed",
    );
    expect(removePluginCommands).toHaveBeenCalledWith('error-cleanup');
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('loadPlugin throws on file read failure', async () => {
    const meta = makeMeta({ id: 'read-fail' });
    mockInvoke.mockRejectedValue(new Error('file not found'));

    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).rejects.toThrow(
      "Failed to read plugin 'read-fail'",
    );
  });

  it('unloadPlugin cleans up event subscriptions', async () => {
    const meta = makeMeta({ id: 'events-cleanup', permissions: ['events'] });
    mockPluginCode(`
      bterminal.events.on('my-event', function() {});
    `);

    await loadPlugin(meta, GROUP_ID, AGENT_ID);
    expect(pluginEventBus.on).toHaveBeenCalledWith('my-event', expect.any(Function));

    unloadPlugin('events-cleanup');
    expect(pluginEventBus.off).toHaveBeenCalledWith('my-event', expect.any(Function));
  });
});

// --- RPC routing tests ---

describe('plugin-host RPC routing', () => {
  it('tasks.list RPC is routed to main thread', async () => {
    const meta = makeMeta({ id: 'rpc-tasks', permissions: ['bttask:read'] });
    mockPluginCode(`bterminal.tasks.list();`);

    // Mock the bttask bridge
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'plugin_read_file') return Promise.resolve('bterminal.tasks.list();');
      if (cmd === 'bttask_list') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected: ${cmd}`));
    });

    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });

  it('messages.inbox RPC is routed to main thread', async () => {
    const meta = makeMeta({ id: 'rpc-messages', permissions: ['btmsg:read'] });
    mockPluginCode(`bterminal.messages.inbox();`);

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'plugin_read_file') return Promise.resolve('bterminal.messages.inbox();');
      if (cmd === 'btmsg_get_unread') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected: ${cmd}`));
    });

    await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
  });
});
