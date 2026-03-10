<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import { PROJECT_ACCENTS } from '../../types/groups';
  import type { ProjectHealth } from '../../stores/health.svelte';

  interface Props {
    project: ProjectConfig;
    slotIndex: number;
    active: boolean;
    health: ProjectHealth | null;
    onclick: () => void;
  }

  let { project, slotIndex, active, health, onclick }: Props = $props();

  let accentVar = $derived(PROJECT_ACCENTS[slotIndex % PROJECT_ACCENTS.length]);

  /** Shorten home dir for display */
  let displayCwd = $derived(() => {
    const home = '/home/';
    const cwd = project.cwd || '~';
    if (cwd.startsWith(home)) {
      const afterHome = cwd.slice(home.length);
      const slashIdx = afterHome.indexOf('/');
      if (slashIdx >= 0) return '~' + afterHome.slice(slashIdx);
      return '~';
    }
    return cwd;
  });

  let statusDotClass = $derived(() => {
    if (!health) return 'dot-inactive';
    switch (health.activityState) {
      case 'running': return 'dot-running';
      case 'idle': return 'dot-idle';
      case 'stalled': return 'dot-stalled';
      default: return 'dot-inactive';
    }
  });

  let statusTooltip = $derived(() => {
    if (!health) return 'No active session';
    switch (health.activityState) {
      case 'running': return health.activeTool ? `Running: ${health.activeTool}` : 'Running';
      case 'idle': {
        const secs = Math.floor(health.idleDurationMs / 1000);
        return secs < 60 ? `Idle (${secs}s)` : `Idle (${Math.floor(secs / 60)}m ${secs % 60}s)`;
      }
      case 'stalled': {
        const mins = Math.floor(health.idleDurationMs / 60_000);
        return `Stalled — ${mins} min since last activity`;
      }
      default: return 'Inactive';
    }
  });

  let contextPct = $derived(health?.contextPressure !== null && health?.contextPressure !== undefined
    ? Math.round(health.contextPressure * 100)
    : null);

  let ctxColor = $derived(() => {
    if (contextPct === null) return '';
    if (contextPct > 90) return 'var(--ctp-red)';
    if (contextPct > 75) return 'var(--ctp-peach)';
    if (contextPct > 50) return 'var(--ctp-yellow)';
    return 'var(--ctp-overlay0)';
  });
</script>

<button
  class="project-header"
  class:active
  style="--accent: var({accentVar})"
  {onclick}
>
  <div class="header-main">
    <span class="status-dot {statusDotClass()}" title={statusTooltip()}></span>
    <span class="project-icon">{project.icon || '📁'}</span>
    <span class="project-name">{project.name}</span>
    <span class="project-id">({project.identifier})</span>
  </div>
  <div class="header-info">
    {#if health && health.fileConflictCount > 0}
      <span class="info-conflict" title="{health.fileConflictCount} file conflict{health.fileConflictCount > 1 ? 's' : ''} — multiple agents writing same file">
        ⚠ {health.fileConflictCount} conflict{health.fileConflictCount > 1 ? 's' : ''}
      </span>
      <span class="info-sep">·</span>
    {/if}
    {#if contextPct !== null && contextPct > 0}
      <span class="info-ctx" style="color: {ctxColor()}" title="Context window usage">ctx {contextPct}%</span>
      <span class="info-sep">·</span>
    {/if}
    {#if health && health.burnRatePerHour > 0.01}
      <span class="info-rate" title="Burn rate">
        ${health.burnRatePerHour < 1 ? health.burnRatePerHour.toFixed(2) : health.burnRatePerHour.toFixed(1)}/hr
      </span>
      <span class="info-sep">·</span>
    {/if}
    <span class="info-cwd" title={project.cwd}>{displayCwd()}</span>
    {#if project.profile}
      <span class="info-sep">·</span>
      <span class="info-profile" title={project.profile}>{project.profile}</span>
    {/if}
  </div>
</button>

<style>
  .project-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-mantle);
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ctp-subtext0);
    font-size: 0.78rem;
    cursor: pointer;
    flex-shrink: 0;
    width: 100%;
    text-align: left;
    transition: color 0.15s, border-color 0.15s;
  }

  .project-header:hover {
    color: var(--ctp-text);
  }

  .project-header.active {
    color: var(--ctp-text);
    border-bottom-color: var(--accent);
  }

  .header-main {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    flex-shrink: 0;
  }

  /* Status dot */
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-inactive {
    background: var(--ctp-surface2);
  }

  .dot-running {
    background: var(--ctp-green);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .dot-idle {
    background: var(--ctp-overlay0);
  }

  .dot-stalled {
    background: var(--ctp-peach);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .project-icon {
    font-size: 0.85rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .project-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .project-id {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    flex-shrink: 1;
    overflow: hidden;
  }

  .info-ctx {
    font-size: 0.6rem;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
  }

  .info-rate {
    font-size: 0.6rem;
    color: var(--ctp-mauve);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
  }

  .info-cwd {
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
    unicode-bidi: plaintext;
    max-width: 12rem;
  }

  .info-sep {
    color: var(--ctp-surface2);
    font-size: 0.6rem;
    flex-shrink: 0;
  }

  .info-conflict {
    font-size: 0.6rem;
    color: var(--ctp-red);
    font-weight: 600;
    white-space: nowrap;
    background: color-mix(in srgb, var(--ctp-red) 12%, transparent);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
  }

  .info-profile {
    font-size: 0.65rem;
    color: var(--ctp-blue);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 8rem;
    background: color-mix(in srgb, var(--ctp-blue) 10%, transparent);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.1875rem;
  }
</style>
