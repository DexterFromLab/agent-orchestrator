<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getAuditLog, type AuditEntry, type AuditEventType } from '../../adapters/audit-bridge';
  import { getGroupAgents, type BtmsgAgent } from '../../adapters/btmsg-bridge';
  import type { GroupId, AgentId } from '../../types/ids';

  interface Props {
    groupId: GroupId;
  }

  let { groupId }: Props = $props();

  const EVENT_TYPES: AuditEventType[] = [
    'prompt_injection',
    'wake_event',
    'btmsg_sent',
    'btmsg_received',
    'status_change',
    'heartbeat_missed',
    'dead_letter',
  ];

  const EVENT_COLORS: Record<string, string> = {
    prompt_injection: 'var(--ctp-mauve)',
    wake_event: 'var(--ctp-peach)',
    btmsg_sent: 'var(--ctp-blue)',
    btmsg_received: 'var(--ctp-teal)',
    status_change: 'var(--ctp-green)',
    heartbeat_missed: 'var(--ctp-yellow)',
    dead_letter: 'var(--ctp-red)',
  };

  const ROLE_COLORS: Record<string, string> = {
    manager: 'var(--ctp-mauve)',
    architect: 'var(--ctp-blue)',
    tester: 'var(--ctp-green)',
    reviewer: 'var(--ctp-peach)',
    project: 'var(--ctp-text)',
    admin: 'var(--ctp-overlay1)',
  };

  let entries = $state<AuditEntry[]>([]);
  let agents = $state<BtmsgAgent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Filters
  let enabledTypes = $state<Set<string>>(new Set(EVENT_TYPES));
  let selectedAgent = $state<string>('all');

  let filteredEntries = $derived.by(() => {
    return entries
      .filter(e => enabledTypes.has(e.eventType))
      .filter(e => selectedAgent === 'all' || e.agentId === selectedAgent)
      .slice(0, 200);
  });

  function agentName(agentId: string): string {
    const agent = agents.find(a => a.id === agentId);
    return agent?.name ?? agentId;
  }

  function agentRole(agentId: string): string {
    const agent = agents.find(a => a.id === agentId);
    return agent?.role ?? 'unknown';
  }

  function toggleType(type: string) {
    const next = new Set(enabledTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    enabledTypes = next;
  }

  function formatTime(createdAt: string): string {
    try {
      const d = new Date(createdAt + 'Z');
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return createdAt;
    }
  }

  async function fetchData() {
    try {
      const [auditData, agentData] = await Promise.all([
        getAuditLog(groupId, 200, 0),
        getGroupAgents(groupId),
      ]);
      entries = auditData;
      agents = agentData;
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchData();
    pollTimer = setInterval(fetchData, 5_000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

<div class="audit-log-tab">
  <div class="audit-toolbar">
    <div class="filter-types">
      {#each EVENT_TYPES as type}
        <button
          class="type-chip"
          class:active={enabledTypes.has(type)}
          style="--chip-color: {EVENT_COLORS[type] ?? 'var(--ctp-overlay1)'}"
          onclick={() => toggleType(type)}
        >
          {type.replace(/_/g, ' ')}
        </button>
      {/each}
    </div>
    <select
      class="agent-select"
      bind:value={selectedAgent}
    >
      <option value="all">All agents</option>
      {#each agents.filter(a => a.id !== 'admin') as agent}
        <option value={agent.id}>{agent.name} ({agent.role})</option>
      {/each}
    </select>
  </div>

  <div class="audit-entries">
    {#if loading}
      <div class="audit-empty">Loading audit log...</div>
    {:else if error}
      <div class="audit-empty audit-error">Error: {error}</div>
    {:else if filteredEntries.length === 0}
      <div class="audit-empty">No audit events yet</div>
    {:else}
      {#each filteredEntries as entry (entry.id)}
        <div class="audit-entry">
          <span class="entry-time">{formatTime(entry.createdAt)}</span>
          <span
            class="entry-agent"
            style="color: {ROLE_COLORS[agentRole(entry.agentId)] ?? 'var(--ctp-text)'}"
          >
            {agentName(entry.agentId)}
          </span>
          <span
            class="entry-type"
            style="--badge-color: {EVENT_COLORS[entry.eventType] ?? 'var(--ctp-overlay1)'}"
          >
            {entry.eventType.replace(/_/g, ' ')}
          </span>
          <span class="entry-detail">{entry.detail}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .audit-log-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 0.8rem;
    flex: 1;
  }

  .audit-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
    background: var(--ctp-mantle);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .filter-types {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .type-chip {
    font-size: 0.6rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--chip-color);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--chip-color);
    cursor: pointer;
    text-transform: capitalize;
    transition: background 0.12s, color 0.12s;
    font-family: inherit;
    opacity: 0.4;
  }

  .type-chip.active {
    background: color-mix(in srgb, var(--chip-color) 15%, transparent);
    opacity: 1;
  }

  .type-chip:hover {
    background: color-mix(in srgb, var(--chip-color) 25%, transparent);
    opacity: 1;
  }

  .agent-select {
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    cursor: pointer;
    font-family: inherit;
  }

  .audit-entries {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0;
  }

  .audit-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
  }

  .audit-error {
    color: var(--ctp-red);
  }

  .audit-entry {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.1875rem 0.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--ctp-surface0) 50%, transparent);
    line-height: 1.4;
  }

  .audit-entry:hover {
    background: var(--ctp-surface0);
  }

  .entry-time {
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .entry-agent {
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 5rem;
  }

  .entry-type {
    font-size: 0.6rem;
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.1875rem;
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    color: var(--badge-color);
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    text-transform: capitalize;
  }

  .entry-detail {
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
