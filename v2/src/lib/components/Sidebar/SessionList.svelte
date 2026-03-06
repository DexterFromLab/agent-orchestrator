<script lang="ts">
  import {
    getPanes,
    addPane,
    focusPane,
    removePane,
    getActivePreset,
    setPreset,
    type LayoutPreset,
  } from '../../stores/layout.svelte';
  import SshSessionList from '../SSH/SshSessionList.svelte';

  let panes = $derived(getPanes());
  let preset = $derived(getActivePreset());

  const presets: LayoutPreset[] = ['1-col', '2-col', '3-col', '2x2', 'master-stack'];

  function newTerminal() {
    const id = crypto.randomUUID();
    const num = panes.filter(p => p.type === 'terminal').length + 1;
    addPane({
      id,
      type: 'terminal',
      title: `Terminal ${num}`,
    });
  }

  function newAgent() {
    const id = crypto.randomUUID();
    const num = panes.filter(p => p.type === 'agent').length + 1;
    addPane({
      id,
      type: 'agent',
      title: `Agent ${num}`,
    });
  }

  function openContext() {
    const existing = panes.find(p => p.type === 'context');
    if (existing) {
      focusPane(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    addPane({
      id,
      type: 'context',
      title: 'Context',
    });
  }

  let fileInputEl: HTMLInputElement | undefined = $state();

  function openMarkdown() {
    fileInputEl?.click();
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Tauri file paths from input elements include the full path
    const path = (file as any).path ?? file.name;
    const id = crypto.randomUUID();
    addPane({
      id,
      type: 'markdown',
      title: file.name,
      cwd: path,
    });
    input.value = '';
  }
</script>

<div class="session-list">
  <div class="header">
    <h2>Sessions</h2>
    <div class="header-buttons">
      <button class="new-btn" onclick={openContext} title="Context manager">C</button>
      <button class="new-btn" onclick={openMarkdown} title="Open markdown file">M</button>
      <button class="new-btn" onclick={newAgent} title="New agent (Ctrl+Shift+N)">A</button>
      <button class="new-btn" onclick={newTerminal} title="New terminal (Ctrl+N)">+</button>
    </div>
    <input
      bind:this={fileInputEl}
      type="file"
      accept=".md,.markdown,.txt"
      onchange={handleFileSelect}
      style="display: none;"
    />
  </div>

  <div class="layout-presets">
    {#each presets as p}
      <button
        class="preset-btn"
        class:active={preset === p}
        onclick={() => setPreset(p)}
        title={p}
      >{p}</button>
    {/each}
  </div>

  {#if panes.length === 0}
    <div class="empty-state">
      <p>No sessions yet.</p>
      <p class="hint">Ctrl+N terminal / Ctrl+Shift+N agent</p>
    </div>
  {:else}
    <ul class="pane-list">
      {#each panes as pane (pane.id)}
        <li class="pane-item" class:focused={pane.focused}>
          <button class="pane-btn" onclick={() => focusPane(pane.id)}>
            <span class="pane-icon">{pane.type === 'terminal' ? '>' : pane.type === 'agent' ? '*' : pane.type === 'markdown' ? 'M' : pane.type === 'ssh' ? '@' : pane.type === 'context' ? 'C' : '#'}</span>
            <span class="pane-name">{pane.title}</span>
          </button>
          <button class="remove-btn" onclick={() => removePane(pane.id)}>&times;</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="divider"></div>
  <SshSessionList />
</div>

<style>
  .divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .session-list {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-buttons {
    display: flex;
    gap: 4px;
  }

  .new-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-primary);
    width: 24px;
    height: 24px;
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

  .layout-presets {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }

  .preset-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 9px;
    padding: 2px 5px;
    border-radius: 3px;
    cursor: pointer;
  }

  .preset-btn:hover { color: var(--text-primary); }
  .preset-btn.active {
    background: var(--accent);
    color: var(--ctp-crust);
    border-color: var(--accent);
  }

  .empty-state {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: 24px 0;
  }

  .hint {
    margin-top: 4px;
    font-size: 11px;
    color: var(--ctp-overlay0);
  }

  .pane-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pane-item {
    display: flex;
    align-items: center;
    border-radius: var(--border-radius);
  }

  .pane-item.focused {
    background: var(--bg-surface);
  }

  .pane-btn {
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

  .pane-btn:hover { color: var(--text-primary); }

  .pane-icon {
    color: var(--ctp-green);
    font-weight: bold;
    font-size: 11px;
  }

  .pane-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .pane-item:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { color: var(--ctp-red); }
</style>
