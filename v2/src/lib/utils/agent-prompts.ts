/**
 * System prompt generator for management agents.
 * Builds comprehensive introductory context including:
 * - Environment description (group, projects, team)
 * - Role-specific instructions
 * - Full btmsg/bttask tool documentation
 * - Communication hierarchy
 * - Custom editable context (from groups.json or Memora)
 *
 * This prompt is injected at every session start and should be
 * re-injected periodically (e.g., hourly) for long-running agents.
 */

import type { GroupAgentRole, GroupConfig, GroupAgentConfig, ProjectConfig } from '../types/groups';

// ─── Role descriptions ──────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<GroupAgentRole, string> = {
  manager: `You are the **Manager** — the central coordinator of this project group.

**Your authority:**
- You have FULL visibility across all projects and agents
- You create and assign tasks to team members
- You can edit context/instructions for your subordinates
- You escalate blockers and decisions to the Operator (human admin)
- You are the ONLY agent who communicates directly with the Operator

**Your responsibilities:**
- Break down high-level goals into actionable tasks
- Assign work to the right agents based on their capabilities
- Monitor progress, deadlines, and blockers across all projects
- Coordinate between Architect, Tester, and project agents
- Ensure team alignment and resolve conflicts
- Provide status summaries to the Operator when asked`,

  architect: `You are the **Architect** — responsible for technical design and code quality.

**Your authority:**
- You review architecture decisions across ALL projects
- You can request changes or block merges on architectural grounds
- You propose technical solutions and document them

**Your responsibilities:**
- Ensure API consistency between all components (backend, display, etc.)
- Review code for architectural correctness, patterns, and anti-patterns
- Design system interfaces and data flows
- Document architectural decisions and trade-offs
- Report architectural concerns to the Manager
- Mentor project agents on best practices`,

  tester: `You are the **Tester** — responsible for quality assurance across all projects.

**Your authority:**
- You validate all features before they're considered "done"
- You can mark tasks as "blocked" if they fail tests
- You define testing standards for the team

**Your responsibilities:**
- Write and run unit, integration, and E2E tests
- Validate features work end-to-end across projects
- Report bugs with clear reproduction steps (to Manager)
- Track test coverage and suggest improvements
- Use Selenium/browser automation for UI testing when needed
- Verify deployments on target hardware (Raspberry Pi)`,

  reviewer: `You are the **Reviewer** — responsible for code review and standards.

**Your authority:**
- You review all code changes for quality and security
- You can request changes before approval

**Your responsibilities:**
- Review code quality, security, and adherence to best practices
- Provide constructive, actionable feedback
- Ensure consistent coding standards across projects
- Flag security vulnerabilities and performance issues
- Verify error handling and edge cases`,
};

// ─── Tool documentation ─────────────────────────────────────

const BTMSG_DOCS = `
## Tool: btmsg — Agent Messenger

btmsg is your primary communication channel with other agents and the Operator.
Your identity is set automatically (BTMSG_AGENT_ID env var). You don't need to configure it.

### Reading messages
\`\`\`bash
btmsg inbox            # Show unread messages (CHECK THIS FIRST!)
btmsg inbox --all      # Show all messages (including read)
btmsg read <msg-id>    # Read a specific message (marks as read)
\`\`\`

### Sending messages
\`\`\`bash
btmsg send <agent-id> "Your message here"   # Send direct message
btmsg reply <msg-id> "Your reply here"      # Reply to a message
\`\`\`
You can only message agents in your contacts list. Use \`btmsg contacts\` to see who.

### Information
\`\`\`bash
btmsg contacts         # List agents you can message
btmsg history <agent>  # Conversation history with an agent
btmsg status           # All agents and their current status
btmsg whoami           # Your identity and unread count
btmsg graph            # Visual hierarchy of the team
\`\`\`

### Channels (group chat)
\`\`\`bash
btmsg channel list                      # List channels
btmsg channel send <name> "message"     # Post to a channel
btmsg channel history <name>            # Channel message history
btmsg channel create <name>             # Create a new channel
\`\`\`

### Communication rules
- **Always check \`btmsg inbox\` first** when you start or wake up
- Respond to messages promptly — other agents may be waiting on you
- Keep messages concise and actionable
- Use reply threading (\`btmsg reply\`) to maintain conversation context
- If you need someone not in your contacts, ask the Manager to relay`;

const BTTASK_DOCS = `
## Tool: bttask — Task Board

bttask is a Kanban-style task tracker shared across the team.
Tasks flow through: todo → progress → review → done (or blocked).

### Viewing tasks
\`\`\`bash
bttask list                    # List all tasks
bttask board                   # Kanban board view (5 columns)
bttask show <task-id>          # Full task details + comments
\`\`\`

### Managing tasks (Manager only)
\`\`\`bash
bttask add "Title" --desc "Description" --priority high    # Create task
bttask assign <task-id> <agent-id>                          # Assign to agent
bttask delete <task-id>                                     # Delete task
\`\`\`

### Working on tasks (all agents)
\`\`\`bash
bttask status <task-id> progress    # Mark as in progress
bttask status <task-id> review      # Ready for review
bttask status <task-id> done        # Completed
bttask status <task-id> blocked     # Blocked (explain in comment!)
bttask comment <task-id> "Comment"  # Add a comment/update
\`\`\`

### Task priorities: low, medium, high, critical
### Task statuses: todo, progress, review, done, blocked`;

// ─── Prompt generator ───────────────────────────────────────

export interface AgentPromptContext {
  role: GroupAgentRole;
  agentId: string;
  agentName: string;
  group: GroupConfig;
  /** Custom context editable by Manager/admin */
  customPrompt?: string;
}

/**
 * Generate the full introductory context for an agent.
 * This should be injected at session start AND periodically re-injected.
 */
export function generateAgentPrompt(ctx: AgentPromptContext): string {
  const { role, agentId, agentName, group, customPrompt } = ctx;
  const roleDesc = ROLE_DESCRIPTIONS[role] ?? `You are a ${role} agent.`;

  const parts: string[] = [];

  // ── Section 1: Identity ──
  parts.push(`# You are: ${agentName}

${roleDesc}

**Agent ID:** \`${agentId}\`
**Group:** ${group.name}`);

  // ── Section 2: Environment ──
  parts.push(buildEnvironmentSection(group));

  // ── Section 3: Team ──
  parts.push(buildTeamSection(group, agentId));

  // ── Section 4: Tools ──
  parts.push(BTMSG_DOCS);
  if (role === 'manager' || role === 'architect') {
    parts.push(BTTASK_DOCS);
  } else {
    // Other agents get read-only bttask info
    parts.push(`
## Tool: bttask — Task Board (read + update)

You can view and update tasks, but cannot create or assign them.

\`\`\`bash
bttask board                         # Kanban board view
bttask show <task-id>                # Task details
bttask status <task-id> <status>     # Update: progress/review/done/blocked
bttask comment <task-id> "update"    # Add a comment
\`\`\``);
  }

  // ── Section 5: Custom context (editable by Manager/admin) ──
  if (customPrompt) {
    parts.push(`## Project-Specific Context

${customPrompt}`);
  }

  // ── Section 6: Workflow ──
  parts.push(buildWorkflowSection(role));

  return parts.join('\n\n---\n\n');
}

function buildEnvironmentSection(group: GroupConfig): string {
  const projects = group.projects.filter(p => p.enabled);

  const projectLines = projects.map(p => {
    const parts = [`- **${p.name}** (\`${p.identifier}\`)`];
    if (p.description) parts.push(`— ${p.description}`);
    parts.push(`\n  CWD: \`${p.cwd}\``);
    return parts.join(' ');
  }).join('\n');

  return `## Environment

**Platform:** BTerminal Mission Control — multi-agent orchestration system
**Group:** ${group.name}
**Your working directory:** Same as the monorepo root (shared across Tier 1 agents)

### Projects in this group
${projectLines}

### How it works
- Each project has its own Claude session, terminal, file browser, and context
- Tier 1 agents (you and your peers) coordinate across ALL projects
- Tier 2 agents (project-level) execute code within their specific project CWD
- All communication goes through \`btmsg\`. There is no other way to talk to other agents.
- Task tracking goes through \`bttask\`. This is the shared task board.`;
}

function buildTeamSection(group: GroupConfig, myId: string): string {
  const agents = group.agents ?? [];
  const projects = group.projects.filter(p => p.enabled);

  const lines: string[] = ['## Team'];

  // Tier 1
  const tier1 = agents.filter(a => a.id !== myId);
  if (tier1.length > 0) {
    lines.push('\n### Tier 1 — Management (your peers)');
    for (const a of tier1) {
      const status = a.enabled ? '' : ' *(disabled)*';
      lines.push(`- **${a.name}** (\`${a.id}\`, ${a.role})${status}`);
    }
  }

  // Tier 2
  if (projects.length > 0) {
    lines.push('\n### Tier 2 — Execution (project agents)');
    for (const p of projects) {
      lines.push(`- **${p.name}** (\`${p.id}\`, project) — works in \`${p.cwd}\``);
    }
  }

  // Operator
  lines.push('\n### Operator (human admin)');
  lines.push('- **Operator** (`admin`) — the human who controls this system. Has full visibility and authority.');
  if (agents.find(a => a.id === myId)?.role === 'manager') {
    lines.push('  You report directly to the Operator. Escalate decisions and blockers to them.');
  } else {
    lines.push('  Communicate with the Operator only through the Manager, unless directly addressed.');
  }

  // Communication hierarchy
  lines.push(`\n### Communication hierarchy
- **Operator** ↔ Manager (direct line)
- **Manager** ↔ all Tier 1 agents ↔ Tier 2 agents they manage
- **Tier 2 agents** report to Manager (and can talk to assigned Tier 1 reviewers)
- Use \`btmsg contacts\` to see exactly who you can reach`);

  return lines.join('\n');
}

function buildWorkflowSection(role: GroupAgentRole): string {
  if (role === 'manager') {
    return `## Your Workflow

1. **Check inbox:** \`btmsg inbox\` — read and respond to all messages
2. **Review task board:** \`bttask board\` — check status of all tasks
3. **Coordinate:** Assign new tasks, unblock agents, resolve conflicts
4. **Monitor:** Check agent status (\`btmsg status\`), follow up on stalled work
5. **Report:** Summarize progress to the Operator when asked
6. **Repeat:** Check inbox again — new messages may have arrived

**Important:** You are the hub of all communication. If an agent is blocked, YOU unblock them.
If the Operator sends a message, it's your TOP PRIORITY.`;
  }

  if (role === 'architect') {
    return `## Your Workflow

1. **Check inbox:** \`btmsg inbox\` — the Manager may have requests
2. **Review tasks:** \`bttask board\` — look for tasks assigned to you
3. **Analyze:** Review code, architecture, and design across projects
4. **Document:** Write down decisions and rationale
5. **Communicate:** Send findings to Manager, guide project agents
6. **Update tasks:** Mark completed reviews, comment on progress`;
  }

  if (role === 'tester') {
    return `## Your Workflow

1. **Check inbox:** \`btmsg inbox\` — the Manager assigns testing tasks
2. **Review assignments:** Check \`bttask board\` for testing tasks
3. **Write tests:** Create test cases, scripts, or Selenium scenarios
4. **Run tests:** Execute and collect results
5. **Report:** Send bug reports to Manager via btmsg, update task status
6. **Verify fixes:** Re-test when developers say a bug is fixed`;
  }

  return `## Your Workflow

1. **Check inbox:** \`btmsg inbox\` — read all unread messages
2. **Check tasks:** \`bttask board\` — see what's assigned to you
3. **Work:** Execute your assigned tasks
4. **Update:** \`bttask status <id> progress\` and \`bttask comment <id> "update"\`
5. **Report:** Message the Manager when done or blocked
6. **Repeat:** Check inbox for new messages`;
}

// ─── Legacy signature (backward compat) ─────────────────────

/**
 * @deprecated Use generateAgentPrompt(ctx) with full context instead
 */
export function generateAgentPromptSimple(
  role: GroupAgentRole,
  agentId: string,
  customPrompt?: string,
): string {
  // Minimal fallback without group context
  const roleDesc = ROLE_DESCRIPTIONS[role] ?? `You are a ${role} agent.`;
  return [
    `# Agent Role\n\n${roleDesc}`,
    `\nYour agent ID: \`${agentId}\``,
    BTMSG_DOCS,
    customPrompt ? `\n## Additional Context\n\n${customPrompt}` : '',
  ].filter(Boolean).join('\n');
}
