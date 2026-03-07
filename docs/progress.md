# BTerminal v2 — Progress Log

> Earlier sessions (2026-03-05 to 2026-03-06 early): see [progress-archive.md](progress-archive.md)

### Session: 2026-03-06 (continued) — Multi-Machine Architecture Design

#### Multi-Machine Support Architecture
- [x] Designed full multi-machine architecture in docs/multi-machine.md (303 lines)
- [x] Three-layer model: BTerminal (controller) + bterminal-relay (remote binary) + unified frontend
- [x] WebSocket NDJSON protocol: RelayCommand/RelayEvent envelope wrapping existing sidecar format
- [x] Authentication: pre-shared token + TLS, rate limiting, lockout
- [x] Autonomous relay model: agents keep running when controller disconnects
- [x] Reconnection with exponential backoff (1s-30s), state_sync on reconnect
- [x] 4-phase implementation plan: A (extract bterminal-core crate), B (relay binary), C (RemoteManager), D (frontend)
- [x] Updated TODO.md and docs/task_plan.md to reference the design

### Session: 2026-03-06 (continued) — Multi-Machine Implementation (Phases A-D)

#### Phase A: bterminal-core crate extraction
- [x] Created Cargo workspace at v2/ level (v2/Cargo.toml, workspace members: src-tauri, bterminal-core, bterminal-relay)
- [x] Extracted PtyManager into v2/bterminal-core/src/pty.rs
- [x] Extracted SidecarManager into v2/bterminal-core/src/sidecar.rs
- [x] Created EventSink trait (v2/bterminal-core/src/event.rs) to abstract event emission
- [x] TauriEventSink (v2/src-tauri/src/event_sink.rs) implements EventSink for Tauri AppHandle
- [x] src-tauri/src/pty.rs and sidecar.rs now thin re-export wrappers
- [x] Cargo.lock moved from src-tauri/ to workspace root (v2/)

#### Phase B: bterminal-relay binary
- [x] New Rust binary at v2/bterminal-relay/ with WebSocket server (tokio-tungstenite)
- [x] Token auth via Authorization: Bearer header on WebSocket upgrade
- [x] CLI flags: --port (default 9750), --token (required), --insecure (allow ws://)
- [x] Routes RelayCommand types (pty_create/write/resize/close, agent_query/stop, sidecar_restart, ping)
- [x] Forwards RelayEvent types (pty_data/exit, sidecar_message/exited, error, pong, ready)
- [x] Rate limiting: 10 failed auth attempts triggers 5-minute lockout
- [x] Per-connection isolated PtyManager + SidecarManager instances

#### Phase C: RemoteManager in controller
- [x] New v2/src-tauri/src/remote.rs module — RemoteManager struct
- [x] WebSocket client connections to relay instances (tokio-tungstenite)
- [x] RemoteMachine struct: id, label, url, token, status (Connected/Connecting/Disconnected/Error)
- [x] Machine lifecycle: add_machine, remove_machine, connect, disconnect
- [x] 12 new Tauri commands: remote_add_machine, remote_remove_machine, remote_connect, remote_disconnect, remote_list_machines, remote_pty_spawn/write/resize/kill, remote_agent_query/stop, remote_sidecar_restart
- [x] Heartbeat ping every 15s to detect stale connections

#### Phase D: Frontend integration
- [x] v2/src/lib/adapters/remote-bridge.ts — IPC adapter for machine management + remote events
- [x] v2/src/lib/stores/machines.svelte.ts — Svelte 5 store for remote machine state
- [x] Layout store: added remoteMachineId?: string to Pane interface
- [x] agent-bridge.ts: routes to remote_agent_query/stop when pane has remoteMachineId
- [x] pty-bridge.ts: routes to remote_pty_spawn/write/resize/kill when pane has remoteMachineId
- [x] SettingsDialog: new "Remote Machines" section (add/remove/connect/disconnect UI)
- [x] SessionList sidebar: auto-groups remote panes by machine label

#### Verification
- cargo check --workspace: clean (0 errors)
- vitest: 114/114 tests passing
- svelte-check: clean (0 errors)

#### New dependencies added
- bterminal-core: serde, serde_json, log, portable-pty, uuid (extracted from src-tauri)
- bterminal-relay: tokio, tokio-tungstenite, clap, env_logger, futures-util
- src-tauri: tokio-tungstenite, tokio, futures-util, uuid (added for RemoteManager)

### Session: 2026-03-06 (continued) — Relay Hardening & Reconnection

#### Relay Command Response Propagation
- [x] Shared event channel between EventSink and command response sender (sink_tx clone in bterminal-relay)
- [x] send_error() helper function: all command failures now emit RelayEvent with commandId + error message instead of just logging
- [x] ping command: now sends pong response via event channel (was a no-op)
- [x] pty_create: returns pty_created event with session ID and commandId for correlation
- [x] All error paths (pty_write, pty_resize, pty_close, agent_query, agent_stop, sidecar_restart) use send_error()

#### RemoteManager Reconnection
- [x] Exponential backoff reconnection in remote.rs: spawns async tokio task on disconnect
- [x] Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s (capped)
- [x] attempt_tcp_probe() function: TCP-only connect probe (5s timeout, default port 9750) — avoids allocating per-connection resources on relay
- [x] Emits remote-machine-reconnecting (with backoffSecs) and remote-machine-reconnect-ready Tauri events
- [x] Cancellation: stops if machine removed (not in HashMap) or manually reconnected (status != disconnected)
- [x] Fixed scoping: disconnection cleanup uses inner block to release mutex before emitting event

#### RemoteManager PTY Creation Confirmation
- [x] Handles pty_created event type from relay: emits remote-pty-created Tauri event with machineId, ptyId, commandId

### Session: 2026-03-06 (continued) — Reconnection Hardening

#### TCP Probe Refactor
- [x] Replaced attempt_ws_connect() with attempt_tcp_probe() in remote.rs: TCP-only connect (no WS upgrade), 5s timeout, default port 9750
- [x] Avoids allocating per-connection resources (PtyManager, SidecarManager) on the relay during reconnection probes
- [x] Probe no longer needs auth token — only checks TCP reachability

#### Frontend Reconnection Listeners
- [x] Added onRemoteMachineReconnecting() listener in remote-bridge.ts: receives machineId + backoffSecs
- [x] Added onRemoteMachineReconnectReady() listener in remote-bridge.ts: receives machineId when probe succeeds
- [x] machines.svelte.ts: reconnecting handler sets machine status to 'reconnecting', shows toast with backoff duration
- [x] machines.svelte.ts: reconnect-ready handler auto-calls connectMachine() to re-establish full WebSocket connection
- [x] Updated docs/multi-machine.md to reflect TCP probe and frontend listener changes

### Session: 2026-03-06 (continued) — Sidecar Env Var Bug Fix

#### CLAUDE* Environment Variable Leak (critical fix)
- [x] Diagnosed silent hang in agent sessions when BTerminal launched from Claude Code terminal
- [x] Root cause: Claude Code sets ~8 CLAUDE* env vars for nesting/sandbox detection
- [x] Fixed both sidecar runners to filter out all keys starting with 'CLAUDE'

### Session: 2026-03-06 (continued) — Sidecar SDK Migration

#### Migration from CLI Spawning to Agent SDK
- [x] Diagnosed root cause: claude CLI v2.1.69 hangs with piped stdio (bug #6775)
- [x] Migrated both runners to @anthropic-ai/claude-agent-sdk query() function
- [x] Added build:sidecar script (esbuild bundle, SDK included)
- [x] SDK options: permissionMode configurable, allowDangerouslySkipPermissions conditional

#### Bug Found and Fixed
- [x] AgentPane onDestroy killed running sessions on layout remounts (fixed: moved to TilingGrid onClose)

### Session: 2026-03-06 (continued) — Permission Mode, AgentPane Bug Fix, SDK Bundling

#### Permission Mode Passthrough
- [x] permission_mode field flows Rust -> sidecar -> SDK, defaults to 'bypassPermissions'

#### AgentPane onDestroy Bug Fix
- [x] Stop-on-close moved from AgentPane onDestroy to TilingGrid onClose handler

#### SDK Bundling Fix
- [x] SDK bundled into agent-runner.mjs (no external dependency at runtime)

### Session: 2026-03-07 — Unified Sidecar Bundle

#### Sidecar Resolution Simplification
- [x] Consolidated to single pre-built bundle (dist/agent-runner.mjs) running on both Deno and Node.js
- [x] resolve_sidecar_command() checks runtime availability upfront, prefers Deno
- [x] agent-runner-deno.ts retained in repo but not used by SidecarManager

### Session: 2026-03-07 (continued) — Rust-Side CLAUDE* Env Var Stripping

#### Dual-Layer Env Var Stripping
- [x] Rust SidecarManager uses env_clear() + envs(clean_env) before spawn (primary defense)
- [x] JS-side stripping retained as defense-in-depth

### Session: 2026-03-07 (continued) — Claude CLI Path Detection

#### pathToClaudeCodeExecutable for SDK
- [x] Added findClaudeCli() to agent-runner.ts (Node.js): checks ~/.local/bin/claude, ~/.claude/local/claude, /usr/local/bin/claude, /usr/bin/claude, then falls back to `which claude`/`where claude`
- [x] Added findClaudeCli() to agent-runner-deno.ts (Deno): same candidate paths, uses Deno.statSync() + Deno.Command("which")
- [x] Both runners now pass pathToClaudeCodeExecutable to SDK query() options
- [x] Early error: if Claude CLI not found, agent_error emitted immediately instead of cryptic SDK failure
- [x] CLI path resolved once at sidecar startup, logged for debugging

### Session: 2026-03-07 (continued) — Claude Profiles & Skill Discovery

#### Claude Profile / Account Switching (switcher-claude integration)
- [x] New Tauri commands: claude_list_profiles(), claude_list_skills(), claude_read_skill(), pick_directory()
- [x] claude_list_profiles() reads ~/.config/switcher/profiles/ for profile directories with profile.toml metadata
- [x] Config dir resolution: ~/.config/switcher-claude/{name}/ or fallback ~/.claude/
- [x] extract_toml_value() simple TOML parser for profile metadata (email, subscription_type, display_name)
- [x] Always includes "default" profile if no switcher profiles found

#### Skill Discovery & Autocomplete
- [x] claude_list_skills() reads ~/.claude/skills/ directory (directories with SKILL.md or standalone .md files)
- [x] Description extracted from first non-heading, non-empty line (max 120 chars)
- [x] claude_read_skill(path) reads full skill file content
- [x] New frontend adapter: v2/src/lib/adapters/claude-bridge.ts (ClaudeProfile, ClaudeSkill interfaces)

#### AgentPane Session Toolbar
- [x] Working directory input (cwdInput) — editable text field, replaces fixed cwd prop
- [x] Profile/account selector dropdown (shown when >1 profile available)
- [x] Selected profile's config_dir passed as claude_config_dir in AgentQueryOptions
- [x] Skill autocomplete menu: type `/` to trigger, arrow keys navigate, Tab/Enter select, Escape dismiss
- [x] expandSkillPrompt(): reads skill content via readSkill(), prepends to prompt with optional user args

#### Extended AgentQueryOptions (full stack passthrough)
- [x] New fields in Rust AgentQueryOptions struct: setting_sources, system_prompt, model, claude_config_dir, additional_directories
- [x] Sidecar QueryMessage interface updated with matching fields
- [x] Both sidecar runners (agent-runner.ts, agent-runner-deno.ts) pass new fields to SDK query()
- [x] CLAUDE_CONFIG_DIR injected into cleanEnv when claudeConfigDir provided (multi-account support)
- [x] settingSources defaults to ['user', 'project'] (loads CLAUDE.md and project settings)
- [x] Frontend AgentQueryOptions interface updated in agent-bridge.ts

### Session: 2026-03-07 (continued) — v3 Mission Control Planning

#### v3 Architecture Planning
- [x] Created docs/v3-task_plan.md — core concept, user requirements, architecture questions
- [x] Created docs/v3-findings.md — codebase reuse analysis (what to keep/replace/drop)
- [x] Created docs/v3-progress.md — v3-specific progress log
- [x] Launched 3 adversarial architecture agents (Architect, Devil's Advocate, UX+Perf Specialist)
- [x] Collect adversarial agent findings
- [x] Produce final architecture plan
- [x] Create v3 implementation phases

### Session: 2026-03-07 (continued) — v3 Mission Control MVP Implementation (Phases 1-5)

#### Phase 1: Data Model + Config
- [x] Created v2/src/lib/types/groups.ts (ProjectConfig, GroupConfig, GroupsFile interfaces)
- [x] Created v2/src-tauri/src/groups.rs (Rust structs + load/save groups.json + default_groups())
- [x] Added groups_load, groups_save Tauri commands to lib.rs
- [x] SQLite migrations in session.rs: project_id column, agent_messages table, project_agent_state table
- [x] Created v2/src/lib/adapters/groups-bridge.ts (IPC wrapper)
- [x] Created v2/src/lib/stores/workspace.svelte.ts (replaces layout.svelte.ts for v3, Svelte 5 runes)
- [x] Added --group CLI argument parsing in main.rs
- [x] 24 vitest tests for workspace store + 7 cargo tests for groups

#### Phase 2: Project Box Shell
- [x] Created 12 new Workspace components in v2/src/lib/components/Workspace/
- [x] GlobalTabBar, ProjectGrid, ProjectBox, ProjectHeader, CommandPalette, DocsTab, ContextTab, SettingsTab
- [x] Rewrote App.svelte (no sidebar, no TilingGrid — GlobalTabBar + tab content + StatusBar)

#### Phase 3: Claude Session Integration
- [x] Created ClaudeSession.svelte wrapping AgentPane per-project

#### Phase 4: Terminal Tabs
- [x] Created TerminalTabs.svelte with shell/SSH/agent tab types

#### Phase 5: Team Agents Panel
- [x] Created TeamAgentsPanel.svelte + AgentCard.svelte

#### Bug Fix
- [x] Fixed AgentPane Svelte 5 event modifier: on:click -> onclick

#### Verification
- All 138 vitest + 36 cargo tests pass, vite build succeeds

### Session: 2026-03-07 (continued) — v3 Phases 6-10 Completion

#### Phase 6: Session Continuity
- [x] Added persistSessionForProject() to agent-dispatcher (saves state + messages to SQLite on complete)
- [x] Added registerSessionProject() + sessionProjectMap for session->project persistence routing
- [x] ClaudeSession restoreMessagesFromRecords() restores cached messages on mount
- [x] Added getAgentSession() export to agents store

#### Phase 7: Workspace Teardown
- [x] Added clearAllAgentSessions() to agents store
- [x] switchGroup() calls clearAllAgentSessions() + resets terminal tabs
- [x] Updated workspace.test.ts with clearAllAgentSessions mock

#### Phase 10: Dead Component Removal + Polish
- [x] Deleted 7 dead v2 components (~1,836 lines): TilingGrid, PaneContainer, PaneHeader, SessionList, SshSessionList, SshDialog, SettingsDialog
- [x] Removed empty directories: Layout/, Sidebar/, Settings/, SSH/
- [x] Rewrote StatusBar for workspace store (group name, project count, "BTerminal v3")
- [x] Fixed subagent routing: project-scoped sessions skip layout pane (render in TeamAgentsPanel)
- [x] Updated v3-task_plan.md to mark all 10 phases complete

#### Verification
- All 138 vitest + 36 cargo tests pass, vite build succeeds

### Session: 2026-03-07 (continued) — Multi-Theme System

#### Theme System Generalization (7 Editor Themes)
- [x] Generalized CatppuccinFlavor to ThemeId union type (11 themes)
- [x] Added 7 editor themes: VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark
- [x] Added ThemePalette, ThemeMeta, THEME_LIST types; deprecated old Catppuccin-only types
- [x] Theme store: getCurrentTheme()/setTheme() with deprecated wrappers for backwards compat
- [x] SettingsTab: optgroup-based theme selector, fixed input overflow with min-width:0
- [x] All themes map to same --ctp-* CSS vars — zero component changes needed

#### Verification
- All 138 vitest + 35 cargo tests pass

### Session: 2026-03-07 (continued) — Deep Dark Theme Group

#### 6 New Deep Dark Themes
- [x] Added Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight to themes.ts
- [x] Extended ThemeId from 11 to 17 values, THEME_LIST from 11 to 17 entries
- [x] New "Deep Dark" theme group (3rd group alongside Catppuccin and Editor)
- [x] Midnight is pure OLED black (#000000), Ayu Dark near-black (#0b0e14), Vesper warm dark (#101010)
- [x] All 6 themes map to same 26 --ctp-* CSS vars — zero component changes needed

### Session: 2026-03-07 (continued) — Custom Theme Dropdown

#### SettingsTab Theme Picker Redesign
- [x] Replaced native `<select>` with custom themed dropdown in SettingsTab.svelte
- [x] Trigger: color swatch (base) + label + arrow; menu: grouped sections with styled headers
- [x] Options show color swatch + label + 4 accent dots (red/green/blue/yellow) via getPalette()
- [x] Click-outside and Escape to close; aria-haspopup/aria-expanded for a11y
- [x] Uses --ctp-* CSS vars — fully themed with active theme

### Session: 2026-03-07 (continued) — Global Font Controls

#### SettingsTab Font Controls + Layout Restructure
- [x] Added font family select (9 monospace fonts + Default) with live CSS var preview
- [x] Added font size +/- stepper (8-24px range) with live CSS var preview
- [x] Restructured global settings: 2-column grid layout with labels above controls (replaced inline rows)
- [x] Added --ui-font-family and --ui-font-size CSS custom properties to catppuccin.css
- [x] app.css body rule now uses CSS vars instead of hardcoded font values
- [x] initTheme() in theme.svelte.ts restores saved font settings on startup (try/catch, non-fatal)
- [x] Font settings persisted as 'font_family' and 'font_size' keys in SQLite settings table

### Session: 2026-03-07 (continued) — SettingsTab Global Settings Redesign

#### Font Settings Split (UI Font + Terminal Font)
- [x] Split single font into UI font (sans-serif: System Sans-Serif, Inter, Roboto, etc.) and Terminal font (monospace: JetBrains Mono, Fira Code, etc.)
- [x] Each font dropdown renders preview text in its own typeface
- [x] Independent size steppers (8-24px) for UI and Terminal font
- [x] Setting keys changed: font_family/font_size -> ui_font_family/ui_font_size + term_font_family/term_font_size

#### SettingsTab Layout + CSS Updates
- [x] Rewrote global settings: single-column layout, "Appearance" + "Defaults" subsections
- [x] All dropdowns are custom themed (no native `<select>` anywhere)
- [x] Added --term-font-family and --term-font-size CSS vars to catppuccin.css
- [x] Updated initTheme() to restore 4 font settings instead of 2

### Next Steps
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning for relay connections
- [ ] E2E testing with Playwright/WebDriver (when display server available)
- [ ] Test agent teams with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
