# BTerminal v2 — Progress Log (Archive: 2026-03-05 to 2026-03-06 early)

> Archived from [progress.md](progress.md). Covers research, Phases 1-6, polish, testing, agent teams, and subagent support.

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
  3. Three-tier observation overengineered — simplified to two-tier
  4. Solid.js ecosystem too small — switched to Svelte 5
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

### Phase 3: Agent SDK Integration (complete)
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
- [x] Updated v2/src-tauri/tauri.conf.json: bundle targets ["deb", "appimage"]
- [x] Regenerated all icons in v2/src-tauri/icons/ from bterminal.svg as RGBA PNGs
- [x] Created .github/workflows/release.yml — CI workflow triggered on v* tags
- [x] Build verified: .deb (4.3 MB), AppImage (103 MB) both built successfully

### Phase 5 continued: SSH, ctx, themes, detached mode, auto-updater (2026-03-06)
- [x] ctx integration: Rust ctx.rs, 5 Tauri commands, ctx-bridge.ts adapter, ContextPane.svelte
- [x] SSH session management: SshSession struct, ssh-bridge.ts, SshDialog.svelte, SshSessionList.svelte
- [x] Catppuccin theme flavors: Latte/Frappe/Macchiato/Mocha selectable
- [x] Detached pane mode: pop-out windows via URL params
- [x] Syntax highlighting: Shiki lazy singleton (13 languages)
- [x] Tauri auto-updater plugin integrated
- [x] AgentPane markdown rendering with Shiki highlighting

### Session: 2026-03-06 (continued) — Polish, Testing, Extras

#### Terminal Copy/Paste + Theme Hot-Swap
- [x] Copy/paste in TerminalPane via Ctrl+Shift+C/V
- [x] Theme hot-swap: onThemeChange() callback registry

#### Agent Tree Enhancements
- [x] Click tree node -> scroll to message, subtree cost display

#### Session Resume
- [x] Follow-up prompt input, resume_session_id passed to SDK

#### Pane Drag-Resize Handles
- [x] Splitter overlays in TilingGrid with mouse drag (min 10% / max 90%)

#### Auto-Update Workflow Enhancement
- [x] release.yml: signing key env vars, latest.json generation

#### Deno Sidecar Evaluation
- [x] Created agent-runner-deno.ts proof-of-concept

#### Testing Infrastructure
- [x] Vitest + Cargo tests: 104 vitest + 29 cargo tests, all passing

### Session: 2026-03-06 (continued) — Session Groups, Auto-Update Key, Deno Sidecar, Tests

#### Auto-Update Signing Key
- [x] Generated Tauri signing keypair (minisign), set pubkey in tauri.conf.json

#### Session Groups/Folders
- [x] group_name column, setPaneGroup, grouped sidebar with collapsible headers

#### Deno Sidecar Integration (upgraded from PoC)
- [x] SidecarCommand struct, Deno-first resolution, Node.js fallback

#### E2E/Integration Tests
- [x] layout.test.ts (30), agent-bridge.test.ts (11), agent-dispatcher.test.ts (18), sdk-messages.test.ts (25)
- [x] Total: 104 vitest tests + 29 cargo tests

### Session: 2026-03-06 (continued) — Agent Teams / Subagent Support

#### Agent Teams Frontend Support
- [x] Parent/child hierarchy in agent store, subagent detection in dispatcher
- [x] spawnSubagentPane(), toolUseToChildPane routing, parent/child navigation in AgentPane
- [x] 10 new dispatcher tests for subagent routing (28 total, 114 vitest overall)

#### Subagent Cost Aggregation
- [x] getTotalCost() recursive helper, total cost shown in parent pane

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
