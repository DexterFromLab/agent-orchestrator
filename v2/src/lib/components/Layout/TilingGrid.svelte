<script lang="ts">
  import PaneContainer from './PaneContainer.svelte';
  import TerminalPane from '../Terminal/TerminalPane.svelte';
  import AgentPane from '../Agent/AgentPane.svelte';
  import MarkdownPane from '../Markdown/MarkdownPane.svelte';
  import ContextPane from '../Context/ContextPane.svelte';
  import {
    getPanes,
    getGridTemplate,
    getPaneGridArea,
    getActivePreset,
    focusPane,
    removePane,
  } from '../../stores/layout.svelte';
  import { detachPane } from '../../utils/detach';
  import { isDetachedMode } from '../../utils/detach';
  import { stopAgent } from '../../adapters/agent-bridge';
  import { getAgentSession } from '../../stores/agents.svelte';

  let gridTemplate = $derived(getGridTemplate());
  let panes = $derived(getPanes());
  let detached = isDetachedMode();

  // Custom column/row sizes (overrides preset when user drags)
  let customColumns = $state<string | null>(null);
  let customRows = $state<string | null>(null);
  let gridEl: HTMLDivElement | undefined = $state();

  // Reset custom sizes when preset changes
  let prevPreset = '';
  $effect(() => {
    const p = getActivePreset();
    if (prevPreset && p !== prevPreset) {
      customColumns = null;
      customRows = null;
    }
    prevPreset = p;
  });

  let columns = $derived(customColumns ?? gridTemplate.columns);
  let rows = $derived(customRows ?? gridTemplate.rows);

  // Determine splitter positions based on preset
  let colCount = $derived(gridTemplate.columns.split(' ').length);
  let rowCount = $derived(gridTemplate.rows.split(' ').length);

  function handleDetach(pane: typeof panes[0]) {
    detachPane(pane);
    removePane(pane.id);
  }

  // Drag resize logic
  let dragging = $state(false);

  function getColSplitterX(ci: number): number {
    if (!gridEl) return 0;
    const rect = gridEl.getBoundingClientRect();
    const cols = columns.split(' ').map(s => parseFloat(s));
    const total = cols.reduce((a, b) => a + b, 0);
    let frac = 0;
    for (let i = 0; i <= ci; i++) frac += cols[i] / total;
    return rect.left + frac * rect.width;
  }

  function getRowSplitterY(ri: number): number {
    if (!gridEl) return 0;
    const rect = gridEl.getBoundingClientRect();
    const rws = rows.split(' ').map(s => parseFloat(s));
    const total = rws.reduce((a, b) => a + b, 0);
    let frac = 0;
    for (let i = 0; i <= ri; i++) frac += rws[i] / total;
    return rect.top + frac * rect.height;
  }

  function startColDrag(colIndex: number, e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const totalWidth = rect.width;

    function onMove(ev: MouseEvent) {
      const relX = ev.clientX - rect.left;
      const ratio = Math.max(0.1, Math.min(0.9, relX / totalWidth));
      if (colCount === 2) {
        customColumns = `${ratio}fr ${1 - ratio}fr`;
      } else if (colCount === 3) {
        if (colIndex === 0) {
          const remaining = 1 - ratio;
          customColumns = `${ratio}fr ${remaining / 2}fr ${remaining / 2}fr`;
        } else {
          // Get current first column ratio or default
          const parts = (customColumns ?? gridTemplate.columns).split(' ');
          const first = parseFloat(parts[0]) / parts.reduce((s, p) => s + parseFloat(p), 0);
          const relRatio = (relX / totalWidth - first) / (1 - first);
          const adj = Math.max(0.1, Math.min(0.9, relRatio));
          customColumns = `${first}fr ${(1 - first) * adj}fr ${(1 - first) * (1 - adj)}fr`;
        }
      }
    }

    function onUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startRowDrag(_rowIndex: number, e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const totalHeight = rect.height;

    function onMove(ev: MouseEvent) {
      const relY = ev.clientY - rect.top;
      const ratio = Math.max(0.1, Math.min(0.9, relY / totalHeight));
      if (rowCount === 2) {
        customRows = `${ratio}fr ${1 - ratio}fr`;
      }
    }

    function onUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<div
  class="tiling-grid"
  class:dragging
  bind:this={gridEl}
  style:grid-template-columns={columns}
  style:grid-template-rows={rows}
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
          onClose={() => {
            if (pane.type === 'agent') {
              const s = getAgentSession(pane.id);
              if (s?.status === 'running' || s?.status === 'starting') {
                stopAgent(pane.id).catch(() => {});
              }
            }
            removePane(pane.id);
          }}
          onDetach={detached ? undefined : () => handleDetach(pane)}
        >
          {#if pane.type === 'terminal'}
            <TerminalPane
              shell={pane.shell}
              cwd={pane.cwd}
              args={pane.args}
              onExit={() => removePane(pane.id)}
            />
          {:else if pane.type === 'agent'}
            <AgentPane
              sessionId={pane.id}
              cwd={pane.cwd}
              onExit={() => removePane(pane.id)}
            />
          {:else if pane.type === 'ssh'}
            <TerminalPane
              shell={pane.shell}
              cwd={pane.cwd}
              args={pane.args}
              onExit={() => removePane(pane.id)}
            />
          {:else if pane.type === 'context'}
            <ContextPane onExit={() => removePane(pane.id)} />
          {:else if pane.type === 'markdown'}
            <MarkdownPane
              paneId={pane.id}
              filePath={pane.cwd ?? ''}
              onExit={() => removePane(pane.id)}
            />
          {:else}
            <div class="placeholder">
              <p>{pane.type} pane — coming soon</p>
            </div>
          {/if}
        </PaneContainer>
      </div>
    {/each}
  {/if}
</div>

<!-- Splitter overlays (outside grid to avoid layout interference) -->
{#if panes.length > 1 && gridEl}
  {#each { length: colCount - 1 } as _, ci}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="splitter splitter-col"
      style:left="{gridEl ? getColSplitterX(ci) : 0}px"
      style:top="{gridEl?.getBoundingClientRect().top ?? 0}px"
      style:height="{gridEl?.getBoundingClientRect().height ?? 0}px"
      onmousedown={(e) => startColDrag(ci, e)}
    ></div>
  {/each}
  {#each { length: rowCount - 1 } as _, ri}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="splitter splitter-row"
      style:top="{gridEl ? getRowSplitterY(ri) : 0}px"
      style:left="{gridEl?.getBoundingClientRect().left ?? 0}px"
      style:width="{gridEl?.getBoundingClientRect().width ?? 0}px"
      onmousedown={(e) => startRowDrag(ri, e)}
    ></div>
  {/each}
{/if}

<style>
  .tiling-grid {
    display: grid;
    gap: var(--pane-gap);
    height: 100%;
    padding: var(--pane-gap);
    position: relative;
  }

  .tiling-grid.dragging {
    user-select: none;
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

  :global(.splitter) {
    position: fixed;
    z-index: 100;
    transition: background 0.15s;
  }

  :global(.splitter:hover), :global(.splitter:active) {
    background: var(--accent);
    opacity: 0.4;
  }

  :global(.splitter-col) {
    width: 6px;
    margin-left: -3px;
    cursor: col-resize;
  }

  :global(.splitter-row) {
    height: 6px;
    margin-top: -3px;
    cursor: row-resize;
  }
</style>
