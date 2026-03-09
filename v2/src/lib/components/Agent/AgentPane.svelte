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
    StatusContent,
  } from '../../adapters/sdk-messages';

  // Tool-aware truncation limits
  const MAX_BASH_LINES = 500;
  const MAX_READ_LINES = 50;
  const MAX_GLOB_LINES = 20;
  const MAX_DEFAULT_LINES = 30;

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
  let isRunning = $derived(session?.status === 'running' || session?.status === 'starting');

  // Tool result map — pairs tool_call with tool_result by toolUseId
  // Cache guard: only rescan when user-role message count changes (tool_results come in user messages)
  let _cachedResultMap: Record<string, ToolResultContent> = {};
  let _cachedUserMsgCount = -1;
  let toolResultMap = $derived.by((): Record<string, ToolResultContent> => {
    if (!session) return {};
    const userMsgCount = session.messages.filter(m => m.type === 'tool_result').length;
    if (userMsgCount === _cachedUserMsgCount) return _cachedResultMap;
    const map: Record<string, ToolResultContent> = {};
    for (const msg of session.messages) {
      if (msg.type === 'tool_result') {
        const tr = msg.content as ToolResultContent;
        map[tr.toolUseId] = tr;
      }
    }
    _cachedUserMsgCount = userMsgCount;
    _cachedResultMap = map;
    return map;
  });

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

  // Track expanded state for tool truncation
  let expandedTools = $state<Set<string>>(new Set());

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

  function handleScroll() {
    if (!scrollContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    autoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function handleTreeNodeClick(nodeId: string) {
    if (!scrollContainer || !session) return;
    const msg = session.messages.find(
      m => m.type === 'tool_call' && (m.content as ToolCallContent).toolUseId === nodeId
    );
    if (!msg) return;
    autoScroll = false;
    scrollContainer.querySelector('#msg-' + CSS.escape(msg.id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Scroll anchoring: two-phase pattern
  let wasNearBottom = true;
  $effect.pre(() => {
    if (session?.messages.length !== undefined) {
      wasNearBottom = scrollContainer
        ? scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 80
        : true;
    }
  });
  $effect(() => {
    if (session?.messages.length !== undefined && wasNearBottom && autoScroll) {
      scrollContainer?.querySelector('#message-end')?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
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

  /** Get truncation limit for a tool name */
  function getTruncationLimit(toolName: string): number {
    const name = toolName.toLowerCase();
    if (name === 'bash' || name.includes('bash')) return MAX_BASH_LINES;
    if (name === 'read' || name === 'write' || name === 'edit') return MAX_READ_LINES;
    if (name === 'glob' || name === 'grep' || name === 'ls') return MAX_GLOB_LINES;
    return MAX_DEFAULT_LINES;
  }

  /** Truncate text by lines, return { text, truncated, totalLines } */
  function truncateByLines(text: string, maxLines: number): { text: string; truncated: boolean; totalLines: number } {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return { text, truncated: false, totalLines: lines.length };
    return { text: lines.slice(0, maxLines).join('\n'), truncated: true, totalLines: lines.length };
  }

  /** Check if a status message is a hook event */
  function isHookMessage(content: StatusContent): boolean {
    return content.subtype === 'hook_started' || content.subtype === 'hook_response';
  }

  /** Get display name for hook subtype */
  function hookDisplayName(subtype: string): string {
    if (subtype === 'hook_started') return 'Hook started';
    if (subtype === 'hook_response') return 'Hook response';
    return subtype;
  }

  // Context meter: estimate percentage of context window used
  const DEFAULT_CONTEXT_LIMIT = 200_000;
  let contextPercent = $derived.by(() => {
    if (!session) return 0;
    const totalTokens = session.inputTokens + session.outputTokens;
    if (totalTokens === 0) return 0;
    return Math.min(100, Math.round((totalTokens / DEFAULT_CONTEXT_LIMIT) * 100));
  });
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

  <div class="agent-pane-scroll" bind:this={scrollContainer} onscroll={handleScroll}>
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
              <summary><span class="chevron" aria-hidden="true">▶</span> Thinking...</summary>
              <pre>{(msg.content as ThinkingContent).text}</pre>
            </details>
          {:else if msg.type === 'tool_call'}
            {@const tc = msg.content as ToolCallContent}
            {@const pairedResult = toolResultMap[tc.toolUseId]}
            <details class="msg-tool-group">
              <summary>
                <span class="chevron" aria-hidden="true">▶</span>
                <span class="tool-name">{tc.name}</span>
                {#if pairedResult}
                  <span class="tool-status tool-status--done">✓</span>
                {:else if isRunning}
                  <span class="tool-status tool-status--pending">⋯</span>
                {/if}
              </summary>
              <div class="tool-group-body">
                <div class="tool-section">
                  <div class="tool-section-label">Input</div>
                  <pre class="tool-input">{formatToolInput(tc.input)}</pre>
                </div>
                {#if pairedResult}
                  {@const outputStr = formatToolInput(pairedResult.output)}
                  {@const limit = getTruncationLimit(tc.name)}
                  {@const truncated = truncateByLines(outputStr, limit)}
                  <div class="tool-section">
                    <div class="tool-section-label">Output</div>
                    {#if truncated.truncated && !expandedTools.has(tc.toolUseId)}
                      <pre class="tool-output">{truncated.text}</pre>
                      <button class="truncation-btn" onclick={() => { expandedTools = new Set([...expandedTools, tc.toolUseId]); }}>
                        Show all ({truncated.totalLines} lines)
                      </button>
                    {:else}
                      <pre class="tool-output">{outputStr}</pre>
                    {/if}
                  </div>
                {:else if isRunning}
                  <div class="tool-pending" role="status">
                    <span aria-hidden="true">⋯</span>
                    <span class="sr-only">Awaiting tool result</span>
                  </div>
                {/if}
              </div>
            </details>
          {:else if msg.type === 'tool_result'}
            <!-- Tool results rendered inline with their tool_call above; skip standalone rendering -->
          {:else if msg.type === 'cost'}
            {@const cost = msg.content as CostContent}
            <div class="msg-cost">
              <span class="cost-value">${cost.totalCostUsd.toFixed(4)}</span>
              <span class="cost-detail">{cost.inputTokens + cost.outputTokens} tokens</span>
              <span class="cost-detail">{cost.numTurns} turns</span>
              <span class="cost-detail">{(cost.durationMs / 1000).toFixed(1)}s</span>
            </div>
            {#if cost.result}
              <div class="msg-summary">{cost.result}</div>
            {/if}
          {:else if msg.type === 'error'}
            <div class="msg-error">{(msg.content as ErrorContent).message}</div>
          {:else if msg.type === 'status'}
            {@const statusContent = msg.content as StatusContent}
            {#if isHookMessage(statusContent)}
              <details class="msg-hook">
                <summary><span class="chevron" aria-hidden="true">▶</span> <span class="hook-icon">⚙</span> {hookDisplayName(statusContent.subtype)}</summary>
                <pre>{statusContent.message || JSON.stringify(msg.content, null, 2)}</pre>
              </details>
            {:else}
              <div class="msg-status">{statusContent.message || statusContent.subtype}</div>
            {/if}
          {/if}
        </div>
      {/each}
      <div id="message-end"></div>
    {/if}
  </div>

  <!-- Context meter + status strip -->
  {#if session}
    <div class="status-strip">
      {#if session.status === 'running' || session.status === 'starting'}
        <div class="running-indicator">
          <span class="pulse"></span>
          <span>Running...</span>
          {#if contextPercent > 0}
            <span class="context-meter" title="Context window usage">
              <span class="context-fill" class:context-streaming={isRunning} style="width: {contextPercent}%"></span>
              <span class="context-label">{contextPercent}%</span>
            </span>
          {/if}
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollContainer?.querySelector('#message-end')?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }); }}>↓ Bottom</button>
          {/if}
          <button class="stop-btn" onclick={handleStop}>Stop</button>
        </div>
      {:else if session.status === 'done'}
        <div class="done-bar">
          <span class="cost-value">${session.costUsd.toFixed(4)}</span>
          {#if totalCost && totalCost.costUsd > session.costUsd}
            <span class="total-cost">(total: ${totalCost.costUsd.toFixed(4)})</span>
          {/if}
          <span class="cost-detail">{session.inputTokens + session.outputTokens} tok</span>
          <span class="cost-detail">{(session.durationMs / 1000).toFixed(1)}s</span>
          {#if contextPercent > 0}
            <span class="context-meter" title="Context window usage">
              <span class="context-fill" style="width: {contextPercent}%"></span>
              <span class="context-label">{contextPercent}%</span>
            </span>
          {/if}
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollContainer?.querySelector('#message-end')?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }); }}>↓ Bottom</button>
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

  <!-- Unified prompt input -->
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
  /* === Root === */
  .agent-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  /* === Scroll wrapper with container queries === */
  .agent-pane-scroll {
    flex: 1;
    overflow-y: auto;
    container-type: inline-size;
    padding: 0.5rem var(--bterminal-pane-padding-inline, 0.75rem);
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-height: 0;
  }

  /* === Screen reader only === */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* === Subagent bars === */
  .parent-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    font-size: 0.75rem;
  }

  .parent-badge {
    background: var(--ctp-mauve);
    color: var(--ctp-crust);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.1875rem;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .parent-btn {
    background: none;
    border: none;
    color: var(--ctp-mauve);
    cursor: pointer;
    font-size: 0.75rem;
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
    font-size: 0.75rem;
  }

  .children-label {
    color: var(--ctp-overlay0);
    font-size: 0.6875rem;
    margin-right: 0.25rem;
  }

  .child-chip {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
    font-size: 0.6875rem;
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
    font-size: 0.75rem;
    cursor: pointer;
    font-family: var(--term-font-family, monospace);
    padding: 0.125rem 0.25rem;
  }

  .tree-btn:hover { color: var(--ctp-text); }

  /* === Welcome state === */
  .welcome-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--ctp-overlay1);
  }

  .welcome-icon { color: var(--ctp-overlay0); opacity: 0.6; }
  .welcome-text { font-size: 0.9375rem; font-weight: 500; color: var(--ctp-subtext1); }
  .welcome-hint { font-size: 0.75rem; color: var(--ctp-overlay0); }

  /* === Messages === */
  .message { padding: 0.1875rem 0; }

  .msg-init {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .msg-init .model {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
    font-family: var(--term-font-family, monospace);
    font-size: 0.6875rem;
  }

  /* === Text messages (markdown) === */
  .msg-text {
    word-break: break-word;
    line-height: 1.65;
  }

  .msg-text.markdown-body :global(h1) {
    font-size: 1.4em;
    font-weight: 700;
    margin: 0.75em 0 0.35em;
    color: var(--ctp-lavender);
    line-height: 1.25;
  }

  .msg-text.markdown-body :global(h2) {
    font-size: 1.2em;
    font-weight: 600;
    margin: 0.6em 0 0.3em;
    color: var(--ctp-blue);
    line-height: 1.3;
  }

  .msg-text.markdown-body :global(h3) {
    font-size: 1.05em;
    font-weight: 600;
    margin: 0.5em 0 0.25em;
    color: var(--ctp-sapphire);
  }

  .msg-text.markdown-body :global(p) { margin: 0.5em 0; }

  .msg-text.markdown-body :global(code) {
    background: var(--ctp-surface0);
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    font-family: var(--term-font-family, monospace);
    font-size: 0.85em;
    color: var(--ctp-green);
  }

  .msg-text.markdown-body :global(pre) {
    background: var(--ctp-mantle);
    padding: 0.75rem 0.875rem;
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0.625em 0;
    direction: ltr;
    unicode-bidi: embed;
  }

  .msg-text.markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--ctp-text);
    font-size: inherit;
  }

  .msg-text.markdown-body :global(.shiki) {
    background: var(--ctp-mantle) !important;
    padding: 0.75rem 0.875rem;
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0.625em 0;
  }

  .msg-text.markdown-body :global(.shiki code) {
    background: none !important;
    padding: 0;
  }

  .msg-text.markdown-body :global(blockquote) {
    border-left: 3px solid var(--ctp-mauve);
    margin: 0.5em 0;
    padding: 0.125rem 0.75rem;
    color: var(--ctp-subtext0);
    background: color-mix(in srgb, var(--ctp-surface0) 20%, transparent);
    border-radius: 0 0.25rem 0.25rem 0;
  }

  .msg-text.markdown-body :global(ul), .msg-text.markdown-body :global(ol) {
    padding-left: 1.5rem;
    margin: 0.4em 0;
  }

  .msg-text.markdown-body :global(li) { margin: 0.2em 0; }

  .msg-text.markdown-body :global(a) { color: var(--ctp-blue); text-decoration: none; }
  .msg-text.markdown-body :global(a:hover) { text-decoration: underline; }

  .msg-text.markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
    font-size: 0.8rem;
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

  /* === Shared collapsible styles === */
  .chevron {
    display: inline-block;
    font-size: 0.625rem;
    transition: transform 0.15s ease;
    margin-right: 0.25rem;
  }

  details[open] > summary > .chevron {
    transform: rotate(90deg);
  }

  details summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  details summary::-webkit-details-marker { display: none; }

  details summary:focus-visible {
    outline: 0.125rem solid var(--ctp-blue);
    outline-offset: 0.125rem;
    border-radius: 0.25rem;
  }

  /* === Thinking === */
  .msg-thinking {
    color: var(--ctp-overlay1);
    font-size: 0.8125rem;
  }

  .msg-thinking summary {
    color: color-mix(in srgb, var(--ctp-mauve) 65%, var(--ctp-surface1) 35%);
    font-size: 0.8125rem;
  }

  .msg-thinking pre {
    margin: 0.25rem 0 0 1rem;
    white-space: pre-wrap;
    font-size: 0.75rem;
    font-family: var(--term-font-family, monospace);
    max-height: 12.5rem;
    overflow-y: auto;
    direction: ltr;
    unicode-bidi: embed;
  }

  /* === Tool groups (paired call + result) === */
  .msg-tool-group {
    border-left: 2px solid color-mix(in srgb, var(--ctp-blue) 50%, var(--ctp-surface1) 50%);
    padding-left: 0.625rem;
    font-size: 0.8125rem;
  }

  .msg-tool-group summary {
    color: var(--ctp-subtext0);
  }

  .tool-name {
    font-weight: 600;
    font-family: var(--term-font-family, monospace);
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--ctp-green) 65%, var(--ctp-surface1) 35%);
  }

  .tool-status {
    font-size: 0.6875rem;
    margin-left: 0.25rem;
  }

  .tool-status--done { color: color-mix(in srgb, var(--ctp-green) 65%, var(--ctp-surface1) 35%); }
  .tool-status--pending { color: var(--ctp-overlay0); animation: pulse 1.5s ease-in-out infinite; }

  .tool-group-body {
    margin-top: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tool-section-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.125rem;
  }

  .tool-input, .tool-output {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.75rem;
    font-family: var(--term-font-family, monospace);
    max-height: 18.75rem;
    overflow-y: auto;
    background: var(--ctp-mantle);
    padding: 0.375rem 0.5rem;
    border-radius: 0.1875rem;
    color: var(--ctp-subtext0);
    border: 1px solid var(--ctp-surface0);
    direction: ltr;
    unicode-bidi: embed;
  }

  .tool-pending {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    padding: 0.25rem 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .truncation-btn {
    background: none;
    border: none;
    color: var(--ctp-blue);
    font-size: 0.6875rem;
    cursor: pointer;
    padding: 0.125rem 0;
    font-family: inherit;
  }

  .truncation-btn:hover { text-decoration: underline; }

  /* === Hook messages === */
  .msg-hook {
    font-size: 0.75rem;
    color: var(--ctp-overlay0);
  }

  .msg-hook summary {
    color: var(--ctp-overlay1);
    font-size: 0.75rem;
  }

  .hook-icon { opacity: 0.7; }

  .msg-hook pre {
    margin: 0.25rem 0 0 1rem;
    white-space: pre-wrap;
    font-size: 0.6875rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay0);
    max-height: 6.25rem;
    overflow-y: auto;
    direction: ltr;
    unicode-bidi: embed;
  }

  /* === Cost message (inline in chat) === */
  .msg-cost {
    display: flex;
    gap: 0.625rem;
    padding: 0.25rem 0;
    font-size: 0.8125rem;
    color: var(--ctp-subtext0);
    border-top: 1px solid var(--ctp-surface1);
    align-items: baseline;
  }

  .cost-value {
    font-family: var(--term-font-family, monospace);
    font-size: 0.75rem;
    color: var(--ctp-subtext1);
  }

  .cost-detail {
    font-size: 0.6875rem;
    color: var(--ctp-overlay0);
  }

  /* === Session summary === */
  .msg-summary {
    background: color-mix(in srgb, var(--ctp-surface0) 60%, var(--ctp-base) 40%);
    border-top: 0.125rem solid var(--ctp-surface2);
    padding: 0.5rem 0.625rem;
    border-radius: 0 0 0.25rem 0.25rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--ctp-subtext1);
  }

  /* === Error === */
  .msg-error {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 10%, transparent);
    padding: 0.375rem 0.5rem;
    border-radius: 0.1875rem;
    font-size: 0.8125rem;
  }

  /* === Status (non-hook) === */
  .msg-status {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    font-style: italic;
  }

  /* === Status strip === */
  .status-strip {
    padding: 0.25rem var(--bterminal-pane-padding-inline, 0.75rem);
    border-top: 1px solid var(--ctp-surface1);
    flex-shrink: 0;
    font-size: 0.8125rem;
  }

  .running-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--ctp-subtext0);
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

  /* === Context meter === */
  .context-meter {
    position: relative;
    width: 3.5rem;
    height: 0.375rem;
    background: var(--ctp-surface0);
    border-radius: 0.1875rem;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
  }

  .context-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--ctp-blue);
    border-radius: 0.1875rem;
    transition: width 0.3s ease;
  }

  .context-fill.context-streaming {
    animation: ctx-pulse 1.2s ease-in-out infinite;
  }

  @keyframes ctx-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .context-label {
    position: relative;
    z-index: 1;
    font-size: 0.5rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
    width: 100%;
    text-align: center;
    line-height: 0.375rem;
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
    gap: 0.625rem;
    font-size: 0.8125rem;
    align-items: center;
  }

  .done-bar { color: var(--ctp-subtext0); }
  .total-cost { color: var(--ctp-overlay1); font-size: 0.6875rem; }
  .error-bar { color: var(--ctp-red); }

  /* === Session controls === */
  .session-controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.375rem var(--bterminal-pane-padding-inline, 0.75rem);
    justify-content: center;
    flex-shrink: 0;
  }

  .session-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
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

  /* === Prompt container === */
  .prompt-container {
    padding: 0.5rem var(--bterminal-pane-padding-inline, 0.75rem);
    flex-shrink: 0;
    border-top: 1px solid var(--ctp-surface0);
  }

  .prompt-container.disabled { opacity: 0.6; }

  .prompt-wrapper {
    position: relative;
    display: flex;
    align-items: flex-end;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    transition: border-color 0.15s ease;
  }

  .prompt-wrapper:focus-within { border-color: var(--ctp-blue); }

  .prompt-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-family: inherit;
    font-size: 0.875rem;
    padding: 0.5rem 0.625rem;
    resize: none;
    min-height: 1.25rem;
    max-height: 9.375rem;
    line-height: 1.4;
    overflow-y: auto;
  }

  .prompt-input:focus { outline: none; }
  .prompt-input::placeholder { color: var(--ctp-overlay0); }
  .prompt-input:disabled { cursor: not-allowed; }

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

  .submit-icon-btn:hover:not(:disabled) { background: var(--ctp-sapphire); }

  .submit-icon-btn:disabled {
    background: var(--ctp-surface1);
    color: var(--ctp-overlay0);
    cursor: not-allowed;
  }

  /* === Skill autocomplete === */
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
    font-size: 0.8125rem;
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
    font-size: 0.75rem;
  }

  .skill-item:hover .skill-name, .skill-item.active .skill-name { color: var(--ctp-crust); }

  .skill-desc {
    color: var(--ctp-overlay1);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-item:hover .skill-desc, .skill-item.active .skill-desc {
    color: var(--ctp-crust);
    opacity: 0.8;
  }
</style>
