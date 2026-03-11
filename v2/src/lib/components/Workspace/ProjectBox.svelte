<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ProjectConfig } from '../../types/groups';
  import { PROJECT_ACCENTS } from '../../types/groups';
  import ProjectHeader from './ProjectHeader.svelte';
  import AgentSession from './AgentSession.svelte';
  import TerminalTabs from './TerminalTabs.svelte';
  import TeamAgentsPanel from './TeamAgentsPanel.svelte';
  import ProjectFiles from './ProjectFiles.svelte';
  import ContextTab from './ContextTab.svelte';
  import FilesTab from './FilesTab.svelte';
  import SshTab from './SshTab.svelte';
  import MemoriesTab from './MemoriesTab.svelte';
  import { getTerminalTabs } from '../../stores/workspace.svelte';
  import { getProjectHealth, setStallThreshold } from '../../stores/health.svelte';
  import { fsWatchProject, fsUnwatchProject, onFsWriteDetected, fsWatcherStatus } from '../../adapters/fs-watcher-bridge';
  import { recordExternalWrite } from '../../stores/conflicts.svelte';
  import { notify, dismissNotification } from '../../stores/notifications.svelte';

  interface Props {
    project: ProjectConfig;
    slotIndex: number;
    active: boolean;
    onactivate: () => void;
  }

  let { project, slotIndex, active, onactivate }: Props = $props();

  let accentVar = $derived(PROJECT_ACCENTS[slotIndex % PROJECT_ACCENTS.length]);
  let mainSessionId = $state<string | null>(null);
  let terminalExpanded = $state(false);

  type ProjectTab = 'model' | 'docs' | 'context' | 'files' | 'ssh' | 'memories';
  let activeTab = $state<ProjectTab>('model');

  // PERSISTED-LAZY: track which tabs have been activated at least once
  let everActivated = $state<Record<string, boolean>>({});

  let termTabs = $derived(getTerminalTabs(project.id));
  let projectHealth = $derived(getProjectHealth(project.id));
  let termTabCount = $derived(termTabs.length);

  /** Activate a tab — for lazy tabs, mark as ever-activated */
  function switchTab(tab: ProjectTab) {
    activeTab = tab;
    if (!everActivated[tab]) {
      everActivated = { ...everActivated, [tab]: true };
    }
  }

  function toggleTerminal() {
    terminalExpanded = !terminalExpanded;
  }

  // Sync per-project stall threshold to health store
  $effect(() => {
    setStallThreshold(project.id, project.stallThresholdMin ?? null);
  });

  // S-1 Phase 2: start filesystem watcher for this project's CWD
  $effect(() => {
    const cwd = project.cwd;
    const projectId = project.id;
    if (!cwd) return;

    // Start watching, then check inotify capacity
    // Show scanning toast only if status check takes >300ms
    let scanToastId: string | null = null;
    const scanTimer = setTimeout(() => {
      scanToastId = notify('info', 'Scanning project directories…');
    }, 300);

    fsWatchProject(projectId, cwd)
      .then(() => fsWatcherStatus())
      .then((status) => {
        clearTimeout(scanTimer);
        if (scanToastId) dismissNotification(scanToastId);
        if (status.warning) {
          notify('warning', status.warning);
        }
      })
      .catch(e => {
        clearTimeout(scanTimer);
        if (scanToastId) dismissNotification(scanToastId);
        console.warn(`Failed to start fs watcher for ${projectId}:`, e);
      });

    // Listen for fs write events (filter to this project)
    let unlisten: (() => void) | null = null;
    onFsWriteDetected((event) => {
      if (event.project_id !== projectId) return;
      const isNew = recordExternalWrite(projectId, event.file_path, event.timestamp_ms);
      if (isNew) {
        const shortName = event.file_path.split('/').pop() ?? event.file_path;
        notify('warning', `External write: ${shortName} — file also modified by agent`);
      }
    }).then(fn => { unlisten = fn; });

    return () => {
      // Cleanup: stop watching on unmount or project change
      fsUnwatchProject(projectId).catch(() => {});
      unlisten?.();
    };
  });
</script>

<div
  class="project-box"
  class:active
  style="--accent: var({accentVar})"
>
  <ProjectHeader
    {project}
    {slotIndex}
    {active}
    health={projectHealth}
    onclick={onactivate}
  />

  <div class="project-tabs">
    <button
      class="ptab"
      class:active={activeTab === 'model'}
      onclick={() => switchTab('model')}
    >Model</button>
    <button
      class="ptab"
      class:active={activeTab === 'docs'}
      onclick={() => switchTab('docs')}
    >Docs</button>
    <button
      class="ptab"
      class:active={activeTab === 'context'}
      onclick={() => switchTab('context')}
    >Context</button>
    <button
      class="ptab"
      class:active={activeTab === 'files'}
      onclick={() => switchTab('files')}
    >Files</button>
    <button
      class="ptab"
      class:active={activeTab === 'ssh'}
      onclick={() => switchTab('ssh')}
    >SSH</button>
    <button
      class="ptab"
      class:active={activeTab === 'memories'}
      onclick={() => switchTab('memories')}
    >Memory</button>
  </div>

  <div class="project-content-area">
    <!-- PERSISTED-EAGER: always mounted, toggled via display -->
    <div class="content-pane" style:display={activeTab === 'model' ? 'flex' : 'none'}>
      <AgentSession {project} onsessionid={(id) => mainSessionId = id} />
      {#if mainSessionId}
        <TeamAgentsPanel {mainSessionId} />
      {/if}
    </div>
    <div class="content-pane" style:display={activeTab === 'docs' ? 'flex' : 'none'}>
      <ProjectFiles cwd={project.cwd} projectName={project.name} />
    </div>
    <div class="content-pane" style:display={activeTab === 'context' ? 'flex' : 'none'}>
      <ContextTab sessionId={mainSessionId} projectId={project.id} anchorBudgetScale={project.anchorBudgetScale} />
    </div>

    <!-- PERSISTED-LAZY: mount on first activation, then toggle via display -->
    {#if everActivated['files']}
      <div class="content-pane" style:display={activeTab === 'files' ? 'flex' : 'none'}>
        <FilesTab cwd={project.cwd} />
      </div>
    {/if}
    {#if everActivated['ssh']}
      <div class="content-pane" style:display={activeTab === 'ssh' ? 'flex' : 'none'}>
        <SshTab projectId={project.id} />
      </div>
    {/if}
    {#if everActivated['memories']}
      <div class="content-pane" style:display={activeTab === 'memories' ? 'flex' : 'none'}>
        <MemoriesTab />
      </div>
    {/if}
  </div>

  <div class="terminal-section" style:display={activeTab === 'model' ? 'flex' : 'none'}>
      <button class="terminal-toggle" onclick={toggleTerminal}>
        <span class="toggle-chevron" class:expanded={terminalExpanded}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="toggle-label">Terminal</span>
        {#if termTabCount > 0}
          <span class="toggle-count">{termTabCount}</span>
        {/if}
      </button>

      {#if terminalExpanded}
        <div class="project-terminal-area">
          <TerminalTabs {project} agentSessionId={mainSessionId} />
        </div>
      {/if}
  </div>
</div>

<style>
  .project-box {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    min-width: 30rem;
    scroll-snap-align: start;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.375rem;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .project-box.active {
    border-color: var(--accent);
  }

  .project-tabs {
    display: flex;
    gap: 0;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ptab {
    display: inline-flex;
    align-items: center;
    padding: 0.3125em 0.875em;
    border: none;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.725rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
  }

  .ptab:hover {
    color: var(--ctp-subtext1);
    background: var(--ctp-surface0);
  }

  .ptab:focus-visible {
    outline: 1px solid var(--ctp-blue);
    outline-offset: -1px;
  }

  .ptab.active {
    background: var(--ctp-base);
    color: var(--ctp-text);
    font-weight: 600;
    border-bottom-color: var(--accent);
    margin-bottom: -1px;
  }

  .project-content-area {
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .content-pane {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .terminal-section {
    border-top: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
  }

  .terminal-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: var(--ctp-mantle);
    border: none;
    color: var(--ctp-overlay1);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
  }

  .terminal-toggle:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .toggle-chevron {
    display: flex;
    align-items: center;
    transition: transform 0.15s ease;
  }

  .toggle-chevron.expanded {
    transform: rotate(90deg);
  }

  .toggle-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .toggle-count {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-surface0);
    padding: 0 0.3rem;
    border-radius: 0.5rem;
    line-height: 1.4;
    min-width: 1rem;
    text-align: center;
  }

  .project-terminal-area {
    height: 16rem;
    min-height: 8rem;
  }
</style>
