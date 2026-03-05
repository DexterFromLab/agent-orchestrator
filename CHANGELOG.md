# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- v2 project scaffolding: Tauri 2.x + Svelte 5 in `v2/` directory (Phase 1 complete)
- Rust backend stubs: main.rs, lib.rs, pty.rs, sidecar.rs, watcher.rs, session.rs
- Svelte frontend with Catppuccin Mocha CSS variables and component structure
- Node.js sidecar scaffold with NDJSON communication pattern
- v2 architecture planning: Tauri 2.x + Svelte 5 + Claude Agent SDK via Node.js sidecar
- Research documentation covering Agent SDK, xterm.js performance, Tauri ecosystem, and ultrawide layout patterns
- Phased implementation plan (6 phases, MVP = Phases 1-4)
- Error handling and testing strategy for v2
- Documentation structure in `docs/` (task_plan, phases, findings, progress)
- 17 operational rules in `.claude/rules/`
- TODO.md for tracking active work
- `.claude/CLAUDE.md` behavioral guide for Claude sessions
- VS Code workspace configuration with Peacock color
