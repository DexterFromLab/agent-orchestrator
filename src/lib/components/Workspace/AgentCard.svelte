<script lang="ts">
  import type { AgentSession } from '../../stores/agents.svelte';

  interface Props {
    session: AgentSession;
    onclick?: () => void;
  }

  let { session, onclick }: Props = $props();

  let statusColor = $derived(
    session.status === 'running' ? 'var(--ctp-green)' :
    session.status === 'done' ? 'var(--ctp-blue)' :
    session.status === 'error' ? 'var(--ctp-red)' :
    'var(--ctp-overlay0)'
  );

  let truncatedPrompt = $derived(
    session.prompt.length > 60
      ? session.prompt.slice(0, 60) + '...'
      : session.prompt
  );
</script>

<div class="agent-card" role="button" tabindex="0" {onclick} onkeydown={e => e.key === 'Enter' && onclick?.()}>
  <div class="card-header">
    <span class="status-dot" style="background: {statusColor}"></span>
    <span class="agent-status">{session.status}</span>
    {#if session.costUsd > 0}
      <span class="agent-cost">${session.costUsd.toFixed(4)}</span>
    {/if}
  </div>
  <div class="card-prompt">{truncatedPrompt}</div>
  {#if session.status === 'running'}
    <div class="card-progress">
      <span class="turns">{session.numTurns} turns</span>
    </div>
  {/if}
</div>

<style>
  .agent-card {
    padding: 0.375rem 0.5rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background 0.1s;
    border-left: 2px solid transparent;
  }

  .agent-card:hover {
    background: var(--ctp-surface1);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.1875rem;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-status {
    font-size: 0.65rem;
    color: var(--ctp-overlay1);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .agent-cost {
    margin-left: auto;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    font-family: monospace;
  }

  .card-prompt {
    font-size: 0.72rem;
    color: var(--ctp-subtext0);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-progress {
    margin-top: 0.1875rem;
  }

  .turns {
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
  }
</style>
