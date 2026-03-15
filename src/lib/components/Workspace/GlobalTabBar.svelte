<script lang="ts">
  import { getActiveTab, setActiveTab, type WorkspaceTab } from '../../stores/workspace.svelte';

  interface Props {
    expanded?: boolean;
    ontoggle?: () => void;
  }

  let { expanded = false, ontoggle }: Props = $props();

  const settingsIcon = 'M10.3 2L9.9 4.4a7 7 0 0 0-1.8 1l-2.2-.9-1.7 3 1.8 1.5a7 7 0 0 0 0 2l-1.8 1.5 1.7 3 2.2-.9a7 7 0 0 0 1.8 1L10.3 18h3.4l.4-2.4a7 7 0 0 0 1.8-1l2.2.9 1.7-3-1.8-1.5a7 7 0 0 0 0-2l1.8-1.5-1.7-3-2.2.9a7 7 0 0 0-1.8-1L13.7 2h-3.4zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z';

  function handleTabClick(tab: WorkspaceTab) {
    if (getActiveTab() === tab && expanded) {
      ontoggle?.();
    } else {
      setActiveTab(tab);
      if (!expanded) ontoggle?.();
    }
  }
</script>

<nav class="sidebar-rail" data-testid="sidebar-rail">
  <button
    class="rail-btn"
    class:active={getActiveTab() === 'comms' && expanded}
    onclick={() => handleTabClick('comms')}
    title="Messages (Ctrl+M)"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  </button>

  <div class="rail-spacer"></div>

  <button
    class="rail-btn"
    class:active={getActiveTab() === 'settings' && expanded}
    onclick={() => handleTabClick('settings')}
    title="Settings (Ctrl+,)"
    data-testid="settings-btn"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d={settingsIcon}
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  </button>
</nav>

<style>
  .sidebar-rail {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0.375rem;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    width: 2.75rem;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--ctp-subtext0);
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

  .rail-spacer {
    flex: 1;
  }
</style>
