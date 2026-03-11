<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ProjectConfig } from '../../types/groups';
  import type { ProjectHealth } from '../../stores/health.svelte';
  import type { GroupId, ProjectId as ProjectIdType } from '../../types/ids';
  import { getProjectHealth, getAllProjectHealth, getHealthAggregates } from '../../stores/health.svelte';
  import { getAgentSession } from '../../stores/agents.svelte';
  import { listTasks, type Task } from '../../adapters/bttask-bridge';
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    project: ProjectConfig;
    groupId?: GroupId;
  }

  let { project, groupId }: Props = $props();

  // --- View toggle ---
  type MetricsView = 'live' | 'history';
  let activeView = $state<MetricsView>('live');

  // --- Live view state ---
  let taskCounts = $state<Record<string, number>>({ todo: 0, progress: 0, review: 0, done: 0, blocked: 0 });
  let taskPollTimer: ReturnType<typeof setInterval> | null = null;

  // --- History view state ---
  interface MetricPoint {
    endTime: number;
    costUsd: number;
    peakTokens: number;
    turnCount: number;
    toolCallCount: number;
    durationMin: number;
  }
  let historyData = $state<MetricPoint[]>([]);
  let historyLoading = $state(false);
  type HistoryMetric = 'cost' | 'tokens' | 'turns' | 'tools' | 'duration';
  let selectedHistoryMetric = $state<HistoryMetric>('cost');

  // --- Derived live data ---
  let health = $derived(getProjectHealth(project.id));
  let aggregates = $derived(getHealthAggregates());
  let allHealth = $derived(getAllProjectHealth());

  let session = $derived.by(() => {
    if (!health?.sessionId) return undefined;
    return getAgentSession(health.sessionId);
  });

  // --- Task polling ---
  async function fetchTaskCounts() {
    if (!groupId) return;
    try {
      const tasks = await listTasks(groupId);
      const counts: Record<string, number> = { todo: 0, progress: 0, review: 0, done: 0, blocked: 0 };
      for (const t of tasks) {
        if (counts[t.status] !== undefined) counts[t.status]++;
      }
      taskCounts = counts;
    } catch {
      // bttask db may not exist yet
    }
  }

  // --- History loading ---
  async function loadHistory() {
    historyLoading = true;
    try {
      const metrics = await invoke<Array<{
        id: number;
        project_id: string;
        session_id: string;
        start_time: number;
        end_time: number;
        peak_tokens: number;
        turn_count: number;
        tool_call_count: number;
        cost_usd: number;
        model: string | null;
        status: string;
        error_message: string | null;
      }>>('session_metrics_load', { projectId: project.id, limit: 50 });

      historyData = metrics.reverse().map(m => ({
        endTime: m.end_time,
        costUsd: m.cost_usd,
        peakTokens: m.peak_tokens,
        turnCount: m.turn_count,
        toolCallCount: m.tool_call_count,
        durationMin: Math.max(0.1, (m.end_time - m.start_time) / 60_000),
      }));
    } catch (e) {
      console.warn('Failed to load metrics history:', e);
      historyData = [];
    }
    historyLoading = false;
  }

  // --- SVG sparkline helpers ---
  function sparklinePath(points: number[], width: number, height: number): string {
    if (points.length < 2) return '';
    const max = Math.max(...points, 0.001);
    const step = width / (points.length - 1);
    return points
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function getHistoryValues(metric: HistoryMetric): number[] {
    switch (metric) {
      case 'cost': return historyData.map(d => d.costUsd);
      case 'tokens': return historyData.map(d => d.peakTokens);
      case 'turns': return historyData.map(d => d.turnCount);
      case 'tools': return historyData.map(d => d.toolCallCount);
      case 'duration': return historyData.map(d => d.durationMin);
    }
  }

  function formatMetricValue(metric: HistoryMetric, value: number): string {
    switch (metric) {
      case 'cost': return `$${value.toFixed(4)}`;
      case 'tokens': return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${value}`;
      case 'turns': return `${value}`;
      case 'tools': return `${value}`;
      case 'duration': return `${value.toFixed(1)}m`;
    }
  }

  const METRIC_LABELS: Record<HistoryMetric, string> = {
    cost: 'Cost (USD)',
    tokens: 'Peak Tokens',
    turns: 'Turns',
    tools: 'Tool Calls',
    duration: 'Duration',
  };

  const METRIC_COLORS: Record<HistoryMetric, string> = {
    cost: 'var(--ctp-yellow)',
    tokens: 'var(--ctp-blue)',
    turns: 'var(--ctp-green)',
    tools: 'var(--ctp-mauve)',
    duration: 'var(--ctp-peach)',
  };

  // --- Formatting helpers ---
  function fmtBurnRate(rate: number): string {
    if (rate === 0) return '$0/hr';
    if (rate < 0.01) return `$${(rate * 100).toFixed(1)}c/hr`;
    return `$${rate.toFixed(2)}/hr`;
  }

  function fmtPressure(p: number | null): string {
    if (p === null) return '—';
    return `${Math.round(p * 100)}%`;
  }

  function pressureColor(p: number | null): string {
    if (p === null) return 'var(--ctp-overlay0)';
    if (p > 0.9) return 'var(--ctp-red)';
    if (p > 0.75) return 'var(--ctp-peach)';
    if (p > 0.5) return 'var(--ctp-yellow)';
    return 'var(--ctp-green)';
  }

  function stateColor(state: string): string {
    switch (state) {
      case 'running': return 'var(--ctp-green)';
      case 'idle': return 'var(--ctp-overlay1)';
      case 'stalled': return 'var(--ctp-peach)';
      default: return 'var(--ctp-overlay0)';
    }
  }

  function fmtIdle(ms: number): string {
    if (ms === 0) return '—';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }

  // --- Lifecycle ---
  onMount(() => {
    fetchTaskCounts();
    taskPollTimer = setInterval(fetchTaskCounts, 10_000);
  });

  onDestroy(() => {
    if (taskPollTimer) clearInterval(taskPollTimer);
  });

  // Load history when switching to history view
  $effect(() => {
    if (activeView === 'history' && historyData.length === 0) {
      loadHistory();
    }
  });
</script>

<div class="metrics-panel">
  <!-- View tabs -->
  <div class="view-tabs">
    <button
      class="vtab"
      class:active={activeView === 'live'}
      onclick={() => activeView = 'live'}
    >Live</button>
    <button
      class="vtab"
      class:active={activeView === 'history'}
      onclick={() => activeView = 'history'}
    >History</button>
  </div>

  {#if activeView === 'live'}
    <div class="live-view">
      <!-- Aggregates bar -->
      <div class="agg-bar">
        <div class="agg-item">
          <span class="agg-label">Fleet</span>
          <span class="agg-badges">
            {#if aggregates.running > 0}
              <span class="agg-badge" style="color: var(--ctp-green)">{aggregates.running} running</span>
            {/if}
            {#if aggregates.idle > 0}
              <span class="agg-badge" style="color: var(--ctp-overlay1)">{aggregates.idle} idle</span>
            {/if}
            {#if aggregates.stalled > 0}
              <span class="agg-badge" style="color: var(--ctp-peach)">{aggregates.stalled} stalled</span>
            {/if}
          </span>
        </div>
        <div class="agg-item">
          <span class="agg-label">Burn</span>
          <span class="agg-value" style="color: var(--ctp-mauve)">{fmtBurnRate(aggregates.totalBurnRatePerHour)}</span>
        </div>
      </div>

      <!-- This project's health -->
      {#if health}
        <div class="section-header">This Project</div>
        <div class="health-grid">
          <div class="health-card">
            <span class="hc-label">Status</span>
            <span class="hc-value" style="color: {stateColor(health.activityState)}">
              {health.activityState}
              {#if health.activeTool}
                <span class="hc-tool">({health.activeTool})</span>
              {/if}
            </span>
          </div>
          <div class="health-card">
            <span class="hc-label">Burn Rate</span>
            <span class="hc-value" style="color: var(--ctp-mauve)">{fmtBurnRate(health.burnRatePerHour)}</span>
          </div>
          <div class="health-card">
            <span class="hc-label">Context</span>
            <span class="hc-value" style="color: {pressureColor(health.contextPressure)}">{fmtPressure(health.contextPressure)}</span>
          </div>
          <div class="health-card">
            <span class="hc-label">Idle</span>
            <span class="hc-value">{fmtIdle(health.idleDurationMs)}</span>
          </div>
          {#if session}
            <div class="health-card">
              <span class="hc-label">Tokens</span>
              <span class="hc-value" style="color: var(--ctp-blue)">{(session.inputTokens + session.outputTokens).toLocaleString()}</span>
            </div>
            <div class="health-card">
              <span class="hc-label">Cost</span>
              <span class="hc-value" style="color: var(--ctp-yellow)">${session.costUsd.toFixed(4)}</span>
            </div>
            <div class="health-card">
              <span class="hc-label">Turns</span>
              <span class="hc-value">{session.numTurns}</span>
            </div>
            <div class="health-card">
              <span class="hc-label">Model</span>
              <span class="hc-value hc-model">{session.model ?? '—'}</span>
            </div>
          {/if}
          {#if health.fileConflictCount > 0}
            <div class="health-card health-warn">
              <span class="hc-label">Conflicts</span>
              <span class="hc-value" style="color: var(--ctp-red)">{health.fileConflictCount}</span>
            </div>
          {/if}
          {#if health.externalConflictCount > 0}
            <div class="health-card health-warn">
              <span class="hc-label">External</span>
              <span class="hc-value" style="color: var(--ctp-peach)">{health.externalConflictCount}</span>
            </div>
          {/if}
          {#if health.attentionScore > 0}
            <div class="health-card health-attention">
              <span class="hc-label">Attention</span>
              <span class="hc-value" style="color: {health.attentionScore >= 90 ? 'var(--ctp-red)' : health.attentionScore >= 70 ? 'var(--ctp-peach)' : 'var(--ctp-yellow)'}">{health.attentionScore}</span>
              {#if health.attentionReason}
                <span class="hc-reason">{health.attentionReason}</span>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty-state">No health data — start an agent session</div>
      {/if}

      <!-- Task board summary -->
      {#if groupId}
        <div class="section-header">Task Board</div>
        <div class="task-summary">
          {#each ['todo', 'progress', 'review', 'done', 'blocked'] as status}
            <div class="task-col" class:task-col-blocked={status === 'blocked' && taskCounts[status] > 0}>
              <span class="tc-count" class:tc-zero={taskCounts[status] === 0}>{taskCounts[status]}</span>
              <span class="tc-label">{status === 'progress' ? 'In Prog' : status === 'todo' ? 'To Do' : status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Attention queue (cross-project) -->
      {#if allHealth.filter(h => h.attentionScore > 0).length > 0}
        <div class="section-header">Attention Queue</div>
        <div class="attention-list">
          {#each allHealth.filter(h => h.attentionScore > 0).slice(0, 5) as item}
            <div class="attention-row">
              <span class="ar-score" style="color: {item.attentionScore >= 90 ? 'var(--ctp-red)' : item.attentionScore >= 70 ? 'var(--ctp-peach)' : 'var(--ctp-yellow)'}">{item.attentionScore}</span>
              <span class="ar-id">{item.projectId.slice(0, 8)}</span>
              <span class="ar-reason">{item.attentionReason ?? '—'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- History view -->
    <div class="history-view">
      {#if historyLoading}
        <div class="empty-state">Loading history...</div>
      {:else if historyData.length === 0}
        <div class="empty-state">No session history for this project</div>
      {:else}
        <!-- Metric selector -->
        <div class="metric-tabs">
          {#each (['cost', 'tokens', 'turns', 'tools', 'duration'] as const) as metric}
            <button
              class="mtab"
              class:active={selectedHistoryMetric === metric}
              onclick={() => selectedHistoryMetric = metric}
              style={selectedHistoryMetric === metric ? `border-bottom-color: ${METRIC_COLORS[metric]}` : ''}
            >{METRIC_LABELS[metric]}</button>
          {/each}
        </div>

        <!-- Sparkline chart -->
        {@const values = getHistoryValues(selectedHistoryMetric)}
        {@const maxVal = Math.max(...values, 0.001)}
        {@const minVal = Math.min(...values)}
        {@const lastVal = values[values.length - 1] ?? 0}
        {@const avgVal = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0}

        <div class="sparkline-container">
          <svg viewBox="0 0 400 120" class="sparkline-svg" preserveAspectRatio="none">
            <!-- Grid lines -->
            <line x1="0" y1="30" x2="400" y2="30" stroke="var(--ctp-surface0)" stroke-width="0.5" />
            <line x1="0" y1="60" x2="400" y2="60" stroke="var(--ctp-surface0)" stroke-width="0.5" />
            <line x1="0" y1="90" x2="400" y2="90" stroke="var(--ctp-surface0)" stroke-width="0.5" />

            <!-- Area fill -->
            <path
              d="{sparklinePath(values, 400, 110)} L400,110 L0,110 Z"
              fill={METRIC_COLORS[selectedHistoryMetric]}
              opacity="0.08"
            />

            <!-- Line -->
            <path
              d={sparklinePath(values, 400, 110)}
              fill="none"
              stroke={METRIC_COLORS[selectedHistoryMetric]}
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- Last point dot -->
            {#if values.length > 0}
              {@const lastX = 400}
              {@const lastY = 110 - (lastVal / maxVal) * 110}
              <circle cx={lastX} cy={lastY} r="3" fill={METRIC_COLORS[selectedHistoryMetric]} />
            {/if}
          </svg>
        </div>

        <!-- Stats row -->
        <div class="stats-row">
          <div class="stat">
            <span class="stat-label">Last</span>
            <span class="stat-value" style="color: {METRIC_COLORS[selectedHistoryMetric]}">{formatMetricValue(selectedHistoryMetric, lastVal)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Avg</span>
            <span class="stat-value">{formatMetricValue(selectedHistoryMetric, avgVal)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max</span>
            <span class="stat-value">{formatMetricValue(selectedHistoryMetric, maxVal)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Min</span>
            <span class="stat-value">{formatMetricValue(selectedHistoryMetric, minVal)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Sessions</span>
            <span class="stat-value">{historyData.length}</span>
          </div>
        </div>

        <!-- Session table -->
        <div class="section-header">Recent Sessions</div>
        <div class="session-table">
          <div class="st-header">
            <span class="st-col st-col-time">Time</span>
            <span class="st-col st-col-dur">Dur</span>
            <span class="st-col st-col-cost">Cost</span>
            <span class="st-col st-col-tok">Tokens</span>
            <span class="st-col st-col-turns">Turns</span>
            <span class="st-col st-col-tools">Tools</span>
          </div>
          {#each historyData.slice(-10).reverse() as row}
            <div class="st-row">
              <span class="st-col st-col-time">{new Date(row.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span class="st-col st-col-dur">{row.durationMin.toFixed(0)}m</span>
              <span class="st-col st-col-cost" style="color: var(--ctp-yellow)">${row.costUsd.toFixed(3)}</span>
              <span class="st-col st-col-tok">{row.peakTokens >= 1000 ? `${(row.peakTokens / 1000).toFixed(0)}K` : row.peakTokens}</span>
              <span class="st-col st-col-turns">{row.turnCount}</span>
              <span class="st-col st-col-tools">{row.toolCallCount}</span>
            </div>
          {/each}
        </div>

        <button class="refresh-btn" onclick={loadHistory}>Refresh</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .metrics-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.8rem;
    color: var(--ctp-text);
  }

  /* --- View tabs --- */
  .view-tabs {
    display: flex;
    gap: 0;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .vtab {
    flex: 1;
    padding: 0.375rem 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }

  .vtab:hover { color: var(--ctp-subtext1); }
  .vtab.active {
    color: var(--ctp-text);
    border-bottom-color: var(--accent, var(--ctp-blue));
    font-weight: 600;
  }

  /* --- Live view --- */
  .live-view {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .agg-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: var(--ctp-mantle);
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
  }

  .agg-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .agg-label {
    color: var(--ctp-overlay0);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .agg-badges {
    display: flex;
    gap: 0.375rem;
  }

  .agg-badge {
    font-size: 0.7rem;
    font-weight: 500;
  }

  .agg-value {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .section-header {
    color: var(--ctp-overlay0);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.25rem 0 0.125rem;
    font-weight: 600;
  }

  /* --- Health grid --- */
  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
    gap: 0.375rem;
  }

  .health-card {
    padding: 0.375rem 0.5rem;
    background: var(--ctp-mantle);
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .health-warn { border-color: color-mix(in srgb, var(--ctp-peach) 30%, var(--ctp-surface0)); }
  .health-attention { border-color: color-mix(in srgb, var(--ctp-yellow) 30%, var(--ctp-surface0)); }

  .hc-label {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hc-value {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .hc-tool {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--ctp-overlay1);
  }

  .hc-model {
    font-size: 0.6rem;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hc-reason {
    font-size: 0.6rem;
    color: var(--ctp-subtext0);
    font-weight: 400;
  }

  /* --- Task summary --- */
  .task-summary {
    display: flex;
    gap: 0.25rem;
  }

  .task-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.375rem 0.25rem;
    background: var(--ctp-mantle);
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
  }

  .task-col-blocked {
    border-color: color-mix(in srgb, var(--ctp-red) 30%, var(--ctp-surface0));
  }

  .tc-count {
    font-size: 1rem;
    font-weight: 700;
    color: var(--ctp-text);
    line-height: 1;
  }

  .tc-zero { color: var(--ctp-overlay0); }

  .tc-label {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* --- Attention queue --- */
  .attention-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .attention-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-mantle);
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
    font-size: 0.7rem;
  }

  .ar-score { font-weight: 700; min-width: 1.5rem; }
  .ar-id { color: var(--ctp-overlay1); font-family: monospace; font-size: 0.65rem; }
  .ar-reason { color: var(--ctp-subtext0); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* --- History view --- */
  .history-view {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .metric-tabs {
    display: flex;
    gap: 0;
    flex-shrink: 0;
  }

  .mtab {
    flex: 1;
    padding: 0.25rem 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.6rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: color 0.12s;
  }

  .mtab:hover { color: var(--ctp-subtext1); }
  .mtab.active { color: var(--ctp-text); font-weight: 600; }

  /* --- Sparkline --- */
  .sparkline-container {
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    padding: 0.5rem;
  }

  .sparkline-svg {
    width: 100%;
    height: 7.5rem;
  }

  /* --- Stats row --- */
  .stats-row {
    display: flex;
    gap: 0.25rem;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.0625rem;
    padding: 0.25rem;
    background: var(--ctp-mantle);
    border-radius: 0.25rem;
    border: 1px solid var(--ctp-surface0);
  }

  .stat-label {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
  }

  /* --- Session table --- */
  .session-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.65rem;
    font-family: monospace;
  }

  .st-header {
    display: flex;
    gap: 0;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--ctp-surface0);
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.55rem;
    font-family: system-ui, sans-serif;
  }

  .st-row {
    display: flex;
    gap: 0;
    padding: 0.1875rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--ctp-surface0) 40%, transparent);
    color: var(--ctp-subtext0);
  }

  .st-row:hover { background: color-mix(in srgb, var(--ctp-surface0) 30%, transparent); }

  .st-col { text-align: right; padding: 0 0.25rem; }
  .st-col-time { flex: 1.2; text-align: left; }
  .st-col-dur { flex: 0.8; }
  .st-col-cost { flex: 1; }
  .st-col-tok { flex: 1; }
  .st-col-turns { flex: 0.7; }
  .st-col-tools { flex: 0.7; }

  /* --- Misc --- */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .refresh-btn {
    align-self: center;
    padding: 0.25rem 0.75rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    font-size: 0.65rem;
    cursor: pointer;
    transition: background 0.12s;
  }

  .refresh-btn:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }
</style>
