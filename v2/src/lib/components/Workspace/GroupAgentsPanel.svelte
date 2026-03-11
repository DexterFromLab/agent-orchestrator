<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getActiveGroup } from '../../stores/workspace.svelte';
  import type { GroupAgentConfig, GroupAgentStatus } from '../../types/groups';
  import { getGroupAgents, setAgentStatus, type BtmsgAgent } from '../../adapters/btmsg-bridge';

  /** Runtime agent status from btmsg database */
  let btmsgAgents = $state<BtmsgAgent[]>([]);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let group = $derived(getActiveGroup());
  let agents = $derived(group?.agents ?? []);
  let hasAgents = $derived(agents.length > 0);
  let collapsed = $state(false);

  const ROLE_ICONS: Record<string, string> = {
    manager: '🎯',
    architect: '🏗',
    tester: '🧪',
    reviewer: '🔍',
  };

  const ROLE_LABELS: Record<string, string> = {
    manager: 'Manager',
    architect: 'Architect',
    tester: 'Tester',
    reviewer: 'Reviewer',
  };

  async function pollBtmsg() {
    if (!group) return;
    try {
      btmsgAgents = await getGroupAgents(group.id);
    } catch {
      // btmsg.db might not exist yet
    }
  }

  onMount(() => {
    pollBtmsg();
    pollTimer = setInterval(pollBtmsg, 5000); // Poll every 5 seconds
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  function getStatus(agentId: string): GroupAgentStatus {
    const btAgent = btmsgAgents.find(a => a.id === agentId);
    return (btAgent?.status as GroupAgentStatus) ?? 'stopped';
  }

  function getUnread(agentId: string): number {
    const btAgent = btmsgAgents.find(a => a.id === agentId);
    return btAgent?.unreadCount ?? 0;
  }

  async function toggleAgent(agent: GroupAgentConfig) {
    const current = getStatus(agent.id);
    const newStatus = current === 'stopped' ? 'active' : 'stopped';
    try {
      await setAgentStatus(agent.id, newStatus);
      await pollBtmsg(); // Refresh immediately
    } catch (e) {
      console.warn('Failed to set agent status:', e);
    }
  }
</script>

{#if hasAgents}
  <div class="group-agents-panel" class:collapsed>
    <button
      class="panel-header"
      onclick={() => collapsed = !collapsed}
    >
      <span class="header-left">
        <span class="header-icon">{collapsed ? '▸' : '▾'}</span>
        <span class="header-title">Agents</span>
        <span class="agent-count">{agents.length}</span>
      </span>
      <span class="header-right">
        {#each agents as agent (agent.id)}
          {@const status = getStatus(agent.id)}
          <span
            class="status-dot"
            class:active={status === 'active'}
            class:sleeping={status === 'sleeping'}
            class:stopped={status === 'stopped'}
            title="{ROLE_LABELS[agent.role] ?? agent.role}: {status}"
          ></span>
        {/each}
      </span>
    </button>

    {#if !collapsed}
      <div class="agents-grid">
        {#each agents as agent (agent.id)}
          {@const status = getStatus(agent.id)}
          <div class="agent-card" class:active={status === 'active'} class:sleeping={status === 'sleeping'}>
            <div class="card-top">
              <span class="agent-icon">{ROLE_ICONS[agent.role] ?? '🤖'}</span>
              <span class="agent-name">{agent.name}</span>
              <span
                class="card-status-dot"
                class:active={status === 'active'}
                class:sleeping={status === 'sleeping'}
                class:stopped={status === 'stopped'}
              ></span>
            </div>
            <div class="card-meta">
              <span class="agent-role">{ROLE_LABELS[agent.role] ?? agent.role}</span>
              {#if agent.model}
                <span class="agent-model">{agent.model}</span>
              {/if}
              {@const unread = getUnread(agent.id)}
              {#if unread > 0}
                <span class="unread-badge">{unread}</span>
              {/if}
            </div>
            <div class="card-actions">
              <button
                class="action-btn"
                class:start={status === 'stopped'}
                class:stop={status !== 'stopped'}
                onclick={() => toggleAgent(agent)}
                title={status === 'stopped' ? 'Start agent' : 'Stop agent'}
              >
                {status === 'stopped' ? '▶' : '■'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .group-agents-panel {
    flex-shrink: 0;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    cursor: pointer;
    transition: color 0.1s;
  }

  .panel-header:hover {
    color: var(--ctp-text);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .header-icon {
    font-size: 0.6rem;
    width: 0.6rem;
  }

  .header-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.6rem;
  }

  .agent-count {
    background: var(--ctp-surface0);
    color: var(--ctp-subtext0);
    border-radius: 0.5rem;
    padding: 0 0.3rem;
    font-size: 0.55rem;
    font-weight: 600;
  }

  .header-right {
    display: flex;
    gap: 0.25rem;
  }

  .status-dot, .card-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ctp-overlay0);
  }

  .status-dot.active, .card-status-dot.active {
    background: var(--ctp-green);
    box-shadow: 0 0 4px var(--ctp-green);
    animation: pulse 2s ease-in-out infinite;
  }

  .status-dot.sleeping, .card-status-dot.sleeping {
    background: var(--ctp-yellow);
    animation: pulse 3s ease-in-out infinite;
  }

  .status-dot.stopped, .card-status-dot.stopped {
    background: var(--ctp-overlay0);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .agents-grid {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem 0.375rem;
    overflow-x: auto;
  }

  .agent-card {
    flex: 0 0 auto;
    min-width: 7rem;
    padding: 0.3rem 0.4rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    transition: border-color 0.15s, background 0.15s;
  }

  .agent-card:hover {
    border-color: var(--ctp-surface1);
  }

  .agent-card.active {
    border-color: var(--ctp-green);
    background: color-mix(in srgb, var(--ctp-green) 5%, var(--ctp-base));
  }

  .agent-card.sleeping {
    border-color: var(--ctp-yellow);
    background: color-mix(in srgb, var(--ctp-yellow) 5%, var(--ctp-base));
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .agent-icon {
    font-size: 0.75rem;
  }

  .agent-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.15rem;
  }

  .agent-role {
    font-size: 0.55rem;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .agent-model {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    font-family: monospace;
  }

  .card-actions {
    margin-top: 0.2rem;
    display: flex;
    justify-content: flex-end;
  }

  .action-btn {
    background: transparent;
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
    font-size: 0.6rem;
    padding: 0.1rem 0.3rem;
    border-radius: 0.15rem;
    cursor: pointer;
    transition: all 0.1s;
  }

  .action-btn.start:hover {
    background: var(--ctp-green);
    color: var(--ctp-base);
    border-color: var(--ctp-green);
  }

  .action-btn.stop:hover {
    background: var(--ctp-red);
    color: var(--ctp-base);
    border-color: var(--ctp-red);
  }

  .unread-badge {
    background: var(--ctp-red);
    color: var(--ctp-base);
    border-radius: 0.5rem;
    padding: 0 0.25rem;
    font-size: 0.5rem;
    font-weight: 700;
    min-width: 0.75rem;
    text-align: center;
  }
</style>
