<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { queryAgent, stopAgent, isAgentReady, restartAgent } from '../../adapters/agent-bridge';
  import {
    getAgentSession,
    createAgentSession,
    removeAgentSession,
    type AgentSession,
  } from '../../stores/agents.svelte';
  import { isSidecarAlive, setSidecarAlive } from '../../agent-dispatcher';
  import type {
    AgentMessage,
    TextContent,
    ThinkingContent,
    ToolCallContent,
    ToolResultContent,
    CostContent,
    ErrorContent,
  } from '../../adapters/sdk-messages';

  interface Props {
    sessionId: string;
    prompt?: string;
    cwd?: string;
    onExit?: () => void;
  }

  let { sessionId, prompt: initialPrompt = '', cwd, onExit }: Props = $props();

  let session = $derived(getAgentSession(sessionId));
  let inputPrompt = $state(initialPrompt);
  let scrollContainer: HTMLDivElement | undefined = $state();
  let autoScroll = $state(true);
  let restarting = $state(false);

  onMount(async () => {
    if (initialPrompt) {
      await startQuery(initialPrompt);
    }
  });

  onDestroy(() => {
    if (session?.status === 'running' || session?.status === 'starting') {
      stopAgent(sessionId).catch(() => {});
    }
  });

  async function startQuery(text: string) {
    if (!text.trim()) return;

    const ready = await isAgentReady();
    if (!ready) {
      createAgentSession(sessionId, text);
      const { updateAgentStatus } = await import('../../stores/agents.svelte');
      updateAgentStatus(sessionId, 'error', 'Sidecar not ready — agent features unavailable');
      return;
    }

    createAgentSession(sessionId, text);
    await queryAgent({
      session_id: sessionId,
      prompt: text,
      cwd,
      max_turns: 50,
    });
    inputPrompt = '';
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    startQuery(inputPrompt);
  }

  function handleStop() {
    stopAgent(sessionId).catch(() => {});
  }

  async function handleRestart() {
    restarting = true;
    try {
      await restartAgent();
      setSidecarAlive(true);
    } catch {
      // Still dead
    } finally {
      restarting = false;
    }
  }

  function scrollToBottom() {
    if (autoScroll && scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  function handleScroll() {
    if (!scrollContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    // Lock auto-scroll if user scrolled up more than 50px from bottom
    autoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  // Auto-scroll when new messages arrive
  $effect(() => {
    if (session?.messages.length) {
      scrollToBottom();
    }
  });

  function formatToolInput(input: unknown): string {
    if (typeof input === 'string') return input;
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }
</script>

<div class="agent-pane">
  {#if !session || session.messages.length === 0}
    <div class="prompt-area">
      <form onsubmit={handleSubmit} class="prompt-form">
        <textarea
          bind:value={inputPrompt}
          placeholder="Ask Claude something..."
          class="prompt-input"
          rows="3"
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              startQuery(inputPrompt);
            }
          }}
        ></textarea>
        <button type="submit" class="send-btn" disabled={!inputPrompt.trim()}>Send</button>
      </form>
    </div>
  {:else}
    <div class="messages" bind:this={scrollContainer} onscroll={handleScroll}>
      {#each session.messages as msg (msg.id)}
        <div class="message msg-{msg.type}">
          {#if msg.type === 'init'}
            <div class="msg-init">
              <span class="label">Session started</span>
              <span class="model">{(msg.content as import('../../adapters/sdk-messages').InitContent).model}</span>
            </div>
          {:else if msg.type === 'text'}
            <div class="msg-text">{(msg.content as TextContent).text}</div>
          {:else if msg.type === 'thinking'}
            <details class="msg-thinking">
              <summary>Thinking...</summary>
              <pre>{(msg.content as ThinkingContent).text}</pre>
            </details>
          {:else if msg.type === 'tool_call'}
            {@const tc = msg.content as ToolCallContent}
            <details class="msg-tool-call">
              <summary>
                <span class="tool-name">{tc.name}</span>
                <span class="tool-id">{truncate(tc.toolUseId, 12)}</span>
              </summary>
              <pre class="tool-input">{formatToolInput(tc.input)}</pre>
            </details>
          {:else if msg.type === 'tool_result'}
            {@const tr = msg.content as ToolResultContent}
            <details class="msg-tool-result">
              <summary>Tool result</summary>
              <pre class="tool-output">{formatToolInput(tr.output)}</pre>
            </details>
          {:else if msg.type === 'cost'}
            {@const cost = msg.content as CostContent}
            <div class="msg-cost">
              <span>${cost.totalCostUsd.toFixed(4)}</span>
              <span>{cost.inputTokens + cost.outputTokens} tokens</span>
              <span>{cost.numTurns} turns</span>
              <span>{(cost.durationMs / 1000).toFixed(1)}s</span>
            </div>
          {:else if msg.type === 'error'}
            <div class="msg-error">{(msg.content as ErrorContent).message}</div>
          {:else if msg.type === 'status'}
            <div class="msg-status">{JSON.stringify(msg.content)}</div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="footer">
      {#if session.status === 'running' || session.status === 'starting'}
        <div class="running-indicator">
          <span class="pulse"></span>
          <span>Running...</span>
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollToBottom(); }}>Scroll to bottom</button>
          {/if}
          <button class="stop-btn" onclick={handleStop}>Stop</button>
        </div>
      {:else if session.status === 'done'}
        <div class="done-bar">
          <span class="cost">${session.costUsd.toFixed(4)}</span>
          <span class="tokens">{session.inputTokens + session.outputTokens} tokens</span>
          <span class="duration">{(session.durationMs / 1000).toFixed(1)}s</span>
        </div>
      {:else if session.status === 'error'}
        <div class="error-bar">
          <span>Error: {session.error ?? 'Unknown'}</span>
          {#if session.error?.includes('Sidecar') || session.error?.includes('crashed')}
            <button class="restart-btn" onclick={handleRestart} disabled={restarting}>
              {restarting ? 'Restarting...' : 'Restart Sidecar'}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .agent-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
  }

  .prompt-area {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
  }

  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 600px;
  }

  .prompt-input {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 13px;
    padding: 10px;
    resize: vertical;
  }

  .prompt-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .send-btn {
    align-self: flex-end;
    background: var(--accent);
    color: var(--ctp-crust);
    border: none;
    border-radius: var(--border-radius);
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .send-btn:hover { opacity: 0.9; }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .message { padding: 4px 0; }

  .msg-init {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .msg-init .model {
    background: var(--bg-surface);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: var(--font-mono);
  }

  .msg-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  .msg-thinking {
    color: var(--ctp-overlay1);
    font-size: 12px;
  }

  .msg-thinking summary {
    cursor: pointer;
    color: var(--ctp-mauve);
  }

  .msg-thinking pre {
    margin: 4px 0 0 12px;
    white-space: pre-wrap;
    font-size: 11px;
    max-height: 200px;
    overflow-y: auto;
  }

  .msg-tool-call, .msg-tool-result {
    border-left: 2px solid var(--ctp-blue);
    padding-left: 8px;
    font-size: 12px;
  }

  .msg-tool-call summary, .msg-tool-result summary {
    cursor: pointer;
    color: var(--ctp-blue);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tool-name {
    font-weight: 600;
    color: var(--ctp-green);
  }

  .tool-id {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
  }

  .tool-input, .tool-output {
    margin: 4px 0 0 0;
    white-space: pre-wrap;
    font-size: 11px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-surface);
    padding: 6px 8px;
    border-radius: 3px;
    color: var(--text-secondary);
  }

  .msg-tool-result {
    border-left-color: var(--ctp-teal);
  }

  .msg-tool-result summary {
    color: var(--ctp-teal);
  }

  .msg-cost {
    display: flex;
    gap: 12px;
    padding: 4px 8px;
    background: var(--bg-surface);
    border-radius: 3px;
    font-size: 11px;
    color: var(--ctp-yellow);
    font-family: var(--font-mono);
  }

  .msg-error {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 10%, transparent);
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 12px;
  }

  .msg-status {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 6px 12px;
    flex-shrink: 0;
  }

  .running-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ctp-blue);
  }

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ctp-blue);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .stop-btn {
    margin-left: auto;
    background: var(--ctp-red);
    color: var(--ctp-crust);
    border: none;
    border-radius: 3px;
    padding: 2px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .stop-btn:hover { opacity: 0.9; }

  .scroll-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 10px;
    cursor: pointer;
  }

  .scroll-btn:hover { color: var(--text-primary); }

  .restart-btn {
    margin-left: auto;
    background: var(--ctp-peach);
    color: var(--ctp-crust);
    border: none;
    border-radius: 3px;
    padding: 2px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .restart-btn:hover { opacity: 0.9; }
  .restart-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .done-bar, .error-bar {
    display: flex;
    gap: 12px;
    font-size: 11px;
    font-family: var(--font-mono);
    align-items: center;
  }

  .done-bar { color: var(--ctp-green); }
  .error-bar { color: var(--ctp-red); }
</style>
