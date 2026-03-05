<script lang="ts">
  import SessionList from './lib/components/Sidebar/SessionList.svelte';
  import TilingGrid from './lib/components/Layout/TilingGrid.svelte';
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
