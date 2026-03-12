<script lang="ts">
  import {
    getNotificationHistory,
    getUnreadCount,
    markRead,
    markAllRead,
    clearHistory,
    type NotificationType,
  } from '../../stores/notifications.svelte';

  let history = $derived(getNotificationHistory());
  let unreadCount = $derived(getUnreadCount());
  let open = $state(false);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      close();
    }
  }

  function handleClickNotification(id: string) {
    markRead(id);
  }

  function typeIcon(type: NotificationType): string {
    switch (type) {
      case 'agent_complete': return '\u2713'; // checkmark
      case 'agent_error': return '\u2715'; // x
      case 'task_review': return '\u2691'; // flag
      case 'wake_event': return '\u23F0'; // alarm
      case 'conflict': return '\u26A0'; // warning
      case 'system': return '\u2139'; // info
    }
  }

  function typeColor(type: NotificationType): string {
    switch (type) {
      case 'agent_complete': return 'var(--ctp-green)';
      case 'agent_error': return 'var(--ctp-red)';
      case 'task_review': return 'var(--ctp-blue)';
      case 'wake_event': return 'var(--ctp-teal)';
      case 'conflict': return 'var(--ctp-yellow)';
      case 'system': return 'var(--ctp-overlay1)';
    }
  }

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="notification-center" data-testid="notification-center">
  <button
    class="bell-btn"
    class:has-unread={unreadCount > 0}
    onclick={toggle}
    title="Notifications"
    data-testid="notification-bell"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    {#if unreadCount > 0}
      <span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
    {/if}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={close}></div>
    <div class="panel" data-testid="notification-panel">
      <div class="panel-header">
        <span class="panel-title">Notifications</span>
        <div class="panel-actions">
          {#if unreadCount > 0}
            <button class="action-btn" onclick={() => markAllRead()}>Mark all read</button>
          {/if}
          {#if history.length > 0}
            <button class="action-btn" onclick={() => { clearHistory(); close(); }}>Clear</button>
          {/if}
        </div>
      </div>
      <div class="panel-list">
        {#if history.length === 0}
          <div class="empty">No notifications</div>
        {:else}
          {#each [...history].reverse() as item (item.id)}
            <button
              class="notification-item"
              class:unread={!item.read}
              onclick={() => handleClickNotification(item.id)}
            >
              <span class="notif-icon" style="color: {typeColor(item.type)}">{typeIcon(item.type)}</span>
              <div class="notif-content">
                <span class="notif-title">{item.title}</span>
                <span class="notif-body">{item.body}</span>
              </div>
              <span class="notif-time">{relativeTime(item.timestamp)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .notification-center {
    position: relative;
    display: flex;
    align-items: center;
  }

  .bell-btn {
    position: relative;
    background: none;
    border: none;
    color: var(--ctp-overlay1);
    cursor: pointer;
    padding: 0.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bell-btn:hover {
    color: var(--ctp-text);
  }

  .bell-btn.has-unread {
    color: var(--ctp-peach);
  }

  .badge {
    position: absolute;
    top: -0.25rem;
    right: -0.375rem;
    background: var(--ctp-red);
    color: var(--ctp-crust);
    font-size: 0.5rem;
    font-weight: 700;
    min-width: 0.875rem;
    height: 0.875rem;
    border-radius: 0.4375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.1875rem;
    line-height: 1;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
  }

  .panel {
    position: absolute;
    bottom: 1.75rem;
    right: 0;
    width: 20rem;
    max-height: 25rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.4);
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface1);
  }

  .panel-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .panel-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    background: none;
    border: none;
    color: var(--ctp-blue);
    font-size: 0.625rem;
    cursor: pointer;
    padding: 0;
  }

  .action-btn:hover {
    color: var(--ctp-sapphire);
    text-decoration: underline;
  }

  .panel-list {
    overflow-y: auto;
    flex: 1;
  }

  .empty {
    padding: 1.5rem;
    text-align: center;
    font-size: 0.6875rem;
    color: var(--ctp-overlay0);
  }

  .notification-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid color-mix(in srgb, var(--ctp-surface1) 50%, transparent);
    background: transparent;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: var(--ctp-subtext0);
    transition: background 0.1s;
  }

  .notification-item:hover {
    background: color-mix(in srgb, var(--ctp-surface1) 40%, transparent);
  }

  .notification-item.unread {
    background: color-mix(in srgb, var(--ctp-blue) 5%, transparent);
    color: var(--ctp-text);
  }

  .notif-icon {
    font-size: 0.75rem;
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
    padding-top: 0.0625rem;
  }

  .notif-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .notif-title {
    font-size: 0.6875rem;
    font-weight: 600;
    color: inherit;
  }

  .notif-body {
    font-size: 0.625rem;
    color: var(--ctp-subtext0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unread .notif-body {
    color: var(--ctp-overlay1);
  }

  .notif-time {
    font-size: 0.5625rem;
    color: var(--ctp-overlay0);
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 0.0625rem;
  }
</style>
