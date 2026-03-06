# BTerminal v2 — Progress Log

## Session: 2026-03-05

### Research Phase (complete)
- [x] Analyzed current BTerminal v1 codebase (2092 lines Python, GTK3+VTE)
- [x] Queried Memora — no existing BTerminal memories
- [x] Researched Claude Agent SDK — found structured streaming, subagent tracking, hooks
- [x] Researched Tauri + xterm.js ecosystem — found 4+ working projects
- [x] Researched terminal latency benchmarks — xterm.js acceptable for AI output
- [x] Researched 32:9 ultrawide layout patterns
- [x] Evaluated GTK4 vs Tauri vs pure Rust — Tauri wins for this use case
- [x] Created task_plan.md with 8 phases
- [x] Created findings.md with 7 research areas

### Technology Decision (complete)
- Decision: **Tauri 2.x + Solid.js + Claude Agent SDK + xterm.js**
- Rationale documented in task_plan.md Phase 0

### Adversarial Review (complete)
- [x] Spawned devil's advocate agent to attack the plan
- [x] Identified 5 fatal/critical issues:
  1. Node.js sidecar requirement unacknowledged
  2. SDK 0.2.x instability — need abstraction layer
  3. Three-tier observation overengineered → simplified to two-tier
  4. Solid.js ecosystem too small → switched to Svelte 5
  5. Missing: packaging, error handling, testing, responsive design
- [x] Revised plan (Rev 2) incorporating all corrections
- [x] Added error handling strategy table
- [x] Added testing strategy table
- [x] Defined MVP boundary (Phases 1-4)
- [x] Added responsive layout requirement (1920px degraded mode)

### Phase 1 Scaffolding (complete)
- [x] Created feature branch `v2-mission-control`
- [x] Initialized Tauri 2.x + Svelte 5 project in `v2/` directory
- [x] Rust backend stubs: main.rs, lib.rs, pty.rs, sidecar.rs, watcher.rs, session.rs
- [x] Svelte frontend: App.svelte with Catppuccin Mocha CSS variables, component stubs
- [x] Node.js sidecar scaffold: agent-runner.ts with NDJSON communication pattern
- [x] Tauri builds and launches (cargo build --release verified)
- [x] Dev scripts: npm run dev, npm run build, npm run tauri dev/build
- [x] 17 operational rules added to `.claude/rules/`
- [x] Project meta files: CLAUDE.md, .claude/CLAUDE.md, TODO.md, CHANGELOG.md
- [x] Documentation structure: docs/README.md, task_plan.md, phases.md, findings.md, progress.md

### Phase 2: Terminal Pane + Layout (complete)
- [x] Rust PTY backend with portable-pty (PtyManager: spawn, write, resize, kill)
- [x] PTY reader thread emitting Tauri events (pty-data-{id}, pty-exit-{id})
- [x] Tauri commands: pty_spawn, pty_write, pty_resize, pty_kill
- [x] xterm.js terminal pane with Canvas addon (explicit, no WebGL)
- [x] Catppuccin Mocha theme for xterm.js (16 ANSI colors)
- [x] FitAddon with ResizeObserver + 100ms debounce
- [x] PTY bridge adapter (spawnPty, writePty, resizePty, killPty, onPtyData, onPtyExit)
- [x] CSS Grid tiling layout with 5 presets (1-col, 2-col, 3-col, 2x2, master-stack)
- [x] Layout store with Svelte 5 $state runes and auto-preset selection
- [x] Sidebar with session list, layout preset selector, new terminal button
- [x] Keyboard shortcuts: Ctrl+N new terminal, Ctrl+1-4 focus pane
- [x] PaneContainer with header bar (title, status, close)
- [x] Empty state welcome screen with Ctrl+N hint
- [x] npm dependencies: @xterm/xterm, @xterm/addon-canvas, @xterm/addon-fit
- [x] Cargo dependencies: portable-pty, uuid

### Phase 3: Agent SDK Integration (in progress)
- [x] Rust SidecarManager: spawn Node.js, stdio NDJSON, query/stop/shutdown (sidecar.rs, 218 lines)
- [x] Node.js agent-runner: spawns `claude -p --output-format stream-json`, manages sessions (agent-runner.ts, 176 lines)
- [x] Tauri commands: agent_query, agent_stop, agent_ready in lib.rs
- [x] Sidecar auto-start on app launch
- [x] SDK message adapter: full stream-json parser with 9 typed message types (sdk-messages.ts, 234 lines)
- [x] Agent bridge: Tauri IPC adapter for sidecar communication (agent-bridge.ts, 53 lines)
- [x] Agent dispatcher: routes sidecar events to agent store (agent-dispatcher.ts, 87 lines)
- [x] Agent store: session state with messages, cost tracking (agents.svelte.ts, 91 lines)
- [x] AgentPane component: prompt input, message rendering, stop button, cost display (AgentPane.svelte, 420 lines)
- [x] UI integration: Ctrl+Shift+N for new agent, sidebar agent button, TilingGrid routing

Architecture decision: Initially used `claude` CLI with `--output-format stream-json`. Migrated to `@anthropic-ai/claude-agent-sdk` query() due to CLI piped stdio hang bug (#6775). SDK outputs same message format, so adapter unchanged.

### Bug Fix: Svelte 5 Rune File Extensions (2026-03-06)
- [x] Diagnosed blank screen / "rune_outside_svelte" runtime error
- [x] Root cause: store files used `.ts` extension but contain Svelte 5 `$state`/`$derived` runes, which only work in `.svelte` and `.svelte.ts` files
- [x] Renamed: `layout.ts` -> `layout.svelte.ts`, `agents.ts` -> `agents.svelte.ts`, `sessions.ts` -> `sessions.svelte.ts`
- [x] Updated all import paths in 5 files to use `.svelte` suffix (e.g., `from './stores/layout.svelte'`)

### Phase 3 Polish (2026-03-06)
- [x] Sidecar crash detection: dispatcher listens for sidecar-exited event, marks running sessions as error
- [x] Restart UI: "Restart Sidecar" button in AgentPane error bar, calls agent_restart command
- [x] Auto-scroll lock: scroll handler disables auto-scroll when user scrolls >50px from bottom, "Scroll to bottom" button appears

### Phase 4: Session Management + Markdown Viewer (2026-03-06)
- [x] rusqlite 0.31 (bundled) + dirs 5 + notify 6 added to Cargo.toml
- [x] SessionDb: SQLite with WAL mode, sessions table + layout_state singleton
- [x] Session CRUD: list, save, delete, update_title, touch (7 Tauri commands)
- [x] Frontend session-bridge.ts: typed invoke wrappers for all session/layout commands
- [x] Layout store wired to persistence: addPane/removePane/focusPane/setPreset all persist
- [x] restoreFromDb() on app startup restores panes in layout order
- [x] FileWatcherManager: notify crate watches files, emits Tauri "file-changed" events
- [x] MarkdownPane component: marked.js rendering, Catppuccin-themed styles, live reload
- [x] Sidebar "M" button opens file picker for .md/.markdown/.txt files
- [x] TilingGrid routes markdown pane type to MarkdownPane component

### Phase 5: Agent Tree + Polish (2026-03-06, complete)
- [x] Agent tree visualization (SVG): AgentTree.svelte component with horizontal tree layout, bezier edges, status-colored nodes; agent-tree.ts utility (buildAgentTree, countTreeNodes, subtreeCost)
- [x] Agent tree toggle in AgentPane: collapsible tree view shown when tool_call messages exist
- [x] Global status bar: StatusBar.svelte showing terminal/agent pane counts, active agents with pulse animation, total tokens and cost
- [x] Notification system: notifications.svelte.ts store (notify, dismissNotification, max 5 toasts, 4s auto-dismiss) + ToastContainer.svelte (slide-in animation, color-coded by type)
- [x] Agent dispatcher notifications: toast on agent_stopped (success), agent_error (error), sidecar crash (error), cost result (success with cost/turns)
- [x] Settings dialog: SettingsDialog.svelte modal (default shell, cwd, max panes, theme flavor) with settings-bridge.ts adapter
- [x] Settings backend: settings table (key/value) in session.rs, Tauri commands settings_get/set/list in lib.rs
- [x] Keyboard shortcuts: Ctrl+W close focused pane, Ctrl+, open settings dialog
- [x] CSS grid update: app.css grid-template-rows '1fr' -> '1fr auto' for status bar row
- [x] App.svelte: integrated StatusBar, ToastContainer, SettingsDialog components

### Phase 6: Packaging + Distribution (2026-03-06)
- [x] Created install-v2.sh — build-from-source installer with 6-step dependency check process
  - Checks Node.js 20+, Rust 1.77+, system libs (WebKit2GTK, GTK3, GLib, etc.)
  - Prompts to install missing packages via apt
  - Builds with `npx tauri build`, installs to ~/.local/bin/bterminal-v2
  - Creates desktop entry and installs SVG icon
- [x] Updated v2/src-tauri/tauri.conf.json: bundle targets ["deb", "appimage"], category, descriptions, deb depends, appimage settings
- [x] Regenerated all icons in v2/src-tauri/icons/ from bterminal.svg as RGBA PNGs (32x32, 128x128, 256x256, 512x512, .ico)
- [x] Created .github/workflows/release.yml — CI workflow triggered on v* tags
  - Ubuntu 22.04 runner, caches Rust/npm deps
  - Builds .deb + AppImage, uploads as GitHub Release artifacts via softprops/action-gh-release@v2
- [x] Build verified: .deb (4.3 MB), AppImage (103 MB) both built successfully
- [ ] Tauri auto-update plugin deferred (needs signing key + update server)

### Phase 5 continued: SSH, ctx, themes, detached mode, auto-updater (2026-03-06)
- [x] ctx integration: Rust ctx.rs (read-only CtxDb with SQLITE_OPEN_READ_ONLY), 5 Tauri commands (ctx_list_projects, ctx_get_context, ctx_get_shared, ctx_get_summaries, ctx_search), ctx-bridge.ts adapter, ContextPane.svelte (project selector, tabs for entries/summaries/search)
- [x] SSH session management: SshSession struct + ssh_sessions table in session.rs, 3 Tauri commands (ssh_session_list/save/delete), ssh-bridge.ts adapter, SshDialog.svelte (create/edit modal with validation), SshSessionList.svelte (grouped by folder, color dots)
- [x] TilingGrid SSH routing: SSH pane type routes to TerminalPane with shell=/usr/bin/ssh and constructed args array
- [x] Catppuccin theme flavors: themes.ts with all 4 palettes (Latte/Frappe/Macchiato/Mocha), theme.svelte.ts reactive store, SettingsDialog flavor dropdown, TerminalPane uses getXtermTheme(), persistence via SQLite settings
- [x] Detached pane mode: detach.ts utility (isDetachedMode, getDetachedConfig from URL params), App.svelte renders single pane in full-viewport without chrome when ?detached=1
- [x] Syntax highlighting: highlight.ts with Shiki lazy singleton (13 preloaded languages, catppuccin-mocha theme), integrated into MarkdownPane and AgentPane text messages
- [x] Tauri auto-updater plugin: tauri-plugin-updater (Rust) + @tauri-apps/plugin-updater (npm) + updater.ts frontend utility
- [x] AgentPane markdown rendering: text messages now rendered as markdown with Shiki highlighting
- [x] New npm dependencies: shiki, @tauri-apps/plugin-updater
- [x] New Rust dependency: tauri-plugin-updater

### Session: 2026-03-06 (continued) — Polish, Testing, Extras

#### Terminal Copy/Paste + Theme Hot-Swap
- [x] Copy/paste in TerminalPane via Ctrl+Shift+C/V (attachCustomKeyEventHandler: C copies selection, V reads clipboard and writes to PTY)
- [x] Theme hot-swap: onThemeChange() callback registry in theme.svelte.ts, TerminalPane subscribes and updates term.options.theme on flavor change
- [x] All open terminals now update immediately when theme flavor changes

#### Agent Tree Enhancements
- [x] Click tree node -> scroll to corresponding message (handleTreeNodeClick in AgentPane, scrollIntoView with smooth behavior)
- [x] Subtree cost display: yellow cost text below each tree node label (subtreeCost from agent-tree.ts, NODE_H increased from 32 to 40)
- [x] Each message div has id="msg-{msg.id}" for scroll targeting

#### Session Resume
- [x] Follow-up prompt input appears after session completes or errors (if sdkSessionId exists)
- [x] startQuery(text, resume=true) passes resume_session_id to SDK via agent_query
- [x] Styled .follow-up input + button in done-bar and error-bar sections

#### Pane Drag-Resize Handles
- [x] Splitter overlays in TilingGrid (positioned with fixed CSS, outside grid to avoid layout interference)
- [x] Column splitters: vertical bars between grid columns with mousemove drag
- [x] Row splitters: horizontal bars between grid rows with mousemove drag
- [x] customColumns/customRows $state override preset grid-template; reset on preset change
- [x] Supports 2-col, 3-col, and 2-row layouts with min 10% / max 90% ratio clamping
- [x] .dragging class disables user-select during drag; splitter hover shows accent color at 40% opacity

#### Auto-Update Workflow Enhancement
- [x] release.yml: TAURI_SIGNING_PRIVATE_KEY + PASSWORD env vars passed to build step
- [x] Generates latest.json for auto-updater (version, pub_date, platform URL, signature from .sig file)
- [x] Uploads latest.json alongside .deb and .AppImage as release artifacts

#### Deno Sidecar Evaluation
- [x] Created agent-runner-deno.ts proof-of-concept (Deno.Command for claude CLI, TextLineStream for NDJSON)
- [x] Same NDJSON protocol as Node.js version; compiles to single binary with deno compile
- [ ] Not yet integrated with Rust SidecarManager; needs real-world testing

#### Testing Infrastructure
- [x] Vitest added: vitest ^4.0.18 dev dependency, vite.config.ts test config, npm run test script
- [x] sdk-messages.test.ts: tests for adaptSDKMessage() — init, text, thinking, tool_use, tool_result, cost, unknown types
- [x] agent-tree.test.ts: tests for buildAgentTree(), countTreeNodes(), subtreeCost()
- [x] Cargo: tempfile 3 dev dependency added
- [x] session.rs tests: SessionDb CRUD (sessions, SSH sessions, settings, layout), uses tempfile::tempdir()
- [x] ctx.rs tests: CtxDb error handling with missing database (conn=None)

### Session: 2026-03-06 (continued) — Session Groups, Auto-Update Key, Deno Sidecar, Tests

#### Auto-Update Signing Key
- [x] Generated Tauri signing keypair (minisign)
- [x] Set pubkey in tauri.conf.json updater.pubkey field (base64 encoded)
- [x] Private key to be stored as TAURI_SIGNING_PRIVATE_KEY GitHub secret by user

#### Session Groups/Folders
- [x] Added group_name column to sessions table (session.rs, ALTER TABLE migration with pragma_table_info check)
- [x] Session struct: added group_name field with #[serde(default)]
- [x] SessionDb: update_group(id, group_name) method + save/list queries updated
- [x] Tauri command: session_update_group registered in lib.rs
- [x] Frontend: updateSessionGroup() in session-bridge.ts
- [x] Layout store: Pane.group? field, setPaneGroup(id, group) function in layout.svelte.ts
- [x] SessionList.svelte: grouped sidebar with collapsible headers (arrow + count), right-click to set group via prompt()
- [x] Svelte 5 snippet pattern used for paneItem to avoid duplication across grouped/ungrouped rendering

#### Deno Sidecar Integration (upgraded from PoC)
- [x] SidecarCommand struct in sidecar.rs: { program, args } abstracts runtime choice
- [x] resolve_sidecar_command(): Deno-first resolution (checks agent-runner-deno.ts + deno availability), Node.js fallback
- [x] Both sidecar runners bundled in tauri.conf.json resources array
- [x] Graceful fallback: if Deno binary not found in PATH, falls back to Node.js with log warning

#### E2E/Integration Tests
- [x] layout.test.ts (30 tests): addPane, removePane, focusPane, setPreset, autoPreset, getGridTemplate, getPaneGridArea, renamePaneTitle, setPaneGroup
- [x] agent-bridge.test.ts (11 tests): Tauri IPC mock pattern with vi.hoisted(), invoke/listen wrappers
- [x] agent-dispatcher.test.ts (18 tests): sidecar event routing, crash detection, vi.useFakeTimers() for async setTimeout
- [x] sdk-messages.test.ts rewrite (25 tests): removed unused ErrorContent import
- [x] E2E scaffold: v2/tests/e2e/README.md documenting WebDriver approach
- [x] Total: 104 vitest tests + 29 cargo tests, all passing

Build status: TypeScript 0 errors, Rust 0 errors (1 pre-existing warning), all tests green.

### Session: 2026-03-06 (continued) — Agent Teams / Subagent Support

#### Agent Teams Frontend Support
- [x] Agent store: AgentSession extended with parentSessionId?, parentToolUseId?, childSessionIds[] for parent-child hierarchy
- [x] Agent store: createAgentSession() accepts optional parent param, registers bidirectional parent/child links
- [x] Agent store: findChildByToolUseId(parentId, toolUseId), getChildSessions(parentId) query functions
- [x] Agent store: removeAgentSession() cleans up parent's childSessionIds on removal
- [x] Agent dispatcher: SUBAGENT_TOOL_NAMES detection ('Agent', 'Task', 'dispatch_agent') on tool_call events
- [x] Agent dispatcher: spawnSubagentPane() creates child session + layout pane, auto-groups under parent title
- [x] Agent dispatcher: toolUseToChildPane Map routes messages with parentId to correct child pane
- [x] Agent dispatcher: handleAgentEvent() splits messages — parentId-bearing go to child panes, rest to parent
- [x] AgentPane: parent link bar (SUB badge + navigate-to-parent button)
- [x] AgentPane: children bar (chips per child subagent, status-colored, clickable to focus)
- [x] SessionList: subagent panes show '↳' icon instead of '*'

Design: No separate sidecar process per subagent. Parent's sidecar handles all; routing is purely frontend based on SDK's parentId field.

### Session: 2026-03-06 (continued) — Subagent Tests, Cost Aggregation, Signing Key

#### Subagent Dispatcher Tests
- [x] 10 new tests in agent-dispatcher.test.ts for subagent routing:
  - spawn subagent pane on Agent/Task tool_call
  - skip non-subagent tool_calls (Read, etc.)
  - deduplicate panes for same toolUseId
  - reuse existing child session from findChildByToolUseId
  - route messages with parentId to child pane
  - route child init message (sets model, marks running)
  - route child cost message (updates cost, marks done)
  - fallback title when input has no prompt/name
  - fallback group when parent pane not found
- [x] Total: 28 dispatcher tests (18 existing + 10 new), 114 vitest tests overall
- [x] New mocks added: mockCreateAgentSession, mockFindChildByToolUseId, mockAddPane, mockGetPanes, layout.svelte mock

#### Subagent Cost Aggregation
- [x] getTotalCost(id) recursive helper in agents.svelte.ts — aggregates costUsd, inputTokens, outputTokens across parent + all children via childSessionIds
- [x] AgentPane done-bar: shows "(total: $X.XXXX)" in yellow when child sessions exist and total > parent cost
- [x] .total-cost CSS class: var(--ctp-yellow), 10px font-size

#### TAURI_SIGNING_PRIVATE_KEY
- [x] Set via `gh secret set` on DexterFromLab/BTerminal GitHub repo

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
- [x] Root cause: Claude Code sets ~8 CLAUDE* env vars (CLAUDECODE, CLAUDE_ORIGPROMPT, CLAUDE_BASH_MAINTAIN_CWD, CLAUDE_BASH_SANDBOX_DIR, etc.) for nesting/sandbox detection. Previous fix only removed CLAUDECODE, but the CLI checks multiple indicators.
- [x] Fixed agent-runner.ts: replaced `{ ...process.env, CLAUDECODE: undefined }` with clean env object filtering out all keys starting with 'CLAUDE'
- [x] Fixed agent-runner-deno.ts: same approach, iterate Deno.env.toObject() and skip CLAUDE-prefixed keys
- [x] Pre-built dist/agent-runner.mjs already updated with the fix

### Session: 2026-03-06 (continued) — Sidecar SDK Migration

#### Migration from CLI Spawning to Agent SDK
- [x] Diagnosed root cause of silent agent sessions: claude CLI v2.1.69 hangs when spawned via child_process.spawn() with piped stdio (known bug: github.com/anthropics/claude-code/issues/6775)
- [x] Migrated agent-runner.ts from `child_process.spawn('claude', ...)` to `@anthropic-ai/claude-agent-sdk` query() function
- [x] Migrated agent-runner-deno.ts from `Deno.Command('claude', ...)` to `import { query } from "npm:@anthropic-ai/claude-agent-sdk"`
- [x] Added @anthropic-ai/claude-agent-sdk ^0.2.70 as npm dependency
- [x] SDK query() returns async iterable of messages — same format as CLI stream-json, so sdk-messages.ts adapter unchanged
- [x] Session stop now uses AbortController.abort() instead of process.kill()
- [x] CLAUDE* env var stripping preserved via SDK's `env` option in query() options
- [x] Updated sidecar.rs Deno permissions: added --allow-write and --allow-net (required by SDK)
- [x] Added build:sidecar script to package.json (esbuild bundle with @anthropic-ai/claude-agent-sdk as external)
- [x] SDK options: permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, 10 allowedTools
- [x] Tested standalone: SDK sidecar successfully produced agent output
- [x] All 114 vitest tests pass, Rust compiles clean

#### Bug Found (not yet fixed)
- [ ] AgentPane.svelte onDestroy calls stopAgent() on component unmount — kills running sessions when panes are switched/collapsed, not just when explicitly closed

### Next Steps
- [ ] Fix AgentPane onDestroy session killing bug
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning for relay connections
- [ ] E2E testing with Playwright/WebDriver (when display server available)
- [ ] Test agent teams with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
