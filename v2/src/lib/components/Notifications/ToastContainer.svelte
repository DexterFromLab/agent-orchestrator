<script lang="ts">
  import { getNotifications, dismissNotification } from '../../stores/notifications.svelte';

  let toasts = $derived(getNotifications());
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" role="alert">
        <span class="toast-icon">
          {#if toast.type === 'success'}✓
          {:else if toast.type === 'error'}✕
          {:else if toast.type === 'warning'}!
          {:else}i
          {/if}
        </span>
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" onclick={() => dismissNotification(toast.id)}>&times;</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 360px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--border-radius);
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slide-in 0.2s ease-out;
  }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .toast-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .toast-success .toast-icon { background: var(--ctp-green); color: var(--ctp-crust); }
  .toast-error .toast-icon { background: var(--ctp-red); color: var(--ctp-crust); }
  .toast-warning .toast-icon { background: var(--ctp-yellow); color: var(--ctp-crust); }
  .toast-info .toast-icon { background: var(--ctp-blue); color: var(--ctp-crust); }

  .toast-success { border-color: color-mix(in srgb, var(--ctp-green) 30%, transparent); }
  .toast-error { border-color: color-mix(in srgb, var(--ctp-red) 30%, transparent); }
  .toast-warning { border-color: color-mix(in srgb, var(--ctp-yellow) 30%, transparent); }
  .toast-info { border-color: color-mix(in srgb, var(--ctp-blue) 30%, transparent); }

  .toast-message {
    flex: 1;
    line-height: 1.3;
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .toast-close:hover { color: var(--text-primary); }
</style>
