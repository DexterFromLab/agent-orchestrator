<script lang="ts">
  import {
    getAllGroups,
    switchGroup,
    getActiveGroupId,
    getAllWorkItems,
    getActiveProjectId,
    setActiveProject,
    setActiveTab,
    triggerFocusFlash,
    emitProjectTabSwitch,
    emitTerminalToggle,
    addTerminalTab,
  } from '../../stores/workspace.svelte';
  import { getPluginCommands } from '../../stores/plugins.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let query = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let selectedIndex = $state(0);
  let showShortcuts = $state(false);

  // --- Command definitions ---

  interface Command {
    id: string;
    label: string;
    category: string;
    shortcut?: string;
    action: () => void;
  }

  let commands = $derived.by((): Command[] => {
    const cmds: Command[] = [];
    const groups = getAllGroups();
    const projects = getAllWorkItems();
    const activeGroupId = getActiveGroupId();
    const activeProjectId = getActiveProjectId();

    // Project focus commands
    projects.forEach((p, i) => {
      if (i < 5) {
        cmds.push({
          id: `focus-project-${i + 1}`,
          label: `Focus Project ${i + 1}: ${p.name}`,
          category: 'Navigation',
          shortcut: `Alt+${i + 1}`,
          action: () => {
            setActiveProject(p.id);
            triggerFocusFlash(p.id);
          },
        });
      }
    });

    // Tab switching commands (for active project)
    const tabNames: [string, number][] = [
      ['Model', 1], ['Docs', 2], ['Context', 3], ['Files', 4],
      ['SSH', 5], ['Memory', 6], ['Metrics', 7],
    ];
    for (const [name, idx] of tabNames) {
      cmds.push({
        id: `tab-${name.toLowerCase()}`,
        label: `Switch to ${name} Tab`,
        category: 'Tabs',
        shortcut: `Ctrl+Shift+${idx}`,
        action: () => {
          if (activeProjectId) {
            emitProjectTabSwitch(activeProjectId, idx);
          }
        },
      });
    }

    // Terminal toggle
    cmds.push({
      id: 'toggle-terminal',
      label: 'Toggle Terminal Section',
      category: 'Tabs',
      shortcut: 'Ctrl+J',
      action: () => {
        if (activeProjectId) {
          emitTerminalToggle(activeProjectId);
        }
      },
    });

    // New terminal tab
    cmds.push({
      id: 'new-terminal',
      label: 'New Terminal Tab',
      category: 'Terminal',
      action: () => {
        if (activeProjectId) {
          addTerminalTab(activeProjectId, {
            id: crypto.randomUUID(),
            title: 'Terminal',
            type: 'shell',
          });
          emitTerminalToggle(activeProjectId); // ensure terminal section is open
        }
      },
    });

    // Agent session commands
    cmds.push({
      id: 'focus-agent',
      label: 'Focus Agent Pane',
      category: 'Agent',
      shortcut: 'Ctrl+Shift+K',
      action: () => {
        if (activeProjectId) {
          emitProjectTabSwitch(activeProjectId, 1); // Model tab
        }
      },
    });

    // Group switching commands
    for (const group of groups) {
      cmds.push({
        id: `group-${group.id}`,
        label: `Switch Group: ${group.name}`,
        category: 'Groups',
        shortcut: group.id === activeGroupId ? '(active)' : undefined,
        action: () => switchGroup(group.id),
      });
    }

    // Settings toggle
    cmds.push({
      id: 'toggle-settings',
      label: 'Toggle Settings',
      category: 'UI',
      shortcut: 'Ctrl+,',
      action: () => {
        setActiveTab('settings');
        // Toggle is handled by App.svelte
      },
    });

    // Vi navigation
    cmds.push({
      id: 'nav-prev-project',
      label: 'Focus Previous Project',
      category: 'Navigation',
      shortcut: 'Ctrl+H',
      action: () => {
        const idx = projects.findIndex(p => p.id === activeProjectId);
        if (idx > 0) {
          setActiveProject(projects[idx - 1].id);
          triggerFocusFlash(projects[idx - 1].id);
        }
      },
    });

    cmds.push({
      id: 'nav-next-project',
      label: 'Focus Next Project',
      category: 'Navigation',
      shortcut: 'Ctrl+L',
      action: () => {
        const idx = projects.findIndex(p => p.id === activeProjectId);
        if (idx >= 0 && idx < projects.length - 1) {
          setActiveProject(projects[idx + 1].id);
          triggerFocusFlash(projects[idx + 1].id);
        }
      },
    });

    // Keyboard shortcuts help
    cmds.push({
      id: 'shortcuts-help',
      label: 'Keyboard Shortcuts',
      category: 'Help',
      shortcut: '?',
      action: () => { showShortcuts = true; },
    });

    // Plugin-registered commands
    for (const pc of getPluginCommands()) {
      cmds.push({
        id: `plugin-${pc.pluginId}-${pc.label.toLowerCase().replace(/\s+/g, '-')}`,
        label: pc.label,
        category: 'Plugins',
        action: pc.callback,
      });
    }

    return cmds;
  });

  let filtered = $derived.by((): Command[] => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  // Grouped for display
  let grouped = $derived.by((): [string, Command[]][] => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const list = map.get(cmd.category) ?? [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return [...map.entries()];
  });

  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
      showShortcuts = false;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  // Reset selection when filter changes
  $effect(() => {
    void filtered;
    selectedIndex = 0;
  });

  function executeCommand(cmd: Command) {
    cmd.action();
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showShortcuts) {
        showShortcuts = false;
        e.stopPropagation();
      } else {
        onclose();
      }
      return;
    }

    if (showShortcuts) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollToSelected();
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      executeCommand(filtered[selectedIndex]);
    }
  }

  function scrollToSelected() {
    requestAnimationFrame(() => {
      const el = document.querySelector('.palette-item.selected');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  // Track flat index across grouped display
  function getFlatIndex(groupIdx: number, itemIdx: number): number {
    let idx = 0;
    for (let g = 0; g < groupIdx; g++) {
      idx += grouped[g][1].length;
    }
    return idx + itemIdx;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="palette-backdrop" onclick={onclose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" data-testid="command-palette" onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown}>
      {#if showShortcuts}
        <div class="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="shortcuts-close" onclick={() => showShortcuts = false}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="shortcuts-list">
          <div class="shortcut-section">
            <h4>Global</h4>
            <div class="shortcut-row"><kbd>Ctrl+K</kbd><span>Command Palette</span></div>
            <div class="shortcut-row"><kbd>Ctrl+,</kbd><span>Toggle Settings</span></div>
            <div class="shortcut-row"><kbd>Ctrl+M</kbd><span>Toggle Messages</span></div>
            <div class="shortcut-row"><kbd>Ctrl+B</kbd><span>Toggle Sidebar</span></div>
            <div class="shortcut-row"><kbd>Escape</kbd><span>Close Panel / Palette</span></div>
          </div>
          <div class="shortcut-section">
            <h4>Project Navigation</h4>
            <div class="shortcut-row"><kbd>Alt+1</kbd> – <kbd>Alt+5</kbd><span>Focus Project 1–5</span></div>
            <div class="shortcut-row"><kbd>Ctrl+H</kbd><span>Previous Project</span></div>
            <div class="shortcut-row"><kbd>Ctrl+L</kbd><span>Next Project</span></div>
            <div class="shortcut-row"><kbd>Ctrl+J</kbd><span>Toggle Terminal</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+K</kbd><span>Focus Agent Pane</span></div>
          </div>
          <div class="shortcut-section">
            <h4>Project Tabs</h4>
            <div class="shortcut-row"><kbd>Ctrl+Shift+1</kbd><span>Model</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+2</kbd><span>Docs</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+3</kbd><span>Context</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+4</kbd><span>Files</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+5</kbd><span>SSH</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+6</kbd><span>Memory</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+7</kbd><span>Metrics</span></div>
          </div>
        </div>
      {:else}
        <input
          bind:this={inputEl}
          bind:value={query}
          class="palette-input"
          data-testid="palette-input"
          placeholder="Type a command..."
          onkeydown={handleKeydown}
        />
        <ul class="palette-results">
          {#each grouped as [category, items], gi}
            <li class="palette-category">{category}</li>
            {#each items as cmd, ci}
              {@const flatIdx = getFlatIndex(gi, ci)}
              <li>
                <button
                  class="palette-item"
                  class:selected={flatIdx === selectedIndex}
                  onclick={() => executeCommand(cmd)}
                  onmouseenter={() => selectedIndex = flatIdx}
                >
                  <span class="cmd-label">{cmd.label}</span>
                  {#if cmd.shortcut}
                    <kbd class="cmd-shortcut">{cmd.shortcut}</kbd>
                  {/if}
                </button>
              </li>
            {/each}
          {/each}
          {#if filtered.length === 0}
            <li class="no-results">No commands match "{query}"</li>
          {/if}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ctp-crust) 70%, transparent);
    display: flex;
    justify-content: center;
    padding-top: 12vh;
    z-index: 1000;
  }

  .palette {
    width: 32rem;
    max-height: 28rem;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    align-self: flex-start;
  }

  .palette-input {
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--ctp-surface0);
    color: var(--ctp-text);
    font-size: 0.9rem;
    outline: none;
    font-family: inherit;
  }

  .palette-input::placeholder {
    color: var(--ctp-overlay0);
  }

  .palette-results {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    overflow-y: auto;
  }

  .palette-category {
    padding: 0.375rem 0.75rem 0.125rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-overlay0);
  }

  .palette-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.4rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-size: 0.82rem;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: background 0.08s;
    font-family: inherit;
  }

  .palette-item:hover,
  .palette-item.selected {
    background: var(--ctp-surface0);
  }

  .palette-item.selected {
    outline: 1px solid var(--ctp-blue);
    outline-offset: -1px;
  }

  .cmd-label {
    flex: 1;
    text-align: left;
  }

  .cmd-shortcut {
    font-size: 0.68rem;
    color: var(--ctp-overlay1);
    background: var(--ctp-surface1);
    padding: 0.1rem 0.375rem;
    border-radius: 0.1875rem;
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    margin-left: 0.5rem;
  }

  .no-results {
    padding: 0.75rem;
    color: var(--ctp-overlay0);
    font-size: 0.85rem;
    text-align: center;
  }

  /* Shortcuts overlay */
  .shortcuts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .shortcuts-header h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .shortcuts-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    cursor: pointer;
  }

  .shortcuts-close:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .shortcuts-list {
    padding: 0.5rem 1rem;
    overflow-y: auto;
  }

  .shortcut-section {
    margin-bottom: 0.75rem;
  }

  .shortcut-section h4 {
    margin: 0 0 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-overlay0);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.8rem;
    color: var(--ctp-subtext1);
  }

  .shortcut-row kbd {
    font-size: 0.68rem;
    color: var(--ctp-overlay1);
    background: var(--ctp-surface1);
    padding: 0.1rem 0.375rem;
    border-radius: 0.1875rem;
    font-family: var(--font-mono, monospace);
  }

  .shortcut-row span {
    text-align: right;
  }
</style>
