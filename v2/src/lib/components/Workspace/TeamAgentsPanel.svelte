<script lang="ts">
  import { getAgentSessions, getChildSessions, type AgentSession } from '../../stores/agents.svelte';
  import AgentCard from './AgentCard.svelte';

  interface Props {
    /** The main Claude session ID for this project */
    mainSessionId: string;
  }

  let { mainSessionId }: Props = $props();

  // Get subagent sessions spawned by the main session
  let childSessions = $derived(getChildSessions(mainSessionId));
  let hasAgents = $derived(childSessions.length > 0);
  let expanded = $state(true);
</script>

{#if hasAgents}
  <div class="team-agents-panel">
    <button class="panel-header" onclick={() => expanded = !expanded}>
      <span class="header-icon">{expanded ? '▾' : '▸'}</span>
      <span class="header-title">Team Agents</span>
      <span class="agent-count">{childSessions.length}</span>
    </button>

    {#if expanded}
      <div class="agent-list">
        {#each childSessions as child (child.id)}
          <AgentCard session={child} />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .team-agents-panel {
    border-left: 1px solid var(--ctp-surface0);
    background: var(--ctp-mantle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: 220px;
    flex-shrink: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.72rem;
    cursor: pointer;
    border-bottom: 1px solid var(--ctp-surface0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .panel-header:hover {
    color: var(--ctp-text);
  }

  .header-icon {
    font-size: 0.65rem;
  }

  .header-title {
    font-weight: 600;
  }

  .agent-count {
    margin-left: auto;
    background: var(--ctp-surface0);
    padding: 0 5px;
    border-radius: 8px;
    font-size: 0.65rem;
    color: var(--ctp-overlay1);
  }

  .agent-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
    overflow-y: auto;
    flex: 1;
  }
</style>
