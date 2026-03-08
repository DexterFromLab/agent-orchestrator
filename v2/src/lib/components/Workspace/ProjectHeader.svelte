<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import { PROJECT_ACCENTS } from '../../types/groups';

  interface Props {
    project: ProjectConfig;
    slotIndex: number;
    active: boolean;
    onclick: () => void;
  }

  let { project, slotIndex, active, onclick }: Props = $props();

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
</script>

<button
  class="project-header"
  class:active
  style="--accent: var({accentVar})"
  {onclick}
>
  <div class="header-main">
    <span class="project-icon">{project.icon || '📁'}</span>
    <span class="project-name">{project.name}</span>
    <span class="project-id">({project.identifier})</span>
  </div>
  <div class="header-info">
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
