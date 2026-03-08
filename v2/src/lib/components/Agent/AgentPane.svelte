<script lang="ts">
  import { onMount } from 'svelte';
  import { marked, Renderer } from 'marked';
  import { queryAgent, stopAgent, isAgentReady, restartAgent } from '../../adapters/agent-bridge';
  import {
    getAgentSession,
    createAgentSession,
    getChildSessions,
    getTotalCost,
  } from '../../stores/agents.svelte';
  import { focusPane } from '../../stores/layout.svelte';
  import { isSidecarAlive, setSidecarAlive } from '../../agent-dispatcher';
  import { listProfiles, listSkills, readSkill, type ClaudeProfile, type ClaudeSkill } from '../../adapters/claude-bridge';
  import AgentTree from './AgentTree.svelte';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';
  import type {
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
    profile?: string;
    onExit?: () => void;
  }

  let { sessionId, prompt: initialPrompt = '', cwd: initialCwd, profile: profileName, onExit }: Props = $props();

  let session = $derived(getAgentSession(sessionId));
  let inputPrompt = $state(initialPrompt);
  let scrollContainer: HTMLDivElement | undefined = $state();
  let autoScroll = $state(true);
  let restarting = $state(false);
  let showTree = $state(false);
  let hasToolCalls = $derived(session?.messages.some(m => m.type === 'tool_call') ?? false);
  let parentSession = $derived(session?.parentSessionId ? getAgentSession(session.parentSessionId) : undefined);
  let childSessions = $derived(session ? getChildSessions(session.id) : []);
  let totalCost = $derived(session && childSessions.length > 0 ? getTotalCost(session.id) : null);

  // Profile list (for resolving profileName to config_dir)
  let profiles = $state<ClaudeProfile[]>([]);

  // Skill autocomplete
  let skills = $state<ClaudeSkill[]>([]);
  let showSkillMenu = $state(false);
  let filteredSkills = $derived(
    inputPrompt.startsWith('/')
      ? skills.filter(s => s.name.toLowerCase().startsWith(inputPrompt.slice(1).toLowerCase()))
      : []
  );
  let skillMenuIndex = $state(0);

  const mdRenderer = new Renderer();
  mdRenderer.code = function({ text, lang }: { text: string; lang?: string }) {
    if (lang) {
      const highlighted = highlightCode(text, lang);
      if (highlighted !== escapeHtml(text)) return highlighted;
    }
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
  };

  function renderMarkdown(source: string): string {
    try {
      return marked.parse(source, { renderer: mdRenderer, async: false }) as string;
    } catch {
      return escapeHtml(source);
    }
  }

  onMount(async () => {
    await getHighlighter();
    // Load profiles and skills in parallel
    const [profileList, skillList] = await Promise.all([
      listProfiles().catch(() => []),
      listSkills().catch(() => []),
    ]);
    profiles = profileList;
    skills = skillList;
    if (initialPrompt) {
      await startQuery(initialPrompt);
    }
  });

  // NOTE: Do NOT stop agents in onDestroy — it fires on layout changes/remounts,
  // not just explicit close. Stop-on-close is handled by workspace teardown.

  let promptRef = $state<HTMLTextAreaElement | undefined>();
  let isRunning = $derived(session?.status === 'running' || session?.status === 'starting');

  async function startQuery(text: string, resume = false) {
    if (!text.trim()) return;

    const ready = await isAgentReady();
    if (!ready) {
      if (!resume) createAgentSession(sessionId, text);
      const { updateAgentStatus } = await import('../../stores/agents.svelte');
      updateAgentStatus(sessionId, 'error', 'Sidecar not ready — agent features unavailable');
      return;
    }

    const resumeId = resume ? session?.sdkSessionId : undefined;

    if (!resume) {
      createAgentSession(sessionId, text);
    } else {
      const { updateAgentStatus } = await import('../../stores/agents.svelte');
      updateAgentStatus(sessionId, 'starting');
    }

    const profile = profileName ? profiles.find(p => p.name === profileName) : undefined;
    await queryAgent({
      session_id: sessionId,
      prompt: text,
      cwd: initialCwd || undefined,
      max_turns: 50,
      resume_session_id: resumeId,
      setting_sources: ['user', 'project'],
      claude_config_dir: profile?.config_dir,
    });
    inputPrompt = '';
    if (promptRef) {
      promptRef.style.height = 'auto';
    }
  }

  async function expandSkillPrompt(text: string): Promise<string> {
    if (!text.startsWith('/')) return text;
    const skillName = text.slice(1).split(/\s+/)[0];
    const skill = skills.find(s => s.name === skillName);
    if (!skill) return text;
    try {
      const content = await readSkill(skill.source_path);
      const args = text.slice(1 + skillName.length).trim();
      return args ? `${content}\n\nUser input: ${args}` : content;
    } catch {
      return text;
    }
  }

  async function handleUnifiedSubmit() {
    if (!inputPrompt.trim() || isRunning) return;
    const expanded = await expandSkillPrompt(inputPrompt);
    showSkillMenu = false;
    // If session exists with sdkSessionId, this is a follow-up (resume)
    const isResume = !!(session?.sdkSessionId && session.messages.length > 0);
    startQuery(expanded, isResume);
  }

  function handleNewSession() {
    onExit?.();
  }

  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }

  function handleSkillSelect(skill: ClaudeSkill) {
    inputPrompt = `/${skill.name} `;
    showSkillMenu = false;
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

  function handleTreeNodeClick(nodeId: string) {
    if (!scrollContainer || !session) return;
    // Find the message whose tool_call has this toolUseId
    const msg = session.messages.find(
      m => m.type === 'tool_call' && (m.content as ToolCallContent).toolUseId === nodeId
    );
    if (!msg) return;
    autoScroll = false;
    scrollContainer.querySelector('#msg-' + CSS.escape(msg.id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  {#if parentSession}
    <div class="parent-link">
      <span class="parent-badge">SUB</span>
      <button class="parent-btn" onclick={() => focusPane(parentSession!.id)}>
        ← {parentSession.prompt ? parentSession.prompt.slice(0, 40) : 'Parent agent'}
      </button>
    </div>
  {/if}
  {#if childSessions.length > 0}
    <div class="children-bar">
      <span class="children-label">{childSessions.length} subagent{childSessions.length > 1 ? 's' : ''}</span>
      {#each childSessions as child (child.id)}
        <button class="child-chip" class:running={child.status === 'running'} class:done={child.status === 'done'} class:error={child.status === 'error'} onclick={() => focusPane(child.id)}>
          {child.prompt.slice(0, 20)}{child.prompt.length > 20 ? '...' : ''}
        </button>
      {/each}
    </div>
  {/if}
  {#if hasToolCalls}
    <div class="tree-toggle">
      <button class="tree-btn" onclick={() => showTree = !showTree}>
        {showTree ? '▼' : '▶'} Agent Tree
      </button>
    </div>
    {#if showTree && session}
      <AgentTree {session} onNodeClick={handleTreeNodeClick} />
    {/if}
  {/if}

  <div class="messages" bind:this={scrollContainer} onscroll={handleScroll}>
    {#if !session || session.messages.length === 0}
      <div class="welcome-state">
        <div class="welcome-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <span class="welcome-text">Ask Claude anything</span>
        <span class="welcome-hint">Type / for skills • Shift+Enter for newline</span>
      </div>
    {:else}
      {#each session.messages as msg (msg.id)}
        <div class="message msg-{msg.type}" id="msg-{msg.id}">
          {#if msg.type === 'init'}
            <div class="msg-init">
              <span class="label">Session started</span>
              <span class="model">{(msg.content as import('../../adapters/sdk-messages').InitContent).model}</span>
            </div>
          {:else if msg.type === 'text'}
            <div class="msg-text markdown-body">{@html renderMarkdown((msg.content as TextContent).text)}</div>
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
    {/if}
  </div>

  <!-- Status bar -->
  {#if session}
    <div class="status-strip">
      {#if session.status === 'running' || session.status === 'starting'}
        <div class="running-indicator">
          <span class="pulse"></span>
          <span>Running...</span>
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollToBottom(); }}>↓ Bottom</button>
          {/if}
          <button class="stop-btn" onclick={handleStop}>Stop</button>
        </div>
      {:else if session.status === 'done'}
        <div class="done-bar">
          <span class="cost">${session.costUsd.toFixed(4)}</span>
          {#if totalCost && totalCost.costUsd > session.costUsd}
            <span class="total-cost">(total: ${totalCost.costUsd.toFixed(4)})</span>
          {/if}
          <span class="tokens">{session.inputTokens + session.outputTokens} tok</span>
          <span class="duration">{(session.durationMs / 1000).toFixed(1)}s</span>
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollToBottom(); }}>↓ Bottom</button>
          {/if}
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

  <!-- Session controls (new / continue) -->
  {#if session && (session.status === 'done' || session.status === 'error') && session.sdkSessionId}
    <div class="session-controls">
      <button class="session-btn session-btn-new" onclick={handleNewSession}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        New Session
      </button>
      <button class="session-btn session-btn-continue" onclick={() => promptRef?.focus()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        Continue
      </button>
    </div>
  {/if}

  <!-- Unified prompt input (VSCode style) -->
  <div class="prompt-container" class:disabled={isRunning}>
    <div class="prompt-wrapper">
      {#if showSkillMenu && filteredSkills.length > 0}
        <div class="skill-menu">
          {#each filteredSkills as skill, i (skill.name)}
            <button
              class="skill-item"
              class:active={i === skillMenuIndex}
              onmousedown={(e) => { e.preventDefault(); handleSkillSelect(skill); }}
            >
              <span class="skill-name">/{skill.name}</span>
              <span class="skill-desc">{skill.description}</span>
            </button>
          {/each}
        </div>
      {/if}
      <textarea
        bind:this={promptRef}
        bind:value={inputPrompt}
        placeholder={isRunning ? 'Agent is running...' : 'Ask Claude something... (/ for skills)'}
        class="prompt-input"
        rows="1"
        disabled={isRunning}
        oninput={(e) => {
          showSkillMenu = inputPrompt.startsWith('/') && filteredSkills.length > 0;
          skillMenuIndex = 0;
          autoResizeTextarea(e.currentTarget as HTMLTextAreaElement);
        }}
        onkeydown={async (e) => {
          if (showSkillMenu && filteredSkills.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              skillMenuIndex = Math.min(skillMenuIndex + 1, filteredSkills.length - 1);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              skillMenuIndex = Math.max(skillMenuIndex - 1, 0);
              return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault();
              handleSkillSelect(filteredSkills[skillMenuIndex]);
              return;
            }
            if (e.key === 'Escape') {
              showSkillMenu = false;
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUnifiedSubmit();
          }
        }}
      ></textarea>
      <button
        class="submit-icon-btn"
        onclick={handleUnifiedSubmit}
        disabled={!inputPrompt.trim() || isRunning}
        aria-label="Send message"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .agent-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
    font-size: 0.8125rem;
  }

  .parent-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    font-size: 0.6875rem;
  }

  .parent-badge {
    background: var(--ctp-mauve);
    color: var(--ctp-crust);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.1875rem;
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .parent-btn {
    background: none;
    border: none;
    color: var(--ctp-mauve);
    cursor: pointer;
    font-size: 0.6875rem;
    padding: 0;
    font-family: inherit;
  }

  .parent-btn:hover { color: var(--ctp-text); text-decoration: underline; }

  .children-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    flex-wrap: wrap;
    font-size: 0.6875rem;
  }

  .children-label {
    color: var(--ctp-overlay0);
    font-size: 0.625rem;
    margin-right: 0.25rem;
  }

  .child-chip {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
    font-size: 0.625rem;
    cursor: pointer;
    font-family: inherit;
  }

  .child-chip:hover { color: var(--ctp-text); border-color: var(--accent); }
  .child-chip.running { border-color: var(--ctp-blue); color: var(--ctp-blue); }
  .child-chip.done { border-color: var(--ctp-green); color: var(--ctp-green); }
  .child-chip.error { border-color: var(--ctp-red); color: var(--ctp-red); }

  .tree-toggle {
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .tree-btn {
    background: none;
    border: none;
    color: var(--ctp-mauve);
    font-size: 0.6875rem;
    cursor: pointer;
    font-family: var(--term-font-family, monospace);
    padding: 0.125rem 0.25rem;
  }

  .tree-btn:hover { color: var(--ctp-text); }

  /* Welcome state */
  .welcome-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--ctp-overlay1);
  }

  .welcome-icon {
    color: var(--ctp-overlay0);
    opacity: 0.6;
  }

  .welcome-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--ctp-subtext1);
  }

  .welcome-hint {
    font-size: 0.6875rem;
    color: var(--ctp-overlay0);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 0;
  }

  .message { padding: 0.25rem 0; }

  .msg-init {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ctp-overlay0);
    font-size: 0.6875rem;
  }

  .msg-init .model {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
    font-family: var(--term-font-family, monospace);
  }

  .msg-text {
    word-break: break-word;
    line-height: 1.5;
  }

  .msg-text.markdown-body :global(h1) {
    font-size: 1.4em;
    font-weight: 700;
    margin: 0.6em 0 0.3em;
    color: var(--ctp-lavender);
  }

  .msg-text.markdown-body :global(h2) {
    font-size: 1.2em;
    font-weight: 600;
    margin: 0.5em 0 0.3em;
    color: var(--ctp-blue);
  }

  .msg-text.markdown-body :global(h3) {
    font-size: 1.05em;
    font-weight: 600;
    margin: 0.4em 0 0.2em;
    color: var(--ctp-sapphire);
  }

  .msg-text.markdown-body :global(p) {
    margin: 0.4em 0;
  }

  .msg-text.markdown-body :global(code) {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.1875rem;
    font-family: var(--term-font-family, monospace);
    font-size: 0.9em;
    color: var(--ctp-green);
  }

  .msg-text.markdown-body :global(pre) {
    background: var(--ctp-surface0);
    padding: 0.625rem 0.75rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    font-size: 0.75rem;
    line-height: 1.5;
    margin: 0.5em 0;
  }

  .msg-text.markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--ctp-text);
  }

  .msg-text.markdown-body :global(.shiki) {
    background: var(--ctp-surface0) !important;
    padding: 0.625rem 0.75rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    font-size: 0.75rem;
    line-height: 1.5;
    margin: 0.5em 0;
  }

  .msg-text.markdown-body :global(.shiki code) {
    background: none !important;
    padding: 0;
  }

  .msg-text.markdown-body :global(blockquote) {
    border-left: 3px solid var(--ctp-mauve);
    margin: 0.4em 0;
    padding: 0.125rem 0.625rem;
    color: var(--ctp-subtext0);
  }

  .msg-text.markdown-body :global(ul), .msg-text.markdown-body :global(ol) {
    padding-left: 1.25rem;
    margin: 0.3em 0;
  }

  .msg-text.markdown-body :global(li) {
    margin: 0.15em 0;
  }

  .msg-text.markdown-body :global(a) {
    color: var(--ctp-blue);
    text-decoration: none;
  }

  .msg-text.markdown-body :global(a:hover) {
    text-decoration: underline;
  }

  .msg-text.markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.4em 0;
    font-size: 0.75rem;
  }

  .msg-text.markdown-body :global(th), .msg-text.markdown-body :global(td) {
    border: 1px solid var(--ctp-surface0);
    padding: 0.25rem 0.5rem;
    text-align: left;
  }

  .msg-text.markdown-body :global(th) {
    background: var(--ctp-surface0);
    font-weight: 600;
  }

  .msg-thinking {
    color: var(--ctp-overlay1);
    font-size: 0.75rem;
  }

  .msg-thinking summary {
    cursor: pointer;
    color: var(--ctp-mauve);
  }

  .msg-thinking pre {
    margin: 0.25rem 0 0 0.75rem;
    white-space: pre-wrap;
    font-size: 0.6875rem;
    max-height: 12.5rem;
    overflow-y: auto;
  }

  .msg-tool-call, .msg-tool-result {
    border-left: 2px solid var(--ctp-blue);
    padding-left: 0.5rem;
    font-size: 0.75rem;
  }

  .msg-tool-call summary, .msg-tool-result summary {
    cursor: pointer;
    color: var(--ctp-blue);
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .tool-name {
    font-weight: 600;
    color: var(--ctp-green);
  }

  .tool-id {
    font-family: var(--term-font-family, monospace);
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
  }

  .tool-input, .tool-output {
    margin: 0.25rem 0 0 0;
    white-space: pre-wrap;
    font-size: 0.6875rem;
    max-height: 18.75rem;
    overflow-y: auto;
    background: var(--ctp-surface0);
    padding: 0.375rem 0.5rem;
    border-radius: 0.1875rem;
    color: var(--ctp-subtext0);
  }

  .msg-tool-result {
    border-left-color: var(--ctp-teal);
  }

  .msg-tool-result summary {
    color: var(--ctp-teal);
  }

  .msg-cost {
    display: flex;
    gap: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-surface0);
    border-radius: 0.1875rem;
    font-size: 0.6875rem;
    color: var(--ctp-yellow);
    font-family: var(--term-font-family, monospace);
  }

  .msg-error {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 10%, transparent);
    padding: 0.375rem 0.5rem;
    border-radius: 0.1875rem;
    font-size: 0.75rem;
  }

  .msg-status {
    color: var(--ctp-overlay0);
    font-size: 0.6875rem;
    font-style: italic;
  }

  /* Status strip */
  .status-strip {
    padding: 0.25rem 0.75rem;
    border-top: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .running-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
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
    border-radius: 0.1875rem;
    padding: 0.125rem 0.625rem;
    font-size: 0.6875rem;
    cursor: pointer;
  }

  .stop-btn:hover { opacity: 0.9; }

  .scroll-btn {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
    border-radius: 0.1875rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.625rem;
    cursor: pointer;
  }

  .scroll-btn:hover { color: var(--ctp-text); }

  .restart-btn {
    margin-left: auto;
    background: var(--ctp-peach);
    color: var(--ctp-crust);
    border: none;
    border-radius: 0.1875rem;
    padding: 0.125rem 0.625rem;
    font-size: 0.6875rem;
    cursor: pointer;
  }

  .restart-btn:hover { opacity: 0.9; }
  .restart-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .done-bar, .error-bar {
    display: flex;
    gap: 0.75rem;
    font-size: 0.6875rem;
    font-family: var(--term-font-family, monospace);
    align-items: center;
  }

  .done-bar { color: var(--ctp-green); }
  .total-cost { color: var(--ctp-yellow); font-size: 0.625rem; }
  .error-bar { color: var(--ctp-red); }

  /* Session controls */
  .session-controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    justify-content: center;
    flex-shrink: 0;
  }

  .session-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .session-btn-new {
    background: transparent;
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
  }

  .session-btn-new:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    border-color: var(--ctp-surface2);
  }

  .session-btn-continue {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-blue);
  }

  .session-btn-continue:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-sapphire);
  }

  /* VSCode-style prompt container */
  .prompt-container {
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
    border-top: 1px solid var(--ctp-surface0);
  }

  .prompt-container.disabled {
    opacity: 0.6;
  }

  .prompt-wrapper {
    position: relative;
    display: flex;
    align-items: flex-end;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    transition: border-color 0.15s ease;
  }

  .prompt-wrapper:focus-within {
    border-color: var(--ctp-blue);
  }

  .prompt-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-family: inherit;
    font-size: 0.8125rem;
    padding: 0.5rem 0.625rem;
    resize: none;
    min-height: 1.25rem;
    max-height: 9.375rem;
    line-height: 1.4;
    overflow-y: auto;
  }

  .prompt-input:focus {
    outline: none;
  }

  .prompt-input::placeholder {
    color: var(--ctp-overlay0);
  }

  .prompt-input:disabled {
    cursor: not-allowed;
  }

  .submit-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin: 0.25rem;
    border: none;
    border-radius: 0.375rem;
    background: var(--ctp-blue);
    color: var(--ctp-crust);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s ease, opacity 0.12s ease;
  }

  .submit-icon-btn:hover:not(:disabled) {
    background: var(--ctp-sapphire);
  }

  .submit-icon-btn:disabled {
    background: var(--ctp-surface1);
    color: var(--ctp-overlay0);
    cursor: not-allowed;
  }

  /* Skill autocomplete */
  .skill-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    max-height: 12.5rem;
    overflow-y: auto;
    z-index: 10;
    margin-bottom: 0.25rem;
  }

  .skill-item {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.375rem 0.625rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--ctp-text);
    font-size: 0.75rem;
    cursor: pointer;
    font-family: inherit;
  }

  .skill-item:hover, .skill-item.active {
    background: var(--ctp-blue);
    color: var(--ctp-crust);
  }

  .skill-name {
    font-weight: 600;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-green);
    flex-shrink: 0;
  }

  .skill-item:hover .skill-name, .skill-item.active .skill-name {
    color: var(--ctp-crust);
  }

  .skill-desc {
    color: var(--ctp-overlay1);
    font-size: 0.6875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-item:hover .skill-desc, .skill-item.active .skill-desc {
    color: var(--ctp-crust);
    opacity: 0.8;
  }
</style>
