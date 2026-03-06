# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Exponential backoff reconnection in RemoteManager: on disconnect, spawns async task with 1s/2s/4s/8s/16s/30s-cap backoff, uses attempt_tcp_probe() (TCP-only, no WS upgrade, 5s timeout, default port 9750), emits remote-machine-reconnecting and remote-machine-reconnect-ready events
- Frontend reconnection listeners: onRemoteMachineReconnecting and onRemoteMachineReconnectReady in remote-bridge.ts; machines store sets status to 'reconnecting' and auto-calls connectMachine() on ready
- Relay command response propagation: bterminal-relay now sends structured responses (pty_created, pong, error) back to client via shared event channel with commandId correlation
- send_error() helper in bterminal-relay for consistent error reporting across all command handlers
- PTY creation confirmation flow: pty_create command returns pty_created event with session ID and commandId; RemoteManager emits remote-pty-created Tauri event
- bterminal-core shared crate with EventSink trait: extracted PtyManager and SidecarManager into reusable crate at v2/bterminal-core/, EventSink trait abstracts event emission for both Tauri and WebSocket contexts
- bterminal-relay WebSocket server binary: standalone Rust binary at v2/bterminal-relay/ with token auth (--port, --token, --insecure CLI flags), rate limiting (10 attempts, 5min lockout), per-connection isolated PTY + sidecar managers
- RemoteManager for multi-machine WebSocket connections: v2/src-tauri/src/remote.rs manages WebSocket client connections to relay instances, 12 new Tauri commands for remote operations, heartbeat ping every 15s
- Remote machine management UI in settings: SettingsDialog "Remote Machines" section for add/remove/connect/disconnect
- Auto-grouping of remote panes in sidebar: remote panes auto-grouped by machine label in SessionList
- remote-bridge.ts adapter for remote machine IPC operations
- machines.svelte.ts store for remote machine state management (Svelte 5 runes)
- Pane.remoteMachineId field in layout store for local vs remote routing
- TauriEventSink (event_sink.rs) implementing EventSink trait for Tauri AppHandle
- Multi-machine support architecture design (`docs/multi-machine.md`): WebSocket NDJSON protocol, pre-shared token + TLS auth, autonomous relay model
- Subagent cost aggregation: getTotalCost() recursive helper in agents store aggregates cost across parent + all child sessions; total cost displayed in parent pane done-bar when children present
- 10 new subagent routing tests in agent-dispatcher.test.ts: spawn, dedup, child message routing, init/cost forwarding, fallbacks (28 total dispatcher tests, 114 vitest tests overall)
- TAURI_SIGNING_PRIVATE_KEY secret set in GitHub repo for auto-update signing
- Agent teams/subagent support (Phase 7): auto-detects subagent tool calls ('Agent', 'Task', 'dispatch_agent'), spawns child agent panes with parent/child navigation, routes messages via parentId field
- Agent store parent/child hierarchy: AgentSession extended with parentSessionId, parentToolUseId, childSessionIds; findChildByToolUseId() and getChildSessions() query functions
- AgentPane parent link bar: SUB badge with navigate-to-parent button for subagent panes
- AgentPane children bar: clickable chips per child subagent with status-colored indicators (running/done/error)
- SessionList subagent icon: subagent panes show '↳' instead of '*' in sidebar
- Session groups/folders: group_name column in sessions table, setPaneGroup in layout store, collapsible group headers in sidebar with arrow/count, right-click pane to set group
- Auto-update signing key: generated minisign keypair, pubkey configured in tauri.conf.json updater section
- Deno-first sidecar: SidecarCommand struct in sidecar.rs, resolve_sidecar_command() prefers Deno (runs TS directly) with Node.js fallback, both runners bundled via tauri.conf.json resources
- Vitest integration tests: layout.test.ts (30 tests), agent-bridge.test.ts (11 tests), agent-dispatcher.test.ts (28 tests) — total 114 vitest tests passing
- E2E test scaffold: v2/tests/e2e/README.md documenting WebDriver approach
- Terminal copy/paste: Ctrl+Shift+C copies selection, Ctrl+Shift+V pastes from clipboard to PTY (TerminalPane.svelte)
- Terminal theme hot-swap: onThemeChange() callback registry in theme.svelte.ts, open terminals update immediately when flavor changes
- Agent tree node click: clicking a tree node scrolls to the corresponding message in the agent pane (scrollIntoView smooth)
- Agent tree subtree cost: cumulative cost displayed in yellow below each tree node label (subtreeCost utility)
- Agent session resume: follow-up prompt input after session completes or errors, passes resume_session_id to SDK
- Pane drag-resize handles: splitter overlays in TilingGrid with mouse drag, supports 2-col/3-col/2-row layouts with 10-90% ratio clamping
- Auto-update CI workflow: release.yml generates latest.json with version, platform URL, and signature from .sig file; uploads as release artifact
- Deno sidecar proof-of-concept: agent-runner-deno.ts with same NDJSON protocol, compiles to single binary via deno compile
- Vitest test suite: sdk-messages.test.ts (SDK message adapter) and agent-tree.test.ts (tree builder/cost), vite.config.ts test config, npm run test script
- Cargo test suite: session.rs tests (SessionDb CRUD for sessions, SSH sessions, settings, layout) and ctx.rs tests (CtxDb error handling with missing database)
- tempfile dev dependency for Rust test isolation

### Fixed
- Sidecar env var leak: both agent-runner.ts and agent-runner-deno.ts now strip ALL `CLAUDE*` prefixed env vars before spawning the claude CLI, preventing silent hangs when BTerminal is launched from within a Claude Code terminal session (previously only CLAUDECODE was removed)

### Changed
- RemoteManager reconnection probe refactored from attempt_ws_connect() (full WS handshake + auth) to attempt_tcp_probe() (TCP-only connect, no resource allocation on relay)
- bterminal-relay command handlers refactored: all error paths now use send_error() helper instead of log::error!() only; pong response sent via event channel instead of no-op
- RemoteManager disconnect handler: scoped mutex release before event emission to prevent deadlocks; spawns reconnection task
- PtyManager and SidecarManager extracted from src-tauri to bterminal-core shared crate (src-tauri now has thin re-export wrappers)
- Cargo workspace structure at v2/ level: members = [src-tauri, bterminal-core, bterminal-relay], Cargo.lock moved from src-tauri/ to workspace root
- agent-bridge.ts and pty-bridge.ts extended with remote routing (check remoteMachineId, route to remote_* commands)
- Agent dispatcher refactored to split messages: parentId-bearing messages routed to child panes via toolUseToChildPane Map, main session messages stay in parent
- Agent store createAgentSession() now accepts optional parent parameter for registering bidirectional parent/child links
- Agent store removeAgentSession() cleans up parent's childSessionIds on removal
- Sidecar manager refactored from Node.js-only to Deno-first with Node.js fallback (SidecarCommand abstraction)
- Session struct: added group_name field with serde default
- SessionDb: added update_group method, list/save queries updated for group_name column
- SessionList sidebar: uses Svelte 5 snippets for grouped pane rendering with collapsible headers
- Agent tree NODE_H increased from 32 to 40 to accommodate subtree cost display
- release.yml build step now passes TAURI_SIGNING_PRIVATE_KEY and PASSWORD env vars from secrets
- release.yml uploads latest.json alongside .deb and .AppImage artifacts
- vitest ^4.0.18 added as npm dev dependency

### Previously Added
- SSH session management: SshSession CRUD in SQLite, SshDialog create/edit modal, SshSessionList grouped by folder with color dots, SSH pane type routing to TerminalPane with shell=/usr/bin/ssh (Phase 5)
- ctx context database integration: read-only CtxDb (Rust, SQLITE_OPEN_READ_ONLY), ContextPane with project selector, tabs for entries/summaries/search, ctx-bridge adapter (Phase 5)
- Catppuccin theme flavors: all 4 palettes (Latte/Frappe/Macchiato/Mocha) selectable via Settings dialog, theme.svelte.ts reactive store with SQLite persistence, TerminalPane theme-aware (Phase 5)
- Detached pane mode: pop-out terminal/agent panes into standalone windows via URL params (?detached=1), detach.ts utility, App.svelte conditional rendering (Phase 5)
- Shiki syntax highlighting: lazy singleton highlighter with catppuccin-mocha theme, 13 preloaded languages, integrated in MarkdownPane and AgentPane text messages (Phase 5)
- Tauri auto-updater plugin: tauri-plugin-updater (Rust + npm) + updater.ts frontend utility (Phase 6)
- Markdown rendering in agent text messages with Shiki code highlighting (Phase 5)
- Build-from-source installer `install-v2.sh` with 6-step dependency checking (Node.js 20+, Rust 1.77+, WebKit2GTK, GTK3, and 8 other system libraries), auto-install via apt, binary install to `~/.local/bin/bterminal-v2` with desktop entry (Phase 6)
- Tauri bundle configuration for .deb and AppImage targets with category, descriptions, and deb dependencies (Phase 6)
- GitHub Actions release workflow (`.github/workflows/release.yml`): triggered on `v*` tags, builds on Ubuntu 22.04 with Rust/npm caching, uploads .deb + AppImage as GitHub Release artifacts (Phase 6)
- Regenerated application icons from `bterminal.svg` as RGBA PNGs (32x32, 128x128, 256x256, 512x512, .ico) (Phase 6)
- Agent tree visualization: SVG tree of tool calls with horizontal layout, bezier edges, status-colored nodes (AgentTree.svelte + agent-tree.ts) (Phase 5)
- Global status bar showing terminal/agent pane counts, active agents with pulse animation, total tokens and cost (StatusBar.svelte) (Phase 5)
- Toast notification system with auto-dismiss (4s), max 5 visible, color-coded by type (notifications.svelte.ts + ToastContainer.svelte) (Phase 5)
- Agent dispatcher toast integration: notifications on agent complete, error, and sidecar crash (Phase 5)
- Settings dialog with default shell, working directory, and max panes configuration (SettingsDialog.svelte) (Phase 5)
- Settings persistence: key-value settings table in SQLite, Tauri commands settings_get/set/list, settings-bridge.ts adapter (Phase 5)
- Keyboard shortcuts: Ctrl+W close focused pane, Ctrl+, open settings dialog (Phase 5)
- SQLite session persistence with rusqlite (bundled, WAL mode) — sessions table + layout_state singleton (Phase 4)
- Session CRUD: save, delete, update_title, touch with 7 Tauri commands (Phase 4)
- Layout restore on app startup — panes and preset restored from database (Phase 4)
- File watcher backend using notify crate v6 — watches files, emits Tauri events on change (Phase 4)
- MarkdownPane component with marked.js rendering, Catppuccin-themed styles, and live reload (Phase 4)
- Sidebar "M" button for opening markdown/text files via file picker (Phase 4)
- Session bridge adapter for Tauri IPC (session + layout persistence wrappers) (Phase 4)
- File bridge adapter for Tauri IPC (watch, unwatch, read, onChange wrappers) (Phase 4)
- Sidecar crash detection — dispatcher listens for process exit, marks running sessions as error (Phase 3 polish)
- Sidecar restart UI — "Restart Sidecar" button in AgentPane error bar (Phase 3 polish)
- Auto-scroll lock — disables auto-scroll when user scrolls up, shows "Scroll to bottom" button (Phase 3 polish)
- Agent restart Tauri command (agent_restart) (Phase 3 polish)
- Agent pane with prompt input, structured message rendering, stop button, and cost display (Phase 3)

### Fixed
- Svelte 5 rune stores (layout, agents, sessions) renamed from `.ts` to `.svelte.ts` — runes only work in `.svelte` and `.svelte.ts` files, plain `.ts` caused "rune_outside_svelte" runtime error (blank screen)
- Updated all import paths to use `.svelte` suffix for store modules
- Node.js sidecar manager (Rust) for spawning and communicating with agent-runner via stdio NDJSON (Phase 3)
- Agent-runner sidecar: spawns `claude` CLI with `--output-format stream-json` for structured agent output (Phase 3)
- SDK message adapter parsing stream-json into 9 typed message types: init, text, thinking, tool_call, tool_result, status, cost, error, unknown (Phase 3)
- Agent bridge adapter for Tauri IPC (invoke + event listeners) (Phase 3)
- Agent dispatcher routing sidecar events to agent session store (Phase 3)
- Agent session store with message history, cost tracking, and lifecycle management (Phase 3)
- Keyboard shortcut: Ctrl+Shift+N to open new agent pane (Phase 3)
- Sidebar button for creating new agent sessions (Phase 3)
- Rust PTY backend with portable-pty: spawn, write, resize, kill with Tauri event streaming (Phase 2)
- xterm.js terminal pane with Canvas addon, FitAddon, and Catppuccin Mocha theme (Phase 2)
- CSS Grid tiling layout with 5 presets: 1-col, 2-col, 3-col, 2x2, master-stack (Phase 2)
- Layout store with Svelte 5 $state runes and auto-preset selection (Phase 2)
- Sidebar with session list, layout preset selector, and new terminal button (Phase 2)
- Keyboard shortcuts: Ctrl+N new terminal, Ctrl+1-4 focus pane (Phase 2)
- PTY bridge adapter for Tauri IPC (invoke + event listeners) (Phase 2)
- PaneContainer component with header bar, status indicator, and close button (Phase 2)
- Terminal resize handling with ResizeObserver and 100ms debounce (Phase 2)
- v2 project scaffolding: Tauri 2.x + Svelte 5 in `v2/` directory (Phase 1)
- Rust backend stubs: main.rs, lib.rs, pty.rs, sidecar.rs, watcher.rs, session.rs (Phase 1)
- Svelte frontend with Catppuccin Mocha CSS variables and component structure (Phase 1)
- Node.js sidecar scaffold with NDJSON communication pattern (Phase 1)
- v2 architecture planning: Tauri 2.x + Svelte 5 + Claude Agent SDK via Node.js sidecar
- Research documentation covering Agent SDK, xterm.js performance, Tauri ecosystem, and ultrawide layout patterns
- Phased implementation plan (6 phases, MVP = Phases 1-4)
- Error handling and testing strategy for v2
- Documentation structure in `docs/` (task_plan, phases, findings, progress)
- 17 operational rules in `.claude/rules/`
- TODO.md for tracking active work
- `.claude/CLAUDE.md` behavioral guide for Claude sessions
- VS Code workspace configuration with Peacock color
