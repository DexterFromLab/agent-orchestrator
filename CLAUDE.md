# BTerminal — Project Guide for Claude

## Project Overview

Terminal emulator with SSH and Claude Code session management. v1 (GTK3+VTE Python) is production-stable. v2 redesign (Tauri 2.x + Svelte 5 + Claude Agent SDK) all 6 phases complete. Packaging: .deb + AppImage via GitHub Actions CI.

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
| `docs/phases.md` | v2 implementation phases (1-6) |
| `docs/findings.md` | v2 research findings |
| `docs/progress.md` | Session progress log |
| `v2/src-tauri/src/pty.rs` | PTY backend (portable-pty, PtyManager) |
| `v2/src-tauri/src/lib.rs` | Tauri commands (pty + agent + session + file + settings) |
| `v2/src-tauri/src/sidecar.rs` | SidecarManager (Node.js lifecycle, NDJSON) |
| `v2/src-tauri/src/session.rs` | SessionDb (rusqlite, sessions + layout + settings persistence) |
| `v2/src-tauri/src/watcher.rs` | FileWatcherManager (notify crate, file change events) |
| `v2/src/lib/stores/layout.svelte.ts` | Layout store (panes, presets, persistence, Svelte 5 runes) |
| `v2/src/lib/stores/agents.svelte.ts` | Agent session store (messages, cost) |
| `v2/src/lib/components/Terminal/TerminalPane.svelte` | xterm.js terminal pane |
| `v2/src/lib/components/Agent/AgentPane.svelte` | Agent session pane (prompt, messages, cost) |
| `v2/src/lib/adapters/pty-bridge.ts` | PTY IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/agent-bridge.ts` | Agent IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/sdk-messages.ts` | SDK message adapter (stream-json parser) |
| `v2/src/lib/agent-dispatcher.ts` | Routes sidecar events to agent store + toast notifications |
| `v2/src/lib/adapters/file-bridge.ts` | File watcher IPC wrapper |
| `v2/src/lib/adapters/settings-bridge.ts` | Settings IPC wrapper (get/set/list) |
| `v2/src/lib/utils/agent-tree.ts` | Agent tree builder (hierarchy from messages) |
| `v2/src/lib/stores/notifications.svelte.ts` | Toast notification store (notify, dismiss) |
| `v2/src/lib/components/Agent/AgentTree.svelte` | SVG agent tree visualization |
| `v2/src/lib/components/StatusBar/StatusBar.svelte` | Global status bar (pane counts, cost) |
| `v2/src/lib/components/Notifications/ToastContainer.svelte` | Toast notification display |
| `v2/src/lib/components/Settings/SettingsDialog.svelte` | Settings modal dialog |
| `v2/src/lib/adapters/session-bridge.ts` | Session/layout persistence IPC wrapper |
| `v2/src/lib/components/Markdown/MarkdownPane.svelte` | Markdown file viewer (marked.js, live reload) |
| `v2/sidecar/agent-runner.ts` | Node.js sidecar (spawns claude CLI) |

## v1 Stack

- Python 3, GTK3 (PyGObject), VTE 2.91
- Config: `~/.config/bterminal/` (sessions.json, claude_sessions.json)
- Context DB: `~/.claude-context/context.db`
- Theme: Catppuccin Mocha

## v2 Stack (all phases complete, branch: v2-mission-control)

- Tauri 2.x (Rust backend) + Svelte 5 (frontend)
- xterm.js with Canvas addon (no WebGL on WebKit2GTK)
- Agent sessions via `claude` CLI subprocess with `--output-format stream-json`
- Node.js sidecar manages claude processes (stdio NDJSON to Rust)
- portable-pty for terminal management
- SQLite session persistence (rusqlite, WAL mode) + layout restore on startup
- File watcher (notify crate) for live markdown viewer
- Rust deps: tauri, portable-pty, rusqlite (bundled), dirs, notify, uuid, serde, tokio
- npm deps: @xterm/xterm, @xterm/addon-canvas, @xterm/addon-fit, @tauri-apps/api, marked
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

# v2 install from source (builds + installs to ~/.local/bin/bterminal-v2)
./install-v2.sh
```

## Conventions

- Catppuccin Mocha theme for all UI elements
- Session configs stored as JSON
- Single-file Python app (v1) — will change to multi-file Rust+Svelte (v2)
- Polish language in some code comments (v1 legacy)
