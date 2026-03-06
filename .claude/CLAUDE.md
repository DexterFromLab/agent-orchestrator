# BTerminal — Claude Behavioral Guide

## Workflow

- v1 is a single-file Python app (`bterminal.py`). Changes are localized.
- v2 docs are in `docs/`. Architecture decisions are in `docs/task_plan.md`.
- Phases 1-7 + multi-machine (A-D) complete. Extras: SSH, ctx, themes, detached mode, auto-updater, shiki, copy/paste, session resume, drag-resize, session groups, Deno sidecar, 114 vitest + 29 cargo tests.
- Consult Memora (tag: `bterminal`) before making architectural changes.

## Documentation References

- Architecture & decisions: [docs/task_plan.md](../docs/task_plan.md)
- Implementation phases: [docs/phases.md](../docs/phases.md)
- Research findings: [docs/findings.md](../docs/findings.md)
- Progress log: [docs/progress.md](../docs/progress.md)

## Rules

- Do not modify v1 code (`bterminal.py`) unless explicitly asked — it is production-stable.
- v2 work goes on a feature branch (`v2-mission-control`), not master.
- All v2 architecture decisions must reference `docs/task_plan.md` Decisions Log.
- When adding new decisions, append to the Decisions Log table with date.
- Update `docs/progress.md` after each significant work session.

## Key Technical Constraints

- WebKit2GTK has no WebGL — xterm.js must use Canvas addon explicitly.
- Agent sessions use `@anthropic-ai/claude-agent-sdk` query() function (migrated from raw CLI spawning due to piped stdio hang bug). SDK handles subprocess management internally. All output goes through the adapter layer (`src/lib/adapters/sdk-messages.ts`) — SDK message format matches CLI stream-json.
- Sidecar uses Deno-first + Node.js fallback (`sidecar/agent-runner-deno.ts` preferred, `sidecar/agent-runner.ts` fallback). SidecarCommand struct in sidecar.rs abstracts runtime. Communicates with Rust via stdio NDJSON. Both runners MUST strip ALL `CLAUDE*` prefixed env vars via SDK's `env` option — without this, nesting detection triggers when BTerminal is launched from a Claude Code terminal. Session stop uses AbortController.abort() (not process.kill()).
- AgentPane does NOT stop agents in onDestroy — onDestroy fires on layout remounts, not just explicit close. Stop-on-close is handled by TilingGrid.svelte's onClose handler (checks pane type + session status before calling stopAgent).
- Agent dispatcher (`src/lib/agent-dispatcher.ts`) is a singleton that routes sidecar events to the agent store. Also handles subagent pane spawning (SUBAGENT_TOOL_NAMES detection, toolUseToChildPane routing map).
- AgentQueryOptions supports `permission_mode` field (flows Rust -> sidecar -> SDK). Defaults to 'bypassPermissions', supports 'default' mode. allowDangerouslySkipPermissions is conditionally set.
- Sidecar build: `npm run build:sidecar` bundles SDK into agent-runner.mjs via esbuild (no --external, SDK included in bundle).
- Maximum 4 active xterm.js instances to avoid WebKit2GTK memory issues.
- Store files using Svelte 5 runes (`$state`, `$derived`) MUST have `.svelte.ts` extension (not `.ts`). Import with `.svelte` suffix. Plain `.ts` compiles but fails at runtime with "rune_outside_svelte".
- Session persistence uses rusqlite (bundled) with WAL mode. Data dir: `dirs::data_dir()/bterminal/sessions.db`.
- Layout store persists to SQLite on every addPane/removePane/setPreset/setPaneGroup change (fire-and-forget). Restores on app startup via `restoreFromDb()`.
- Session groups: Pane.group? field in layout store, group_name column in sessions table, collapsible group headers in sidebar. Right-click pane to set group.
- File watcher uses notify crate v6, watches parent directory (NonRecursive), emits `file-changed` Tauri events.
- Settings use key-value `settings` table in SQLite (session.rs). Frontend: `settings-bridge.ts` adapter, `SettingsDialog.svelte` component.
- Notifications use ephemeral toast system: `notifications.svelte.ts` store (max 5, 4s auto-dismiss), `ToastContainer.svelte` display. Agent dispatcher emits toasts on agent complete/error/crash.
- StatusBar component spans full grid width (grid-column: 1 / -1), shows pane counts, active agents, tokens, cost.
- Agent tree (AgentTree.svelte) uses SVG with recursive layout. Tree data built by `agent-tree.ts` utility from agent messages.
- ctx integration opens `~/.claude-context/context.db` as SQLITE_OPEN_READ_ONLY — never writes. CtxDb uses Option<Connection> for graceful absence if DB doesn't exist.
- SSH sessions spawn TerminalPane with shell=/usr/bin/ssh and args array. No SSH library needed — PTY handles it natively.
- Theme flavors (Latte/Frappe/Macchiato/Mocha) override CSS variables at runtime. Open terminals hot-swap via onThemeChange() callback registry in theme.svelte.ts.
- Detached pane mode: App.svelte checks URL param `?detached=1` and renders a single pane without sidebar/grid chrome. Used for pop-out windows.
- Shiki syntax highlighting uses lazy singleton pattern (avoid repeated WASM init). 13 languages preloaded. Used in MarkdownPane and AgentPane text messages.
- Cargo workspace at v2/ level: members = [src-tauri, bterminal-core, bterminal-relay]. Cargo.lock is at workspace root (v2/), not in src-tauri/.
- EventSink trait (bterminal-core/src/event.rs) abstracts event emission. PtyManager and SidecarManager are in bterminal-core, not src-tauri. src-tauri has thin re-exports.
- RemoteManager (src-tauri/src/remote.rs) manages WebSocket client connections to bterminal-relay instances. 12 Tauri commands prefixed with `remote_`.
- remote-bridge.ts adapter wraps remote machine management IPC. machines.svelte.ts store tracks remote machine state.
- Pane.remoteMachineId?: string routes operations through RemoteManager instead of local managers. Bridge adapters (pty-bridge, agent-bridge) check this field.
- bterminal-relay binary (v2/bterminal-relay/) is a standalone WebSocket server with token auth, rate limiting, and per-connection isolated managers. Commands return structured responses (pty_created, pong, error) with commandId for correlation via send_error() helper.
- RemoteManager reconnection: exponential backoff (1s-30s cap) on disconnect, attempt_tcp_probe() (TCP-only, no WS upgrade), emits remote-machine-reconnecting and remote-machine-reconnect-ready events. Frontend listeners in remote-bridge.ts; machines store auto-reconnects on ready.

## Memora Tags

Project tag: `bterminal`
Common tag combinations: `bterminal,architecture`, `bterminal,research`, `bterminal,tech-stack`

## Operational Rules

All operational rules live in `.claude/rules/`. Every `.md` file in that directory is automatically loaded at session start by Claude Code with the same priority as this file.

### Rule Index

| # | File | Scope |
|---|------|-------|
| 01 | `security.md` | **PARAMOUNT** — secrets, input validation, least privilege |
| 02 | `error-handling.md` | **PARAMOUNT** — handle every error visibly |
| 03 | `environment-safety.md` | **PARAMOUNT** — verify target, data safety, K8s isolation, cleanup |
| 04 | `communication.md` | Stop on ambiguity, scope discipline |
| 05 | `git-practices.md` | Conventional commits, authorship |
| 06 | `testing.md` | TDD, unit tests, E2E tests |
| 07 | `documentation.md` | README, CLAUDE.md sync, docs/ |
| 08 | `branch-hygiene.md` | Branches, naming, clean state before refactors |
| 09 | `dependency-discipline.md` | No deps without consent |
| 10 | `code-consistency.md` | Match existing patterns |
| 11 | `api-contracts.md` | Contract-first, flag breaking changes (path-conditional) |
| 12 | `performance-awareness.md` | No N+1, no unbounded fetches (path-conditional) |
| 13 | `logging-observability.md` | Structured logging, OTEL (path-conditional) |
| 14 | `resilience-and-config.md` | Timeouts, circuit breakers, externalized config (path-conditional) |
| 15 | `memora.md` | Persistent memory across sessions |
| 16 | `sub-agents.md` | When to use sub-agents and team agents |
| 17 | `document-imports.md` | Resolve @ imports in CLAUDE.md before acting |
