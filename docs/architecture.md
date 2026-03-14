# System Architecture

This document describes the end-to-end architecture of Agent Orchestrator — how the Rust backend, Svelte 5 frontend, and Node.js/Deno sidecar processes work together to provide a multi-project AI agent orchestration dashboard.

---

## High-Level Overview

Agent Orchestrator is a Tauri 2.x desktop application. Tauri provides a Rust backend process and a WebKit2GTK-based webview for the frontend. The application manages AI agent sessions by spawning sidecar child processes that communicate with AI provider APIs (Claude, Codex, Ollama).

```
┌────────────────────────────────────────────────────────────────┐
│  Agent Orchestrator (Tauri 2.x)                                │
│                                                                │
│  ┌─────────────────┐    Tauri IPC     ┌────────────────────┐  │
│  │  WebView         │ ◄─────────────► │  Rust Backend      │  │
│  │  (Svelte 5)      │   invoke/listen │                    │  │
│  │                   │                │  ├── PtyManager     │  │
│  │  ├── ProjectGrid  │                │  ├── SidecarManager │  │
│  │  ├── AgentPane    │                │  ├── SessionDb      │  │
│  │  ├── TerminalPane │                │  ├── BtmsgDb        │  │
│  │  ├── StatusBar    │                │  ├── SearchDb       │  │
│  │  └── Stores       │                │  ├── SecretsManager │  │
│  └─────────────────┘                 │  ├── RemoteManager  │  │
│                                       │  └── FileWatchers   │  │
│                                       └────────────────────┘  │
│                                           │                    │
└───────────────────────────────────────────┼────────────────────┘
                                            │ stdio NDJSON
                                            ▼
                                    ┌───────────────────┐
                                    │ Sidecar Processes  │
                                    │ (Deno or Node.js)  │
                                    │                    │
                                    │ claude-runner.mjs  │
                                    │ codex-runner.mjs   │
                                    │ ollama-runner.mjs  │
                                    └───────────────────┘
```

### Why Three Layers?

1. **Rust backend** — Manages OS-level resources (PTY processes, file watchers, SQLite databases) with memory safety and low overhead. Exposes everything to the frontend via Tauri IPC commands and events.

2. **Svelte 5 frontend** — Renders the UI with fine-grained reactivity (no VDOM). Svelte 5 runes (`$state`, `$derived`, `$effect`) provide signal-based reactivity comparable to Solid.js but with a larger ecosystem.

3. **Sidecar processes** — The Claude Agent SDK, OpenAI Codex SDK, and Ollama API are all JavaScript/TypeScript libraries. They cannot run in Rust or in the WebKit2GTK webview (no Node.js APIs). The sidecar layer bridges this gap: Rust spawns a JS process, communicates via stdio NDJSON, and forwards structured messages to the frontend.

---

## Rust Backend (`v2/src-tauri/`)

The Rust backend is the central coordinator. It owns all OS resources and database connections.

### Cargo Workspace

The Rust code is organized as a Cargo workspace with three members:

```
v2/
├── Cargo.toml              # Workspace root
├── bterminal-core/          # Shared crate
│   └── src/
│       ├── lib.rs
│       ├── pty.rs           # PtyManager (portable-pty)
│       ├── sidecar.rs       # SidecarManager (multi-provider)
│       ├── supervisor.rs    # SidecarSupervisor (crash recovery)
│       ├── sandbox.rs       # Landlock sandbox
│       └── event.rs         # EventSink trait
├── bterminal-relay/         # Remote machine relay
│   └── src/main.rs          # WebSocket server + token auth
└── src-tauri/               # Tauri application
    └── src/
        ├── lib.rs           # AppState + setup + handler registration
        ├── commands/        # 16 domain command modules
        ├── btmsg.rs         # Inter-agent messaging (SQLite)
        ├── bttask.rs        # Task board (SQLite, shared btmsg.db)
        ├── search.rs        # FTS5 full-text search
        ├── secrets.rs       # System keyring (libsecret)
        ├── plugins.rs       # Plugin discovery
        ├── notifications.rs # Desktop notifications
        ├── session/         # SessionDb (sessions, layout, settings, agents, metrics, anchors)
        ├── remote.rs        # RemoteManager (WebSocket client)
        ├── ctx.rs           # Read-only ctx database access
        ├── memora.rs        # Read-only Memora database access
        ├── telemetry.rs     # OpenTelemetry tracing
        ├── groups.rs        # Project groups config
        ├── watcher.rs       # File watcher (notify crate)
        ├── fs_watcher.rs    # Per-project filesystem watcher (inotify)
        ├── event_sink.rs    # TauriEventSink implementation
        ├── pty.rs           # Thin re-export from bterminal-core
        └── sidecar.rs       # Thin re-export from bterminal-core
```

### Why a Workspace?

The `bterminal-core` crate exists so that both the Tauri application and the standalone `bterminal-relay` binary can share PtyManager and SidecarManager code. The `EventSink` trait abstracts event emission — TauriEventSink wraps Tauri's AppHandle, while the relay uses a WebSocket-based EventSink.

### AppState

All backend state lives in `AppState`, initialized during Tauri setup:

```rust
pub struct AppState {
    pub pty_manager: Mutex<PtyManager>,
    pub sidecar_manager: Mutex<SidecarManager>,
    pub session_db: Mutex<SessionDb>,
    pub remote_manager: Mutex<RemoteManager>,
    pub telemetry: Option<TelemetryGuard>,
}
```

### SQLite Databases

The backend manages two SQLite databases, both in WAL mode with 5-second busy timeout for concurrent access:

| Database | Location | Purpose |
|----------|----------|---------|
| `sessions.db` | `~/.local/share/bterminal/` | Sessions, layout, settings, agent state, metrics, anchors |
| `btmsg.db` | `~/.local/share/bterminal/` | Inter-agent messages, tasks, agents registry, audit log |

WAL checkpoints run every 5 minutes via a background tokio task to prevent unbounded WAL growth.

All queries use **named column access** (`row.get("column_name")`) — never positional indices. Rust structs use `#[serde(rename_all = "camelCase")]` so TypeScript interfaces receive camelCase field names on the wire.

### Command Modules

Tauri commands are organized into 16 domain modules under `commands/`:

| Module | Commands | Purpose |
|--------|----------|---------|
| `pty` | spawn, write, resize, kill | Terminal management |
| `agent` | query, stop, ready, restart | Agent session lifecycle |
| `session` | session CRUD, layout, settings | Session persistence |
| `persistence` | agent state, messages | Agent session continuity |
| `knowledge` | ctx, memora queries | External knowledge bases |
| `claude` | profiles, skills | Claude-specific features |
| `groups` | load, save | Project group config |
| `files` | list_directory, read/write file | File browser |
| `watcher` | start, stop | File change monitoring |
| `remote` | 12 commands | Remote machine management |
| `bttask` | list, create, update, delete, comments | Task board |
| `search` | init, search, rebuild, index | FTS5 search |
| `secrets` | store, get, delete, list, has_keyring | Secrets management |
| `plugins` | discover, read_file | Plugin discovery |
| `notifications` | send_desktop | OS notifications |
| `misc` | test_mode, frontend_log | Utilities |

---

## Svelte 5 Frontend (`v2/src/`)

The frontend uses Svelte 5 with runes for reactive state management. The UI follows a VSCode-inspired layout with a left icon rail, expandable drawer, project grid, and status bar.

### Component Hierarchy

```
App.svelte                           [Root — VSCode-style layout]
├── CommandPalette.svelte            [Ctrl+K overlay, 18+ commands]
├── SearchOverlay.svelte             [Ctrl+Shift+F, FTS5 Spotlight-style]
├── NotificationCenter.svelte        [Bell icon + dropdown]
├── GlobalTabBar.svelte              [Left icon rail, 2.75rem wide]
├── [Sidebar Panel]                  [Expandable drawer, max 50%]
│   └── SettingsTab.svelte           [Global settings + group/project CRUD]
├── ProjectGrid.svelte               [Flex + scroll-snap, adaptive count]
│   └── ProjectBox.svelte            [Per-project container, 11 tab types]
│       ├── ProjectHeader.svelte     [Icon + name + status + badges]
│       ├── AgentSession.svelte      [Main Claude session wrapper]
│       │   ├── AgentPane.svelte     [Structured message rendering]
│       │   └── TeamAgentsPanel.svelte [Tier 1 subagent cards]
│       ├── TerminalTabs.svelte      [Shell/SSH/agent-preview tabs]
│       │   ├── TerminalPane.svelte  [xterm.js + Canvas addon]
│       │   └── AgentPreviewPane.svelte [Read-only agent activity]
│       ├── DocsTab.svelte           [Markdown file browser]
│       ├── ContextTab.svelte        [LLM context visualization]
│       ├── FilesTab.svelte          [Directory tree + CodeMirror editor]
│       ├── SshTab.svelte            [SSH connection manager]
│       ├── MemoriesTab.svelte       [Memora database viewer]
│       ├── MetricsPanel.svelte      [Health + history sparklines]
│       ├── TaskBoardTab.svelte      [Kanban board, Manager only]
│       ├── ArchitectureTab.svelte   [PlantUML viewer, Architect only]
│       └── TestingTab.svelte        [Selenium/test files, Tester only]
└── StatusBar.svelte                 [Agent counts, burn rate, attention queue]
```

### Stores (Svelte 5 Runes)

All store files use the `.svelte.ts` extension — this is required for Svelte 5 runes (`$state`, `$derived`, `$effect`). Files with plain `.ts` extension will compile but fail at runtime with "rune_outside_svelte".

| Store | Purpose |
|-------|---------|
| `workspace.svelte.ts` | Project groups, active group, tabs, focus |
| `agents.svelte.ts` | Agent sessions, messages, cost, parent/child hierarchy |
| `health.svelte.ts` | Per-project health tracking, attention scoring, burn rate |
| `conflicts.svelte.ts` | File overlap + external write detection |
| `anchors.svelte.ts` | Session anchor management (auto/pinned/promoted) |
| `notifications.svelte.ts` | Toast + history (6 types, unread badge) |
| `plugins.svelte.ts` | Plugin command registry, event bus |
| `theme.svelte.ts` | 17 themes, font restoration |
| `machines.svelte.ts` | Remote machine state |
| `wake-scheduler.svelte.ts` | Manager auto-wake (3 strategies, per-manager timers) |

### Adapters (IPC Bridge Layer)

Adapters wrap Tauri `invoke()` calls and `listen()` event subscriptions. They isolate the frontend from IPC details and provide typed TypeScript interfaces.

| Adapter | Backend Module | Purpose |
|---------|---------------|---------|
| `agent-bridge.ts` | sidecar + commands/agent | Agent query/stop/restart |
| `pty-bridge.ts` | pty + commands/pty | Terminal spawn/write/resize |
| `claude-messages.ts` | — (frontend-only) | Parse Claude SDK NDJSON → AgentMessage |
| `codex-messages.ts` | — (frontend-only) | Parse Codex ThreadEvents → AgentMessage |
| `ollama-messages.ts` | — (frontend-only) | Parse Ollama chunks → AgentMessage |
| `message-adapters.ts` | — (frontend-only) | Provider registry for message parsers |
| `provider-bridge.ts` | commands/claude | Generic provider bridge (profiles, skills) |
| `btmsg-bridge.ts` | btmsg | Inter-agent messaging |
| `bttask-bridge.ts` | bttask | Task board operations |
| `groups-bridge.ts` | groups | Group config load/save |
| `session-bridge.ts` | session | Session/layout persistence |
| `settings-bridge.ts` | session/settings | Key-value settings |
| `files-bridge.ts` | commands/files | File browser operations |
| `search-bridge.ts` | search | FTS5 search |
| `secrets-bridge.ts` | secrets | System keyring |
| `anchors-bridge.ts` | session/anchors | Session anchor CRUD |
| `remote-bridge.ts` | remote | Remote machine management |
| `ssh-bridge.ts` | session/ssh | SSH session CRUD |
| `ctx-bridge.ts` | ctx | Context database queries |
| `memora-bridge.ts` | memora | Memora database queries |
| `fs-watcher-bridge.ts` | fs_watcher | Filesystem change events |
| `audit-bridge.ts` | btmsg (audit_log) | Audit log queries |
| `telemetry-bridge.ts` | telemetry | Frontend → Rust tracing |
| `notifications-bridge.ts` | notifications | Desktop notification trigger |
| `plugins-bridge.ts` | plugins | Plugin discovery |

### Agent Dispatcher

The agent dispatcher (`agent-dispatcher.ts`, ~260 lines) is the central router between sidecar events and the agent store. When the Rust backend emits a `sidecar-message` Tauri event, the dispatcher:

1. Looks up the provider for the session (via `sessionProviderMap`)
2. Routes the raw message through the appropriate adapter (claude-messages.ts, codex-messages.ts, or ollama-messages.ts) via `message-adapters.ts`
3. Feeds the resulting `AgentMessage[]` into the agent store
4. Handles side effects: subagent pane spawning, session persistence, auto-anchoring, worktree detection, health tracking, conflict recording

The dispatcher delegates to four extracted utility modules:
- `utils/session-persistence.ts` — session-project maps, persistSessionForProject
- `utils/subagent-router.ts` — spawn + route subagent panes
- `utils/auto-anchoring.ts` — triggerAutoAnchor on first compaction event
- `utils/worktree-detection.ts` — detectWorktreeFromCwd pure function

---

## Sidecar Layer (`v2/sidecar/`)

See [sidecar.md](sidecar.md) for the full sidecar architecture. In brief:

- Each AI provider has its own runner file (e.g., `claude-runner.ts`) compiled to an ESM bundle (`claude-runner.mjs`) by esbuild
- Rust's SidecarManager spawns the appropriate runner based on the `provider` field in AgentQueryOptions
- Communication uses stdio NDJSON — one JSON object per line, newline-delimited
- Deno is preferred (faster startup), Node.js is the fallback
- The Claude runner uses `@anthropic-ai/claude-agent-sdk` query() internally

---

## Data Flow: Agent Query Lifecycle

Here is the complete path of a user prompt through the system:

```
1. User types prompt in AgentPane
2. AgentPane calls agentBridge.queryAgent(options)
3. agent-bridge.ts invokes Tauri command 'agent_query'
4. Rust agent_query handler calls SidecarManager.query()
5. SidecarManager resolves provider runner (e.g., claude-runner.mjs)
6. SidecarManager writes QueryMessage as NDJSON to sidecar stdin
7. Sidecar runner calls provider SDK (e.g., Claude Agent SDK query())
8. Provider SDK streams responses
9. Runner forwards each response as NDJSON to stdout
10. SidecarManager reads stdout line-by-line
11. SidecarManager emits Tauri event 'sidecar-message' with sessionId + data
12. Frontend agent-dispatcher.ts receives event
13. Dispatcher routes through message-adapters.ts → provider-specific parser
14. Parser converts to AgentMessage[]
15. Dispatcher feeds messages into agents.svelte.ts store
16. AgentPane reactively re-renders via $derived bindings
```

### Session Stop Flow

```
1. User clicks Stop button in AgentPane
2. AgentPane calls agentBridge.stopAgent(sessionId)
3. agent-bridge.ts invokes Tauri command 'agent_stop'
4. Rust handler calls SidecarManager.stop(sessionId)
5. SidecarManager writes StopMessage to sidecar stdin
6. Runner calls AbortController.abort() on the SDK query
7. SDK terminates the Claude subprocess
8. Runner emits final status message, then closes
```

---

## Configuration

### Project Groups (`~/.config/bterminal/groups.json`)

Human-editable JSON file defining project groups and their projects. Loaded at startup by `groups.rs`. Not hot-reloaded — changes require app restart or group switch.

### SQLite Settings (`sessions.db` → `settings` table)

Key-value store for user preferences: theme, fonts, shell, CWD, provider settings. Accessed via `settings-bridge.ts` → `settings_get`/`settings_set` Tauri commands.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `BTERMINAL_TEST` | Enables test mode (disables watchers, wake scheduler) |
| `BTERMINAL_TEST_DATA_DIR` | Redirects SQLite database storage |
| `BTERMINAL_TEST_CONFIG_DIR` | Redirects groups.json config |
| `BTERMINAL_OTLP_ENDPOINT` | Enables OpenTelemetry OTLP export |

---

## Key Constraints

1. **WebKit2GTK has no WebGL** — xterm.js must use the Canvas addon explicitly. Maximum 4 active xterm.js instances to avoid OOM.

2. **Svelte 5 runes require `.svelte.ts`** — Store files using `$state`/`$derived` must have the `.svelte.ts` extension. The compiler silently accepts `.ts` but runes fail at runtime.

3. **Single shared sidecar** — All agent sessions share one SidecarManager. Per-project isolation is via `cwd`, `claude_config_dir`, and `session_id` routing. Per-project sidecar pools deferred to v3.1.

4. **SQLite WAL mode** — Both databases use WAL with 5s busy_timeout for concurrent access from Rust backend + Python CLIs (btmsg/bttask).

5. **camelCase wire format** — Rust uses `#[serde(rename_all = "camelCase")]`. TypeScript interfaces must match. This was a source of bugs during development (see [findings.md](findings.md) for context).
