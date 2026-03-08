<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import { PROJECT_ACCENTS } from '../../types/groups';
  import ProjectHeader from './ProjectHeader.svelte';
  import ClaudeSession from './ClaudeSession.svelte';
  import TerminalTabs from './TerminalTabs.svelte';
  import TeamAgentsPanel from './TeamAgentsPanel.svelte';

  interface Props {
    project: ProjectConfig;
    slotIndex: number;
    active: boolean;
    onactivate: () => void;
  }

  let { project, slotIndex, active, onactivate }: Props = $props();

  let accentVar = $derived(PROJECT_ACCENTS[slotIndex % PROJECT_ACCENTS.length]);
  let mainSessionId = $state<string | null>(null);
</script>

<div
  class="project-box"
  class:active
  style="--accent: var({accentVar})"
>
  <ProjectHeader
    {project}
    {slotIndex}
    {active}
    onclick={onactivate}
  />

  <div class="project-session-area">
    <ClaudeSession {project} onsessionid={(id) => mainSessionId = id} />
    {#if mainSessionId}
      <TeamAgentsPanel {mainSessionId} />
    {/if}
  </div>

  <div class="project-terminal-area">
    <TerminalTabs {project} />
  </div>
</div>

<style>
  .project-box {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-width: 30rem;
    scroll-snap-align: start;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.375rem;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .project-box.active {
    border-color: var(--accent);
  }

  .project-session-area {
    display: flex;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .project-terminal-area {
    height: 16rem;
    min-height: 8rem;
    border-top: 1px solid var(--ctp-surface0);
  }
</style>
