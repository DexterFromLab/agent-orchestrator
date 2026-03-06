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

### Next Steps
- [ ] Markdown rendering in agent text messages
- [ ] Sidecar crash detection and restart UI
- [ ] Auto-scroll lock on user scroll-up
- [ ] Testing: vitest for sdk-messages adapter, cargo test for sidecar
- [ ] Begin Phase 4: Session Management + Markdown Viewer
