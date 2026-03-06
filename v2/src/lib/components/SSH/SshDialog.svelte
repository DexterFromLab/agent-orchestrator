<script lang="ts">
  import { notify } from '../../stores/notifications.svelte';
  import { saveSshSession, type SshSession } from '../../adapters/ssh-bridge';

  interface Props {
    open: boolean;
    editSession?: SshSession;
    onClose: () => void;
    onSaved: () => void;
  }

  let { open, editSession, onClose, onSaved }: Props = $props();

  let name = $state('');
  let host = $state('');
  let port = $state(22);
  let username = $state('');
  let keyFile = $state('');
  let folder = $state('');

  let validationError = $state('');

  $effect(() => {
    if (open && editSession) {
      name = editSession.name;
      host = editSession.host;
      port = editSession.port;
      username = editSession.username;
      keyFile = editSession.key_file;
      folder = editSession.folder;
    } else if (open) {
      name = '';
      host = '';
      port = 22;
      username = '';
      keyFile = '';
      folder = '';
    }
    validationError = '';
  });

  function validate(): boolean {
    if (!name.trim()) {
      validationError = 'Name is required';
      return false;
    }
    if (!host.trim()) {
      validationError = 'Host is required';
      return false;
    }
    if (!username.trim()) {
      validationError = 'Username is required';
      return false;
    }
    if (port < 1 || port > 65535) {
      validationError = 'Port must be between 1 and 65535';
      return false;
    }
    validationError = '';
    return true;
  }

  async function handleSave() {
    if (!validate()) return;

    const now = Math.floor(Date.now() / 1000);
    const session: SshSession = {
      id: editSession?.id ?? crypto.randomUUID(),
      name: name.trim(),
      host: host.trim(),
      port,
      username: username.trim(),
      key_file: keyFile.trim(),
      folder: folder.trim(),
      color: editSession?.color ?? '#89b4fa',
      created_at: editSession?.created_at ?? now,
      last_used_at: now,
    };

    try {
      await saveSshSession(session);
      notify('success', `SSH session "${session.name}" saved`);
      onSaved();
      onClose();
    } catch (e) {
      notify('error', `Failed to save SSH session: ${e}`);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="backdrop" onclick={onClose}></div>
    <div class="dialog" role="dialog" aria-label="SSH Session">
      <div class="dialog-header">
        <h2>{editSession ? 'Edit' : 'New'} SSH Session</h2>
        <button class="close-btn" onclick={onClose}>&times;</button>
      </div>
      <div class="dialog-body">
        {#if validationError}
          <div class="validation-error">{validationError}</div>
        {/if}
        <label class="field">
          <span class="field-label">Name</span>
          <input type="text" bind:value={name} placeholder="My Server" />
        </label>
        <label class="field">
          <span class="field-label">Host</span>
          <input type="text" bind:value={host} placeholder="192.168.1.100 or server.example.com" />
        </label>
        <div class="field-row">
          <label class="field" style="flex: 1;">
            <span class="field-label">Username</span>
            <input type="text" bind:value={username} placeholder="root" />
          </label>
          <label class="field" style="width: 100px;">
            <span class="field-label">Port</span>
            <input type="number" bind:value={port} min="1" max="65535" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">SSH Key (optional)</span>
          <input type="text" bind:value={keyFile} placeholder="~/.ssh/id_ed25519" />
          <span class="field-hint">Leave empty to use default key or password auth</span>
        </label>
        <label class="field">
          <span class="field-label">Folder (optional)</span>
          <input type="text" bind:value={folder} placeholder="Group name for organizing" />
          <span class="field-hint">Sessions with the same folder are grouped together</span>
        </label>
      </div>
      <div class="dialog-footer">
        <button class="btn-cancel" onclick={onClose}>Cancel</button>
        <button class="btn-save" onclick={handleSave}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    position: relative;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 420px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .dialog-header h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
  }

  .close-btn:hover { color: var(--text-primary); }

  .dialog-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .validation-error {
    background: rgba(243, 139, 168, 0.1);
    border: 1px solid var(--ctp-red);
    border-radius: var(--border-radius);
    color: var(--ctp-red);
    font-size: 11px;
    padding: 6px 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-row {
    display: flex;
    gap: 10px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .field input {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 6px 8px;
  }

  .field input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .field-hint {
    font-size: 10px;
    color: var(--text-muted);
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }

  .btn-cancel, .btn-save {
    border: none;
    border-radius: var(--border-radius);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-cancel {
    background: var(--bg-surface);
    color: var(--text-secondary);
  }

  .btn-cancel:hover { color: var(--text-primary); }

  .btn-save {
    background: var(--accent);
    color: var(--ctp-crust);
  }

  .btn-save:hover { opacity: 0.9; }
</style>
