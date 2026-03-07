# BTerminal v3 — Progress Log

### Session: 2026-03-07 — Architecture Planning + MVP Implementation (Phases 1-5)

#### Phase: Adversarial Design Review
- [x] Launch 3 architecture agents (Architect, Devil's Advocate, UX+Performance Specialist)
- [x] Collect findings — 12 issues identified, all resolved
- [x] Produce final architecture plan in docs/v3-task_plan.md
- [x] Create 10-phase implementation plan

#### Phase 1: Data Model + Config
- [x] Created `v2/src/lib/types/groups.ts` — TypeScript interfaces (ProjectConfig, GroupConfig, GroupsFile)
- [x] Created `v2/src-tauri/src/groups.rs` — Rust structs + load/save groups.json
- [x] Added `groups_load`, `groups_save` Tauri commands to lib.rs
- [x] SQLite migrations in session.rs: project_id column, agent_messages table, project_agent_state table
- [x] Created `v2/src/lib/adapters/groups-bridge.ts` (IPC wrapper)
- [x] Created `v2/src/lib/stores/workspace.svelte.ts` (replaces layout.svelte.ts, Svelte 5 runes)
- [x] Added `--group` CLI argument parsing in main.rs
- [x] Wrote 24 vitest tests for workspace store (workspace.test.ts)
- [x] Wrote cargo tests for groups load/save/default

#### Phase 2: Project Box Shell
- [x] Created GlobalTabBar.svelte (Sessions | Docs | Context | Settings)
- [x] Created ProjectGrid.svelte (flex + scroll-snap container)
- [x] Created ProjectBox.svelte (CSS grid: header | session-area | terminal-area)
- [x] Created ProjectHeader.svelte (icon + name + status dot + accent color)
- [x] Rewrote App.svelte (GlobalTabBar + tab content + StatusBar, no sidebar/TilingGrid)
- [x] Created CommandPalette.svelte (Ctrl+K overlay with fuzzy search)
- [x] Created DocsTab.svelte (markdown file browser per project)
- [x] Created ContextTab.svelte (wrapper for ContextPane)
- [x] Created SettingsTab.svelte (per-project + global settings editor)
- [x] CSS for responsive project count + Catppuccin accent colors

#### Phase 3: Claude Session Integration
- [x] Created ClaudeSession.svelte (wraps AgentPane, passes project cwd/profile/config_dir)

#### Phase 4: Terminal Tabs
- [x] Created TerminalTabs.svelte (tab bar + content, shell/SSH/agent tab types)

#### Phase 5: Team Agents Panel
- [x] Created TeamAgentsPanel.svelte (right panel for subagents)
- [x] Created AgentCard.svelte (compact subagent view: status, messages, cost)

#### Bug Fix
- [x] Fixed AgentPane Svelte 5 event modifier syntax: `on:click` -> `onclick` (Svelte 5 requires lowercase event attributes)

#### Verification
- All 138 vitest tests pass (114 existing + 24 new workspace tests)
- All 36 cargo tests pass (29 existing + 7 new groups tests)
- Vite build succeeds

### Session: 2026-03-07 — Phases 6-10 Completion

#### Phase 6: Session Continuity
- [x] Added `persistSessionForProject()` to agent-dispatcher — saves agent state + messages to SQLite on session complete
- [x] Added `registerSessionProject()` — maps sessionId -> projectId for persistence routing
- [x] Added `sessionProjectMap` (Map<string, string>) in agent-dispatcher
- [x] Updated ClaudeSession.svelte: `restoreMessagesFromRecords()` restores cached messages into agent store on mount
- [x] ClaudeSession loads previous state via `loadProjectAgentState()`, restores session ID and messages
- [x] Added `getAgentSession()` export to agents store

#### Phase 7: Workspace Teardown on Group Switch
- [x] Added `clearAllAgentSessions()` to agents store (clears sessions array)
- [x] Updated `switchGroup()` in workspace store to call `clearAllAgentSessions()` + reset terminal tabs
- [x] Updated workspace.test.ts to mock `clearAllAgentSessions`

#### Phase 10: Dead Component Removal + Polish
- [x] Deleted `TilingGrid.svelte` (328 lines), `PaneContainer.svelte` (113 lines), `PaneHeader.svelte` (44 lines)
- [x] Deleted `SessionList.svelte` (374 lines), `SshSessionList.svelte` (263 lines), `SshDialog.svelte` (281 lines), `SettingsDialog.svelte` (433 lines)
- [x] Removed empty directories: Layout/, Sidebar/, Settings/, SSH/
- [x] Rewrote StatusBar.svelte for workspace store (group name, project count, agent count, "BTerminal v3" label)
- [x] Fixed subagent routing in agent-dispatcher: project-scoped sessions skip layout pane creation (subagents render in TeamAgentsPanel instead)
- [x] Updated v3-task_plan.md to mark all 10 phases complete

#### Verification
- All 138 vitest tests pass (including updated workspace tests with clearAllAgentSessions mock)
- All 36 cargo tests pass
- Vite build succeeds
- ~1,836 lines of dead code removed
