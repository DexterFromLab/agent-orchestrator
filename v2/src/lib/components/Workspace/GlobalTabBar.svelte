<script lang="ts">
  import { getActiveTab, setActiveTab, type WorkspaceTab } from '../../stores/workspace.svelte';

  const tabs: { id: WorkspaceTab; label: string; shortcut: string }[] = [
    { id: 'sessions', label: 'Sessions', shortcut: 'Alt+1' },
    { id: 'docs', label: 'Docs', shortcut: 'Alt+2' },
    { id: 'context', label: 'Context', shortcut: 'Alt+3' },
    { id: 'settings', label: 'Settings', shortcut: 'Alt+4' },
  ];
</script>

<nav class="global-tab-bar">
  {#each tabs as tab}
    <button
      class="tab-btn"
      class:active={getActiveTab() === tab.id}
      onclick={() => setActiveTab(tab.id)}
      title={tab.shortcut}
    >
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .global-tab-bar {
    display: flex;
    gap: 2px;
    padding: 4px 8px;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .tab-btn {
    padding: 4px 14px;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    transition: color 0.15s, background 0.15s;
  }

  .tab-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .tab-btn.active {
    color: var(--ctp-text);
    background: var(--ctp-base);
    border-bottom: 2px solid var(--ctp-blue);
  }
</style>
