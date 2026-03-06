<script lang="ts">
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../adapters/settings-bridge';
  import { notify } from '../../stores/notifications.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let defaultShell = $state('');
  let defaultCwd = $state('');
  let maxPanes = $state('4');

  onMount(async () => {
    try {
      defaultShell = (await getSetting('default_shell')) ?? '';
      defaultCwd = (await getSetting('default_cwd')) ?? '';
      maxPanes = (await getSetting('max_panes')) ?? '4';
    } catch {
      // Use defaults
    }
  });

  async function handleSave() {
    try {
      if (defaultShell) await setSetting('default_shell', defaultShell);
      if (defaultCwd) await setSetting('default_cwd', defaultCwd);
      await setSetting('max_panes', maxPanes);
      notify('success', 'Settings saved');
      onClose();
    } catch (e) {
      notify('error', `Failed to save settings: ${e}`);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="backdrop" onclick={onClose}></div>
    <div class="dialog" role="dialog" aria-label="Settings">
      <div class="dialog-header">
        <h2>Settings</h2>
        <button class="close-btn" onclick={onClose}>&times;</button>
      </div>
      <div class="dialog-body">
        <label class="field">
          <span class="field-label">Default Shell</span>
          <input type="text" bind:value={defaultShell} placeholder="$SHELL (auto-detect)" />
          <span class="field-hint">Leave empty to use system default</span>
        </label>
        <label class="field">
          <span class="field-label">Default Working Directory</span>
          <input type="text" bind:value={defaultCwd} placeholder="$HOME" />
          <span class="field-hint">Leave empty for home directory</span>
        </label>
        <label class="field">
          <span class="field-label">Max Panes</span>
          <input type="number" bind:value={maxPanes} min="1" max="8" />
          <span class="field-hint">Maximum simultaneous panes (1-8)</span>
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
    width: 400px;
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

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
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
