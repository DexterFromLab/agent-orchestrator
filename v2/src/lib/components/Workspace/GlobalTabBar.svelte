<script lang="ts">
  import { getActiveTab, setActiveTab, type WorkspaceTab } from '../../stores/workspace.svelte';

  interface Props {
    settingsOpen?: boolean;
    ontoggleSettings?: () => void;
  }

  let { settingsOpen = false, ontoggleSettings }: Props = $props();

  const tabs: { id: WorkspaceTab; label: string; shortcut: string }[] = [
    { id: 'sessions', label: 'Sessions', shortcut: 'Alt+1' },
    { id: 'docs', label: 'Docs', shortcut: 'Alt+2' },
    { id: 'context', label: 'Context', shortcut: 'Alt+3' },
  ];
</script>

<nav class="global-tab-bar">
  <div class="tabs">
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
  </div>
  <button
    class="settings-toggle"
    class:active={settingsOpen}
    onclick={ontoggleSettings}
    title="Settings (Ctrl+,)"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.5 1L6.2 2.7a5 5 0 0 0-1.2.7L3.4 2.8 1.9 5.4l1.3 1.2a5 5 0 0 0 0 1.4L1.9 9.2l1.5 2.6 1.6-.6a5 5 0 0 0 1.2.7L6.5 14h3l.3-1.7a5 5 0 0 0 1.2-.7l1.6.6 1.5-2.6-1.3-1.2a5 5 0 0 0 0-1.4l1.3-1.2-1.5-2.6-1.6.6a5 5 0 0 0-1.2-.7L9.5 1h-3zM8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  </button>
</nav>

<style>
  .global-tab-bar {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    gap: 2px;
    flex: 1;
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

  .settings-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--ctp-subtext0);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .settings-toggle:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .settings-toggle.active {
    color: var(--ctp-blue);
    background: var(--ctp-surface0);
  }
</style>
