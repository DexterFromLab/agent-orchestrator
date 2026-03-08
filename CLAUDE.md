# BTerminal — Project Guide for Claude

## Project Overview

Terminal emulator with SSH and Claude Code session management. v1 (GTK3+VTE Python) is production-stable. v2 redesign (Tauri 2.x + Svelte 5 + Claude Agent SDK) Phases 1-7 + multi-machine (A-D) + profiles/skills complete. Packaging: .deb + AppImage via GitHub Actions CI. v3 Mission Control (All Phases 1-10 Complete + Sidebar Redesign): multi-project dashboard with project groups, per-project Claude sessions with session continuity, team agents panel, terminal tabs, VSCode-style left sidebar (icon rail + expandable drawer + always-visible workspace), dead v2 component cleanup.

- **Repository:** github.com/DexterFromLab/BTerminal
- **License:** MIT
- **Primary target:** Linux x86_64

## Documentation (SOURCE OF TRUTH)

**All project documentation lives in [`docs/`](docs/README.md). This is the single source of truth for this project.** Before making changes, consult the docs. After making changes, update the docs. No exceptions.

## Key Paths

| Path | Description |
|------|-------------|
| `bterminal.py` | v1 main application (2092 lines, GTK3+VTE) |
| `ctx` | Context manager CLI tool (SQLite-based) |
| `install.sh` | v1 system installer |
| `install-v2.sh` | v2 build-from-source installer (Node.js 20+, Rust 1.77+, system libs) |
| `.github/workflows/release.yml` | CI: builds .deb + AppImage on v* tags, uploads to GitHub Releases |
| `docs/task_plan.md` | v2 architecture decisions and strategies |
| `docs/phases.md` | v2 implementation phases (1-7 + multi-machine A-D) |
| `docs/findings.md` | v2 research findings |
| `docs/progress.md` | Session progress log (recent) |
| `docs/progress-archive.md` | Archived progress log (2026-03-05 to 2026-03-06 early) |
| `docs/multi-machine.md` | Multi-machine architecture (implemented, Phases A-D) |
| `docs/v3-task_plan.md` | v3 Mission Control redesign: architecture decisions and strategies |
| `docs/v3-findings.md` | v3 research findings and codebase reuse analysis |
| `docs/v3-progress.md` | v3 session progress log |
| `v2/Cargo.toml` | Cargo workspace root (members: src-tauri, bterminal-core, bterminal-relay) |
| `v2/bterminal-core/` | Shared crate: EventSink trait, PtyManager, SidecarManager |
| `v2/bterminal-relay/` | Standalone relay binary (WebSocket server, token auth, CLI) |
| `v2/src-tauri/src/pty.rs` | PTY backend (thin re-export from bterminal-core) |
| `v2/src-tauri/src/groups.rs` | Groups config (load/save ~/.config/bterminal/groups.json) |
| `v2/src-tauri/src/lib.rs` | Tauri commands (pty + agent + session + file + settings + 12 remote + 4 claude + 2 groups) |
| `v2/src-tauri/src/sidecar.rs` | SidecarManager (thin re-export from bterminal-core) |
| `v2/src-tauri/src/event_sink.rs` | TauriEventSink (implements EventSink for AppHandle) |
| `v2/src-tauri/src/remote.rs` | RemoteManager (WebSocket client connections to relays) |
| `v2/src-tauri/src/session.rs` | SessionDb (rusqlite, sessions + layout + settings + ssh_sessions + agent_messages + project_agent_state) |
| `v2/src-tauri/src/watcher.rs` | FileWatcherManager (notify crate, file change events) |
| `v2/src-tauri/src/ctx.rs` | CtxDb (read-only access to ~/.claude-context/context.db) |
| `v2/src-tauri/src/telemetry.rs` | OTEL telemetry (TelemetryGuard, tracing + OTLP export, BTERMINAL_OTLP_ENDPOINT) |
| `v2/src/lib/stores/workspace.svelte.ts` | v3 workspace store (project groups, tabs, focus, replaces layout store) |
| `v2/src/lib/stores/layout.svelte.ts` | v2 layout store (panes, presets, groups, persistence, Svelte 5 runes) |
| `v2/src/lib/stores/agents.svelte.ts` | Agent session store (messages, cost, parent/child hierarchy) |
| `v2/src/lib/components/Terminal/TerminalPane.svelte` | xterm.js terminal pane |
| `v2/src/lib/components/Terminal/AgentPreviewPane.svelte` | Read-only xterm.js showing agent activity (Bash commands, tool results, errors) |
| `v2/src/lib/components/Agent/AgentPane.svelte` | Agent session pane (prompt, messages, cost, profile selector, skill autocomplete) |
| `v2/src/lib/adapters/pty-bridge.ts` | PTY IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/agent-bridge.ts` | Agent IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/sdk-messages.ts` | SDK message adapter (stream-json parser) |
| `v2/src/lib/agent-dispatcher.ts` | Routes sidecar events to agent store + subagent routing + session persistence + toast notifications |
| `v2/src/lib/adapters/file-bridge.ts` | File watcher IPC wrapper |
| `v2/src/lib/adapters/settings-bridge.ts` | Settings IPC wrapper (get/set/list) |
| `v2/src/lib/adapters/ctx-bridge.ts` | ctx database IPC wrapper |
| `v2/src/lib/adapters/ssh-bridge.ts` | SSH session IPC wrapper |
| `v2/src/lib/adapters/claude-bridge.ts` | Claude profiles + skills IPC wrapper |
| `v2/src/lib/adapters/groups-bridge.ts` | Groups config IPC wrapper (load/save) |
| `v2/src/lib/adapters/remote-bridge.ts` | Remote machine management IPC wrapper |
| `v2/src/lib/adapters/telemetry-bridge.ts` | Frontend telemetry bridge (routes events to Rust tracing via IPC) |
| `docker/tempo/` | Docker compose: Tempo + Grafana for trace visualization (port 9715) |
| `v2/src/lib/stores/machines.svelte.ts` | Remote machine state store (Svelte 5 runes) |
| `v2/src/lib/utils/agent-tree.ts` | Agent tree builder (hierarchy from messages) |
| `v2/src/lib/utils/highlight.ts` | Shiki syntax highlighter (lazy singleton, 13 languages) |
| `v2/src/lib/utils/detach.ts` | Detached pane mode (pop-out windows via URL params) |
| `v2/src/lib/utils/updater.ts` | Tauri auto-updater utility |
| `v2/src/lib/stores/notifications.svelte.ts` | Toast notification store (notify, dismiss) |
| `v2/src/lib/stores/theme.svelte.ts` | Theme store (17 themes: 4 Catppuccin + 7 Editor + 6 Deep Dark, UI + terminal font restoration on startup) |
| `v2/src/lib/styles/themes.ts` | Theme palette definitions (17 themes), ThemeId/ThemePalette/ThemeMeta types, THEME_LIST |
| `v2/src/lib/styles/catppuccin.css` | CSS custom properties: 26 --ctp-* color vars + --ui-font-* + --term-font-* |
| `v2/src/lib/components/Agent/AgentTree.svelte` | SVG agent tree visualization |
| `v2/src/lib/components/Context/ContextPane.svelte` | ctx database viewer (projects, entries, search) |
| `v2/src/lib/components/StatusBar/StatusBar.svelte` | Global status bar (group name, project count, agent count, cost) |
| `v2/src/lib/components/Notifications/ToastContainer.svelte` | Toast notification display |
| `v2/src/lib/components/Workspace/` | v3 components: GlobalTabBar, ProjectGrid, ProjectBox, ProjectHeader, ClaudeSession, TeamAgentsPanel, AgentCard, TerminalTabs, ProjectFiles, CommandPalette, DocsTab, SettingsTab |
| `v2/src/lib/types/groups.ts` | TypeScript interfaces (ProjectConfig, GroupConfig, GroupsFile) |
| `v2/src/lib/adapters/session-bridge.ts` | Session/layout/group persistence IPC wrapper |
| `v2/src/lib/components/Markdown/MarkdownPane.svelte` | Markdown file viewer (marked.js + shiki, live reload) |
| `v2/sidecar/agent-runner.ts` | Sidecar source (compiled to .mjs by esbuild, includes findClaudeCli()) |
| `v2/sidecar/agent-runner-deno.ts` | Standalone Deno sidecar runner (not used by SidecarManager, alternative) |
| `v2/sidecar/dist/agent-runner.mjs` | Bundled sidecar (runs on both Deno and Node.js) |
| `v2/src/lib/adapters/sdk-messages.test.ts` | Vitest tests for SDK message adapter (25 tests) |
| `v2/src/lib/adapters/agent-bridge.test.ts` | Vitest tests for agent IPC bridge (11 tests) |
| `v2/src/lib/agent-dispatcher.test.ts` | Vitest tests for agent dispatcher (28 tests) |
| `v2/src/lib/stores/layout.test.ts` | Vitest tests for layout store (30 tests) |
| `v2/src/lib/utils/agent-tree.test.ts` | Vitest tests for agent tree builder (20 tests) |
| `v2/src/lib/stores/workspace.test.ts` | Vitest tests for workspace store (24 tests) |

## v1 Stack

- Python 3, GTK3 (PyGObject), VTE 2.91
- Config: `~/.config/bterminal/` (sessions.json, claude_sessions.json)
- Context DB: `~/.claude-context/context.db`
- Theme: Catppuccin Mocha

## v2/v3 Stack (v2 complete, v3 All Phases 1-10 complete, branch: v2-mission-control)

- Tauri 2.x (Rust backend) + Svelte 5 (frontend)
- Cargo workspace: bterminal-core (shared), bterminal-relay (remote binary), src-tauri (Tauri app)
- xterm.js with Canvas addon (no WebGL on WebKit2GTK)
- Agent sessions via `@anthropic-ai/claude-agent-sdk` query() function (migrated from raw CLI spawning)
- Sidecar uses SDK internally (single .mjs bundle, Deno-first + Node.js fallback, stdio NDJSON to Rust, auto-detects Claude CLI path via findClaudeCli(), supports CLAUDE_CONFIG_DIR override for multi-account)
- portable-pty for terminal management (in bterminal-core)
- Multi-machine: bterminal-relay WebSocket server + RemoteManager WebSocket client
- SQLite session persistence (rusqlite, WAL mode) + layout restore on startup
- File watcher (notify crate) for live markdown viewer
- OpenTelemetry: tracing + tracing-subscriber + opentelemetry 0.28 + tracing-opentelemetry 0.29, OTLP/HTTP to Tempo, BTERMINAL_OTLP_ENDPOINT env var
- Rust deps (src-tauri): tauri, bterminal-core (path), rusqlite (bundled), dirs, notify, serde, tokio, tokio-tungstenite, futures-util, tracing, tracing-subscriber, opentelemetry, opentelemetry_sdk, opentelemetry-otlp, tracing-opentelemetry, tauri-plugin-updater, tauri-plugin-dialog
- Rust deps (bterminal-core): portable-pty, uuid, serde, serde_json, log
- Rust deps (bterminal-relay): bterminal-core, tokio, tokio-tungstenite, clap, env_logger, futures-util
- npm deps: @anthropic-ai/claude-agent-sdk, @xterm/xterm, @xterm/addon-canvas, @xterm/addon-fit, @tauri-apps/api, @tauri-apps/plugin-updater, @tauri-apps/plugin-dialog, marked, shiki, vitest (dev)
- Source: `v2/` directory

## Build / Run

```bash
# v1 (current production)
./install.sh          # Install system-wide
bterminal             # Run

# v1 Dependencies (Debian/Ubuntu)
sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-vte-2.91

# v2 (development, branch v2-mission-control)
cd v2 && npm install && npm run tauri dev   # Dev mode
cd v2 && npm run tauri build                # Release build

# v2 tests
cd v2 && npm run test                       # Vitest (frontend)
cd v2/src-tauri && cargo test               # Cargo tests (backend)

# v2 install from source (builds + installs to ~/.local/bin/bterminal-v2)
./install-v2.sh

# Telemetry stack (Tempo + Grafana)
cd docker/tempo && docker compose up -d  # Grafana at http://localhost:9715
BTERMINAL_OTLP_ENDPOINT=http://localhost:4318 npm run tauri dev  # Enable OTLP export
```

## Conventions

- 17 themes in 3 groups: 4 Catppuccin (Mocha default) + 7 Editor + 6 Deep Dark (Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight)
- CSS uses rem/em for layout; px only for icons/borders (see `.claude/rules/18-relative-units.md`)
- Session configs stored as JSON
- Single-file Python app (v1) — will change to multi-file Rust+Svelte (v2)
- Polish language in some code comments (v1 legacy)
