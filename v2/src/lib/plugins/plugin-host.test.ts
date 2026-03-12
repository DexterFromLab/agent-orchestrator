import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { addPluginCommand, removePluginCommands } from '../stores/plugins.svelte';
import type { PluginMeta } from '../adapters/plugins-bridge';
import type { GroupId, AgentId } from '../types/ids';

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

/** Set mockInvoke to return the given code when plugin_read_file is called */
function mockPluginCode(code: string): void {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'plugin_read_file') return Promise.resolve(code);
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
  });
}

const GROUP_ID = 'test-group' as GroupId;
const AGENT_ID = 'test-agent' as AgentId;

beforeEach(() => {
  vi.clearAllMocks();
  unloadAllPlugins();
});

// --- Sandbox escape prevention tests ---

describe('plugin-host sandbox', () => {
  describe('global shadowing', () => {
    // `eval` is intentionally excluded: `var eval` is a SyntaxError in strict mode.
    // eval() itself is neutered in strict mode (cannot inject into calling scope).
    const shadowedGlobals = [
      'window',
      'document',
      'fetch',
      'globalThis',
      'self',
      'XMLHttpRequest',
      'WebSocket',
      'Function',
      'importScripts',
      'require',
      'process',
      'Deno',
      '__TAURI__',
      '__TAURI_INTERNALS__',
    ];

    for (const name of shadowedGlobals) {
      it(`shadows '${name}' as undefined`, async () => {
        const meta = makeMeta({ id: `shadow-${name}` });
        const code = `
          if (typeof ${name} !== 'undefined') {
            throw new Error('ESCAPE: ${name} is accessible');
          }
        `;
        mockPluginCode(code);
        await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
      });
    }
  });

  describe('this binding', () => {
    it('this is undefined in strict mode (cannot reach global scope)', async () => {
      const meta = makeMeta({ id: 'this-test' });
      mockPluginCode(`
        if (this !== undefined) {
          throw new Error('ESCAPE: this is not undefined, got: ' + typeof this);
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
  });

  describe('runtime-level shadowing', () => {
    it('require is shadowed (blocks CJS imports)', async () => {
      const meta = makeMeta({ id: 'require-test' });
      mockPluginCode(`
        if (typeof require !== 'undefined') {
          throw new Error('ESCAPE: require is accessible');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('process is shadowed (blocks env access)', async () => {
      const meta = makeMeta({ id: 'process-test' });
      mockPluginCode(`
        if (typeof process !== 'undefined') {
          throw new Error('ESCAPE: process is accessible');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('Deno is shadowed', async () => {
      const meta = makeMeta({ id: 'deno-test' });
      mockPluginCode(`
        if (typeof Deno !== 'undefined') {
          throw new Error('ESCAPE: Deno is accessible');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
  });

  describe('Tauri IPC shadowing', () => {
    it('__TAURI__ is shadowed (blocks Tauri IPC bridge)', async () => {
      const meta = makeMeta({ id: 'tauri-test' });
      mockPluginCode(`
        if (typeof __TAURI__ !== 'undefined') {
          throw new Error('ESCAPE: __TAURI__ is accessible');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('__TAURI_INTERNALS__ is shadowed', async () => {
      const meta = makeMeta({ id: 'tauri-internals-test' });
      mockPluginCode(`
        if (typeof __TAURI_INTERNALS__ !== 'undefined') {
          throw new Error('ESCAPE: __TAURI_INTERNALS__ is accessible');
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });
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

  describe('API object is frozen', () => {
    it('cannot add properties to bterminal', async () => {
      const meta = makeMeta({ id: 'freeze-test', permissions: [] });
      // In strict mode, assigning to a frozen object throws TypeError
      mockPluginCode(`
        try {
          bterminal.hacked = true;
          throw new Error('FREEZE FAILED: could add property');
        } catch (e) {
          if (e.message === 'FREEZE FAILED: could add property') throw e;
          // TypeError from strict mode + frozen object is expected
        }
      `);
      await expect(loadPlugin(meta, GROUP_ID, AGENT_ID)).resolves.toBeUndefined();
    });

    it('cannot delete properties from bterminal', async () => {
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

    // Still only one entry
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

  it('plugin meta is accessible and frozen', async () => {
    const meta = makeMeta({ id: 'meta-access', permissions: [] });
    mockPluginCode(`
      if (bterminal.meta.id !== 'meta-access') {
        throw new Error('meta.id mismatch');
      }
      if (bterminal.meta.name !== 'Test Plugin') {
        throw new Error('meta.name mismatch');
      }
      // meta should also be frozen
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
