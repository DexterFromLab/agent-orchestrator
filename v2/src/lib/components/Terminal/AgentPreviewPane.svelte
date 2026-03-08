<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { CanvasAddon } from '@xterm/addon-canvas';
  import { FitAddon } from '@xterm/addon-fit';
  import { getXtermTheme, onThemeChange } from '../../stores/theme.svelte';
  import { getAgentSession } from '../../stores/agents.svelte';
  import type {
    ToolCallContent,
    ToolResultContent,
    InitContent,
    CostContent,
    ErrorContent,
    TextContent,
    AgentMessage,
  } from '../../adapters/sdk-messages';
  import '@xterm/xterm/css/xterm.css';

  interface Props {
    sessionId: string;
  }

  let { sessionId }: Props = $props();

  let terminalEl: HTMLDivElement;
  let term: Terminal;
  let fitAddon: FitAddon;
  let resizeObserver: ResizeObserver | null = null;
  let unsubTheme: (() => void) | null = null;

  /** Track how many messages we've already rendered */
  let renderedCount = 0;

  let session = $derived(getAgentSession(sessionId));

  // Watch for new messages and render them
  $effect(() => {
    if (!session || !term) return;
    const msgs = session.messages;
    if (msgs.length <= renderedCount) return;

    const newMsgs = msgs.slice(renderedCount);
    for (const msg of newMsgs) {
      renderMessage(msg);
    }
    renderedCount = msgs.length;
  });

  // Reset when sessionId changes
  $effect(() => {
    // Access sessionId to track it
    void sessionId;
    renderedCount = 0;
    if (term) {
      term.clear();
      term.write('\x1b[90m● Watching agent activity...\x1b[0m\r\n');
    }
  });

  function renderMessage(msg: AgentMessage) {
    switch (msg.type) {
      case 'init': {
        const c = msg.content as InitContent;
        term.write(`\x1b[32m● Session started\x1b[0m \x1b[90m(${c.model})\x1b[0m\r\n`);
        break;
      }
      case 'tool_call': {
        const tc = msg.content as ToolCallContent;
        if (tc.name === 'Bash') {
          const cmd = (tc.input as { command?: string })?.command ?? '';
          term.write(`\r\n\x1b[36m❯ ${escapeForTerminal(cmd)}\x1b[0m\r\n`);
        } else if (tc.name === 'Read' || tc.name === 'Write' || tc.name === 'Edit') {
          const input = tc.input as { file_path?: string };
          const path = input?.file_path ?? '';
          term.write(`\x1b[33m[${tc.name}]\x1b[0m \x1b[90m${escapeForTerminal(path)}\x1b[0m\r\n`);
        } else if (tc.name === 'Grep' || tc.name === 'Glob') {
          const input = tc.input as { pattern?: string };
          const pattern = input?.pattern ?? '';
          term.write(`\x1b[33m[${tc.name}]\x1b[0m \x1b[90m${escapeForTerminal(pattern)}\x1b[0m\r\n`);
        } else {
          term.write(`\x1b[33m[${tc.name}]\x1b[0m\r\n`);
        }
        break;
      }
      case 'tool_result': {
        const tr = msg.content as ToolResultContent;
        const output = typeof tr.output === 'string'
          ? tr.output
          : JSON.stringify(tr.output, null, 2);
        if (output) {
          // Truncate long outputs (show first 80 lines)
          const lines = output.split('\n');
          const truncated = lines.length > 80;
          const display = truncated ? lines.slice(0, 80).join('\n') : output;
          term.write(escapeForTerminal(display));
          if (!display.endsWith('\n')) term.write('\r\n');
          if (truncated) {
            term.write(`\x1b[90m... (${lines.length - 80} more lines)\x1b[0m\r\n`);
          }
        }
        break;
      }
      case 'text': {
        const tc = msg.content as TextContent;
        // Show brief text indicator (first line only)
        const firstLine = tc.text.split('\n')[0].slice(0, 120);
        term.write(`\x1b[37m${escapeForTerminal(firstLine)}\x1b[0m\r\n`);
        break;
      }
      case 'error': {
        const ec = msg.content as ErrorContent;
        term.write(`\x1b[31m✗ ${escapeForTerminal(ec.message)}\x1b[0m\r\n`);
        break;
      }
      case 'cost': {
        const cc = msg.content as CostContent;
        const cost = cc.totalCostUsd.toFixed(4);
        const dur = (cc.durationMs / 1000).toFixed(1);
        term.write(`\r\n\x1b[90m● Session complete ($${cost}, ${dur}s, ${cc.numTurns} turns)\x1b[0m\r\n`);
        break;
      }
      // Skip thinking, status, unknown
    }
  }

  /** Escape text for xterm — convert \n to \r\n */
  function escapeForTerminal(text: string): string {
    return text.replace(/\r?\n/g, '\r\n');
  }

  onMount(() => {
    term = new Terminal({
      theme: getXtermTheme(),
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: false,
      cursorStyle: 'underline',
      scrollback: 10000,
      allowProposedApi: true,
      disableStdin: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new CanvasAddon());
    term.open(terminalEl);
    fitAddon.fit();

    term.write('\x1b[90m● Watching agent activity...\x1b[0m\r\n');

    // If session already has messages, render them
    const s = getAgentSession(sessionId);
    if (s && s.messages.length > 0) {
      for (const msg of s.messages) {
        renderMessage(msg);
      }
      renderedCount = s.messages.length;
    }

    // Resize handling with debounce
    let resizeTimer: ReturnType<typeof setTimeout>;
    resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
      }, 100);
    });
    resizeObserver.observe(terminalEl);

    // Hot-swap theme
    unsubTheme = onThemeChange(() => {
      term.options.theme = getXtermTheme();
    });
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    unsubTheme?.();
    term?.dispose();
  });
</script>

<div class="agent-preview-container" bind:this={terminalEl}></div>

<style>
  .agent-preview-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .agent-preview-container :global(.xterm) {
    height: 100%;
    padding: 0.25rem;
  }
</style>
