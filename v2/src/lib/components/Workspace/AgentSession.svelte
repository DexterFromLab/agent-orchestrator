<script lang="ts">
  import type { ProjectConfig, GroupAgentRole } from '../../types/groups';
  import { generateAgentPrompt } from '../../utils/agent-prompts';
  import { getActiveGroup } from '../../stores/workspace.svelte';
  import {
    loadProjectAgentState,
    loadAgentMessages,
    type ProjectAgentState,
    type AgentMessageRecord,
  } from '../../adapters/groups-bridge';
  import { registerSessionProject } from '../../agent-dispatcher';
  import { trackProject, updateProjectSession } from '../../stores/health.svelte';
  import {
    createAgentSession,
    appendAgentMessages,
    updateAgentCost,
    updateAgentStatus,
    setAgentSdkSessionId,
    getAgentSession,
  } from '../../stores/agents.svelte';
  import type { AgentMessage } from '../../adapters/claude-messages';
  import { getProvider, getDefaultProviderId } from '../../providers/registry.svelte';
  import { loadAnchorsForProject } from '../../stores/anchors.svelte';
  import { SessionId, ProjectId } from '../../types/ids';
  import AgentPane from '../Agent/AgentPane.svelte';

  interface Props {
    project: ProjectConfig;
    onsessionid?: (id: string) => void;
  }

  let { project, onsessionid }: Props = $props();

  let providerId = $derived(project.provider ?? getDefaultProviderId());
  let providerMeta = $derived(getProvider(providerId));
  let group = $derived(getActiveGroup());
  let agentPrompt = $derived.by(() => {
    if (!project.isAgent || !project.agentRole || !group) return undefined;
    return generateAgentPrompt({
      role: project.agentRole as GroupAgentRole,
      agentId: project.id,
      agentName: project.name,
      group,
      customPrompt: project.systemPrompt,
    });
  });

  // Inject BTMSG_AGENT_ID for agent projects so they can use btmsg/bttask CLIs
  let agentEnv = $derived.by(() => {
    if (!project.isAgent) return undefined;
    return { BTMSG_AGENT_ID: project.id };
  });

  let sessionId = $state(SessionId(crypto.randomUUID()));
  let lastState = $state<ProjectAgentState | null>(null);
  let loading = $state(true);
  let hasRestoredHistory = $state(false);

  function handleNewSession() {
    sessionId = SessionId(crypto.randomUUID());
    hasRestoredHistory = false;
    lastState = null;
    registerSessionProject(sessionId, ProjectId(project.id), providerId);
    trackProject(ProjectId(project.id), sessionId);
    onsessionid?.(sessionId);
  }

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
        sessionId = SessionId(state.last_session_id);

        // Restore cached messages into the agent store
        const records = await loadAgentMessages(projectId);
        if (records.length > 0) {
          restoreMessagesFromRecords(sessionId, state, records);
          hasRestoredHistory = true;
        }
      } else {
        sessionId = SessionId(crypto.randomUUID());
      }
    } catch (e) {
      console.warn('Failed to load project agent state:', e);
      sessionId = SessionId(crypto.randomUUID());
    } finally {
      loading = false;
      // Load persisted anchors for this project
      loadAnchorsForProject(ProjectId(project.id));
      // Register session -> project mapping for persistence + health tracking
      registerSessionProject(sessionId, ProjectId(project.id), providerId);
      trackProject(ProjectId(project.id), sessionId);
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
      timestamp: r.created_at ?? Date.now(),
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

<div class="agent-session">
  {#if loading}
    <div class="loading-state">Loading session...</div>
  {:else}
    <AgentPane
      {sessionId}
      projectId={project.id}
      cwd={project.cwd}
      profile={project.profile || undefined}
      provider={providerId}
      capabilities={providerMeta?.capabilities}
      useWorktrees={project.useWorktrees ?? false}
      agentSystemPrompt={agentPrompt}
      extraEnv={agentEnv}
      onExit={handleNewSession}
    />
  {/if}
</div>

<style>
  .agent-session {
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
