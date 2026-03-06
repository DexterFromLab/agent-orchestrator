<script lang="ts">
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../../adapters/settings-bridge';
  import { notify } from '../../stores/notifications.svelte';
  import { getCurrentFlavor, setFlavor } from '../../stores/theme.svelte';
  import { ALL_FLAVORS, FLAVOR_LABELS, type CatppuccinFlavor } from '../../styles/themes';
  import {
    getMachines,
    addMachine,
    removeMachine,
    connectMachine,
    disconnectMachine,
    loadMachines,
  } from '../../stores/machines.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let defaultShell = $state('');
  let defaultCwd = $state('');
  let maxPanes = $state('4');
  let themeFlavor = $state<CatppuccinFlavor>('mocha');

  // Machine form state
  let newMachineLabel = $state('');
  let newMachineUrl = $state('');
  let newMachineToken = $state('');
  let newMachineAutoConnect = $state(false);

  let remoteMachines = $derived(getMachines());

  onMount(async () => {
    try {
      defaultShell = (await getSetting('default_shell')) ?? '';
      defaultCwd = (await getSetting('default_cwd')) ?? '';
      maxPanes = (await getSetting('max_panes')) ?? '4';
      themeFlavor = getCurrentFlavor();
      await loadMachines();
    } catch {
      // Use defaults
    }
  });

  async function handleSave() {
    try {
      if (defaultShell) await setSetting('default_shell', defaultShell);
      if (defaultCwd) await setSetting('default_cwd', defaultCwd);
      await setSetting('max_panes', maxPanes);
      await setFlavor(themeFlavor);
      notify('success', 'Settings saved');
      onClose();
    } catch (e) {
      notify('error', `Failed to save settings: ${e}`);
    }
  }

  async function handleAddMachine() {
    if (!newMachineLabel || !newMachineUrl || !newMachineToken) {
      notify('error', 'Label, URL, and token are required');
      return;
    }
    try {
      await addMachine({
        label: newMachineLabel,
        url: newMachineUrl,
        token: newMachineToken,
        auto_connect: newMachineAutoConnect,
      });
      newMachineLabel = '';
      newMachineUrl = '';
      newMachineToken = '';
      newMachineAutoConnect = false;
      notify('success', 'Machine added');
    } catch (e) {
      notify('error', `Failed to add machine: ${e}`);
    }
  }

  async function handleRemoveMachine(id: string) {
    try {
      await removeMachine(id);
      notify('success', 'Machine removed');
    } catch (e) {
      notify('error', `Failed to remove machine: ${e}`);
    }
  }

  async function handleToggleConnection(id: string, status: string) {
    try {
      if (status === 'connected') {
        await disconnectMachine(id);
      } else {
        await connectMachine(id);
      }
    } catch (e) {
      notify('error', `Connection error: ${e}`);
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
        <label class="field">
          <span class="field-label">Theme</span>
          <select bind:value={themeFlavor}>
            {#each ALL_FLAVORS as flavor}
              <option value={flavor}>{FLAVOR_LABELS[flavor]}</option>
            {/each}
          </select>
          <span class="field-hint">Catppuccin color scheme. New terminals use the updated theme.</span>
        </label>

        <div class="section-divider"></div>
        <h3 class="section-title">Remote Machines</h3>

        {#if remoteMachines.length > 0}
          <div class="machine-list">
            {#each remoteMachines as machine (machine.id)}
              <div class="machine-item">
                <div class="machine-info">
                  <span class="machine-label">{machine.label}</span>
                  <span class="machine-url">{machine.url}</span>
                  <span class="machine-status" class:connected={machine.status === 'connected'} class:error={machine.status === 'error'}>
                    {machine.status}
                  </span>
                </div>
                <div class="machine-actions">
                  <button
                    class="machine-btn"
                    onclick={() => handleToggleConnection(machine.id, machine.status)}
                  >
                    {machine.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                  <button class="machine-btn machine-btn-danger" onclick={() => handleRemoveMachine(machine.id)}>
                    &times;
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="field-hint">No remote machines configured.</p>
        {/if}

        <div class="add-machine-form">
          <label class="field">
            <span class="field-label">Label</span>
            <input type="text" bind:value={newMachineLabel} placeholder="devbox" />
          </label>
          <label class="field">
            <span class="field-label">URL</span>
            <input type="text" bind:value={newMachineUrl} placeholder="wss://host:9750" />
          </label>
          <label class="field">
            <span class="field-label">Token</span>
            <input type="password" bind:value={newMachineToken} placeholder="auth token" />
          </label>
          <label class="field-checkbox">
            <input type="checkbox" bind:checked={newMachineAutoConnect} />
            <span>Auto-connect on startup</span>
          </label>
          <button class="btn-save" onclick={handleAddMachine}>Add Machine</button>
        </div>
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

  .field input, .field select {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 6px 8px;
  }

  .field input:focus, .field select:focus {
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

  .section-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .machine-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .machine-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    padding: 6px 8px;
  }

  .machine-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .machine-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .machine-url {
    font-size: 10px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .machine-status {
    font-size: 10px;
    color: var(--ctp-overlay1);
  }

  .machine-status.connected {
    color: var(--ctp-green);
  }

  .machine-status.error {
    color: var(--ctp-red);
  }

  .machine-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .machine-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }

  .machine-btn:hover {
    color: var(--text-primary);
    border-color: var(--accent);
  }

  .machine-btn-danger:hover {
    color: var(--ctp-red);
    border-color: var(--ctp-red);
  }

  .add-machine-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }

  .field-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .field-checkbox input[type="checkbox"] {
    accent-color: var(--accent);
  }
</style>
