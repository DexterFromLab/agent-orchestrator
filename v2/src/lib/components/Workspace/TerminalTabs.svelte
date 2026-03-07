<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import {
    getTerminalTabs,
    addTerminalTab,
    removeTerminalTab,
    type TerminalTab,
  } from '../../stores/workspace.svelte';
  import TerminalPane from '../Terminal/TerminalPane.svelte';

  interface Props {
    project: ProjectConfig;
  }

  let { project }: Props = $props();

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
    <button class="tab-add" onclick={addShellTab} title="New shell (Ctrl+N)">+</button>
  </div>

  <div class="tab-content">
    {#each tabs as tab (tab.id)}
      <div class="tab-pane" class:visible={activeTabId === tab.id}>
        {#if activeTabId === tab.id}
          <TerminalPane
            cwd={project.cwd}
            shell={tab.type === 'ssh' ? '/usr/bin/ssh' : undefined}
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
    height: 26px;
    padding: 0 4px;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: transparent;
    border: none;
    color: var(--ctp-overlay1);
    font-size: 0.72rem;
    cursor: pointer;
    border-radius: 3px 3px 0 0;
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

  .tab-icon {
    font-family: 'NerdFontsSymbols Nerd Font', 'Symbols Nerd Font Mono', monospace;
    font-size: 0.75rem;
  }

  .tab-title {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-close {
    background: transparent;
    border: none;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0 2px;
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
    padding: 2px 6px;
    border-radius: 3px;
  }

  .tab-add:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .tab-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .tab-pane {
    position: absolute;
    inset: 0;
    display: none;
  }

  .tab-pane.visible {
    display: block;
  }

  .empty-terminals {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .add-first {
    padding: 6px 16px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-subtext0);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .add-first:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }
</style>
