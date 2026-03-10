<script lang="ts">
  import { onMount } from 'svelte';
  import { listSshSessions, saveSshSession, deleteSshSession, type SshSession } from '../../adapters/ssh-bridge';
  import { addTerminalTab } from '../../stores/workspace.svelte';

  interface Props {
    projectId: string;
  }

  let { projectId }: Props = $props();

  let sessions = $state<SshSession[]>([]);
  let loading = $state(true);
  let editing = $state<SshSession | null>(null);
  let showForm = $state(false);

  // Form fields
  let formName = $state('');
  let formHost = $state('');
  let formPort = $state(22);
  let formUsername = $state('');
  let formKeyFile = $state('');
  let formFolder = $state('');

  onMount(loadSessions);

  async function loadSessions() {
    loading = true;
    try {
      sessions = await listSshSessions();
    } catch (e) {
      console.warn('Failed to load SSH sessions:', e);
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    formName = '';
    formHost = '';
    formPort = 22;
    formUsername = '';
    formKeyFile = '';
    formFolder = '';
    editing = null;
    showForm = false;
  }

  function editSession(session: SshSession) {
    formName = session.name;
    formHost = session.host;
    formPort = session.port;
    formUsername = session.username;
    formKeyFile = session.key_file;
    formFolder = session.folder;
    editing = session;
    showForm = true;
  }

  function startNew() {
    resetForm();
    showForm = true;
  }

  async function saveForm() {
    if (!formName.trim() || !formHost.trim()) return;

    const session: SshSession = {
      id: editing?.id ?? crypto.randomUUID(),
      name: formName.trim(),
      host: formHost.trim(),
      port: formPort,
      username: formUsername.trim() || 'root',
      key_file: formKeyFile.trim(),
      folder: formFolder.trim(),
      color: editing?.color ?? '',
      created_at: editing?.created_at ?? Date.now(),
      last_used_at: Date.now(),
    };

    try {
      await saveSshSession(session);
      await loadSessions();
      resetForm();
    } catch (e) {
      console.warn('Failed to save SSH session:', e);
    }
  }

  async function removeSession(id: string) {
    try {
      await deleteSshSession(id);
      await loadSessions();
    } catch (e) {
      console.warn('Failed to delete SSH session:', e);
    }
  }

  function launchSession(session: SshSession) {
    addTerminalTab(projectId, {
      id: `ssh-${session.id}-${Date.now()}`,
      title: `SSH: ${session.name}`,
      type: 'ssh',
      sshSessionId: session.id,
    });
  }
</script>

<div class="ssh-tab">
  <div class="ssh-header">
    <h3>SSH Connections</h3>
    <button class="add-btn" onclick={startNew}>+ New</button>
  </div>

  {#if showForm}
    <div class="ssh-form">
      <div class="form-title">{editing ? 'Edit Connection' : 'New Connection'}</div>
      <div class="form-grid">
        <label class="form-label">
          <span>Name</span>
          <input type="text" bind:value={formName} placeholder="My Server" />
        </label>
        <label class="form-label">
          <span>Host</span>
          <input type="text" bind:value={formHost} placeholder="192.168.1.100" />
        </label>
        <label class="form-label">
          <span>Port</span>
          <input type="number" bind:value={formPort} min="1" max="65535" />
        </label>
        <label class="form-label">
          <span>Username</span>
          <input type="text" bind:value={formUsername} placeholder="root" />
        </label>
        <label class="form-label">
          <span>Key File</span>
          <input type="text" bind:value={formKeyFile} placeholder="~/.ssh/id_ed25519" />
        </label>
        <label class="form-label">
          <span>Remote Folder</span>
          <input type="text" bind:value={formFolder} placeholder="/home/user" />
        </label>
      </div>
      <div class="form-actions">
        <button class="btn-cancel" onclick={resetForm}>Cancel</button>
        <button class="btn-save" onclick={saveForm} disabled={!formName.trim() || !formHost.trim()}>
          {editing ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  {/if}

  <div class="ssh-list">
    {#if loading}
      <div class="ssh-empty">Loading…</div>
    {:else if sessions.length === 0 && !showForm}
      <div class="ssh-empty">
        <p>No SSH connections configured.</p>
        <p>Add a connection to launch it as a terminal in the Model tab.</p>
      </div>
    {:else}
      {#each sessions as session (session.id)}
        <div class="ssh-card">
          <div class="ssh-card-info">
            <span class="ssh-card-name">{session.name}</span>
            <span class="ssh-card-detail">{session.username}@{session.host}:{session.port}</span>
            {#if session.folder}
              <span class="ssh-card-folder">{session.folder}</span>
            {/if}
          </div>
          <div class="ssh-card-actions">
            <button class="ssh-btn launch" onclick={() => launchSession(session)} title="Launch in terminal">
              ▶
            </button>
            <button class="ssh-btn edit" onclick={() => editSession(session)} title="Edit">
              ✎
            </button>
            <button class="ssh-btn delete" onclick={() => removeSession(session.id)} title="Delete">
              ✕
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ssh-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
    overflow: hidden;
  }

  .ssh-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .ssh-header h3 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-blue);
    margin: 0;
  }

  .add-btn {
    background: var(--ctp-surface0);
    border: none;
    color: var(--ctp-text);
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background 0.12s;
  }

  .add-btn:hover {
    background: var(--ctp-surface1);
  }

  .ssh-form {
    padding: 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    background: var(--ctp-mantle);
    flex-shrink: 0;
  }

  .form-title {
    font-size: 0.725rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
    margin-bottom: 0.5rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.375rem;
  }

  .form-label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .form-label span {
    font-size: 0.625rem;
    font-weight: 500;
    color: var(--ctp-overlay1);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .form-label input {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.725rem;
    padding: 0.25rem 0.375rem;
    font-family: var(--term-font-family, monospace);
  }

  .form-label input:focus {
    outline: none;
    border-color: var(--ctp-blue);
  }

  .form-actions {
    display: flex;
    gap: 0.375rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .btn-cancel, .btn-save {
    padding: 0.25rem 0.625rem;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.12s;
  }

  .btn-cancel {
    background: var(--ctp-surface0);
    color: var(--ctp-subtext0);
  }

  .btn-cancel:hover {
    background: var(--ctp-surface1);
  }

  .btn-save {
    background: var(--ctp-blue);
    color: var(--ctp-base);
  }

  .btn-save:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ssh-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .ssh-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    text-align: center;
    gap: 0.25rem;
  }

  .ssh-empty p {
    margin: 0;
  }

  .ssh-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
    margin-bottom: 0.375rem;
    transition: background 0.12s;
  }

  .ssh-card:hover {
    background: var(--ctp-surface1);
  }

  .ssh-card-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .ssh-card-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .ssh-card-detail {
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-subtext0);
  }

  .ssh-card-folder {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
  }

  .ssh-card-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .ssh-btn {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    cursor: pointer;
    font-size: 0.7rem;
    transition: background 0.12s, color 0.12s;
  }

  .ssh-btn.launch {
    color: var(--ctp-green);
  }

  .ssh-btn.launch:hover {
    background: color-mix(in srgb, var(--ctp-green) 15%, transparent);
  }

  .ssh-btn.edit {
    color: var(--ctp-blue);
  }

  .ssh-btn.edit:hover {
    background: color-mix(in srgb, var(--ctp-blue) 15%, transparent);
  }

  .ssh-btn.delete {
    color: var(--ctp-red);
  }

  .ssh-btn.delete:hover {
    background: color-mix(in srgb, var(--ctp-red) 15%, transparent);
  }
</style>
