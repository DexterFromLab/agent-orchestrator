<script lang="ts">
  import { onMount } from 'svelte';
  import SessionList from './lib/components/Sidebar/SessionList.svelte';
  import TilingGrid from './lib/components/Layout/TilingGrid.svelte';
  import { addPane, focusPaneByIndex, getPanes } from './lib/stores/layout';

  function newTerminal() {
    const id = crypto.randomUUID();
    const num = getPanes().length + 1;
    addPane({
      id,
      type: 'terminal',
      title: `Terminal ${num}`,
    });
  }

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Ctrl+N — new terminal
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        newTerminal();
        return;
      }

      // Ctrl+1-4 — focus pane by index
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        focusPaneByIndex(parseInt(e.key) - 1);
        return;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<aside class="sidebar">
  <SessionList />
</aside>
<main class="workspace">
  <TilingGrid />
</main>

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
