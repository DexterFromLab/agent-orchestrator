<script lang="ts">
  import { getPanes } from '../../stores/layout.svelte';
  import { getAgentSessions } from '../../stores/agents.svelte';

  let panes = $derived(getPanes());
  let agentSessions = $derived(getAgentSessions());

  let activeAgents = $derived(agentSessions.filter(s => s.status === 'running' || s.status === 'starting').length);
  let totalCost = $derived(agentSessions.reduce((sum, s) => sum + s.costUsd, 0));
  let totalTokens = $derived(agentSessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0));
  let terminalCount = $derived(panes.filter(p => p.type === 'terminal').length);
  let agentCount = $derived(panes.filter(p => p.type === 'agent').length);
</script>

<div class="status-bar">
  <div class="left">
    <span class="item" title="Terminal panes">{terminalCount} terminals</span>
    <span class="sep"></span>
    <span class="item" title="Agent panes">{agentCount} agents</span>
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
    <span class="item version">BTerminal v2</span>
  </div>
</div>

<style>
  .status-bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 10px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    user-select: none;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--border);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
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
