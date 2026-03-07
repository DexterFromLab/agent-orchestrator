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
  let settingsOpen = $state(false);
  let loaded = $state(false);

  let activeTab = $derived(getActiveTab());

  function toggleSettings() {
    settingsOpen = !settingsOpen;
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

      // Alt+1..3 — switch workspace tab
      if (e.altKey && !e.ctrlKey && e.key >= '1' && e.key <= '3') {
        e.preventDefault();
        const tabs = ['sessions', 'docs', 'context'] as const;
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

      // Ctrl+, — toggle settings drawer
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        toggleSettings();
        return;
      }

      // Escape — close settings drawer
      if (e.key === 'Escape' && settingsOpen) {
        e.preventDefault();
        settingsOpen = false;
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
    <GlobalTabBar {settingsOpen} ontoggleSettings={toggleSettings} />

    <div class="content-area">
      <main class="tab-content">
        {#if activeTab === 'sessions'}
          <ProjectGrid />
        {:else if activeTab === 'docs'}
          <DocsTab />
        {:else if activeTab === 'context'}
          <ContextTab />
        {/if}
      </main>

      {#if settingsOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="drawer-backdrop" onclick={() => settingsOpen = false}></div>
        <aside class="settings-drawer">
          <div class="drawer-header">
            <h2>Settings</h2>
            <button class="drawer-close" onclick={() => settingsOpen = false} title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <SettingsTab />
        </aside>
      {/if}
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

  .content-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .tab-content {
    height: 100%;
    overflow: hidden;
  }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 50;
  }

  .settings-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 32em;
    max-width: 90%;
    background: var(--ctp-base);
    border-left: 1px solid var(--ctp-surface1);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    z-index: 51;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .drawer-header h2 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ctp-text);
    margin: 0;
  }

  .drawer-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--ctp-subtext0);
    cursor: pointer;
  }

  .drawer-close:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
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
