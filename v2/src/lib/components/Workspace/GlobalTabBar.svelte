<script lang="ts">
  import { getActiveTab, setActiveTab, type WorkspaceTab } from '../../stores/workspace.svelte';

  interface Props {
    expanded?: boolean;
    ontoggle?: () => void;
  }

  let { expanded = false, ontoggle }: Props = $props();

  const tabs: { id: WorkspaceTab; label: string; shortcut: string }[] = [
    { id: 'sessions', label: 'Sessions', shortcut: 'Alt+1' },
    { id: 'docs', label: 'Docs', shortcut: 'Alt+2' },
    { id: 'context', label: 'Context', shortcut: 'Alt+3' },
    { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,' },
  ];

  // SVG icon paths for each tab
  const icons: Record<WorkspaceTab, string> = {
    sessions: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    docs: 'M6 2h9l5 5v15H4V2h2zm8 0v5h5M8 12h8M8 16h5',
    context: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v5l3 3',
    settings: 'M10.3 2L9.9 4.4a7 7 0 0 0-1.8 1l-2.2-.9-1.7 3 1.8 1.5a7 7 0 0 0 0 2l-1.8 1.5 1.7 3 2.2-.9a7 7 0 0 0 1.8 1L10.3 18h3.4l.4-2.4a7 7 0 0 0 1.8-1l2.2.9 1.7-3-1.8-1.5a7 7 0 0 0 0-2l1.8-1.5-1.7-3-2.2.9a7 7 0 0 0-1.8-1L13.7 2h-3.4zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  };

  function handleTabClick(id: WorkspaceTab) {
    const current = getActiveTab();
    if (current === id && expanded) {
      // Clicking active tab again collapses
      ontoggle?.();
    } else {
      setActiveTab(id);
      if (!expanded) ontoggle?.();
    }
  }
</script>

<nav class="sidebar-rail">
  {#each tabs as tab}
    <button
      class="rail-btn"
      class:active={getActiveTab() === tab.id && expanded}
      onclick={() => handleTabClick(tab.id)}
      title="{tab.label} ({tab.shortcut})"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d={icons[tab.id]}
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
    </button>
  {/each}
</nav>

<style>
  .sidebar-rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 4px;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    width: 36px;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--ctp-overlay1);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .rail-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .rail-btn.active {
    color: var(--ctp-blue);
    background: var(--ctp-surface0);
  }
</style>
