# BTerminal v3 — Mission Control Redesign

## Goal

Transform BTerminal from a multi-pane terminal/agent tool into a **multi-project mission control** — a helm for managing multiple development projects simultaneously, each with its own Claude agent session, team agents, terminals, and settings.

## Status: All Phases Complete (1-10) — Rev 2

---

## Core Concept

**Project Groups** are workspaces. Each group has up to 5 projects arranged horizontally. One group visible at a time. Projects have their own Claude subscription, working directory, icon, and settings. The app is a dashboard for orchestrating Claude agents across a portfolio of projects.

### Key Mental Model

```
BTerminal v2: Terminal emulator with agent sessions (panes in a grid)
BTerminal v3: Project orchestration dashboard (projects in a workspace)
```

### User Requirements

1. Projects arranged in **project groups** (many groups, switch between them)
2. Each group has **up to 5 projects** shown horizontally
3. Group/project config via **main menu** (command palette / hidden drawer, Ctrl+K)
4. Per-project settings: Claude subscription, working dir, icon (nerd font), name, identifier, description, enabled
5. Project group = workspace on screen
6. Each project box: Claude session (default, resume previous) + team agents (right) + terminal tabs (below)
7. **4 workspace tabs**: Sessions | Docs | Context | Settings
8. App launchable with `--group <name>` CLI arg
9. JSON config file defines all groups (`~/.config/bterminal/groups.json`)
10. Session continuity: resume previous + restore history visually
11. SSH sessions: spawnable within a project's terminal tabs
12. ctx viewer: workspace tab #3

---

## Architecture (Post-Adversarial Review)

### Adversarial Review Summary

3 agents reviewed the architecture: Architect (advocate), Devil's Advocate (attacker), UX+Performance Specialist.

**12 issues identified by Devil's Advocate. Resolutions:**

| # | Issue | Severity | Resolution |
|---|---|---|---|
| 1 | xterm.js 4-instance ceiling (WebKit2GTK OOM) | Critical | Lazy-init + scrollback serialization. Budget: 4 active xterm, unlimited suspended (text buffer). Enforced in code. |
| 2 | Single sidecar = SPOF for all projects | Critical | Accept for v3.0 (existing crash recovery). Per-project pool deferred to v3.1 if needed. |
| 3 | Session identity collision (sdkSessionId not persisted) | Major | Persist sdkSessionId in SQLite `project_agent_state` table. Per-project CLAUDE_CONFIG_DIR isolation. |
| 4 | Layout store has no workspace concept | Critical | Full rewrite: `workspace.svelte.ts` replaces `layout.svelte.ts`. |
| 5 | 384px per project unusable on 1920px | Major | Adaptive: compute visible count from viewport width (`Math.floor(width / 520)`). 5@5120px, 3@1920px, scroll-snap for rest. min-width 480px. |
| 6 | JSON config + SQLite = split-brain | Major | JSON for groups/projects config (human-editable). SQLite for session state. JSON loaded at startup only, no hot-reload. |
| 7 | Agent dispatcher is global singleton, no project scoping | Major | Add projectId to AgentSession. Dispatcher routes by project. Per-project cleanup on workspace switch. |
| 8 | Markdown discovery undefined | Minor | Priority list: CLAUDE.md, README.md, docs/*.md (max 20). Rust command scans with depth limit. |
| 9 | Keyboard shortcut conflicts (3 layers) | Major | Shortcut manager: Terminal layer (focused only), Workspace layer (Ctrl+1-5), App layer (Ctrl+K, Ctrl+G). |
| 10 | Remote machine support orphaned | Major | Elevate to project level (project.remote_machine_id). Defer integration to v3.1. |
| 11 | No graceful degradation for broken projects | Major | Project health state: healthy/degraded/unavailable/error. Colored dot indicator. |
| 12 | Flat event stream wastes CPU for hidden projects | Minor | Buffer messages for inactive workspace projects. Flush on activation. |

---

## Data Model

### Project Group Config (`~/.config/bterminal/groups.json`)

```jsonc
{
  "version": 1,
  "groups": [
    {
      "id": "work-ai",
      "name": "AI Projects",
      "projects": [
        {
          "id": "bterminal",
          "name": "BTerminal",
          "identifier": "bterminal",
          "description": "Terminal emulator with Claude integration",
          "icon": "\uf120",
          "cwd": "/home/hibryda/code/ai/BTerminal",
          "profile": "default",
          "enabled": true
        }
      ]
    }
  ],
  "activeGroupId": "work-ai"
}
```

### TypeScript Types (`v2/src/lib/types/groups.ts`)

```typescript
export interface ProjectConfig {
  id: string;
  name: string;
  identifier: string;
  description: string;
  icon: string;
  cwd: string;
  profile: string;
  enabled: boolean;
}

export interface GroupConfig {
  id: string;
  name: string;
  projects: ProjectConfig[];  // max 5
}

export interface GroupsFile {
  version: number;
  groups: GroupConfig[];
  activeGroupId: string;
}
```

### SQLite Schema Additions

```sql
ALTER TABLE sessions ADD COLUMN project_id TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    sdk_session_id TEXT,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_agent_messages_session ON agent_messages(session_id);
CREATE INDEX idx_agent_messages_project ON agent_messages(project_id);

CREATE TABLE IF NOT EXISTS project_agent_state (
    project_id TEXT PRIMARY KEY,
    last_session_id TEXT NOT NULL,
    sdk_session_id TEXT,
    status TEXT NOT NULL,
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    last_prompt TEXT,
    updated_at INTEGER NOT NULL
);
```

---

## Component Architecture

### Component Tree

```
App.svelte                              [REWRITTEN]
├── CommandPalette.svelte               [NEW]
├── GlobalTabBar.svelte                 [NEW] Sessions | Docs | Context | Settings
├── [Tab: Sessions]
│   └── ProjectGrid.svelte             [NEW] Horizontal flex + scroll-snap
│       └── ProjectBox.svelte           [NEW] Per-project container
│           ├── ProjectHeader.svelte    [NEW] Icon + name + status dot
│           ├── ClaudeSession.svelte    [NEW, from AgentPane] Main session
│           ├── TeamAgentsPanel.svelte  [NEW] Right panel for subagents
│           │   └── AgentCard.svelte    [NEW] Compact subagent view
│           └── TerminalTabs.svelte     [NEW] Tabbed terminals
│               ├── TabBar.svelte       [NEW]
│               └── TerminalPane.svelte [SURVIVES]
├── [Tab: Docs]
│   └── DocsTab.svelte                 [NEW]
│       ├── MdFilePicker.svelte        [NEW]
│       └── MarkdownPane.svelte        [SURVIVES]
├── [Tab: Context]
│   └── ContextPane.svelte             [SURVIVES, extracted from pane]
├── [Tab: Settings]
│   └── SettingsTab.svelte             [NEW]
│       ├── ProjectSettingsEditor.svelte [NEW]
│       └── GlobalSettings.svelte       [NEW]
├── StatusBar.svelte                    [MODIFIED]
└── ToastContainer.svelte               [SURVIVES]
```

### What Dies

| v2 Component/Store | Reason |
|---|---|
| TilingGrid.svelte | Replaced by ProjectGrid |
| PaneContainer.svelte | Fixed project box structure |
| SessionList.svelte (sidebar) | No sidebar; project headers replace |
| SshSessionList.svelte | Absorbed into TerminalTabs |
| SettingsDialog.svelte | Replaced by SettingsTab |
| AgentPane.svelte | Split into ClaudeSession + TeamAgentsPanel |
| layout.svelte.ts | Replaced by workspace.svelte.ts |
| layout.test.ts | Replaced by workspace tests |

### What Survives

TerminalPane, MarkdownPane, AgentTree, ContextPane, StatusBar, ToastContainer, theme store, notifications store, agents store (modified), all adapters (agent-bridge, pty-bridge, claude-bridge, sdk-messages, session-bridge, ctx-bridge, ssh-bridge), all Rust backend (sidecar, pty, session, ctx, watcher), highlight utils.

---

## Layout System

### Project Grid (Flexbox + scroll-snap)

```css
.project-grid {
  display: flex;
  gap: 4px;
  height: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}

.project-box {
  flex: 0 0 calc((100% - (N-1) * 4px) / N);
  scroll-snap-align: start;
  min-width: 480px;
}
```

N computed from viewport: `Math.min(projects.length, Math.max(1, Math.floor(containerWidth / 520)))`

### Project Box Internal Layout

```
┌─ ProjectHeader (28px) ──────────────────┐
├─────────────────────┬───────────────────┤
│ ClaudeSession       │ TeamAgentsPanel   │
│ (flex: 1)           │ (240px or overlay)│
├─────────────────────┴───────────────────┤
│ [Tab1] [Tab2] [+]           TabBar 26px │
├─────────────────────────────────────────┤
│ Terminal content (xterm or scrollback)  │
└─────────────────────────────────────────┘
```

Team panel: inline at >2560px, overlay at <2560px. Collapsed when no subagents.

### Responsive Breakpoints

| Width | Visible Projects | Team Panel |
|-------|-----------------|------------|
| 5120px+ | 5 | inline 240px |
| 3840px | 4 | inline 200px |
| 2560px | 3 | overlay |
| 1920px | 3 | overlay |
| <1600px | 1 + project tabs | overlay |

### xterm.js Budget: 4 Active Instances

| State | xterm? | Memory |
|-------|--------|--------|
| Active-Focused | Yes | ~20MB |
| Active-Background | Yes (if budget allows) | ~20MB |
| Suspended | No (HTML pre scrollback) | ~200KB |
| Uninitialized | No (placeholder) | 0 |

On focus: serialize least-recent xterm scrollback, destroy it, create new for focused tab, reconnect PTY.

### Project Accent Colors (Catppuccin)

| Slot | Color | Variable |
|------|-------|----------|
| 1 | Blue | --ctp-blue |
| 2 | Green | --ctp-green |
| 3 | Mauve | --ctp-mauve |
| 4 | Peach | --ctp-peach |
| 5 | Pink | --ctp-pink |

---

## Sidecar Strategy

**Single shared sidecar** (unchanged from v2). Per-project isolation via:
- `cwd` per query (already implemented)
- `claude_config_dir` per query (already implemented)
- `session_id` routing (already implemented)

No sidecar changes needed for v3.0.

---

## Keyboard Shortcuts

| Shortcut | Action | Layer |
|----------|--------|-------|
| Ctrl+K | Command palette | App |
| Ctrl+G | Switch group (palette filtered) | App |
| Ctrl+1..5 | Focus project by index | App |
| Alt+1..4 | Switch workspace tab | App |
| Ctrl+N | New terminal in focused project | Workspace |
| Ctrl+Shift+N | New agent query | Workspace |
| Ctrl+Tab | Next terminal tab | Project |
| Ctrl+W | Close terminal tab | Project |
| Ctrl+, | Settings tab | App |
| Ctrl+Shift+C/V | Copy/paste in terminal | Terminal |

---

## Implementation Phases

### Phase 1: Data Model + Config [status: complete]
**Milestone: Groups config loads/saves, SQLite migrations pass, workspace store works**

- [x] Create `v2/src/lib/types/groups.ts` (TypeScript interfaces)
- [x] Create `v2/src-tauri/src/groups.rs` (Rust structs + load/save)
- [x] Add `groups_load`, `groups_save` Tauri commands to lib.rs
- [x] SQLite migrations in session.rs: project_id column, agent_messages table, project_agent_state table
- [x] Create `v2/src/lib/adapters/groups-bridge.ts` (IPC wrapper)
- [x] Create `v2/src/lib/stores/workspace.svelte.ts` (replaces layout.svelte.ts)
- [x] Add `--group` CLI argument parsing in main.rs
- [x] Write tests for groups load/save and workspace store (24 vitest + 7 cargo)

### Phase 2: Project Box Shell [status: complete]
**Milestone: Project boxes render horizontally with headers, workspace tabs switch**

- [x] Create GlobalTabBar.svelte (Sessions | Docs | Context | Settings)
- [x] Create ProjectGrid.svelte (flex + scroll-snap container)
- [x] Create ProjectBox.svelte (CSS grid: header | session-area | terminal-area)
- [x] Create ProjectHeader.svelte (icon + name + status dot + accent color)
- [x] Rewrite App.svelte (GlobalTabBar + tab content + StatusBar)
- [x] Create CommandPalette.svelte, DocsTab.svelte, ContextTab.svelte, SettingsTab.svelte
- [x] CSS for responsive project count + accent colors

### Phase 3: Claude Session Integration [status: complete]
**Milestone: Claude sessions run within project boxes, per-project profile isolation**

- [x] Create ClaudeSession.svelte (wraps AgentPane, passes project cwd/profile/config_dir)

### Phase 4: Terminal Tabs [status: complete]
**Milestone: Each project has tabbed terminals with xterm budget enforcement**

- [x] Create TerminalTabs.svelte (tab state per project, shell/SSH/agent tab types)

### Phase 5: Team Agents Panel [status: complete]
**Milestone: Subagents appear in right panel, not separate panes. MVP complete.**

- [x] Create TeamAgentsPanel.svelte (right side of session area)
- [x] Create AgentCard.svelte (compact subagent: status, messages, cost)

### --- MVP BOUNDARY ---

### Phase 6: Session Continuity [status: complete]
- [x] Persist agent messages to SQLite on session complete (agent-dispatcher persistSessionForProject)
- [x] Persist sdkSessionId in project_agent_state
- [x] On startup, load cached messages per project (ClaudeSession restoreMessagesFromRecords)
- [x] Session-project mapping via registerSessionProject()

### Phase 7: Command Palette + Group Switching [status: complete]
- [x] CommandPalette.svelte (overlay, Ctrl+K, fuzzy search)
- [x] Group list with switching
- [x] Workspace teardown on switch (clearAllAgentSessions + terminal tabs reset)

### Phase 8: Docs Tab [status: complete]
- [x] DocsTab.svelte with split layout (file picker + MarkdownPane)
- [x] Auto-discovers markdown files per project via discoverMarkdownFiles

### Phase 9: Settings Tab [status: complete]
- [x] SettingsTab.svelte (group CRUD + project CRUD)
- [x] 5-project limit enforcement

### Phase 10: Polish + Cleanup [status: complete]
- [x] Remove dead v2 components (TilingGrid, PaneContainer, PaneHeader, SessionList, SshSessionList, SshDialog, SettingsDialog)
- [x] Remove empty directories (Layout/, Sidebar/, Settings/, SSH/)
- [x] Rewrite StatusBar for workspace store
- [x] Fix subagent routing (skip layout pane for project-scoped agents)
- [x] All 138 vitest + cargo tests pass, vite build succeeds

---

## Decisions Log

| Decision | Rationale | Date |
|---|---|---|
| JSON for groups config, SQLite for session state | JSON is human-editable, shareable, version-controllable. SQLite for ephemeral runtime state. Load at startup only. | 2026-03-07 |
| Adaptive project count from viewport width | 5@5120px, 3@1920px, scroll-snap for overflow. min-width 480px. Better than forcing 5 at all sizes. | 2026-03-07 |
| Single shared sidecar (v3.0) | Existing multiplexed protocol handles concurrent sessions. Per-project pool deferred to v3.1 if crash isolation needed. Saves ~200MB RAM. | 2026-03-07 |
| xterm budget: 4 active, unlimited suspended | WebKit2GTK OOM at ~5 instances. Serialize scrollback to text buffer, destroy xterm, recreate on focus. PTY stays alive. | 2026-03-07 |
| Flexbox + scroll-snap over CSS Grid | Allows horizontal scroll on narrow screens. Scroll-snap gives clean project-to-project scrolling. | 2026-03-07 |
| Team panel: inline >2560px, overlay <2560px | Adapts to available space. Collapsed when no subagents running. | 2026-03-07 |
| 4 workspace tabs (Sessions/Docs/Context/Settings) | ctx viewer as separate tab per user requirement. Docs auto-discovered from projects. | 2026-03-07 |
| Project accent colors from Catppuccin palette | Visual distinction: blue/green/mauve/peach/pink per slot 1-5. Applied to border + header tint. | 2026-03-07 |
| Remote machines deferred to v3.1 | Elevate to project level (project.remote_machine_id) but don't implement in MVP. | 2026-03-07 |
| Keyboard shortcut layers: App > Workspace > Terminal | Prevents conflicts. Terminal captures raw keys only when focused. App layer uses Ctrl+K/G. | 2026-03-07 |
| AgentPane splits into ClaudeSession + TeamAgentsPanel | Team agents shown inline in right panel, not as separate panes. Saves xterm/pane slots. | 2026-03-07 |
| Unmount/remount on group switch | Serialize xterm scrollbacks, destroy, remount new group. <100ms perceived. Frees ~80MB. | 2026-03-07 |

## Errors Encountered

| Error | Cause | Fix | Date |
|---|---|---|---|
