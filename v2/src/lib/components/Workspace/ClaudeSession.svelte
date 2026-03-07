<script lang="ts">
  import type { ProjectConfig } from '../../types/groups';
  import {
    loadProjectAgentState,
    loadAgentMessages,
    type ProjectAgentState,
    type AgentMessageRecord,
  } from '../../adapters/groups-bridge';
  import { registerSessionProject } from '../../agent-dispatcher';
  import {
    createAgentSession,
    appendAgentMessages,
    updateAgentCost,
    updateAgentStatus,
    setAgentSdkSessionId,
    getAgentSession,
  } from '../../stores/agents.svelte';
  import type { AgentMessage } from '../../adapters/sdk-messages';
  import AgentPane from '../Agent/AgentPane.svelte';

  interface Props {
    project: ProjectConfig;
    onsessionid?: (id: string) => void;
  }

  let { project, onsessionid }: Props = $props();

  let sessionId = $state(crypto.randomUUID());
  let lastState = $state<ProjectAgentState | null>(null);
  let loading = $state(true);
  let hasRestoredHistory = $state(false);

  // Load previous session state when project changes
  $effect(() => {
    const pid = project.id;
    loadPreviousState(pid);
  });

  async function loadPreviousState(projectId: string) {
    loading = true;
    hasRestoredHistory = false;
    try {
      const state = await loadProjectAgentState(projectId);
      lastState = state;
      if (state?.last_session_id) {
        sessionId = state.last_session_id;

        // Restore cached messages into the agent store
        const records = await loadAgentMessages(projectId);
        if (records.length > 0) {
          restoreMessagesFromRecords(sessionId, state, records);
          hasRestoredHistory = true;
        }
      } else {
        sessionId = crypto.randomUUID();
      }
    } catch (e) {
      console.warn('Failed to load project agent state:', e);
      sessionId = crypto.randomUUID();
    } finally {
      loading = false;
      // Register session -> project mapping for persistence
      registerSessionProject(sessionId, project.id);
      onsessionid?.(sessionId);
    }
  }

  function restoreMessagesFromRecords(
    sid: string,
    state: ProjectAgentState,
    records: AgentMessageRecord[],
  ) {
    // Don't re-create if already exists
    if (getAgentSession(sid)) return;

    createAgentSession(sid, state.last_prompt ?? '');
    if (state.sdk_session_id) {
      setAgentSdkSessionId(sid, state.sdk_session_id);
    }

    // Convert records back to AgentMessage format
    const messages: AgentMessage[] = records.map(r => ({
      id: `restored-${r.id}`,
      type: r.message_type as AgentMessage['type'],
      content: JSON.parse(r.content),
      parentId: r.parent_id ?? undefined,
    }));

    appendAgentMessages(sid, messages);
    updateAgentCost(sid, {
      costUsd: state.cost_usd,
      inputTokens: state.input_tokens,
      outputTokens: state.output_tokens,
      numTurns: 0,
      durationMs: 0,
    });

    // Mark as done (it's a restored completed session)
    updateAgentStatus(sid, state.status === 'error' ? 'error' : 'done');
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
    flex: 1;
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
