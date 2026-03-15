<script lang="ts">
  import { getAgentSessions, updateAgentStatus } from '../../stores/agents.svelte';
  import { getActiveGroup, getEnabledProjects, setActiveProject } from '../../stores/workspace.svelte';
  import { getHealthAggregates, getAttentionQueue, type ProjectHealth } from '../../stores/health.svelte';
  import { getTotalConflictCount } from '../../stores/conflicts.svelte';
  import { clearWakeScheduler } from '../../stores/wake-scheduler.svelte';
  import { stopAgent } from '../../adapters/agent-bridge';
  import { setAgentStatus as setBtmsgAgentStatus } from '../../adapters/btmsg-bridge';
  import { getSessionProjectId } from '../../utils/session-persistence';
  import type { AgentId } from '../../types/ids';
  import { onMount } from 'svelte';
  import { checkForUpdates, installUpdate, type UpdateInfo } from '../../utils/updater';
  import { message as dialogMessage, confirm } from '@tauri-apps/plugin-dialog';
  import NotificationCenter from '../Notifications/NotificationCenter.svelte';

  let agentSessions = $derived(getAgentSessions());
  let activeGroup = $derived(getActiveGroup());
  let enabledProjects = $derived(getEnabledProjects());

  let totalCost = $derived(agentSessions.reduce((sum, s) => sum + s.costUsd, 0));
  let totalTokens = $derived(agentSessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0));
  let projectCount = $derived(enabledProjects.length);

  // Health-derived signals
  let health = $derived(getHealthAggregates());
  let attentionQueue = $derived(getAttentionQueue(5));

  let totalConflicts = $derived(getTotalConflictCount());
  let showAttention = $state(false);

  // Stop All state
  let stopping = $state(false);
  let hasActive = $derived(health.running > 0 || health.idle > 0 || health.stalled > 0);

  async function handleStopAll() {
    if (stopping) return;
    stopping = true;
    try {
      clearWakeScheduler();
      const sessions = getAgentSessions();
      const active = sessions.filter(s => s.status === 'running' || s.status === 'starting' || s.status === 'idle');
      for (const s of active) {
        updateAgentStatus(s.id, 'done');
        const projId = getSessionProjectId(s.id);
        if (projId) setBtmsgAgentStatus(projId as unknown as AgentId, 'stopped').catch(() => {});
      }
      await Promise.all(active.map(s => stopAgent(s.id).catch(() => {})));
    } finally {
      stopping = false;
    }
  }

  // Auto-update state
  let updateInfo = $state<UpdateInfo | null>(null);
  let installing = $state(false);

  onMount(() => {
    // Check for updates 10s after startup
    const timer = setTimeout(async () => {
      const info = await checkForUpdates();
      if (info.available) updateInfo = info;
    }, 10_000);
    return () => clearTimeout(timer);
  });

  async function handleUpdateClick() {
    if (!updateInfo) return;
    const notes = updateInfo.notes
      ? `Release notes:\n\n${updateInfo.notes}\n\nInstall and restart?`
      : `Install v${updateInfo.version} and restart?`;
    const confirmed = await confirm(notes, { title: `Update available: v${updateInfo.version}`, kind: 'info' });
    if (confirmed) {
      installing = true;
      try {
        await installUpdate();
      } catch {
        installing = false;
      }
    }
  }

  function projectName(projectId: string): string {
    return enabledProjects.find(p => p.id === projectId)?.name ?? projectId.slice(0, 8);
  }

  function focusProject(projectId: string) {
    setActiveProject(projectId);
    showAttention = false;
  }

  function formatRate(rate: number): string {
    if (rate < 0.01) return '$0/hr';
    if (rate < 1) return `$${rate.toFixed(2)}/hr`;
    return `$${rate.toFixed(1)}/hr`;
  }

  function attentionColor(item: ProjectHealth): string {
    if (item.attentionScore >= 90) return 'var(--ctp-red)';
    if (item.attentionScore >= 70) return 'var(--ctp-peach)';
    if (item.attentionScore >= 40) return 'var(--ctp-yellow)';
    return 'var(--ctp-overlay1)';
  }
</script>

<div class="status-bar" data-testid="status-bar">
  <div class="left">
    {#if activeGroup}
      <span class="item group-name" title="Active group">{activeGroup.name}</span>
      <span class="sep"></span>
    {/if}
    <span class="item" title="Enabled projects">{projectCount} projects</span>
    <span class="sep"></span>

    <!-- Agent states from health store -->
    {#if health.running > 0}
      <span class="item state-running" title="Running agents">
        <span class="pulse"></span>
        {health.running} running
      </span>
      <span class="sep"></span>
    {/if}
    {#if health.idle > 0}
      <span class="item state-idle" title="Idle agents">{health.idle} idle</span>
      <span class="sep"></span>
    {/if}
    {#if health.stalled > 0}
      <span class="item state-stalled" title="Stalled agents (>15 min inactive)">
        {health.stalled} stalled
      </span>
      <span class="sep"></span>
    {/if}
    {#if totalConflicts > 0}
      <span class="item state-conflict" title="{totalConflicts} file conflict{totalConflicts > 1 ? 's' : ''} — multiple agents writing same file">
        ⚠ {totalConflicts} conflict{totalConflicts > 1 ? 's' : ''}
      </span>
      <span class="sep"></span>
    {/if}

    <!-- Attention queue toggle -->
    {#if attentionQueue.length > 0}
      <button
        class="item attention-btn"
        class:attention-open={showAttention}
        onclick={() => showAttention = !showAttention}
        title="Needs attention — click to expand"
      >
        <span class="attention-dot"></span>
        {attentionQueue.length} need attention
      </button>
    {/if}
  </div>

  <div class="right">
    {#if hasActive}
      <button
        class="item stop-all-btn"
        onclick={handleStopAll}
        disabled={stopping}
        title="Stop all agents and wake scheduler"
      >
        {#if stopping}
          Stopping...
        {:else}
          ■ Stop All
        {/if}
      </button>
      <span class="sep"></span>
    {/if}
    {#if health.totalBurnRatePerHour > 0}
      <span class="item burn-rate" title="Total burn rate across active sessions">
        {formatRate(health.totalBurnRatePerHour)}
      </span>
      <span class="sep"></span>
    {/if}
    {#if totalTokens > 0}
      <span class="item tokens">{totalTokens.toLocaleString()} tok</span>
      <span class="sep"></span>
    {/if}
    {#if totalCost > 0}
      <span class="item cost">${totalCost.toFixed(4)}</span>
      <span class="sep"></span>
    {/if}
    <NotificationCenter />
    <span class="sep"></span>
    {#if updateInfo?.available}
      <button
        class="item update-btn"
        onclick={handleUpdateClick}
        disabled={installing}
        title="Click to install v{updateInfo.version}"
      >
        {#if installing}
          Installing...
        {:else}
          Update v{updateInfo.version}
        {/if}
      </button>
      <span class="sep"></span>
    {/if}
    <span class="item version">Agent Orchestrator v3</span>
  </div>
</div>

<!-- Attention queue dropdown -->
{#if showAttention && attentionQueue.length > 0}
  <div class="attention-panel">
    {#each attentionQueue as item (item.projectId)}
      <button
        class="attention-card"
        onclick={() => focusProject(item.projectId)}
      >
        <span class="card-name">{projectName(item.projectId)}</span>
        <span class="card-reason" style="color: {attentionColor(item)}">{item.attentionReason}</span>
        {#if item.contextPressure !== null && item.contextPressure > 0.5}
          <span class="card-ctx" title="Context usage">ctx {Math.round(item.contextPressure * 100)}%</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 1.5rem;
    padding: 0 0.625rem;
    background: var(--ctp-mantle);
    border-top: 1px solid var(--ctp-surface0);
    font-size: 0.6875rem;
    color: var(--ctp-overlay1);
    font-family: 'JetBrains Mono', monospace;
    user-select: none;
    flex-shrink: 0;
    position: relative;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .sep {
    width: 1px;
    height: 0.625rem;
    background: var(--ctp-surface1);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .group-name {
    color: var(--ctp-blue);
    font-weight: 600;
  }

  /* Agent state indicators */
  .state-running {
    color: var(--ctp-green);
  }

  .state-idle {
    color: var(--ctp-overlay1);
  }

  .state-stalled {
    color: var(--ctp-peach);
    font-weight: 600;
  }

  .state-conflict {
    color: var(--ctp-red);
    font-weight: 600;
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ctp-green);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Attention button */
  .attention-btn {
    background: none;
    border: none;
    color: var(--ctp-peach);
    font: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    font-weight: 600;
  }

  .attention-btn:hover {
    color: var(--ctp-red);
  }

  .attention-btn.attention-open {
    color: var(--ctp-red);
  }

  .attention-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ctp-peach);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .attention-btn.attention-open .attention-dot,
  .attention-btn:hover .attention-dot {
    background: var(--ctp-red);
  }

  /* Stop All */
  .stop-all-btn {
    background: color-mix(in srgb, var(--ctp-red) 15%, transparent);
    border: 1px solid var(--ctp-red);
    border-radius: 0.25rem;
    color: var(--ctp-red);
    font: inherit;
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0 0.375rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    line-height: 1.25rem;
  }

  .stop-all-btn:hover {
    background: color-mix(in srgb, var(--ctp-red) 25%, transparent);
  }

  .stop-all-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Burn rate */
  .burn-rate {
    color: var(--ctp-mauve);
    font-weight: 600;
  }

  .tokens { color: var(--ctp-overlay1); }
  .cost { color: var(--ctp-yellow); }
  .version { color: var(--ctp-overlay0); }

  /* Update badge */
  .update-btn {
    background: color-mix(in srgb, var(--ctp-green) 15%, transparent);
    border: 1px solid var(--ctp-green);
    border-radius: 0.25rem;
    color: var(--ctp-green);
    font: inherit;
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0 0.375rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    line-height: 1.25rem;
  }

  .update-btn:hover {
    background: color-mix(in srgb, var(--ctp-green) 25%, transparent);
  }

  .update-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Attention panel dropdown */
  .attention-panel {
    position: absolute;
    bottom: 1.5rem;
    left: 0;
    right: 0;
    background: var(--ctp-surface0);
    border-top: 1px solid var(--ctp-surface1);
    display: flex;
    gap: 1px;
    padding: 0.25rem 0.5rem;
    z-index: 100;
    overflow-x: auto;
  }

  .attention-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font: inherit;
    font-size: 0.6875rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .attention-card:hover {
    background: var(--ctp-surface0);
    border-color: var(--ctp-surface2);
  }

  .card-name {
    font-weight: 600;
    color: var(--ctp-text);
  }

  .card-reason {
    font-size: 0.625rem;
  }

  .card-ctx {
    font-size: 0.5625rem;
    color: var(--ctp-overlay0);
    background: color-mix(in srgb, var(--ctp-yellow) 10%, transparent);
    padding: 0 0.25rem;
    border-radius: 0.125rem;
  }
</style>
