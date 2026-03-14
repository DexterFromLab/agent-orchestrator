---
title: "Documentation"
role: part
parent: null
order: 1
description: "Project documentation index"
---

# Agent Orchestrator Documentation

Agent Orchestrator (formerly BTerminal) is a multi-project AI agent orchestration dashboard built with Tauri 2.x, Svelte 5, and the Claude Agent SDK. It transforms a traditional terminal emulator into a mission control for running, monitoring, and coordinating multiple AI agent sessions across multiple codebases simultaneously.

The application has three major version milestones:

- **v1** — A single-file Python GTK3+VTE terminal emulator with Claude Code session management. Production-stable, still shipped as `bterminal`.
- **v2** — A ground-up rewrite using Tauri 2.x (Rust backend) + Svelte 5 (frontend). Multi-pane terminal with structured agent sessions, subagent tree visualization, session persistence, multi-machine relay support, 17 themes, and comprehensive packaging.
- **v3 (Mission Control)** — A further redesign on top of v2's codebase. Replaces the free-form pane grid with a project-group dashboard. Adds multi-agent orchestration (4 management roles), inter-agent messaging (btmsg), task boards (bttask), session anchors, health monitoring, FTS5 search, plugin system, Landlock sandboxing, secrets management, and 704 automated tests.

> **Important:** The `docs/` directory is the single source of truth for this project. Before making changes, consult the docs. After making changes, update the docs.

---

## Documentation Map

### Architecture & Design

| Document | What It Covers |
|----------|---------------|
| [architecture.md](architecture.md) | End-to-end system architecture: Rust backend, Svelte frontend, sidecar layer, data flow, IPC patterns |
| [v3-task_plan.md](v3-task_plan.md) | v3 Mission Control architecture decisions, adversarial review, data model, component tree, layout system, 10-phase plan |
| [multi-machine.md](multi-machine.md) | Multi-machine relay architecture: bterminal-core extraction, bterminal-relay binary, RemoteManager, WebSocket protocol, reconnection |

### Subsystem Guides

| Document | What It Covers |
|----------|---------------|
| [sidecar.md](sidecar.md) | Sidecar process lifecycle, multi-provider runners (Claude/Codex/Ollama), env var stripping, CLI detection, NDJSON protocol |
| [orchestration.md](orchestration.md) | Multi-agent orchestration: btmsg messaging, bttask kanban, Tier 1/2 agent roles, wake scheduler, system prompts |
| [production.md](production.md) | Production hardening: sidecar supervisor, Landlock sandbox, FTS5 search, plugin system, secrets management, notifications, health monitoring, audit logging |
| [provider-adapter/](provider-adapter/) | Multi-provider adapter pattern: architecture decisions, coupling analysis, implementation progress |

### Implementation & Progress

| Document | What It Covers |
|----------|---------------|
| [phases.md](phases.md) | v2 implementation phases (1-7 + multi-machine A-D + profiles/skills) with checklists |
| [v3-progress.md](v3-progress.md) | v3 session-by-session progress log (All Phases 1-10 + production hardening) |
| [progress.md](progress.md) | v2 session-by-session progress log (recent sessions) |
| [progress-archive.md](progress-archive.md) | Archived v2 progress (2026-03-05 to 2026-03-06 early) |

### Research & Analysis

| Document | What It Covers |
|----------|---------------|
| [findings.md](findings.md) | v2 research: Claude Agent SDK, Tauri+xterm.js, terminal performance, Zellij architecture, ultrawide design patterns |
| [v3-findings.md](v3-findings.md) | v3 research: adversarial architecture review, production hardening analysis, provider adapter coupling map, session anchor design |

### Release

| Document | What It Covers |
|----------|---------------|
| [v3-release-notes.md](v3-release-notes.md) | v3.0 release notes: feature summary, breaking changes, test coverage, known limitations |
| [e2e-testing.md](e2e-testing.md) | E2E testing facility: WebDriverIO fixtures, test mode, LLM judge, CI integration, troubleshooting |

---

## Quick Orientation

If you are new to this codebase, read the documents in this order:

1. **[architecture.md](architecture.md)** — Understand how the pieces fit together
2. **[v3-task_plan.md](v3-task_plan.md)** — Understand the design decisions behind v3
3. **[sidecar.md](sidecar.md)** — Understand how agent sessions actually run
4. **[orchestration.md](orchestration.md)** — Understand multi-agent coordination
5. **[e2e-testing.md](e2e-testing.md)** — Understand how to test changes

For v2-specific context (the foundation that v3 builds on), read [findings.md](findings.md) and [phases.md](phases.md).

---

## Key Directories

| Path | Purpose |
|------|---------|
| `v2/src-tauri/src/` | Rust backend: commands, SQLite, btmsg, bttask, search, secrets, plugins |
| `v2/bterminal-core/` | Shared Rust crate: PtyManager, SidecarManager, EventSink trait, Landlock sandbox |
| `v2/bterminal-relay/` | Standalone relay binary for remote machine support |
| `v2/src/lib/` | Svelte 5 frontend: components, stores, adapters, utils, providers |
| `v2/sidecar/` | Agent sidecar runners (Claude, Codex, Ollama) — compiled to ESM bundles |
| `v2/tests/e2e/` | WebDriverIO E2E tests, fixtures, LLM judge |
| `ctx/` | Context manager CLI tool (SQLite-based, standalone) |
| `consult/` | Multi-model tribunal CLI (OpenRouter, standalone Python) |
