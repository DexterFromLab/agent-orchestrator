<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme } from './lib/stores/theme.svelte';
  import { getSetting } from './lib/adapters/settings-bridge';
  import { isDetachedMode, getDetachedConfig } from './lib/utils/detach';
  import { startAgentDispatcher, stopAgentDispatcher } from './lib/agent-dispatcher';
  import { startHealthTick, stopHealthTick, clearHealthTracking } from './lib/stores/health.svelte';
  import { registerProvider } from './lib/providers/registry.svelte';
  import { CLAUDE_PROVIDER } from './lib/providers/claude';
  import { CODEX_PROVIDER } from './lib/providers/codex';
  import { OLLAMA_PROVIDER } from './lib/providers/ollama';
  import { registerMemoryAdapter } from './lib/adapters/memory-adapter';
  import { MemoraAdapter } from './lib/adapters/memora-bridge';
  import { loadWorkspace, getActiveTab, setActiveTab, setActiveProject, getEnabledProjects } from './lib/stores/workspace.svelte';

  // Workspace components
  import GlobalTabBar from './lib/components/Workspace/GlobalTabBar.svelte';
  import GroupAgentsPanel from './lib/components/Workspace/GroupAgentsPanel.svelte';
  import ProjectGrid from './lib/components/Workspace/ProjectGrid.svelte';
  import SettingsTab from './lib/components/Workspace/SettingsTab.svelte';
  import CommandPalette from './lib/components/Workspace/CommandPalette.svelte';

  // Shared
  import StatusBar from './lib/components/StatusBar/StatusBar.svelte';
  import ToastContainer from './lib/components/Notifications/ToastContainer.svelte';

  // Detached mode (preserved from v2)
  import TerminalPane from './lib/components/Terminal/TerminalPane.svelte';
  import AgentPane from './lib/components/Agent/AgentPane.svelte';

  let detached = isDetachedMode();
  let detachedConfig = getDetachedConfig();

  let paletteOpen = $state(false);
  let drawerOpen = $state(false);
  let loaded = $state(false);

  let activeTab = $derived(getActiveTab());
  let panelContentEl: HTMLElement | undefined = $state();
  let panelWidth = $state<string | undefined>(undefined);

  // Measure the panel content's natural width
  $effect(() => {
    const el = panelContentEl;
    void activeTab;
    if (!el) { panelWidth = undefined; return; }
    const frame = requestAnimationFrame(() => {
      let maxW = 0;
      const candidates = el.querySelectorAll('[style*="white-space"], h3, h4, input, .settings-list, .settings-tab');
      for (const c of candidates) {
        maxW = Math.max(maxW, c.scrollWidth);
      }
      const child = el.firstElementChild as HTMLElement;
      if (child) {
        const cs = getComputedStyle(child);
        const mw = parseFloat(cs.minWidth);
        if (!isNaN(mw)) maxW = Math.max(maxW, mw);
      }
      if (maxW > 0) {
        panelWidth = `${maxW + 24}px`;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  onMount(() => {
    initTheme();
    getSetting('project_max_aspect').then(v => {
      if (v) document.documentElement.style.setProperty('--project-max-aspect', v);
    });
    registerProvider(CLAUDE_PROVIDER);
    registerProvider(CODEX_PROVIDER);
    registerProvider(OLLAMA_PROVIDER);
    const memora = new MemoraAdapter();
    registerMemoryAdapter(memora);
    memora.checkAvailability();
    startAgentDispatcher();
    startHealthTick();

    if (!detached) {
      loadWorkspace().then(() => { loaded = true; });
    }

    function handleKeydown(e: KeyboardEvent) {
      // Ctrl+K — command palette
      if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        paletteOpen = !paletteOpen;
        return;
      }

      // Ctrl+1..5 — focus project by index
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const projects = getEnabledProjects();
        const idx = parseInt(e.key) - 1;
        if (idx < projects.length) {
          setActiveProject(projects[idx].id);
        }
        return;
      }

      // Ctrl+, — toggle settings panel
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        if (getActiveTab() === 'settings' && drawerOpen) {
          drawerOpen = false;
        } else {
          setActiveTab('settings');
          drawerOpen = true;
        }
        return;
      }

      // Ctrl+B — toggle sidebar
      if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        drawerOpen = !drawerOpen;
        return;
      }

      // Escape — close drawer
      if (e.key === 'Escape' && drawerOpen) {
        e.preventDefault();
        drawerOpen = false;
        return;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      stopAgentDispatcher();
      stopHealthTick();
    };
  });
</script>

{#if detached && detachedConfig}
  <div class="detached-pane">
    {#if detachedConfig.type === 'terminal' || detachedConfig.type === 'ssh'}
      <TerminalPane
        shell={detachedConfig.shell}
        cwd={detachedConfig.cwd}
        args={detachedConfig.args}
      />
    {:else if detachedConfig.type === 'agent'}
      <AgentPane
        sessionId={detachedConfig.sessionId ?? crypto.randomUUID()}
        cwd={detachedConfig.cwd}
      />
    {:else}
      <TerminalPane />
    {/if}
  </div>
{:else if loaded}
  <div class="app-shell">
    <div class="main-row">
      <GlobalTabBar expanded={drawerOpen} ontoggle={toggleDrawer} />

      {#if drawerOpen}
        <aside class="sidebar-panel" style:width={panelWidth}>
          <div class="panel-header">
            <h2>Settings</h2>
            <button class="panel-close" onclick={() => drawerOpen = false} title="Close sidebar (Ctrl+B)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="panel-content" bind:this={panelContentEl}>
            <SettingsTab />
          </div>
        </aside>
      {/if}

      <main class="workspace">
        <GroupAgentsPanel />
        <ProjectGrid />
      </main>
    </div>

    <StatusBar />
  </div>

  <CommandPalette open={paletteOpen} onclose={() => paletteOpen = false} />
{:else}
  <div class="loading">Loading workspace...</div>
{/if}
<ToastContainer />

<style>
  .detached-pane {
    height: 100vh;
    width: 100vw;
    background: var(--ctp-base);
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--ctp-base);
    overflow: hidden;
  }

  .main-row {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .sidebar-panel {
    min-width: 16em;
    max-width: 50%;
    display: flex;
    flex-direction: column;
    background: var(--ctp-base);
    border-right: 1px solid var(--ctp-surface1);
    flex-shrink: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .panel-header h2 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
    margin: 0;
  }

  .panel-close {
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

  .panel-close:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
  }

  .workspace {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--ctp-overlay0);
    font-size: 0.9rem;
    background: var(--ctp-base);
  }
</style>
