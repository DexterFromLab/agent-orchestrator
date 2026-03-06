# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
