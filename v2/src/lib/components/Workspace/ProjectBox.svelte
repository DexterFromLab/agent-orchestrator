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
  import TaskBoardTab from './TaskBoardTab.svelte';
  import ArchitectureTab from './ArchitectureTab.svelte';
  import TestingTab from './TestingTab.svelte';
  import MetricsPanel from './MetricsPanel.svelte';
  import AuditLogTab from './AuditLogTab.svelte';
  import {
    getTerminalTabs, getActiveGroup,
    getFocusFlashProjectId, onProjectTabSwitch, onTerminalToggle,
  } from '../../stores/workspace.svelte';
  import { getProjectHealth, setStallThreshold } from '../../stores/health.svelte';
  import { fsWatchProject, fsUnwatchProject, onFsWriteDetected, fsWatcherStatus } from '../../adapters/fs-watcher-bridge';
  import { recordExternalWrite } from '../../stores/conflicts.svelte';
  import { ProjectId, type AgentId, type GroupId } from '../../types/ids';
  import { notify, dismissNotification } from '../../stores/notifications.svelte';
  import { registerManager, unregisterManager, updateManagerConfig } from '../../stores/wake-scheduler.svelte';
  import { setReviewQueueDepth } from '../../stores/health.svelte';
  import { reviewQueueCount } from '../../adapters/bttask-bridge';
  import { getStaleAgents } from '../../adapters/btmsg-bridge';

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

  type ProjectTab = 'model' | 'docs' | 'context' | 'files' | 'ssh' | 'memories' | 'metrics' | 'tasks' | 'architecture' | 'selenium' | 'tests' | 'audit';
  let activeTab = $state<ProjectTab>('model');

  let activeGroup = $derived(getActiveGroup());
  let agentRole = $derived(project.agentRole);
  let isAgent = $derived(project.isAgent ?? false);

  // Heartbeat status for Tier 1 agents
  let heartbeatStatus = $state<'healthy' | 'stale' | 'dead' | null>(null);

  // PERSISTED-LAZY: track which tabs have been activated at least once
  let everActivated = $state<Record<string, boolean>>({});

  let termTabs = $derived(getTerminalTabs(project.id));
  let projectHealth = $derived(getProjectHealth(project.id));
  let termTabCount = $derived(termTabs.length);

  // Focus flash animation (triggered by keyboard quick-jump)
  let flashProjectId = $derived(getFocusFlashProjectId());
  let isFlashing = $derived(flashProjectId === project.id);

  // Tab name -> index mapping for keyboard switching
  const TAB_INDEX_MAP: ProjectTab[] = [
    'model',       // 1
    'docs',        // 2
    'context',     // 3
    'files',       // 4
    'ssh',         // 5
    'memories',    // 6
    'metrics',     // 7
    'tasks',       // 8
    'architecture',// 9
  ];

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

  // Listen for keyboard-driven tab switches
  $effect(() => {
    const unsubTab = onProjectTabSwitch((pid, tabIndex) => {
      if (pid !== project.id) return;
      const tabName = TAB_INDEX_MAP[tabIndex - 1];
      if (tabName) switchTab(tabName);
    });
    const unsubTerm = onTerminalToggle((pid) => {
      if (pid !== project.id) return;
      terminalExpanded = !terminalExpanded;
    });
    return () => {
      unsubTab();
      unsubTerm();
    };
  });

  // Sync per-project stall threshold to health store
  $effect(() => {
    setStallThreshold(project.id, project.stallThresholdMin ?? null);
  });

  // Register Manager agents with the wake scheduler
  $effect(() => {
    if (!(project.isAgent && project.agentRole === 'manager')) return;
    const groupId = activeGroup?.id;
    if (!groupId || !mainSessionId) return;

    // Find the agent config to get wake settings
    const agentConfig = activeGroup?.agents?.find(a => a.id === project.id);
    const strategy = agentConfig?.wakeStrategy ?? 'smart';
    const intervalMin = agentConfig?.wakeIntervalMin ?? 3;
    const threshold = agentConfig?.wakeThreshold ?? 0.5;

    registerManager(
      project.id as unknown as AgentId,
      groupId as unknown as GroupId,
      mainSessionId,
      strategy,
      intervalMin,
      threshold,
    );

    return () => {
      unregisterManager(project.id);
    };
  });

  // Poll review queue depth for reviewer agents (feeds into attention scoring)
  $effect(() => {
    if (!(project.isAgent && project.agentRole === 'reviewer')) return;
    const groupId = activeGroup?.id;
    if (!groupId) return;

    const pollReviewQueue = () => {
      reviewQueueCount(groupId)
        .then(count => setReviewQueueDepth(project.id, count))
        .catch(() => {}); // best-effort
    };

    pollReviewQueue(); // immediate first poll
    const timer = setInterval(pollReviewQueue, 10_000); // 10s poll
    return () => clearInterval(timer);
  });

  // Heartbeat monitoring for Tier 1 agents
  $effect(() => {
    if (!project.isAgent) return;
    const groupId = activeGroup?.id;
    if (!groupId) return;

    const pollHeartbeat = () => {
      // 300s = healthy threshold, 600s = dead threshold
      getStaleAgents(groupId as unknown as GroupId, 300)
        .then(staleIds => {
          if (staleIds.includes(project.id)) {
            // Check if truly dead (>10 min)
            getStaleAgents(groupId as unknown as GroupId, 600)
              .then(deadIds => {
                heartbeatStatus = deadIds.includes(project.id) ? 'dead' : 'stale';
              })
              .catch(() => { heartbeatStatus = 'stale'; });
          } else {
            heartbeatStatus = 'healthy';
          }
        })
        .catch(() => { heartbeatStatus = null; });
    };

    pollHeartbeat();
    const timer = setInterval(pollHeartbeat, 15_000); // 15s poll
    return () => clearInterval(timer);
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
      const isNew = recordExternalWrite(ProjectId(projectId), event.file_path, event.timestamp_ms);
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
  class:focus-flash={isFlashing}
  style="--accent: var({accentVar})"
  data-testid="project-box"
  data-project-id={project.id}
>
  <ProjectHeader
    {project}
    {slotIndex}
    {active}
    health={projectHealth}
    {heartbeatStatus}
    onclick={onactivate}
  />

  <div class="project-tabs" data-testid="project-tabs">
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
    <button
      class="ptab"
      class:active={activeTab === 'metrics'}
      onclick={() => switchTab('metrics')}
    >Metrics</button>
    {#if isAgent && agentRole === 'manager'}
      <button class="ptab ptab-role" class:active={activeTab === 'tasks'} onclick={() => switchTab('tasks')}>Tasks</button>
    {/if}
    {#if isAgent && agentRole === 'architect'}
      <button class="ptab ptab-role" class:active={activeTab === 'architecture'} onclick={() => switchTab('architecture')}>Arch</button>
    {/if}
    {#if isAgent && agentRole === 'reviewer'}
      <button class="ptab ptab-role" class:active={activeTab === 'tasks'} onclick={() => switchTab('tasks')}>Tasks</button>
    {/if}
    {#if isAgent && agentRole === 'tester'}
      <button class="ptab ptab-role" class:active={activeTab === 'selenium'} onclick={() => switchTab('selenium')}>Selenium</button>
      <button class="ptab ptab-role" class:active={activeTab === 'tests'} onclick={() => switchTab('tests')}>Tests</button>
    {/if}
    {#if isAgent && agentRole === 'manager'}
      <button class="ptab ptab-role" class:active={activeTab === 'audit'} onclick={() => switchTab('audit')}>Audit</button>
    {/if}
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
    {#if everActivated['metrics']}
      <div class="content-pane" style:display={activeTab === 'metrics' ? 'flex' : 'none'}>
        <MetricsPanel {project} groupId={activeGroup?.id} />
      </div>
    {/if}
    {#if everActivated['tasks'] && activeGroup}
      <div class="content-pane" style:display={activeTab === 'tasks' ? 'flex' : 'none'}>
        <TaskBoardTab groupId={activeGroup.id} projectId={project.id} />
      </div>
    {/if}
    {#if everActivated['architecture']}
      <div class="content-pane" style:display={activeTab === 'architecture' ? 'flex' : 'none'}>
        <ArchitectureTab cwd={project.cwd} />
      </div>
    {/if}
    {#if everActivated['selenium']}
      <div class="content-pane" style:display={activeTab === 'selenium' ? 'flex' : 'none'}>
        <TestingTab cwd={project.cwd} mode="selenium" />
      </div>
    {/if}
    {#if everActivated['tests']}
      <div class="content-pane" style:display={activeTab === 'tests' ? 'flex' : 'none'}>
        <TestingTab cwd={project.cwd} mode="tests" />
      </div>
    {/if}
    {#if everActivated['audit'] && activeGroup}
      <div class="content-pane" style:display={activeTab === 'audit' ? 'flex' : 'none'}>
        <AuditLogTab groupId={activeGroup.id} />
      </div>
    {/if}
  </div>

  <div class="terminal-section" style:display={activeTab === 'model' ? 'flex' : 'none'}>
      <button class="terminal-toggle" data-testid="terminal-toggle" onclick={toggleTerminal}>
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
    /* scroll-snap-align removed: see ProjectGrid */
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.375rem;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .project-box.active {
    border-color: var(--accent);
  }

  .project-box.focus-flash {
    animation: focus-flash 0.4s ease-out;
  }

  @keyframes focus-flash {
    0% {
      border-color: var(--ctp-blue);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ctp-blue) 40%, transparent);
    }
    100% {
      border-color: var(--accent);
      box-shadow: none;
    }
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

  .ptab-role {
    color: var(--ctp-mauve);
  }

  .ptab-role:hover {
    color: var(--ctp-text);
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
