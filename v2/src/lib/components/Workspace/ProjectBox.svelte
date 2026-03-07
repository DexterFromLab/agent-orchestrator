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
    display: flex;
    flex-direction: column;
    min-width: 480px;
    scroll-snap-align: start;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface0);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .project-box.active {
    border-color: var(--accent);
  }

  .project-session-area {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
    position: relative;
    display: flex;
  }

  .project-terminal-area {
    flex-shrink: 0;
    min-height: 120px;
    border-top: 1px solid var(--ctp-surface0);
  }

</style>
