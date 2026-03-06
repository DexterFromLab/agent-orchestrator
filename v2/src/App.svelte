<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import SessionList from './lib/components/Sidebar/SessionList.svelte';
  import TilingGrid from './lib/components/Layout/TilingGrid.svelte';
  import StatusBar from './lib/components/StatusBar/StatusBar.svelte';
  import ToastContainer from './lib/components/Notifications/ToastContainer.svelte';
  import SettingsDialog from './lib/components/Settings/SettingsDialog.svelte';
  import { addPane, focusPaneByIndex, removePane, getPanes, restoreFromDb } from './lib/stores/layout.svelte';

  let settingsOpen = $state(false);
  import { startAgentDispatcher, stopAgentDispatcher } from './lib/agent-dispatcher';

  function newTerminal() {
    const id = crypto.randomUUID();
    const num = getPanes().length + 1;
    addPane({
      id,
      type: 'terminal',
      title: `Terminal ${num}`,
    });
  }

  function newAgent() {
    const id = crypto.randomUUID();
    const num = getPanes().filter(p => p.type === 'agent').length + 1;
    addPane({
      id,
      type: 'agent',
      title: `Agent ${num}`,
    });
  }

  onMount(() => {
    startAgentDispatcher();
    restoreFromDb();

    function handleKeydown(e: KeyboardEvent) {
      // Ctrl+N — new terminal
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        newTerminal();
        return;
      }

      // Ctrl+Shift+N — new agent
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        newAgent();
        return;
      }

      // Ctrl+1-4 — focus pane by index
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        focusPaneByIndex(parseInt(e.key) - 1);
        return;
      }

      // Ctrl+, — settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        settingsOpen = !settingsOpen;
        return;
      }

      // Ctrl+W — close focused pane
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        const focused = getPanes().find(p => p.focused);
        if (focused) removePane(focused.id);
        return;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      stopAgentDispatcher();
    };
  });
</script>

<aside class="sidebar">
  <SessionList />
</aside>
<main class="workspace">
  <TilingGrid />
</main>
<StatusBar />
<ToastContainer />
<SettingsDialog open={settingsOpen} onClose={() => settingsOpen = false} />

<style>
  .sidebar {
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .workspace {
    background: var(--bg-primary);
    overflow: hidden;
    position: relative;
  }
</style>
