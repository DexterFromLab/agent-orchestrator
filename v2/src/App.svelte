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
  import { AIDER_PROVIDER } from './lib/providers/aider';
  import { registerMemoryAdapter } from './lib/adapters/memory-adapter';
  import { MemoraAdapter } from './lib/adapters/memora-bridge';
  import {
    loadWorkspace, getActiveTab, setActiveTab, setActiveProject,
    getEnabledProjects, getAllWorkItems, getActiveProjectId,
    triggerFocusFlash, emitProjectTabSwitch, emitTerminalToggle,
  } from './lib/stores/workspace.svelte';
  import { disableWakeScheduler } from './lib/stores/wake-scheduler.svelte';
  import { pruneSeen } from './lib/adapters/btmsg-bridge';
  import { invoke } from '@tauri-apps/api/core';

  // Workspace components
  import GlobalTabBar from './lib/components/Workspace/GlobalTabBar.svelte';
  import GroupAgentsPanel from './lib/components/Workspace/GroupAgentsPanel.svelte';
  import ProjectGrid from './lib/components/Workspace/ProjectGrid.svelte';
  import SettingsTab from './lib/components/Workspace/SettingsTab.svelte';
  import CommsTab from './lib/components/Workspace/CommsTab.svelte';
  import CommandPalette from './lib/components/Workspace/CommandPalette.svelte';
  import SearchOverlay from './lib/components/Workspace/SearchOverlay.svelte';

  // Shared
  import StatusBar from './lib/components/StatusBar/StatusBar.svelte';
  import ToastContainer from './lib/components/Notifications/ToastContainer.svelte';
  import SplashScreen from './lib/components/SplashScreen.svelte';

  // Detached mode (preserved from v2)
  import TerminalPane from './lib/components/Terminal/TerminalPane.svelte';
  import AgentPane from './lib/components/Agent/AgentPane.svelte';

  let detached = isDetachedMode();
  let detachedConfig = getDetachedConfig();

  let paletteOpen = $state(false);
  let searchOpen = $state(false);
  let drawerOpen = $state(false);
  let loaded = $state(false);

  // Splash screen loading steps
  let splashSteps = $state([
    { label: 'Initializing theme...', done: false },
    { label: 'Registering providers...', done: false },
    { label: 'Starting agent dispatcher...', done: false },
    { label: 'Connecting sidecar...', done: false },
    { label: 'Loading workspace...', done: false },
  ]);

  function markStep(idx: number) {
    splashSteps[idx] = { ...splashSteps[idx], done: true };
  }

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
    // Step 0: Theme
    initTheme();
    getSetting('project_max_aspect').then(v => {
      if (v) document.documentElement.style.setProperty('--project-max-aspect', v);
    });
    markStep(0);

    // Step 1: Providers
    registerProvider(CLAUDE_PROVIDER);
    registerProvider(CODEX_PROVIDER);
    registerProvider(OLLAMA_PROVIDER);
    registerProvider(AIDER_PROVIDER);
    const memora = new MemoraAdapter();
    registerMemoryAdapter(memora);
    memora.checkAvailability();
    markStep(1);

    // Step 2: Agent dispatcher
    startAgentDispatcher();
    startHealthTick();
    pruneSeen().catch(() => {}); // housekeeping: remove stale seen_messages on startup
    markStep(2);

    // Disable wake scheduler in test mode to prevent timer interference
    invoke<boolean>('is_test_mode').then(isTest => {
      if (isTest) disableWakeScheduler();
    });

    // Step 3: Sidecar (small delay to let sidecar report ready)
    setTimeout(() => markStep(3), 300);

    if (!detached) {
      // Step 4: Workspace
      loadWorkspace().then(() => {
        markStep(4);
        // Brief pause to show completed state before transition
        setTimeout(() => { loaded = true; }, 400);
      });
    }

    /** Check if event target is an editable element (input, textarea, contenteditable) */
    function isEditing(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement;
      if (!t) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (t.isContentEditable) return true;
      // xterm.js canvases and textareas should be considered editing
      if (t.closest('.xterm')) return true;
      return false;
    }

    function handleKeydown(e: KeyboardEvent) {
      // Ctrl+K — command palette (always active)
      if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        paletteOpen = !paletteOpen;
        return;
      }

      // Ctrl+Shift+F — global search overlay
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        searchOpen = !searchOpen;
        return;
      }

      // Alt+1..5 — quick-jump to project by index
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const projects = getAllWorkItems();
        const idx = parseInt(e.key) - 1;
        if (idx < projects.length) {
          setActiveProject(projects[idx].id);
          triggerFocusFlash(projects[idx].id);
        }
        return;
      }

      // Ctrl+Shift+1..9 — switch tab within focused project
      if (e.ctrlKey && e.shiftKey && e.key >= '1' && e.key <= '9') {
        // Allow Ctrl+Shift+K to pass through to its own handler
        if (e.key === 'K') return;
        e.preventDefault();
        const projectId = getActiveProjectId();
        if (projectId) {
          const tabIdx = parseInt(e.key);
          emitProjectTabSwitch(projectId, tabIdx);
        }
        return;
      }

      // Ctrl+Shift+K — focus agent pane (switch to Model tab)
      if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        const projectId = getActiveProjectId();
        if (projectId) {
          emitProjectTabSwitch(projectId, 1); // Model tab
        }
        return;
      }

      // Vi-style navigation (skip when editing text)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !isEditing(e)) {
        const projects = getAllWorkItems();
        const currentId = getActiveProjectId();
        const currentIdx = projects.findIndex(p => p.id === currentId);

        // Ctrl+H — focus previous project (left)
        if (e.key === 'h') {
          e.preventDefault();
          if (currentIdx > 0) {
            setActiveProject(projects[currentIdx - 1].id);
            triggerFocusFlash(projects[currentIdx - 1].id);
          }
          return;
        }

        // Ctrl+L — focus next project (right)
        if (e.key === 'l') {
          e.preventDefault();
          if (currentIdx >= 0 && currentIdx < projects.length - 1) {
            setActiveProject(projects[currentIdx + 1].id);
            triggerFocusFlash(projects[currentIdx + 1].id);
          }
          return;
        }

        // Ctrl+J — toggle terminal section in focused project
        if (e.key === 'j') {
          e.preventDefault();
          if (currentId) {
            emitTerminalToggle(currentId);
          }
          return;
        }
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

      // Ctrl+M — toggle messages panel
      if (e.ctrlKey && !e.shiftKey && e.key === 'm') {
        e.preventDefault();
        if (getActiveTab() === 'comms' && drawerOpen) {
          drawerOpen = false;
        } else {
          setActiveTab('comms');
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
            <h2>{activeTab === 'comms' ? 'Messages' : 'Settings'}</h2>
            <button class="panel-close" onclick={() => drawerOpen = false} title="Close sidebar (Ctrl+B)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="panel-content" bind:this={panelContentEl}>
            {#if activeTab === 'comms'}
              <CommsTab />
            {:else}
              <SettingsTab />
            {/if}
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
  <SearchOverlay open={searchOpen} onclose={() => searchOpen = false} />
{:else}
  <SplashScreen steps={splashSteps} />
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

</style>
