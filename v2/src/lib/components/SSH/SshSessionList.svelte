<script lang="ts">
  import { onMount } from 'svelte';
  import { listSshSessions, deleteSshSession, type SshSession } from '../../adapters/ssh-bridge';
  import { addPane } from '../../stores/layout.svelte';
  import { notify } from '../../stores/notifications.svelte';
  import SshDialog from './SshDialog.svelte';

  let sessions = $state<SshSession[]>([]);
  let dialogOpen = $state(false);
  let editingSession = $state<SshSession | undefined>(undefined);

  onMount(() => {
    loadSessions();
  });

  async function loadSessions() {
    try {
      sessions = await listSshSessions();
    } catch (e) {
      console.warn('Failed to load SSH sessions:', e);
    }
  }

  function openNewDialog() {
    editingSession = undefined;
    dialogOpen = true;
  }

  function openEditDialog(session: SshSession) {
    editingSession = session;
    dialogOpen = true;
  }

  function connectSsh(session: SshSession) {
    const id = crypto.randomUUID();
    const args: string[] = [];

    // Build ssh command arguments
    args.push('-p', String(session.port));
    if (session.key_file) {
      args.push('-i', session.key_file);
    }
    args.push(`${session.username}@${session.host}`);

    addPane({
      id,
      type: 'ssh',
      title: `SSH: ${session.name}`,
      shell: '/usr/bin/ssh',
      args,
    });
  }

  async function handleDelete(session: SshSession, event: MouseEvent) {
    event.stopPropagation();
    try {
      await deleteSshSession(session.id);
      sessions = sessions.filter(s => s.id !== session.id);
      notify('success', `Deleted SSH session "${session.name}"`);
    } catch (e) {
      notify('error', `Failed to delete SSH session: ${e}`);
    }
  }

  // Group sessions by folder
  let grouped = $derived(() => {
    const groups = new Map<string, SshSession[]>();
    for (const s of sessions) {
      const folder = s.folder || '';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(s);
    }
    return groups;
  });
</script>

<div class="ssh-sessions">
  <div class="ssh-header">
    <h3>SSH</h3>
    <button class="new-btn" onclick={openNewDialog} title="Add SSH session">+</button>
  </div>

  {#if sessions.length === 0}
    <div class="empty-state">
      <p>No SSH sessions.</p>
    </div>
  {:else}
    {@const groups = grouped()}
    {#each [...groups.entries()] as [folder, folderSessions] (folder)}
      {#if folder}
        <div class="folder-label">{folder}</div>
      {/if}
      <ul class="ssh-list">
        {#each folderSessions as session (session.id)}
          <li class="ssh-item">
            <button class="ssh-btn" onclick={() => connectSsh(session)} title="Connect to {session.host}">
              <span class="ssh-color" style:background={session.color}></span>
              <span class="ssh-info">
                <span class="ssh-name">{session.name}</span>
                <span class="ssh-host">{session.username}@{session.host}:{session.port}</span>
              </span>
            </button>
            <button class="edit-btn" onclick={() => openEditDialog(session)} title="Edit">E</button>
            <button class="remove-btn" onclick={(e) => handleDelete(session, e)} title="Delete">&times;</button>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</div>

<SshDialog
  open={dialogOpen}
  editSession={editingSession}
  onClose={() => { dialogOpen = false; }}
  onSaved={loadSessions}
/>

<style>
  .ssh-sessions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ssh-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ssh-header h3 {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .new-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-primary);
    width: 20px;
    height: 20px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .new-btn:hover {
    background: var(--bg-surface-hover);
    color: var(--accent);
  }

  .empty-state {
    color: var(--text-muted);
    font-size: 11px;
    text-align: center;
    padding: 8px 0;
  }

  .folder-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0 2px;
  }

  .ssh-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .ssh-item {
    display: flex;
    align-items: center;
    border-radius: var(--border-radius);
  }

  .ssh-item:hover {
    background: var(--bg-surface);
  }

  .ssh-btn {
    flex: 1;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    padding: 4px 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
  }

  .ssh-btn:hover { color: var(--text-primary); }

  .ssh-color {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ssh-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
  }

  .ssh-name {
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ssh-host {
    font-size: 9px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edit-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 3px;
    opacity: 0;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    opacity: 0;
  }

  .ssh-item:hover .edit-btn { opacity: 1; }
  .ssh-item:hover .remove-btn { opacity: 1; }
  .edit-btn:hover { color: var(--ctp-yellow); }
  .remove-btn:hover { color: var(--ctp-red); }
</style>
