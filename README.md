# Agent Orchestrator

Multi-project agent dashboard for orchestrating Claude AI teams across multiple codebases simultaneously. Built with Tauri 2.x (Rust) + Svelte 5 + Claude Agent SDK.

![Agent Orchestrator](screenshot.png)

## What it does

Agent Orchestrator lets you run multiple Claude Code agents in parallel, organized into project groups. Each agent gets its own terminal, file browser, and Claude session. Agents communicate with each other via built-in messaging (btmsg) and coordinate work through a shared task board (bttask).

## Key Features

### Multi-Agent Orchestration
- **Project groups** — up to 5 projects side-by-side, adaptive layout (5 @ultrawide, 3 @1920px)
- **Tier 1 agents** — Manager, Architect, Tester, Reviewer with role-specific tabs and auto-generated system prompts
- **Tier 2 agents** — per-project Claude sessions with custom context
- **btmsg** — inter-agent messaging CLI + UI (Activity Feed, DMs, Channels)
- **bttask** — Kanban task board with role-based visibility (Manager CRUD, others read-only)
- **Auto-wake scheduler** — 3 strategies (persistent, on-demand, smart) with configurable wake signals

### Per-Project Workspace
- **Claude sessions** with session continuity, anchors, and structured output
- **Terminal tabs** — shell, SSH, agent preview per project
- **File browser** — CodeMirror 6 editor (15 languages), PDF viewer, CSV table
- **Docs viewer** — live Markdown with Shiki syntax highlighting
- **Context tab** — LLM context window visualization (token meter, turn breakdown)
- **Metrics panel** — live health, SVG sparkline history, session stats

### Multi-Provider Support
- **Claude** (primary) — via Agent SDK sidecar
- **Codex** — OpenAI Codex SDK adapter
- **Ollama** — local models via native fetch

### Production Hardening
- **Sidecar supervisor** — crash recovery with exponential backoff
- **Landlock sandbox** — Linux kernel process isolation for sidecar
- **FTS5 search** — full-text search with Spotlight-style overlay (Ctrl+F)
- **Plugin system** — sandboxed runtime with permission gates
- **Secrets management** — system keyring integration
- **Notifications** — OS + in-app notification center
- **Agent health monitoring** — heartbeats, dead letter queue, audit log
- **Optimistic locking** — bttask concurrent access protection
- **Error classification** — 6 error types with auto-retry logic
- **TLS relay** — encrypted WebSocket for remote machines
- **WAL checkpoint** — periodic SQLite maintenance (5min interval)

### Developer Experience
- **17 themes** — Catppuccin (4), Editor (7), Deep Dark (6)
- **Keyboard-first UX** — Command Palette (Ctrl+K), 18+ commands, vi-style navigation
- **Claude profiles** — per-project account switching
- **Skill discovery** — type `/` in agent prompt for autocomplete
- **ctx integration** — SQLite context database for cross-session memory

### Testing
- **516 vitest** + **159 cargo** + **109 E2E** tests
- **E2E engine** — WebDriverIO + tauri-driver, Phase A/B/C scenarios
- **LLM judge** — dual-mode CLI/API for semantic assertion (claude-haiku)
- **CI** — GitHub Actions with xvfb + LLM-judged test gating

## Architecture

```
Agent Orchestrator (Tauri 2.x)
├── Rust backend (src-tauri/)
│   ├── Commands: groups, sessions, btmsg, bttask, search, secrets, plugins, notifications
│   ├── bterminal-core: PtyManager, SidecarManager, EventSink trait
│   └── bterminal-relay: WebSocket server for remote machines (+ TLS)
├── Svelte 5 frontend (src/)
│   ├── Workspace: ProjectGrid, ProjectBox (per-project tabs), StatusBar
│   ├── Stores: workspace, agents, health, conflicts, wake-scheduler, plugins
│   ├── Adapters: claude-bridge, btmsg-bridge, bttask-bridge, groups-bridge
│   └── Agent dispatcher: sidecar event routing, session persistence, auto-anchoring
└── Node.js sidecar (sidecar/)
    ├── claude-runner.mjs (Agent SDK)
    ├── codex-runner.mjs (OpenAI Codex)
    └── ollama-runner.mjs (local models)
```

## Installation

Requires Node.js 20+, Rust 1.77+, WebKit2GTK 4.1, GTK3.

```bash
git clone https://github.com/DexterFromLab/agent-orchestrator.git
cd agent-orchestrator/v2
npm install
npm run build:sidecar
npm run tauri:dev
```

### Build for distribution

```bash
npm run tauri:build
# Output: .deb + AppImage in target/release/bundle/
```

## Configuration

Config: `~/.config/bterminal/groups.json` — project groups, agents, prompts (human-editable JSON).

Database: `~/.local/share/bterminal/` — sessions.db (sessions, metrics, anchors), btmsg.db (messages, tasks, agents).

## Multi-Machine Support

```
Agent Orchestrator --WebSocket/TLS--> bterminal-relay (Remote Machine)
                                      ├── PtyManager (remote terminals)
                                      └── SidecarManager (remote agents)
```

```bash
cd v2 && cargo build --release -p bterminal-relay
./target/release/bterminal-relay --port 9750 --token <secret> --tls-cert cert.pem --tls-key key.pem
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command Palette |
| `Ctrl+M` | Messages (CommsTab) |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Settings |
| `Ctrl+F` | Full-text search |
| `Ctrl+1-5` | Focus project by index |
| `Escape` | Close overlay/sidebar |

## Documentation

| Document | Description |
|----------|-------------|
| [docs/decisions.md](docs/decisions.md) | Architecture decisions log |
| [docs/progress/](docs/progress/) | Session progress logs (v2, v3, archive) |
| [docs/release-notes.md](docs/release-notes.md) | v3.0 release notes |
| [docs/e2e-testing.md](docs/e2e-testing.md) | E2E testing facility documentation |
| [docs/multi-machine.md](docs/multi-machine.md) | Multi-machine relay architecture |

## License

MIT
