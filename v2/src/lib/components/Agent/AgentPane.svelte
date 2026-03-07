<script lang="ts">
  import { onMount } from 'svelte';
  import { marked, Renderer } from 'marked';
  import { queryAgent, stopAgent, isAgentReady, restartAgent } from '../../adapters/agent-bridge';
  import {
    getAgentSession,
    createAgentSession,
    removeAgentSession,
    getChildSessions,
    getTotalCost,
    type AgentSession,
  } from '../../stores/agents.svelte';
  import { focusPane } from '../../stores/layout.svelte';
  import { isSidecarAlive, setSidecarAlive } from '../../agent-dispatcher';
  import { listProfiles, listSkills, readSkill, type ClaudeProfile, type ClaudeSkill } from '../../adapters/claude-bridge';
  import AgentTree from './AgentTree.svelte';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';
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

  let { sessionId, prompt: initialPrompt = '', cwd: initialCwd, onExit }: Props = $props();

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

  // Working directory
  let cwdInput = $state(initialCwd ?? '');
  let showCwdPicker = $state(false);

  // Profile selector
  let profiles = $state<ClaudeProfile[]>([]);
  let selectedProfile = $state('');

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

  let followUpPrompt = $state('');

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

    const profile = profiles.find(p => p.name === selectedProfile);
    await queryAgent({
      session_id: sessionId,
      prompt: text,
      cwd: cwdInput || undefined,
      max_turns: 50,
      resume_session_id: resumeId,
      setting_sources: ['user', 'project'],
      claude_config_dir: profile?.config_dir,
    });
    inputPrompt = '';
    followUpPrompt = '';
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

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const expanded = await expandSkillPrompt(inputPrompt);
    showSkillMenu = false;
    startQuery(expanded);
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
  {#if !session || session.messages.length === 0}
    <div class="prompt-area">
      <div class="session-toolbar">
        <div class="toolbar-row">
          <label class="toolbar-label">
            <span class="toolbar-icon">DIR</span>
            <input
              type="text"
              class="toolbar-input"
              bind:value={cwdInput}
              placeholder="Working directory (default: ~)"
              onfocus={() => showCwdPicker = true}
              onblur={() => setTimeout(() => showCwdPicker = false, 150)}
            />
          </label>
          {#if profiles.length > 1}
            <label class="toolbar-label">
              <span class="toolbar-icon">ACC</span>
              <select class="toolbar-select" bind:value={selectedProfile}>
                <option value="">Default account</option>
                {#each profiles as profile (profile.name)}
                  <option value={profile.name}>
                    {profile.display_name || profile.name}
                    {#if profile.subscription_type}
                      ({profile.subscription_type})
                    {/if}
                  </option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
      </div>
      <form onsubmit={handleSubmit} class="prompt-form">
        <div class="prompt-wrapper">
          <textarea
            bind:value={inputPrompt}
            placeholder="Ask Claude something... (type / for skills)"
            class="prompt-input"
            rows="3"
            oninput={() => {
              showSkillMenu = inputPrompt.startsWith('/') && filteredSkills.length > 0;
              skillMenuIndex = 0;
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
                const expanded = await expandSkillPrompt(inputPrompt);
                showSkillMenu = false;
                startQuery(expanded);
              }
            }}
          ></textarea>
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
        </div>
        <button type="submit" class="send-btn" disabled={!inputPrompt.trim()}>Send</button>
      </form>
    </div>
  {:else}
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
          {#if totalCost && totalCost.costUsd > session.costUsd}
            <span class="total-cost">(total: ${totalCost.costUsd.toFixed(4)})</span>
          {/if}
          <span class="tokens">{session.inputTokens + session.outputTokens} tokens</span>
          <span class="duration">{(session.durationMs / 1000).toFixed(1)}s</span>
          {#if !autoScroll}
            <button class="scroll-btn" onclick={() => { autoScroll = true; scrollToBottom(); }}>Scroll to bottom</button>
          {/if}
        </div>
        {#if session.sdkSessionId}
          <div class="follow-up">
            <input
              type="text"
              class="follow-up-input"
              bind:value={followUpPrompt}
              placeholder="Follow up..."
              onkeydown={(e) => {
                if (e.key === 'Enter' && followUpPrompt.trim()) {
                  startQuery(followUpPrompt, true);
                }
              }}
            />
            <button class="follow-up-btn" onclick={() => startQuery(followUpPrompt, true)} disabled={!followUpPrompt.trim()}>Send</button>
          </div>
        {/if}
      {:else if session.status === 'error'}
        <div class="error-bar">
          <span>Error: {session.error ?? 'Unknown'}</span>
          {#if session.error?.includes('Sidecar') || session.error?.includes('crashed')}
            <button class="restart-btn" onclick={handleRestart} disabled={restarting}>
              {restarting ? 'Restarting...' : 'Restart Sidecar'}
            </button>
          {/if}
        </div>
        {#if session.sdkSessionId}
          <div class="follow-up">
            <input
              type="text"
              class="follow-up-input"
              bind:value={followUpPrompt}
              placeholder="Retry or follow up..."
              onkeydown={(e) => {
                if (e.key === 'Enter' && followUpPrompt.trim()) {
                  startQuery(followUpPrompt, true);
                }
              }}
            />
            <button class="follow-up-btn" onclick={() => startQuery(followUpPrompt, true)} disabled={!followUpPrompt.trim()}>Send</button>
          </div>
        {/if}
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

  .parent-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 11px;
  }

  .parent-badge {
    background: var(--ctp-mauve);
    color: var(--ctp-crust);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .parent-btn {
    background: none;
    border: none;
    color: var(--ctp-mauve);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    font-family: inherit;
  }

  .parent-btn:hover { color: var(--text-primary); text-decoration: underline; }

  .children-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
    font-size: 11px;
  }

  .children-label {
    color: var(--text-muted);
    font-size: 10px;
    margin-right: 4px;
  }

  .child-chip {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
  }

  .child-chip:hover { color: var(--text-primary); border-color: var(--accent); }
  .child-chip.running { border-color: var(--ctp-blue); color: var(--ctp-blue); }
  .child-chip.done { border-color: var(--ctp-green); color: var(--ctp-green); }
  .child-chip.error { border-color: var(--ctp-red); color: var(--ctp-red); }

  .tree-toggle {
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tree-btn {
    background: none;
    border: none;
    color: var(--ctp-mauve);
    font-size: 11px;
    cursor: pointer;
    font-family: var(--font-mono);
    padding: 2px 4px;
  }

  .tree-btn:hover { color: var(--text-primary); }

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
    background: var(--bg-surface);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--ctp-green);
  }

  .msg-text.markdown-body :global(pre) {
    background: var(--bg-surface);
    padding: 10px 12px;
    border-radius: var(--border-radius);
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
    margin: 0.5em 0;
  }

  .msg-text.markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--text-primary);
  }

  .msg-text.markdown-body :global(.shiki) {
    background: var(--bg-surface) !important;
    padding: 10px 12px;
    border-radius: var(--border-radius);
    overflow-x: auto;
    font-size: 12px;
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
    padding: 2px 10px;
    color: var(--text-secondary);
  }

  .msg-text.markdown-body :global(ul), .msg-text.markdown-body :global(ol) {
    padding-left: 20px;
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
    font-size: 12px;
  }

  .msg-text.markdown-body :global(th), .msg-text.markdown-body :global(td) {
    border: 1px solid var(--border);
    padding: 4px 8px;
    text-align: left;
  }

  .msg-text.markdown-body :global(th) {
    background: var(--bg-surface);
    font-weight: 600;
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
  .total-cost { color: var(--ctp-yellow); font-size: 10px; }
  .error-bar { color: var(--ctp-red); }

  .follow-up {
    display: flex;
    gap: 6px;
    padding: 4px 0 0;
  }

  .follow-up-input {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-primary);
    font-size: 12px;
    padding: 4px 8px;
    font-family: inherit;
  }

  .follow-up-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .follow-up-btn {
    background: var(--accent);
    color: var(--ctp-crust);
    border: none;
    border-radius: 3px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .follow-up-btn:hover { opacity: 0.9; }
  .follow-up-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Session toolbar */
  .session-toolbar {
    width: 100%;
    max-width: 600px;
    margin-bottom: 8px;
  }

  .toolbar-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .toolbar-label {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 180px;
  }

  .toolbar-icon {
    font-size: 9px;
    font-weight: 700;
    color: var(--ctp-crust);
    background: var(--ctp-overlay1);
    padding: 2px 5px;
    border-radius: 3px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .toolbar-input {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-primary);
    font-size: 11px;
    padding: 3px 6px;
    font-family: var(--font-mono);
  }

  .toolbar-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .toolbar-select {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-primary);
    font-size: 11px;
    padding: 3px 4px;
    font-family: inherit;
  }

  .toolbar-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* Skill autocomplete */
  .prompt-wrapper {
    position: relative;
    width: 100%;
  }

  .skill-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    margin-bottom: 4px;
  }

  .skill-item {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 6px 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .skill-item:hover, .skill-item.active {
    background: var(--accent);
    color: var(--ctp-crust);
  }

  .skill-name {
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--ctp-green);
    flex-shrink: 0;
  }

  .skill-item:hover .skill-name, .skill-item.active .skill-name {
    color: var(--ctp-crust);
  }

  .skill-desc {
    color: var(--text-muted);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-item:hover .skill-desc, .skill-item.active .skill-desc {
    color: var(--ctp-crust);
    opacity: 0.8;
  }
</style>
