<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProjectConfig } from '../../types/groups';
  import {
    loadProjectAgentState,
    saveProjectAgentState,
    loadAgentMessages,
    saveAgentMessages,
    type ProjectAgentState,
    type AgentMessageRecord,
  } from '../../adapters/groups-bridge';
  import AgentPane from '../Agent/AgentPane.svelte';

  interface Props {
    project: ProjectConfig;
    onsessionid?: (id: string) => void;
  }

  let { project, onsessionid }: Props = $props();

  // Per-project session ID (stable across renders, changes with project)
  let sessionId = $state(crypto.randomUUID());
  let lastState = $state<ProjectAgentState | null>(null);
  let resumeSessionId = $state<string | undefined>(undefined);
  let loading = $state(true);

  // Load previous session state when project changes
  $effect(() => {
    const pid = project.id;
    loadPreviousState(pid);
  });

  async function loadPreviousState(projectId: string) {
    loading = true;
    try {
      const state = await loadProjectAgentState(projectId);
      lastState = state;
      if (state?.sdk_session_id) {
        resumeSessionId = state.sdk_session_id;
        sessionId = state.last_session_id;
      } else {
        resumeSessionId = undefined;
        sessionId = crypto.randomUUID();
      }
    } catch (e) {
      console.warn('Failed to load project agent state:', e);
      sessionId = crypto.randomUUID();
    } finally {
      loading = false;
      onsessionid?.(sessionId);
    }
  }
</script>

<div class="claude-session">
  {#if loading}
    <div class="loading-state">Loading session...</div>
  {:else}
    <AgentPane
      {sessionId}
      cwd={project.cwd}
    />
  {/if}
</div>

<style>
  .claude-session {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.85rem;
  }
</style>
