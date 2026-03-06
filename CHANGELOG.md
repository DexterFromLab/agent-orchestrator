# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Svelte 5 rune stores (layout, agents, sessions) renamed from `.ts` to `.svelte.ts` — runes only work in `.svelte` and `.svelte.ts` files, plain `.ts` caused "rune_outside_svelte" runtime error (blank screen)
- Updated all import paths to use `.svelte` suffix for store modules

### Added
- Agent pane with prompt input, structured message rendering, stop button, and cost display (Phase 3)
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
