<script lang="ts">
  interface Props {
    title: string;
    status?: 'idle' | 'running' | 'error' | 'done';
  }

  let { title, status = 'idle' }: Props = $props();
</script>

<div class="pane-header">
  <span class="pane-title">{title}</span>
  {#if status !== 'idle'}
    <span class="status-indicator {status}">{status}</span>
  {/if}
</div>

<style>
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
  }

  .status-indicator {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .status-indicator.running { color: var(--ctp-blue); }
  .status-indicator.error { color: var(--ctp-red); }
  .status-indicator.done { color: var(--ctp-green); }
</style>
