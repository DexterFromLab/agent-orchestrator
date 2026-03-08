<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import { PROJECT_ACCENTS } from '../../types/groups';
  import ProjectHeader from './ProjectHeader.svelte';
  import ClaudeSession from './ClaudeSession.svelte';
  import TerminalTabs from './TerminalTabs.svelte';
  import TeamAgentsPanel from './TeamAgentsPanel.svelte';
  import ProjectFiles from './ProjectFiles.svelte';
  import ContextPane from '../Context/ContextPane.svelte';

  interface Props {
    project: ProjectConfig;
    slotIndex: number;
    active: boolean;
    onactivate: () => void;
  }

  let { project, slotIndex, active, onactivate }: Props = $props();

  let accentVar = $derived(PROJECT_ACCENTS[slotIndex % PROJECT_ACCENTS.length]);
  let mainSessionId = $state<string | null>(null);

  type ProjectTab = 'claude' | 'files' | 'context';
  let activeTab = $state<ProjectTab>('claude');
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

  <div class="project-tabs">
    <button
      class="ptab"
      class:active={activeTab === 'claude'}
      onclick={() => activeTab = 'claude'}
    >Claude</button>
    <button
      class="ptab"
      class:active={activeTab === 'files'}
      onclick={() => activeTab = 'files'}
    >Files</button>
    <button
      class="ptab"
      class:active={activeTab === 'context'}
      onclick={() => activeTab = 'context'}
    >Context</button>
  </div>

  <div class="project-content-area">
    {#if activeTab === 'claude'}
      <div class="content-pane">
        <ClaudeSession {project} onsessionid={(id) => mainSessionId = id} />
        {#if mainSessionId}
          <TeamAgentsPanel {mainSessionId} />
        {/if}
      </div>
    {:else if activeTab === 'files'}
      <div class="content-pane">
        <ProjectFiles cwd={project.cwd} projectName={project.name} />
      </div>
    {:else if activeTab === 'context'}
      <div class="content-pane">
        <ContextPane onExit={() => {}} />
      </div>
    {/if}
  </div>

  <div class="project-terminal-area">
    <TerminalTabs {project} />
  </div>
</div>

<style>
  .project-box {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
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

  .project-tabs {
    display: flex;
    gap: 0;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .ptab {
    padding: 0.25rem 0.75rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ctp-overlay1);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: color 0.1s, border-color 0.1s;
  }

  .ptab:hover {
    color: var(--ctp-text);
  }

  .ptab.active {
    color: var(--ctp-text);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }

  .project-content-area {
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .content-pane {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .project-terminal-area {
    height: 16rem;
    min-height: 8rem;
    border-top: 1px solid var(--ctp-surface0);
  }
</style>
