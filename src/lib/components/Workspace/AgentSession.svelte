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
  import { onAgentStart, onAgentStop } from '../../stores/workspace.svelte';
  import { stopAgent } from '../../adapters/agent-bridge';
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
  import { getSecret } from '../../adapters/secrets-bridge';
  import { getUnseenMessages, markMessagesSeen, setAgentStatus as setBtmsgAgentStatus } from '../../adapters/btmsg-bridge';
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
    // Tier 2: include btmsg/bttask instructions + custom context
    const tier2Parts: string[] = [];
    tier2Parts.push(`You are a project agent working on "${project.name}".
Your agent ID is \`${project.id}\`. You communicate with other agents using CLI tools.

## Communication: btmsg
\`\`\`bash
btmsg inbox            # Check for unread messages (DO THIS FIRST!)
btmsg send <agent-id> "message"   # Send a message
btmsg reply <msg-id> "reply"      # Reply to a message
btmsg contacts         # See who you can message
\`\`\`

## Task Board: bttask
\`\`\`bash
bttask board                       # View task board
bttask show <task-id>              # Task details
bttask status <task-id> progress   # Mark as in progress
bttask status <task-id> done       # Mark as done
bttask comment <task-id> "update"  # Add a comment
\`\`\`

## Your Workflow
1. **Check inbox:** \`btmsg inbox\` — read and respond to messages
2. **Check tasks:** \`bttask board\` — see what's assigned to you
3. **Work:** Execute your assigned tasks in this project
4. **Update:** Report progress via \`bttask status\` and \`bttask comment\`
5. **Report:** Message the Manager when done or blocked`);
    if (project.systemPrompt) {
      tier2Parts.push(project.systemPrompt);
    }
    return tier2Parts.join('\n\n');
  });

  // Provider-specific API keys loaded from system keyring
  let openrouterKey = $state<string | null>(null);

  $effect(() => {
    if (providerId === 'aider') {
      getSecret('openrouter_api_key').then(key => {
        openrouterKey = key;
      }).catch(() => {});
    } else {
      openrouterKey = null;
    }
  });

  // Inject BTMSG_AGENT_ID for all projects (Tier 1 and Tier 2) so they can use btmsg/bttask CLIs
  // Manager agents also get CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to enable subagent delegation
  // Provider-specific API keys are injected from the system keyring
  let agentEnv = $derived.by(() => {
    const env: Record<string, string> = { BTMSG_AGENT_ID: project.id };
    if (project.isAgent && project.agentRole === 'manager') {
      env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
    }
    if (openrouterKey) {
      env.OPENROUTER_API_KEY = openrouterKey;
    }
    return env;
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

  // Listen for play-button start events from GroupAgentsPanel
  const unsubAgentStart = onAgentStart((projectId) => {
    if (projectId !== project.id) return;
    // Only auto-start if not already running and no pending prompt
    if (contextRefreshPrompt) return;
    contextRefreshPrompt = 'Start your work. Check your inbox with `btmsg inbox` and review the task board with `bttask board`. Take action on any pending items.';
  });

  // Listen for stop-button events from GroupAgentsPanel
  const unsubAgentStop = onAgentStop((projectId) => {
    if (projectId !== project.id) return;
    updateAgentStatus(sessionId, 'done');
    setBtmsgAgentStatus(project.id as unknown as AgentId, 'stopped').catch(() => {});
    stopAgent(sessionId).catch(() => {});
  });

  // btmsg inbox polling — per-message acknowledgment wake mechanism
  // Uses seen_messages table for per-session tracking instead of global unread count.
  // Every unseen message triggers exactly one wake, regardless of timing.
  let msgPollTimer: ReturnType<typeof setInterval> | null = null;

  function startMsgPoll() {
    if (msgPollTimer) clearInterval(msgPollTimer);
    msgPollTimer = setInterval(async () => {
      if (contextRefreshPrompt) return; // Don't queue if already has a pending prompt
      try {
        const unseen = await getUnseenMessages(
          project.id as unknown as AgentId,
          sessionId,
        );
        if (unseen.length > 0) {
          // Build a prompt with the actual message contents
          const msgSummary = unseen.map(m =>
            `From ${m.senderName ?? m.fromAgent} (${m.senderRole ?? 'unknown'}): ${m.content}`
          ).join('\n');
          contextRefreshPrompt = `[New Messages] You have ${unseen.length} unread message(s):\n\n${msgSummary}\n\nRespond appropriately using \`btmsg send <agent-id> "reply"\`.`;

          // Mark as seen immediately to prevent re-injection
          await markMessagesSeen(sessionId, unseen.map(m => m.id));

          logAuditEvent(
            project.id as unknown as AgentId,
            'wake_event',
            `Agent woken by ${unseen.length} btmsg message(s)`,
          ).catch(() => {});
        }
      } catch {
        // btmsg not available, ignore
      }
    }, 10_000); // Check every 10s
  }

  // Start timer and clean up
  startReinjectionTimer();
  startMsgPoll();
  onDestroy(() => {
    if (reinjectionTimer) clearInterval(reinjectionTimer);
    if (wakeCheckTimer) clearInterval(wakeCheckTimer);
    if (msgPollTimer) clearInterval(msgPollTimer);
    unsubAgentStart();
    unsubAgentStop();
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
      model={project.model}
      extraEnv={agentEnv}
      autonomousMode={project.autonomousMode}
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
