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
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ptab {
    display: inline-flex;
    align-items: center;
    padding: 0.3125em 0.875em;
    border: none;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.725rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
  }

  .ptab:hover {
    color: var(--ctp-subtext1);
    background: var(--ctp-surface0);
  }

  .ptab:focus-visible {
    outline: 1px solid var(--ctp-blue);
    outline-offset: -1px;
  }

  .ptab.active {
    background: var(--ctp-base);
    color: var(--ctp-text);
    font-weight: 600;
    border-bottom-color: var(--accent);
    margin-bottom: -1px;
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
