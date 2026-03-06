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

Architecture decision: Uses `claude` CLI with `--output-format stream-json` instead of Agent SDK `query()` API. Avoids SDK npm dependency and version churn while getting identical structured output.

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

### Phase 5: Agent Tree + Polish (2026-03-06, in progress)
- [x] Agent tree visualization (SVG): AgentTree.svelte component with horizontal tree layout, bezier edges, status-colored nodes; agent-tree.ts utility (buildAgentTree, countTreeNodes, subtreeCost)
- [x] Agent tree toggle in AgentPane: collapsible tree view shown when tool_call messages exist
- [x] Global status bar: StatusBar.svelte showing terminal/agent pane counts, active agents with pulse animation, total tokens and cost
- [x] Notification system: notifications.svelte.ts store (notify, dismissNotification, max 5 toasts, 4s auto-dismiss) + ToastContainer.svelte (slide-in animation, color-coded by type)
- [x] Agent dispatcher notifications: toast on agent_stopped (success), agent_error (error), sidecar crash (error), cost result (success with cost/turns)
- [x] Settings dialog: SettingsDialog.svelte modal (default shell, cwd, max panes) with settings-bridge.ts adapter
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

### Next Steps
- [ ] Markdown rendering in agent text messages
- [ ] Testing: vitest for sdk-messages adapter, cargo test for sidecar
- [ ] Phase 5 remaining: click tree node -> focus pane, subtree cost display, ctx integration
- [ ] Tauri auto-update plugin (signing key + update server)
