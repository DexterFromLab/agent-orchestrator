<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProjectConfig } from '../../types/groups';
  import {
    getTerminalTabs,
    addTerminalTab,
    removeTerminalTab,
    type TerminalTab,
  } from '../../stores/workspace.svelte';
  import { listSshSessions, type SshSession } from '../../adapters/ssh-bridge';
  import TerminalPane from '../Terminal/TerminalPane.svelte';
  import AgentPreviewPane from '../Terminal/AgentPreviewPane.svelte';

  /** Cached SSH sessions for building args */
  let sshSessions = $state<SshSession[]>([]);

  onMount(() => {
    listSshSessions().then(s => { sshSessions = s; }).catch(() => {});
  });

  /** Resolved SSH args per tab, keyed by tab id */
  let sshArgsCache = $derived.by(() => {
    const cache: Record<string, string[]> = {};
    for (const tab of tabs) {
      if (tab.type !== 'ssh' || !tab.sshSessionId) continue;
      const session = sshSessions.find(s => s.id === tab.sshSessionId);
      if (!session) continue;
      const args: string[] = [];
      if (session.key_file) args.push('-i', session.key_file);
      if (session.port && session.port !== 22) args.push('-p', String(session.port));
      args.push(`${session.username}@${session.host}`);
      cache[tab.id] = args;
    }
    return cache;
  });

  interface Props {
    project: ProjectConfig;
    agentSessionId?: string | null;
  }

  let { project, agentSessionId }: Props = $props();

  let tabs = $derived(getTerminalTabs(project.id));
  let activeTabId = $state<string | null>(null);

  // Auto-select first tab
  $effect(() => {
    if (tabs.length > 0 && (!activeTabId || !tabs.find(t => t.id === activeTabId))) {
      activeTabId = tabs[0].id;
    }
    if (tabs.length === 0) {
      activeTabId = null;
    }
  });

  function addShellTab() {
    const id = crypto.randomUUID();
    const num = tabs.filter(t => t.type === 'shell').length + 1;
    addTerminalTab(project.id, {
      id,
      title: `Shell ${num}`,
      type: 'shell',
    });
    activeTabId = id;
  }

  function addAgentPreviewTab() {
    if (!agentSessionId) return;
    // Don't create duplicate — check if one already exists for this session
    const existing = tabs.find(
      t => t.type === 'agent-preview' && t.agentSessionId === agentSessionId,
    );
    if (existing) {
      activeTabId = existing.id;
      return;
    }
    const id = crypto.randomUUID();
    addTerminalTab(project.id, {
      id,
      title: 'Agent Preview',
      type: 'agent-preview',
      agentSessionId,
    });
    activeTabId = id;
  }

  function closeTab(tabId: string) {
    removeTerminalTab(project.id, tabId);
  }

  function handleTabExit(tabId: string) {
    closeTab(tabId);
  }
</script>

<div class="terminal-tabs">
  <div class="tab-bar">
    {#each tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={activeTabId === tab.id}
        role="tab"
        tabindex="0"
        onclick={() => (activeTabId = tab.id)}
        onkeydown={e => e.key === 'Enter' && (activeTabId = tab.id)}
      >
        <span class="tab-title">{tab.title}</span>
        <button
          class="tab-close"
          onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          title="Close"
        >×</button>
      </div>
    {/each}
    <button class="tab-add" onclick={addShellTab} title="New shell">+</button>
    {#if agentSessionId}
      <button
        class="tab-add tab-agent-preview"
        onclick={addAgentPreviewTab}
        title="Watch agent activity"
      >👁</button>
    {/if}
  </div>

  <div class="tab-content">
    {#each tabs as tab (tab.id)}
      <div class="tab-pane" style:display={activeTabId === tab.id ? 'block' : 'none'}>
        {#if tab.type === 'agent-preview' && tab.agentSessionId}
          {#if activeTabId === tab.id}
            <AgentPreviewPane sessionId={tab.agentSessionId} />
          {/if}
        {:else if tab.type === 'ssh' && sshArgsCache[tab.id]}
          <TerminalPane
            cwd={project.cwd}
            shell="/usr/bin/ssh"
            args={sshArgsCache[tab.id]}
            onExit={() => handleTabExit(tab.id)}
          />
        {:else if tab.type === 'shell'}
          <TerminalPane
            cwd={project.cwd}
            onExit={() => handleTabExit(tab.id)}
          />
        {/if}
      </div>
    {/each}

    {#if tabs.length === 0}
      <div class="empty-terminals">
        <button class="add-first" onclick={addShellTab}>
          + Open terminal
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .terminal-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 0.25rem;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ctp-overlay1);
    font-size: 0.72rem;
    cursor: pointer;
    border-radius: 0.1875rem 0.1875rem 0 0;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
  }

  .tab:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .tab.active {
    color: var(--ctp-text);
    background: var(--ctp-base);
    border-bottom: 1px solid var(--ctp-blue);
  }

  .tab-title {
    max-width: 6.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-close {
    background: transparent;
    border: none;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0 0.125rem;
    line-height: 1;
  }

  .tab-close:hover {
    color: var(--ctp-red);
  }

  .tab-add {
    background: transparent;
    border: none;
    color: var(--ctp-overlay0);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
    border-radius: 0.1875rem;
  }

  .tab-add:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .tab-agent-preview {
    font-size: 0.7rem;
  }

  .tab-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .tab-pane {
    position: absolute;
    inset: 0;
  }

  .empty-terminals {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .add-first {
    padding: 0.375rem 1rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .add-first:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }
</style>
