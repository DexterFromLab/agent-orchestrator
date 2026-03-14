# BTerminal — Project Guide for Claude

## Project Overview

Terminal emulator with SSH and Claude Code session management. v1 (GTK3+VTE Python) is production-stable. v2 redesign (Tauri 2.x + Svelte 5 + Claude Agent SDK) Phases 1-7 + multi-machine (A-D) + profiles/skills complete. Packaging: .deb + AppImage via GitHub Actions CI. v3 Mission Control (All Phases 1-10 Complete + Production Readiness): multi-project dashboard with project groups, per-project Claude sessions with session continuity, team agents panel, terminal tabs, VSCode-style left sidebar, multi-agent orchestration (Tier 1 management agents: Manager/Architect/Tester/Reviewer with role-specific tabs, btmsg inter-agent messaging, bttask kanban task board with optimistic locking). Production features: sidecar crash recovery/supervision, FTS5 full-text search, plugin system (sandboxed, 35 tests), Landlock sandboxing, secrets management (system keyring), OS + in-app notifications, keyboard-first UX (18+ palette commands), agent health monitoring + dead letter queue, audit logging, error classification. Hardening: TLS relay support, WAL checkpoint (5min), subagent delegation fix.

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
| `docs/architecture.md` | End-to-end system architecture, data model, layout system |
| `docs/decisions.md` | Architecture decisions log with rationale and dates |
| `docs/phases.md` | v2 implementation phases (1-7 + multi-machine A-D) |
| `docs/findings.md` | All research findings (v2 + v3 combined) |
| `docs/progress/` | Session progress logs (v2, v3, archive) |
| `docs/multi-machine.md` | Multi-machine architecture (implemented, Phases A-D) |
| `docs/release-notes.md` | v3.0 release notes |
| `docs/e2e-testing.md` | E2E testing facility: fixtures, test mode, LLM judge, spec phases, CI |
| `v2/Cargo.toml` | Cargo workspace root (members: src-tauri, bterminal-core, bterminal-relay) |
| `v2/bterminal-core/` | Shared crate: EventSink trait, PtyManager, SidecarManager |
| `v2/bterminal-relay/` | Standalone relay binary (WebSocket server, token auth, CLI) |
| `v2/src-tauri/src/pty.rs` | PTY backend (thin re-export from bterminal-core) |
| `v2/src-tauri/src/groups.rs` | Groups config (load/save ~/.config/bterminal/groups.json) |
| `v2/src-tauri/src/fs_watcher.rs` | ProjectFsWatcher (inotify per-project recursive file change detection, S-1 Phase 2) |
| `v2/src-tauri/src/lib.rs` | AppState + setup + handler registration (~170 lines) |
| `v2/src-tauri/src/commands/` | 16 domain command modules (pty, agent, watcher, session, persistence, knowledge, claude, groups, files, remote, misc, bttask, notifications, plugins, search, secrets) |
| `v2/src-tauri/src/btmsg.rs` | Agent messaging backend (agents, DMs, channels, contacts ACL, heartbeats, dead_letter_queue, audit_log; SQLite WAL mode, named column access) |
| `v2/src-tauri/src/bttask.rs` | Task board backend (list, create, update status with optimistic locking, delete, comments, review_queue_count; shared btmsg.db) |
| `v2/src-tauri/src/search.rs` | FTS5 full-text search (SearchDb, 3 virtual tables: search_messages/tasks/btmsg, index/search/rebuild) |
| `v2/src-tauri/src/secrets.rs` | SecretsManager (keyring crate, linux-native/libsecret, store/get/delete/list with metadata tracking) |
| `v2/src-tauri/src/plugins.rs` | Plugin discovery (scan config dir for plugin.json, path-traversal-safe file reading, permission validation) |
| `v2/src-tauri/src/notifications.rs` | Desktop notifications (notify-rust, graceful fallback if daemon unavailable) |
| `v2/bterminal-core/src/supervisor.rs` | SidecarSupervisor (auto-restart, exponential backoff 1s-30s, 5 retries, SidecarHealth enum, 17 tests) |
| `v2/bterminal-core/src/sandbox.rs` | Landlock sandbox (SandboxConfig RW/RO paths, pre_exec() integration, kernel 6.2+ graceful fallback) |
| `v2/src-tauri/src/sidecar.rs` | SidecarManager (thin re-export from bterminal-core) |
| `v2/src-tauri/src/event_sink.rs` | TauriEventSink (implements EventSink for AppHandle) |
| `v2/src-tauri/src/remote.rs` | RemoteManager (WebSocket client connections to relays) |
| `v2/src-tauri/src/session/` | SessionDb module: mod.rs (struct + migrate), sessions.rs, layout.rs, settings.rs, ssh.rs, agents.rs, metrics.rs, anchors.rs |
| `v2/src-tauri/src/watcher.rs` | FileWatcherManager (notify crate, file change events) |
| `v2/src-tauri/src/ctx.rs` | CtxDb (read-only access to ~/.claude-context/context.db) |
| `v2/src-tauri/src/memora.rs` | MemoraDb (read-only access to ~/.local/share/memora/memories.db, FTS5 search) |
| `v2/src-tauri/src/telemetry.rs` | OTEL telemetry (TelemetryGuard, tracing + OTLP export, BTERMINAL_OTLP_ENDPOINT) |
| `v2/src/lib/stores/workspace.svelte.ts` | v3 workspace store (project groups, tabs, focus, replaces layout store) |
| `v2/src/lib/stores/layout.svelte.ts` | v2 layout store (panes, presets, groups, persistence, Svelte 5 runes) |
| `v2/src/lib/stores/agents.svelte.ts` | Agent session store (messages, cost, parent/child hierarchy) |
| `v2/src/lib/components/Terminal/TerminalPane.svelte` | xterm.js terminal pane |
| `v2/src/lib/components/Terminal/AgentPreviewPane.svelte` | Read-only xterm.js showing agent activity (Bash commands, tool results, errors) |
| `v2/src/lib/components/Agent/AgentPane.svelte` | Agent session pane (sans-serif font, tool call/result pairing, hook collapsing, context meter, prompt, cost, profile selector, skill autocomplete) |
| `v2/src/lib/adapters/pty-bridge.ts` | PTY IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/agent-bridge.ts` | Agent IPC wrapper (Tauri invoke/listen) |
| `v2/src/lib/adapters/claude-messages.ts` | Claude message adapter (stream-json parser, renamed from sdk-messages.ts) |
| `v2/src/lib/adapters/message-adapters.ts` | Provider message adapter registry (per-provider routing to common AgentMessage) |
| `v2/src/lib/adapters/provider-bridge.ts` | Generic provider bridge (delegates to provider-specific bridges) |
| `v2/src/lib/providers/types.ts` | Provider abstraction types (ProviderId, ProviderCapabilities, ProviderMeta, ProviderSettings) |
| `v2/src/lib/providers/registry.svelte.ts` | Svelte 5 rune-based provider registry (registerProvider, getProviders) |
| `v2/src/lib/providers/claude.ts` | Claude provider metadata constant (CLAUDE_PROVIDER) |
| `v2/src/lib/providers/codex.ts` | Codex provider metadata constant (CODEX_PROVIDER, gpt-5.4 default) |
| `v2/src/lib/providers/ollama.ts` | Ollama provider metadata constant (OLLAMA_PROVIDER, qwen3:8b default) |
| `v2/src/lib/adapters/codex-messages.ts` | Codex message adapter (ThreadEvent parser) |
| `v2/src/lib/adapters/ollama-messages.ts` | Ollama message adapter (streaming chunk parser) |
| `v2/src/lib/agent-dispatcher.ts` | Thin coordinator: routes sidecar events to agent store, delegates to extracted modules |
| `v2/src/lib/utils/session-persistence.ts` | Session-project maps + persistSessionForProject + waitForPendingPersistence |
| `v2/src/lib/utils/auto-anchoring.ts` | triggerAutoAnchor on first compaction event |
| `v2/src/lib/utils/subagent-router.ts` | Subagent pane creation + toolUseToChildPane routing |
| `v2/src/lib/utils/worktree-detection.ts` | detectWorktreeFromCwd pure function (3 provider patterns) |
| `v2/src/lib/adapters/file-bridge.ts` | File watcher IPC wrapper |
| `v2/src/lib/adapters/settings-bridge.ts` | Settings IPC wrapper (get/set/list) |
| `v2/src/lib/adapters/ctx-bridge.ts` | ctx database IPC wrapper |
| `v2/src/lib/adapters/ssh-bridge.ts` | SSH session IPC wrapper |
| `v2/src/lib/adapters/claude-bridge.ts` | Claude profiles + skills IPC wrapper |
| `v2/src/lib/adapters/groups-bridge.ts` | Groups config IPC wrapper (load/save) |
| `v2/src/lib/adapters/remote-bridge.ts` | Remote machine management IPC wrapper |
| `v2/src/lib/adapters/files-bridge.ts` | File browser IPC wrapper (list_directory_children, read_file_content) |
| `v2/src/lib/adapters/memory-adapter.ts` | Pluggable memory adapter interface (MemoryAdapter, registry) |
| `v2/src/lib/adapters/memora-bridge.ts` | Memora IPC bridge + MemoraAdapter (read-only SQLite via Tauri commands) |
| `v2/src/lib/adapters/fs-watcher-bridge.ts` | Filesystem watcher IPC wrapper (project CWD write detection) |
| `v2/src/lib/adapters/anchors-bridge.ts` | Session anchors IPC wrapper (save, load, delete, clear, updateType) |
| `v2/src/lib/adapters/bttask-bridge.ts` | Task board IPC adapter (listTasks, createTask, updateTaskStatus, deleteTask, comments) |
| `v2/src/lib/adapters/telemetry-bridge.ts` | Frontend telemetry bridge (routes events to Rust tracing via IPC) |
| `v2/src/lib/utils/agent-prompts.ts` | Agent prompt generator (generateAgentPrompt: identity, env, team, btmsg/bttask docs, workflow) |
| `docker/tempo/` | Docker compose: Tempo + Grafana for trace visualization (port 9715) |
| `v2/scripts/test-all.sh` | Unified test runner: vitest + cargo + optional E2E (--e2e flag) |
| `v2/tests/e2e/wdio.conf.js` | WebDriverIO config (tauri-driver lifecycle, TCP probe, test env vars) |
| `v2/tests/e2e/fixtures.ts` | E2E test fixture generator (isolated temp dirs, git repos, groups.json) |
| `v2/tests/e2e/results-db.ts` | JSON test results store (run/step tracking, no native deps) |
| `v2/tests/e2e/specs/bterminal.test.ts` | E2E smoke tests (CSS class selectors, 50+ tests) |
| `v2/tests/e2e/specs/agent-scenarios.test.ts` | Phase A E2E scenarios (data-testid selectors, 7 scenarios, 22 tests) |
| `v2/tests/e2e/specs/phase-b.test.ts` | Phase B E2E scenarios (multi-project, LLM-judged assertions, 6 scenarios) |
| `v2/tests/e2e/llm-judge.ts` | LLM judge helper (Claude API assertions, confidence thresholds) |
| `.github/workflows/e2e.yml` | CI: unit + cargo + E2E tests (xvfb-run, path-filtered, LLM tests gated on secret) |
| `v2/src/lib/stores/machines.svelte.ts` | Remote machine state store (Svelte 5 runes) |
| `v2/src/lib/utils/attention-scorer.ts` | Pure attention scoring function (extracted from health store, 14 tests) |
| `v2/src/lib/utils/wake-scorer.ts` | Pure wake signal evaluation (6 signals, 24 tests) |
| `v2/src/lib/types/wake.ts` | WakeStrategy, WakeSignal, WakeEvaluation, WakeContext types |
| `v2/src/lib/stores/wake-scheduler.svelte.ts` | Manager auto-wake scheduler (3 strategies, per-manager timers) |
| `v2/src/lib/utils/type-guards.ts` | Shared runtime guards: str(), num() for untyped wire format parsing |
| `v2/src/lib/utils/agent-tree.ts` | Agent tree builder (hierarchy from messages) |
| `v2/src/lib/utils/highlight.ts` | Shiki syntax highlighter (lazy singleton, 13 languages) |
| `v2/src/lib/utils/detach.ts` | Detached pane mode (pop-out windows via URL params) |
| `v2/src/lib/utils/updater.ts` | Tauri auto-updater utility |
| `v2/src/lib/stores/notifications.svelte.ts` | Notification store (toast + history, 6 NotificationTypes, unread badge, max 100 history) |
| `v2/src/lib/stores/plugins.svelte.ts` | Plugin store (command registry, event bus, loadAllPlugins/unloadAllPlugins) |
| `v2/src/lib/adapters/audit-bridge.ts` | Audit log IPC adapter (logAuditEvent, getAuditLog, AuditEntry, AuditEventType) |
| `v2/src/lib/adapters/notifications-bridge.ts` | Desktop notification IPC wrapper (sendDesktopNotification) |
| `v2/src/lib/adapters/plugins-bridge.ts` | Plugin discovery IPC wrapper (discoverPlugins, readPluginFile) |
| `v2/src/lib/adapters/search-bridge.ts` | FTS5 search IPC wrapper (initSearch, searchAll, rebuildIndex, indexMessage) |
| `v2/src/lib/adapters/secrets-bridge.ts` | Secrets IPC wrapper (storeSecret, getSecret, deleteSecret, listSecrets, hasKeyring) |
| `v2/src/lib/utils/error-classifier.ts` | API error classification (6 types: rate_limit/auth/quota/overloaded/network/unknown, retry logic, 20 tests) |
| `v2/src/lib/plugins/plugin-host.ts` | Sandboxed plugin runtime (new Function(), permission-gated API, load/unload lifecycle) |
| `v2/src/lib/components/Agent/UsageMeter.svelte` | Compact inline usage meter (color thresholds 50/75/90%, hover tooltip) |
| `v2/src/lib/components/Notifications/NotificationCenter.svelte` | Bell icon + dropdown notification panel (unread badge, history, mark read/clear) |
| `v2/src/lib/components/Workspace/AuditLogTab.svelte` | Manager audit log tab (filter by type+agent, 5s auto-refresh, max 200 entries) |
| `v2/src/lib/components/Workspace/SearchOverlay.svelte` | FTS5 search overlay (Ctrl+Shift+F, Spotlight-style, 300ms debounce, grouped results) |
| `v2/src/lib/stores/theme.svelte.ts` | Theme store (17 themes: 4 Catppuccin + 7 Editor + 6 Deep Dark, UI + terminal font restoration on startup) |
| `v2/src/lib/styles/themes.ts` | Theme palette definitions (17 themes), ThemeId/ThemePalette/ThemeMeta types, THEME_LIST |
| `v2/src/lib/styles/catppuccin.css` | CSS custom properties: 26 --ctp-* color vars + --ui-font-* + --term-font-* |
| `v2/src/lib/components/Agent/AgentTree.svelte` | SVG agent tree visualization |
| `v2/src/lib/components/Context/ContextPane.svelte` | ctx database viewer (projects, entries, search) — replaced by ContextTab in ProjectBox |
| `v2/src/lib/components/Workspace/ContextTab.svelte` | LLM context window visualization (stats, token meter, file refs, turn breakdown) |
| `v2/src/lib/components/Workspace/CodeEditor.svelte` | CodeMirror 6 wrapper (15 languages, Catppuccin theme, save/blur callbacks) |
| `v2/src/lib/components/Workspace/PdfViewer.svelte` | PDF viewer (pdfjs-dist, canvas multi-page, zoom 0.5x–3x, HiDPI) |
| `v2/src/lib/components/Workspace/CsvTable.svelte` | CSV table viewer (RFC 4180 parser, delimiter auto-detect, sortable columns) |
| `v2/src/lib/components/Workspace/MetricsPanel.svelte` | Dashboard metrics panel (live health + task counts + history sparklines, 25 tests) |
| `v2/src/lib/stores/health.svelte.ts` | Project health store (activity state, burn rate, context pressure, file conflicts, attention scoring) |
| `v2/src/lib/stores/conflicts.svelte.ts` | File overlap + external write conflict detection (per-project, session-scoped, worktree-aware, dismissible, inotify-backed) |
| `v2/src/lib/stores/anchors.svelte.ts` | Session anchor store (per-project anchors, auto-anchor tracking, re-injection support) |
| `v2/src/lib/types/anchors.ts` | Anchor types (AnchorType, SessionAnchor, AnchorSettings, AnchorBudgetScale, SessionAnchorRecord) |
| `v2/src/lib/utils/anchor-serializer.ts` | Anchor serialization (turn grouping, observation masking, token estimation) |
| `v2/src/lib/utils/tool-files.ts` | Shared file path extraction from tool_call inputs (extractFilePaths, extractWritePaths, extractWorktreePath) |
| `v2/src/lib/components/StatusBar/StatusBar.svelte` | Mission Control bar (agent states, $/hr burn rate, attention queue, cost) |
| `v2/src/lib/components/Notifications/ToastContainer.svelte` | Toast notification display |
| `v2/src/lib/components/Workspace/` | v3 components: GlobalTabBar, ProjectGrid, ProjectBox, ProjectHeader, AgentSession, TeamAgentsPanel, AgentCard, TerminalTabs, ProjectFiles, FilesTab, SshTab, MemoriesTab, CommandPalette, DocsTab, SettingsTab, TaskBoardTab, ArchitectureTab, TestingTab |
| `v2/src/lib/types/groups.ts` | TypeScript interfaces (ProjectConfig, GroupConfig, GroupsFile) |
| `v2/src/lib/adapters/session-bridge.ts` | Session/layout/group persistence IPC wrapper |
| `v2/src/lib/components/Markdown/MarkdownPane.svelte` | Markdown file viewer (marked.js + shiki, live reload) |
| `v2/sidecar/claude-runner.ts` | Claude sidecar source (compiled to .mjs by esbuild, includes findClaudeCli()) |
| `v2/sidecar/codex-runner.ts` | Codex sidecar source (@openai/codex-sdk dynamic import, sandbox/approval mapping) |
| `v2/sidecar/ollama-runner.ts` | Ollama sidecar source (direct HTTP to localhost:11434, zero external deps) |
| `v2/sidecar/agent-runner-deno.ts` | Standalone Deno sidecar runner (not used by SidecarManager, alternative) |
| `v2/sidecar/dist/claude-runner.mjs` | Bundled Claude sidecar (runs on both Deno and Node.js) |
| `v2/src/lib/adapters/claude-messages.test.ts` | Vitest tests for Claude message adapter (25 tests) |
| `v2/src/lib/adapters/codex-messages.test.ts` | Vitest tests for Codex message adapter (19 tests) |
| `v2/src/lib/adapters/ollama-messages.test.ts` | Vitest tests for Ollama message adapter (11 tests) |
| `v2/src/lib/adapters/memora-bridge.test.ts` | Vitest tests for Memora bridge + adapter (16 tests) |
| `v2/src/lib/adapters/btmsg-bridge.test.ts` | Vitest tests for btmsg bridge (17 tests: camelCase, IPC commands) |
| `v2/src/lib/adapters/bttask-bridge.test.ts` | Vitest tests for bttask bridge (10 tests: camelCase, IPC commands) |
| `v2/src/lib/adapters/agent-bridge.test.ts` | Vitest tests for agent IPC bridge (11 tests) |
| `v2/src/lib/agent-dispatcher.test.ts` | Vitest tests for agent dispatcher (29 tests) |
| `v2/src/lib/stores/conflicts.test.ts` | Vitest tests for conflict detection (28 tests) |
| `v2/src/lib/utils/tool-files.test.ts` | Vitest tests for tool file extraction (27 tests) |
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
- Rust deps (src-tauri): tauri, bterminal-core (path), rusqlite (bundled-full, FTS5), dirs, notify, serde, tokio, tokio-tungstenite, futures-util, tracing, tracing-subscriber, opentelemetry, opentelemetry_sdk, opentelemetry-otlp, tracing-opentelemetry, tauri-plugin-updater, tauri-plugin-dialog, notify-rust, keyring (linux-native)
- Rust deps (bterminal-core): portable-pty, uuid, serde, serde_json, log, landlock
- Rust deps (bterminal-relay): bterminal-core, tokio, tokio-tungstenite, clap, env_logger, futures-util
- npm deps: @anthropic-ai/claude-agent-sdk, @xterm/xterm, @xterm/addon-canvas, @xterm/addon-fit, @tauri-apps/api, @tauri-apps/plugin-updater, @tauri-apps/plugin-dialog, marked, shiki, pdfjs-dist, vitest (dev)
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
cd v2 && npm run test:all                   # All tests (vitest + cargo)
cd v2 && npm run test:all:e2e               # All tests + E2E (needs built binary)
cd v2 && npm run test                       # Vitest only (frontend)
cd v2 && npm run test:cargo                 # Cargo only (backend)
cd v2 && npm run test:e2e                   # E2E only (WebDriverIO)

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
