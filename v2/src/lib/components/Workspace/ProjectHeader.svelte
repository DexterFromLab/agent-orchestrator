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
</script>

<button
  class="project-header"
  class:active
  style="--accent: var({accentVar})"
  {onclick}
>
  <span class="project-icon">{project.icon || '📁'}</span>
  <span class="project-name">{project.name}</span>
  <span class="project-id">({project.identifier})</span>
</button>

<style>
  .project-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
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

  .project-icon {
    font-size: 0.85rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .project-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-id {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    white-space: nowrap;
  }
</style>
