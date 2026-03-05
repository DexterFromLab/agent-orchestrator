<script lang="ts">
  import PaneContainer from './PaneContainer.svelte';
  import TerminalPane from '../Terminal/TerminalPane.svelte';
  import {
    getPanes,
    getGridTemplate,
    getPaneGridArea,
    focusPane,
    removePane,
  } from '../../stores/layout';

  let gridTemplate = $derived(getGridTemplate());
  let panes = $derived(getPanes());
</script>

<div
  class="tiling-grid"
  style:grid-template-columns={gridTemplate.columns}
  style:grid-template-rows={gridTemplate.rows}
>
  {#if panes.length === 0}
    <div class="empty-state">
      <h1>BTerminal v2</h1>
      <p>Claude Agent Mission Control</p>
      <p class="hint">Press <kbd>Ctrl+N</kbd> to open a terminal</p>
    </div>
  {:else}
    {#each panes as pane, i (pane.id)}
      {@const gridArea = getPaneGridArea(i)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="pane-slot"
        class:focused={pane.focused}
        style:grid-area={gridArea}
        onclick={() => focusPane(pane.id)}
      >
        <PaneContainer
          title={pane.title}
          status={pane.focused ? 'running' : 'idle'}
          onClose={() => removePane(pane.id)}
        >
          {#if pane.type === 'terminal'}
            <TerminalPane
              shell={pane.shell}
              cwd={pane.cwd}
              args={pane.args}
              onExit={() => removePane(pane.id)}
            />
          {:else}
            <div class="placeholder">
              <p>{pane.type} pane — coming in Phase 3/4</p>
            </div>
          {/if}
        </PaneContainer>
      </div>
    {/each}
  {/if}
</div>

<style>
  .tiling-grid {
    display: grid;
    gap: var(--pane-gap);
    height: 100%;
    padding: var(--pane-gap);
  }

  .pane-slot {
    min-width: 0;
    min-height: 0;
    border-radius: var(--border-radius);
    overflow: hidden;
  }

  .pane-slot.focused {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--text-muted);
  }

  .empty-state h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .empty-state p { font-size: 14px; }

  .hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--ctp-overlay0);
  }

  kbd {
    background: var(--bg-surface);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
