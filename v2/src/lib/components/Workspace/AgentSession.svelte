<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ProjectConfig, GroupAgentRole } from '../../types/groups';
  import { generateAgentPrompt } from '../../utils/agent-prompts';
  import { getActiveGroup } from '../../stores/workspace.svelte';
  import { logAuditEvent } from '../../adapters/audit-bridge';
  import type { AgentId } from '../../types/ids';
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
  import { getWakeEvent, consumeWakeEvent, updateManagerSession } from '../../stores/wake-scheduler.svelte';
  import { SessionId, ProjectId } from '../../types/ids';
  import AgentPane from '../Agent/AgentPane.svelte';

  /** How often to re-inject the system prompt (default 1 hour) */
  const REINJECTION_INTERVAL_MS = 60 * 60 * 1000;

  interface Props {
    project: ProjectConfig;
    onsessionid?: (id: string) => void;
  }

  let { project, onsessionid }: Props = $props();

  let providerId = $derived(project.provider ?? getDefaultProviderId());
  let providerMeta = $derived(getProvider(providerId));
  let group = $derived(getActiveGroup());
  // Build system prompt: full agent prompt for Tier 1, custom context for Tier 2
  let agentPrompt = $derived.by(() => {
    if (project.isAgent && project.agentRole && group) {
      return generateAgentPrompt({
        role: project.agentRole as GroupAgentRole,
        agentId: project.id,
        agentName: project.name,
        group,
        customPrompt: project.systemPrompt,
      });
    }
    // Tier 2: pass custom context directly (if set)
    return project.systemPrompt || undefined;
  });

  // Inject BTMSG_AGENT_ID for agent projects so they can use btmsg/bttask CLIs
  let agentEnv = $derived.by(() => {
    if (!project.isAgent) return undefined;
    return { BTMSG_AGENT_ID: project.id };
  });

  // Periodic context re-injection timer
  let lastPromptTime = $state(Date.now());
  let contextRefreshPrompt = $state<string | undefined>(undefined);
  let reinjectionTimer: ReturnType<typeof setInterval> | null = null;

  function startReinjectionTimer() {
    if (reinjectionTimer) clearInterval(reinjectionTimer);
    lastPromptTime = Date.now();
    reinjectionTimer = setInterval(() => {
      const elapsed = Date.now() - lastPromptTime;
      if (elapsed >= REINJECTION_INTERVAL_MS && !contextRefreshPrompt) {
        const refreshMsg = project.isAgent
          ? '[Context Refresh] Review your role and available tools above. Check your inbox with `btmsg inbox` and review the task board with `bttask board`.'
          : '[Context Refresh] Review the instructions above and continue your work.';
        contextRefreshPrompt = refreshMsg;
        // Audit: log prompt injection event
        logAuditEvent(
          project.id as unknown as AgentId,
          'prompt_injection',
          `Context refresh triggered after ${Math.floor(elapsed / 60_000)} min idle`,
        ).catch(() => {});
      }
    }, 60_000); // Check every minute
  }

  function handleAutoPromptConsumed() {
    contextRefreshPrompt = undefined;
    lastPromptTime = Date.now();
  }

  // Start timer and clean up
  startReinjectionTimer();
  onDestroy(() => {
    if (reinjectionTimer) clearInterval(reinjectionTimer);
    if (wakeCheckTimer) clearInterval(wakeCheckTimer);
  });

  // Wake scheduler integration — poll for wake events (Manager agents only)
  let wakeCheckTimer: ReturnType<typeof setInterval> | null = null;
  const isManager = $derived(project.isAgent && project.agentRole === 'manager');

  function startWakeCheck() {
    if (wakeCheckTimer) clearInterval(wakeCheckTimer);
    if (!isManager) return;
    wakeCheckTimer = setInterval(() => {
      if (contextRefreshPrompt) return; // Don't queue if already has a pending prompt
      const event = getWakeEvent(project.id);
      if (!event) return;

      if (event.mode === 'fresh') {
        // On-demand / Smart: reset session, inject wake context as initial prompt
        handleNewSession();
        contextRefreshPrompt = buildWakePrompt(event.context.evaluation.summary);
      } else {
        // Persistent: resume existing session with wake context
        contextRefreshPrompt = buildWakePrompt(event.context.evaluation.summary);
      }

      consumeWakeEvent(project.id);
    }, 5_000); // Check every 5s
  }

  function buildWakePrompt(summary: string): string {
    return `[Auto-Wake] You have been woken by the auto-wake scheduler. Here is the current fleet status:\n\n${summary}\n\nCheck your inbox with \`btmsg inbox\` and review the task board with \`bttask board\`. Take action on any urgent items above.`;
  }

  // Start wake check when component mounts (for managers)
  $effect(() => {
    if (isManager) {
      startWakeCheck();
    } else if (wakeCheckTimer) {
      clearInterval(wakeCheckTimer);
      wakeCheckTimer = null;
    }
  });

  let sessionId = $state(SessionId(crypto.randomUUID()));
  let lastState = $state<ProjectAgentState | null>(null);
  let loading = $state(true);
  let hasRestoredHistory = $state(false);

  function handleNewSession() {
    sessionId = SessionId(crypto.randomUUID());
    hasRestoredHistory = false;
    lastState = null;
    lastPromptTime = Date.now();
    contextRefreshPrompt = undefined;
    registerSessionProject(sessionId, ProjectId(project.id), providerId);
    trackProject(ProjectId(project.id), sessionId);
    // Notify wake scheduler of new session ID
    if (isManager) updateManagerSession(project.id, sessionId);
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

<div class="agent-session" data-testid="agent-session">
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
      autoPrompt={contextRefreshPrompt}
      onautopromptconsumed={handleAutoPromptConsumed}
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
