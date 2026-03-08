<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme } from './lib/stores/theme.svelte';
  import { isDetachedMode, getDetachedConfig } from './lib/utils/detach';
  import { startAgentDispatcher, stopAgentDispatcher } from './lib/agent-dispatcher';
  import { loadWorkspace, getActiveTab, setActiveTab, setActiveProject, getEnabledProjects } from './lib/stores/workspace.svelte';

  // Workspace components
  import GlobalTabBar from './lib/components/Workspace/GlobalTabBar.svelte';
  import ProjectGrid from './lib/components/Workspace/ProjectGrid.svelte';
  import DocsTab from './lib/components/Workspace/DocsTab.svelte';
  import ContextTab from './lib/components/Workspace/ContextTab.svelte';
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

  // Panel titles
  const panelTitles: Record<string, string> = {
    sessions: 'Sessions',
    docs: 'Documentation',
    context: 'Context',
    settings: 'Settings',
  };

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  onMount(() => {
    initTheme();
    startAgentDispatcher();

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

      // Alt+1..4 — switch sidebar tab (and open drawer)
      if (e.altKey && !e.ctrlKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const tabs = ['sessions', 'docs', 'context', 'settings'] as const;
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          const tab = tabs[idx];
          if (getActiveTab() === tab && drawerOpen) {
            drawerOpen = false;
          } else {
            setActiveTab(tab);
            drawerOpen = true;
          }
        }
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
        <aside class="sidebar-panel">
          <div class="panel-header">
            <h2>{panelTitles[activeTab] ?? ''}</h2>
            <button class="panel-close" onclick={() => drawerOpen = false} title="Close sidebar (Ctrl+B)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="panel-content">
            {#if activeTab === 'sessions'}
              <ProjectGrid />
            {:else if activeTab === 'docs'}
              <DocsTab />
            {:else if activeTab === 'context'}
              <ContextTab />
            {:else if activeTab === 'settings'}
              <SettingsTab />
            {/if}
          </div>
        </aside>
      {/if}

      <main class="workspace">
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
    width: max-content;
    min-width: 16em;
    max-width: 50%;
    display: flex;
    flex-direction: column;
    background: var(--ctp-base);
    border-right: 1px solid var(--ctp-surface1);
    overflow-y: auto;
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
