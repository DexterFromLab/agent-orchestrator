# Multi-Agent Orchestration

Agent Orchestrator supports running multiple AI agents that communicate with each other, coordinate work through a shared task board, and are managed by a hierarchy of specialized roles. This document covers the inter-agent messaging system (btmsg), the task board (bttask), agent roles and system prompts, and the auto-wake scheduler.

---

## Agent Roles (Tier 1 and Tier 2)

Agents are organized into two tiers:

### Tier 1 — Management Agents

Defined in `groups.json` under a group's `agents[]` array. Each management agent gets a full ProjectBox in the UI (converted via `agentToProject()` in the workspace store). They have role-specific capabilities, tabs, and system prompts.

| Role | Tabs | btmsg Permissions | bttask Permissions | Purpose |
|------|------|-------------------|-------------------|---------|
| **Manager** | Model, Tasks | Full (send, receive, create channels) | Full CRUD | Coordinates work, creates/assigns tasks, delegates to subagents |
| **Architect** | Model, Architecture | Send, receive | Read-only + comments | Designs solutions, creates PlantUML diagrams, reviews architecture |
| **Tester** | Model, Selenium, Tests | Send, receive | Read-only + comments | Runs tests, monitors screenshots, discovers test files |
| **Reviewer** | Model, Tasks | Send, receive | Read + status + comments | Reviews code, manages review queue, approves/rejects tasks |

### Tier 2 — Project Agents

Regular `ProjectConfig` entries in `groups.json`. Each project gets its own Claude session with optional custom context via `project.systemPrompt`. They have standard tabs (Model, Docs, Context, Files, SSH, Memory) but no role-specific tabs.

### System Prompt Generation

Tier 1 agents receive auto-generated system prompts built by `generateAgentPrompt()` in `utils/agent-prompts.ts`. The prompt has 7 sections:

1. **Identity** — Role name, project context, team membership
2. **Environment** — Working directory, available tools, shell info
3. **Team** — List of other agents in the group with their roles
4. **btmsg documentation** — CLI usage, channel commands, message format
5. **bttask documentation** — CLI usage, task lifecycle, role-specific permissions
6. **Custom context** — Optional `project.systemPrompt` (Tier 2) or role-specific instructions
7. **Workflow** — Role-specific workflow guidelines (e.g., Manager delegates, Reviewer checks review queue)

Tier 2 agents receive only the custom context section (if `project.systemPrompt` is set), injected as the `system_prompt` field in AgentQueryOptions.

### BTMSG_AGENT_ID

Tier 1 agents receive the `BTMSG_AGENT_ID` environment variable, injected via `extra_env` in AgentQueryOptions. This flows through 5 layers: TypeScript → Rust AgentQueryOptions → NDJSON → JS runner → SDK env. The CLI tools (`btmsg`, `bttask`) read this variable to identify which agent is sending messages or creating tasks.

### Periodic Re-injection

LLM context degrades over long sessions as important instructions scroll out of the context window. To counter this, AgentSession runs a 1-hour timer that re-sends the system prompt when the agent is idle. The mechanism:

1. AgentSession timer fires after 60 minutes of agent inactivity
2. Sets `autoPrompt` flag, which AgentPane reads via `onautopromptconsumed` callback
3. AgentPane calls `startQuery()` with `resume=true` and the refresh prompt
4. The agent receives the role/tools reminder as a follow-up message

---

## btmsg — Inter-Agent Messaging

btmsg is a messaging system that lets agents communicate with each other. It consists of a Rust backend (SQLite), a Python CLI tool (for agents to use in their shell), and a Svelte frontend (CommsTab).

### Architecture

```
Agent (via btmsg CLI)
    │
    ├── btmsg send <recipient> "message"     → writes to btmsg.db
    ├── btmsg read                           → reads from btmsg.db
    ├── btmsg channel create #review-queue   → creates channel
    ├── btmsg channel post #review-queue "msg" → posts to channel
    └── btmsg heartbeat                      → updates agent heartbeat
         │
         ▼
btmsg.db (SQLite, WAL mode, ~/.local/share/bterminal/btmsg.db)
    │
    ├── agents table        — registered agents with roles
    ├── messages table      — DMs and channel messages
    ├── channels table      — named channels (#review-queue, #review-log)
    ├── contacts table      — ACL (who can message whom)
    ├── heartbeats table    — agent liveness tracking
    ├── dead_letter_queue   — undeliverable messages
    └── audit_log           — all operations for debugging
         │
         ▼
Rust Backend (btmsg.rs, ~600 lines)
    │
    ├── btmsg_list_messages, btmsg_send_message, ...
    ├── 15+ Tauri commands for full CRUD
    └── Shared database connection (WAL + 5s busy_timeout)
         │
         ▼
Frontend (btmsg-bridge.ts → CommsTab.svelte)
    ├── Activity feed — all messages across all agents
    ├── DM view — direct messages between specific agents
    └── Channel view — channel messages (#review-queue, etc.)
```

### Database Schema

The btmsg database (`btmsg.db`) stores all messaging data:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agents` | Agent registry | id, name, role, project_id, status, created_at |
| `messages` | All messages | id, sender_id, recipient_id, channel_id, content, read, created_at |
| `channels` | Named channels | id, name, created_by, created_at |
| `contacts` | ACL | agent_id, contact_id (bidirectional) |
| `heartbeats` | Liveness | agent_id, last_heartbeat, status |
| `dead_letter_queue` | Failed delivery | message_id, reason, created_at |
| `audit_log` | All operations | id, event_type, agent_id, details, created_at |

### CLI Usage (for agents)

Agents use the `btmsg` Python CLI tool in their shell. The tool reads `BTMSG_AGENT_ID` to identify the sender:

```bash
# Send a direct message
btmsg send architect "Please review the auth module design"

# Read unread messages
btmsg read

# Create a channel
btmsg channel create #architecture-decisions

# Post to a channel
btmsg channel post #review-queue "PR #42 ready for review"

# Send heartbeat (agents do this periodically)
btmsg heartbeat

# List all agents
btmsg agents
```

### Frontend (CommsTab)

The CommsTab component (rendered in ProjectBox for all agents) shows:

- **Activity Feed** — chronological view of all messages across all agents
- **DMs** — direct message threads between agents
- **Channels** — named channel message streams
- Polling-based updates (5s interval)

### Dead Letter Queue

Messages sent to non-existent or offline agents are moved to the dead letter queue instead of being silently dropped. The Rust backend checks agent status before delivery and queues failures. The Manager agent's health dashboard shows dead letter count.

### Audit Logging

Every btmsg operation is logged to the `audit_log` table with event type, agent ID, and JSON details. Event types include: message_sent, message_read, channel_created, agent_registered, heartbeat, and prompt_injection_detected.

---

## bttask — Task Board

bttask is a kanban-style task board that agents use to coordinate work. It shares the same SQLite database as btmsg (`btmsg.db`) for deployment simplicity.

### Architecture

```
Agent (via bttask CLI)
    │
    ├── bttask list                    → list all tasks
    ├── bttask create "Fix auth bug"   → create task (Manager only)
    ├── bttask status <id> in_progress → update status
    ├── bttask comment <id> "Done"     → add comment
    └── bttask review-count            → count review queue tasks
         │
         ▼
btmsg.db → tasks table + task_comments table
    │
    ▼
Rust Backend (bttask.rs, ~300 lines)
    │
    ├── 7 Tauri commands: list, create, update_status, delete, add_comment, comments, review_queue_count
    └── Optimistic locking via version column
         │
         ▼
Frontend (bttask-bridge.ts → TaskBoardTab.svelte)
    └── Kanban board: 5 columns, 5s poll, drag-and-drop
```

### Task Lifecycle

```
┌──────────┐   assign   ┌─────────────┐   complete   ┌──────────┐
│  Backlog  │──────────►│ In Progress  │────────────►│  Review   │
└──────────┘            └─────────────┘              └──────────┘
                                                          │
                                              ┌───────────┼───────────┐
                                              ▼                       ▼
                                         ┌────────┐             ┌──────────┐
                                         │  Done   │             │ Rejected │
                                         └────────┘             └──────────┘
```

When a task moves to the "Review" column, the system automatically posts a notification to the `#review-queue` btmsg channel. The `ensure_review_channels()` function creates `#review-queue` and `#review-log` channels idempotently on first use.

### Optimistic Locking

To prevent concurrent updates from corrupting task state, bttask uses optimistic locking via a `version` column:

1. Client reads task with current version (e.g., version=3)
2. Client sends update with expected version=3
3. Server's UPDATE query includes `WHERE version = 3`
4. If another client updated first (version=4), the WHERE clause matches 0 rows
5. Server returns a conflict error, client must re-read and retry

This is critical because multiple agents may try to update the same task simultaneously.

### Role-Based Permissions

| Role | List | Create | Update Status | Delete | Comments |
|------|------|--------|---------------|--------|----------|
| Manager | Yes | Yes | Yes | Yes | Yes |
| Reviewer | Yes | No | Yes (review decisions) | No | Yes |
| Architect | Yes | No | No | No | Yes |
| Tester | Yes | No | No | No | Yes |
| Project (Tier 2) | Yes | No | No | No | Yes |

Permissions are enforced in the CLI tool based on the agent's role (read from `BTMSG_AGENT_ID` → agents table lookup).

### Review Queue Integration

The Reviewer agent gets special treatment in the attention scoring system:

- `reviewQueueDepth` is an input to attention scoring: 10 points per review task, capped at 50
- Priority: between file_conflict (70) and context_high (40)
- ProjectBox polls `review_queue_count` every 10 seconds for reviewer agents
- Results feed into `setReviewQueueDepth()` in the health store

### Frontend (TaskBoardTab.svelte)

The kanban board renders 5 columns (Backlog, In Progress, Review, Done, Rejected) with task cards. Features:

- 5-second polling for updates
- Click to expand task details + comments
- Manager-only create/delete buttons
- Color-coded status badges

---

## Wake Scheduler

The wake scheduler automatically re-activates idle Manager agents when attention-worthy events occur. It runs in `wake-scheduler.svelte.ts` and supports three user-selectable strategies.

### Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **Persistent** | Sends a resume prompt to the existing session | Long-running managers that should maintain context |
| **On-demand** | Starts a fresh session | Managers that work in bursts |
| **Smart** | On-demand, but only when wake score exceeds threshold | Avoids waking for minor events |

Strategy and threshold are configurable per group agent via `GroupAgentConfig.wakeStrategy` and `GroupAgentConfig.wakeThreshold` fields, persisted in `groups.json`.

### Wake Signals

The wake scorer evaluates 6 signals (defined in `types/wake.ts`, scored by `utils/wake-scorer.ts`):

| Signal | Weight | Trigger |
|--------|--------|---------|
| AttentionSpike | 1.0 | Any project's attention score exceeds threshold |
| ContextPressureCluster | 0.9 | Multiple projects have >75% context usage |
| BurnRateAnomaly | 0.8 | Cost rate deviates significantly from baseline |
| TaskQueuePressure | 0.7 | Task backlog grows beyond threshold |
| ReviewBacklog | 0.6 | Review queue has pending items |
| PeriodicFloor | 0.1 | Minimum periodic check (floor signal) |

The pure scoring function in `wake-scorer.ts` is tested with 24 unit tests. The types are in `types/wake.ts` (WakeStrategy, WakeSignal, WakeEvaluation, WakeContext).

### Lifecycle

1. ProjectBox registers manager agents via `$effect` on mount
2. Wake scheduler creates per-manager timers
3. Every 5 seconds, AgentSession polls wake events
4. If score exceeds threshold (for smart strategy), triggers wake
5. On group switch, `clearWakeScheduler()` cancels all timers
6. In test mode (`BTERMINAL_TEST=1`), wake scheduler is disabled via `disableWakeScheduler()`

---

## Health Monitoring & Attention Scoring

The health store (`health.svelte.ts`) tracks per-project health with a 5-second tick timer. It provides the data that feeds the StatusBar, wake scheduler, and attention queue.

### Activity States

| State | Meaning | Visual |
|-------|---------|--------|
| Inactive | No agent running, no recent activity | Dim dot |
| Running | Agent actively processing | Green pulse |
| Idle | Agent finished, waiting for input | Gray dot |
| Stalled | Agent hasn't produced output for >N minutes | Orange pulse |

The stall threshold is configurable per-project via `stallThresholdMin` in ProjectConfig (default 15 min, range 5-60, step 5).

### Attention Scoring

Each project gets an attention score (0-100) based on its current state. The attention queue in the StatusBar shows the top 5 projects sorted by urgency:

| Condition | Score | Priority |
|-----------|-------|----------|
| Stalled agent | 100 | Highest — agent may be stuck |
| Error state | 90 | Agent crashed or API error |
| Context >90% | 80 | Context window nearly full |
| File conflict | 70 | Two agents wrote same file |
| Review queue depth | 10/task, cap 50 | Reviewer has pending reviews |
| Context >75% | 40 | Context pressure building |

The pure scoring function is in `utils/attention-scorer.ts` (14 tests). It takes `AttentionInput` and returns a numeric score.

### Burn Rate

Cost tracking uses a 5-minute exponential moving average (EMA) of cost snapshots. The StatusBar displays aggregate $/hr across all running agents.

### File Conflict Detection

The conflicts store (`conflicts.svelte.ts`) detects two types of conflicts:

1. **Agent overlap** — Two agents in the same worktree write the same file (tracked via tool_call analysis in the dispatcher)
2. **External writes** — A file watched by an agent is modified externally (detected via inotify in `fs_watcher.rs`, uses 2s timing heuristic `AGENT_WRITE_GRACE_MS` to distinguish agent writes from external)

Both types show badges in ProjectHeader (orange ⚡ for external, red ⚠ for agent overlap).

---

## Session Anchors

Session anchors preserve important conversation turns through Claude's context compaction process. Without anchors, valuable early context (architecture decisions, debugging breakthroughs) can be lost when the context window fills up.

### Anchor Types

| Type | Created By | Behavior |
|------|-----------|----------|
| **Auto** | System (on first compaction) | Captures first 3 turns, observation-masked (reasoning preserved, tool outputs compacted) |
| **Pinned** | User (pin button in AgentPane) | Marks specific turns as important |
| **Promoted** | User (from pinned) | Re-injectable into future sessions via system prompt |

### Anchor Budget

The budget controls how many tokens are spent on anchor re-injection:

| Scale | Token Budget | Use Case |
|-------|-------------|----------|
| Small | 2,000 | Quick sessions, minimal context needed |
| Medium | 6,000 | Default, covers most scenarios |
| Large | 12,000 | Complex debugging sessions |
| Full | 20,000 | Maximum context preservation |

Configurable per-project via slider in SettingsTab, stored as `ProjectConfig.anchorBudgetScale` in `groups.json`.

### Re-injection Flow

When a session resumes with promoted anchors:
1. `anchors.svelte.ts` loads promoted anchors for the project
2. `anchor-serializer.ts` serializes them (turn grouping, observation masking, token estimation)
3. `AgentPane.startQuery()` includes serialized anchors in the `system_prompt` field
4. The sidecar passes the system prompt to the SDK
5. Claude receives the anchors as context alongside the new prompt

### Storage

Anchors are persisted in the `session_anchors` table in `sessions.db`. The ContextTab shows an anchor section with a budget meter (derived from the configured scale) and promote/demote buttons.
