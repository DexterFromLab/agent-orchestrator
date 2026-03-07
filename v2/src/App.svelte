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
  let loaded = $state(false);

  let activeTab = $derived(getActiveTab());

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

      // Alt+1..4 — switch workspace tab
      if (e.altKey && !e.ctrlKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const tabs = ['sessions', 'docs', 'context', 'settings'] as const;
        setActiveTab(tabs[parseInt(e.key) - 1]);
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

      // Ctrl+, — settings tab
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setActiveTab('settings');
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
    <GlobalTabBar />

    <main class="tab-content">
      {#if activeTab === 'sessions'}
        <ProjectGrid />
      {:else if activeTab === 'docs'}
        <DocsTab />
      {:else if activeTab === 'context'}
        <ContextTab />
      {:else if activeTab === 'settings'}
        <SettingsTab />
      {/if}
    </main>

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

  .tab-content {
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
