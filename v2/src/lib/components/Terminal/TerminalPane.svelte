<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { CanvasAddon } from '@xterm/addon-canvas';
  import { FitAddon } from '@xterm/addon-fit';
  import { spawnPty, writePty, resizePty, killPty, onPtyData, onPtyExit } from '../../adapters/pty-bridge';
  import { getXtermTheme } from '../../stores/theme.svelte';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import '@xterm/xterm/css/xterm.css';

  interface Props {
    shell?: string;
    cwd?: string;
    args?: string[];
    onExit?: () => void;
  }

  let { shell, cwd, args, onExit }: Props = $props();

  let terminalEl: HTMLDivElement;
  let term: Terminal;
  let fitAddon: FitAddon;
  let ptyId: string | null = null;
  let unlistenData: UnlistenFn | null = null;
  let unlistenExit: UnlistenFn | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(async () => {
    term = new Terminal({
      theme: getXtermTheme(),
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new CanvasAddon());
    term.open(terminalEl);
    fitAddon.fit();

    const { cols, rows } = term;

    // Spawn PTY
    try {
      ptyId = await spawnPty({ shell, cwd, args, cols, rows });

      // Listen for PTY output
      unlistenData = await onPtyData(ptyId, (data) => {
        term.write(data);
      });

      unlistenExit = await onPtyExit(ptyId, () => {
        term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        onExit?.();
      });

      // Forward keyboard input to PTY
      term.onData((data) => {
        if (ptyId) writePty(ptyId, data);
      });
    } catch (e) {
      term.write(`\x1b[31mFailed to spawn terminal: ${e}\x1b[0m\r\n`);
    }

    // Resize handling with debounce
    let resizeTimer: ReturnType<typeof setTimeout>;
    resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        if (ptyId) {
          const { cols, rows } = term;
          resizePty(ptyId, cols, rows);
        }
      }, 100);
    });
    resizeObserver.observe(terminalEl);
  });

  onDestroy(async () => {
    resizeObserver?.disconnect();
    unlistenData?.();
    unlistenExit?.();
    if (ptyId) {
      try { await killPty(ptyId); } catch { /* already dead */ }
    }
    term?.dispose();
  });
</script>

<div class="terminal-container" bind:this={terminalEl}></div>

<style>
  .terminal-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .terminal-container :global(.xterm) {
    height: 100%;
    padding: 4px;
  }
</style>
