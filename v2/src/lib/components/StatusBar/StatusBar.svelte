<script lang="ts">
  import { getAgentSessions } from '../../stores/agents.svelte';
  import { getActiveGroup, getEnabledProjects, getActiveGroupId } from '../../stores/workspace.svelte';

  let agentSessions = $derived(getAgentSessions());
  let activeGroup = $derived(getActiveGroup());
  let enabledProjects = $derived(getEnabledProjects());

  let activeAgents = $derived(agentSessions.filter(s => s.status === 'running' || s.status === 'starting').length);
  let totalCost = $derived(agentSessions.reduce((sum, s) => sum + s.costUsd, 0));
  let totalTokens = $derived(agentSessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0));
  let projectCount = $derived(enabledProjects.length);
  let agentCount = $derived(agentSessions.length);
</script>

<div class="status-bar">
  <div class="left">
    {#if activeGroup}
      <span class="item group-name" title="Active group">{activeGroup.name}</span>
      <span class="sep"></span>
    {/if}
    <span class="item" title="Enabled projects">{projectCount} projects</span>
    <span class="sep"></span>
    <span class="item" title="Agent sessions">{agentCount} agents</span>
    {#if activeAgents > 0}
      <span class="sep"></span>
      <span class="item active">
        <span class="pulse"></span>
        {activeAgents} running
      </span>
    {/if}
  </div>
  <div class="right">
    {#if totalTokens > 0}
      <span class="item tokens">{totalTokens.toLocaleString()} tokens</span>
      <span class="sep"></span>
    {/if}
    {#if totalCost > 0}
      <span class="item cost">${totalCost.toFixed(4)}</span>
      <span class="sep"></span>
    {/if}
    <span class="item version">BTerminal v3</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 10px;
    background: var(--ctp-mantle);
    border-top: 1px solid var(--ctp-surface0);
    font-size: 11px;
    color: var(--ctp-overlay1);
    font-family: 'JetBrains Mono', monospace;
    user-select: none;
    flex-shrink: 0;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--ctp-surface1);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .group-name {
    color: var(--ctp-blue);
    font-weight: 600;
  }

  .active {
    color: var(--ctp-blue);
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ctp-blue);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .tokens { color: var(--ctp-overlay1); }
  .cost { color: var(--ctp-yellow); }
  .version { color: var(--ctp-overlay0); }
</style>
