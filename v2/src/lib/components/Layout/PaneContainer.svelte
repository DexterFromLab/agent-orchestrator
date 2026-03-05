<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    status?: 'idle' | 'running' | 'error' | 'done';
    onClose?: () => void;
    children: Snippet;
  }

  let { title, status = 'idle', onClose, children }: Props = $props();
</script>

<div class="pane-container">
  <div class="pane-header">
    <span class="pane-title">{title}</span>
    <div class="pane-controls">
      {#if status !== 'idle'}
        <span class="status {status}">{status}</span>
      {/if}
      {#if onClose}
        <button class="close-btn" onclick={onClose} title="Close pane">&times;</button>
      {/if}
    </div>
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
    height: 100%;
  }

  .pane-header {
    height: var(--pane-header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .pane-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .status.running { color: var(--ctp-blue); }
  .status.error { color: var(--ctp-red); }
  .status.done { color: var(--ctp-green); }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--ctp-red);
  }

  .pane-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }
</style>
