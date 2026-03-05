<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<div class="pane-container">
  <div class="pane-header">
    <span class="pane-title">{title}</span>
  </div>
  <div class="pane-content">
    {@render children()}
  </div>
</div>

<style>
  .pane-container {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: var(--border-radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .pane-header {
    height: var(--pane-header-height);
    display: flex;
    align-items: center;
    padding: 0 10px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .pane-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
  }
</style>
