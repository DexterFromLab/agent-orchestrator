# BTerminal — Claude Behavioral Guide

## Workflow

- v1 is a single-file Python app (`bterminal.py`). Changes are localized.
- v2 docs are in `docs/`. Architecture decisions are in `docs/task_plan.md`.
- v2 Phases 1-7 + multi-machine (A-D) + profiles/skills complete. Extras: SSH, ctx, themes, detached mode, auto-updater, shiki, copy/paste, session resume, drag-resize, session groups, Deno sidecar, Claude profiles, skill discovery.
- v3 Mission Control (All Phases 1-10 Complete): project groups, workspace store, 12 Workspace components, session continuity, workspace teardown, dead v2 component cleanup. 138 vitest + 36 cargo tests.
- v3 docs: `docs/v3-task_plan.md`, `docs/v3-findings.md`, `docs/v3-progress.md`.
- Consult Memora (tag: `bterminal`) before making architectural changes.

## Documentation References

- Architecture & decisions: [docs/task_plan.md](../docs/task_plan.md)
- Implementation phases: [docs/phases.md](../docs/phases.md)
- Research findings: [docs/findings.md](../docs/findings.md)
- Progress log: [docs/progress.md](../docs/progress.md)
- v3 architecture: [docs/v3-task_plan.md](../docs/v3-task_plan.md)
- v3 findings: [docs/v3-findings.md](../docs/v3-findings.md)
- v3 progress: [docs/v3-progress.md](../docs/v3-progress.md)

## Rules

- Do not modify v1 code (`bterminal.py`) unless explicitly asked — it is production-stable.
- v2/v3 work goes on the `v2-mission-control` branch, not master.
- v2 architecture decisions must reference `docs/task_plan.md` Decisions Log.
- v3 architecture decisions must reference `docs/v3-task_plan.md` Decisions Log.
- When adding new decisions, append to the Decisions Log table with date.
- Update `docs/progress.md` after each significant work session.

## Key Technical Constraints

- WebKit2GTK has no WebGL — xterm.js must use Canvas addon explicitly.
- Agent sessions use `@anthropic-ai/claude-agent-sdk` query() function (migrated from raw CLI spawning due to piped stdio hang bug). SDK handles subprocess management internally. All output goes through the adapter layer (`src/lib/adapters/sdk-messages.ts`) — SDK message format matches CLI stream-json.
- Sidecar uses a single pre-built bundle (`sidecar/dist/agent-runner.mjs`) that runs on both Deno and Node.js. SidecarCommand struct in sidecar.rs abstracts runtime (Deno preferred for faster startup, Node.js fallback). Communicates with Rust via stdio NDJSON. Claude CLI auto-detected at startup via `findClaudeCli()` — checks ~/.local/bin/claude, ~/.claude/local/claude, /usr/local/bin/claude, /usr/bin/claude, then `which claude`. Path passed to SDK via `pathToClaudeCodeExecutable` option. Agents error immediately if CLI not found. CLAUDE* env var stripping is dual-layer: (1) Rust SidecarManager uses env_clear() + envs(clean_env) to strip all CLAUDE* vars before spawning the sidecar process, (2) JS runner also strips via SDK's `env` option (defense-in-depth). Without this, nesting detection triggers when BTerminal is launched from a Claude Code terminal. Session stop uses AbortController.abort() (not process.kill()). `agent-runner-deno.ts` exists as standalone alternative runner but is NOT used by SidecarManager.
- AgentPane does NOT stop agents in onDestroy — onDestroy fires on layout remounts, not just explicit close. Stop-on-close is handled externally (was TilingGrid in v2, now workspace teardown in v3).
- Agent dispatcher (`src/lib/agent-dispatcher.ts`) is a singleton that routes sidecar events to the agent store. Handles subagent routing (project-scoped sessions skip layout pane, render in TeamAgentsPanel; detached mode creates layout pane). Session persistence via registerSessionProject() + persistSessionForProject() (saves state + messages to SQLite on complete).
- AgentQueryOptions supports `permission_mode` field (flows Rust -> sidecar -> SDK). Defaults to 'bypassPermissions', supports 'default' mode. allowDangerouslySkipPermissions is conditionally set. Also supports: `setting_sources` (defaults to ['user', 'project']), `system_prompt`, `model`, `claude_config_dir` (for multi-account), `additional_directories`.
- Claude profiles: claude_list_profiles() reads ~/.config/switcher/profiles/ with profile.toml metadata. Profile selector in AgentPane when >1 profile. Selected profile's config_dir -> claude_config_dir -> CLAUDE_CONFIG_DIR env var override in sidecar.
- Skill discovery: claude_list_skills() reads ~/.claude/skills/ (dirs with SKILL.md or .md files). claude_read_skill() reads content. AgentPane `/` prefix triggers autocomplete menu. Skill content injected as prompt via expandSkillPrompt().
- claude-bridge.ts adapter wraps profile/skill Tauri commands (ClaudeProfile, ClaudeSkill interfaces).
- Sidecar build: `npm run build:sidecar` bundles SDK into agent-runner.mjs via esbuild (no --external, SDK included in bundle).
- Maximum 4 active xterm.js instances to avoid WebKit2GTK memory issues.
- Store files using Svelte 5 runes (`$state`, `$derived`) MUST have `.svelte.ts` extension (not `.ts`). Import with `.svelte` suffix. Plain `.ts` compiles but fails at runtime with "rune_outside_svelte".
- Session persistence uses rusqlite (bundled) with WAL mode. Data dir: `dirs::data_dir()/bterminal/sessions.db`.
- Layout store persists to SQLite on every addPane/removePane/setPreset/setPaneGroup change (fire-and-forget). Restores on app startup via `restoreFromDb()`.
- Session groups: Pane.group? field in layout store, group_name column in sessions table, collapsible group headers in sidebar. Right-click pane to set group.
- File watcher uses notify crate v6, watches parent directory (NonRecursive), emits `file-changed` Tauri events.
- Settings use key-value `settings` table in SQLite (session.rs). Frontend: `settings-bridge.ts` adapter. v3 uses SettingsTab.svelte rendered in sidebar drawer panel (v2 SettingsDialog.svelte deleted in P10). SettingsTab has two sections: Global (single-column layout, split into Appearance [theme dropdown, UI font dropdown with sans-serif options + size stepper, Terminal font dropdown with monospace options + size stepper] and Defaults [shell, CWD] — all custom themed dropdowns, no native `<select>`, all persisted via settings-bridge with keys: theme, ui_font_family, ui_font_size, term_font_family, term_font_size, default_shell, default_cwd) and Group/Project CRUD.
- Notifications use ephemeral toast system: `notifications.svelte.ts` store (max 5, 4s auto-dismiss), `ToastContainer.svelte` display. Agent dispatcher emits toasts on agent complete/error/crash.
- StatusBar component shows active group name, project count, agent count, tokens, cost. Uses workspace store (v3 rewrite, no longer uses layout store).
- Agent tree (AgentTree.svelte) uses SVG with recursive layout. Tree data built by `agent-tree.ts` utility from agent messages.
- ctx integration opens `~/.claude-context/context.db` as SQLITE_OPEN_READ_ONLY — never writes. CtxDb uses Option<Connection> for graceful absence if DB doesn't exist.
- SSH sessions spawn TerminalPane with shell=/usr/bin/ssh and args array. No SSH library needed — PTY handles it natively.
- Theme system: 17 themes in 3 groups — 4 Catppuccin + 7 Editor (VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark) + 6 Deep Dark (Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight). All map to same 26 --ctp-* CSS custom properties — zero component changes needed. ThemeId replaces CatppuccinFlavor. getCurrentTheme()/setTheme() are primary API (deprecated wrappers exist). THEME_LIST has ThemeMeta with group metadata for custom dropdown UI. Open terminals hot-swap via onThemeChange() callback registry in theme.svelte.ts. Typography uses --ui-font-family/--ui-font-size (UI elements, sans-serif fallback) and --term-font-family/--term-font-size (terminal, monospace fallback) CSS custom properties (defined in catppuccin.css). initTheme() restores all 4 font settings (ui_font_family, ui_font_size, term_font_family, term_font_size) from SQLite on startup.
- Detached pane mode: App.svelte checks URL param `?detached=1` and renders a single pane without sidebar/grid chrome. Used for pop-out windows.
- Shiki syntax highlighting uses lazy singleton pattern (avoid repeated WASM init). 13 languages preloaded. Used in MarkdownPane and AgentPane text messages.
- Cargo workspace at v2/ level: members = [src-tauri, bterminal-core, bterminal-relay]. Cargo.lock is at workspace root (v2/), not in src-tauri/.
- EventSink trait (bterminal-core/src/event.rs) abstracts event emission. PtyManager and SidecarManager are in bterminal-core, not src-tauri. src-tauri has thin re-exports.
- RemoteManager (src-tauri/src/remote.rs) manages WebSocket client connections to bterminal-relay instances. 12 Tauri commands prefixed with `remote_`.
- remote-bridge.ts adapter wraps remote machine management IPC. machines.svelte.ts store tracks remote machine state.
- Pane.remoteMachineId?: string routes operations through RemoteManager instead of local managers. Bridge adapters (pty-bridge, agent-bridge) check this field.
- bterminal-relay binary (v2/bterminal-relay/) is a standalone WebSocket server with token auth, rate limiting, and per-connection isolated managers. Commands return structured responses (pty_created, pong, error) with commandId for correlation via send_error() helper.
- RemoteManager reconnection: exponential backoff (1s-30s cap) on disconnect, attempt_tcp_probe() (TCP-only, no WS upgrade), emits remote-machine-reconnecting and remote-machine-reconnect-ready events. Frontend listeners in remote-bridge.ts; machines store auto-reconnects on ready.
- v3 workspace store (`workspace.svelte.ts`) replaces layout store for v3. Groups loaded from `~/.config/bterminal/groups.json` via `groups-bridge.ts`. State: groups, activeGroupId, activeTab, focusedProjectId. Derived: activeGroup, activeProjects.
- v3 groups backend (`groups.rs`): load_groups(), save_groups(), default_groups(). Tauri commands: groups_load, groups_save.
- v3 SQLite additions: agent_messages table (per-project message persistence), project_agent_state table (sdkSessionId, cost, status per project), sessions.project_id column.
- v3 App.svelte fully rewritten: VSCode-style sidebar layout. Horizontal: left icon rail (GlobalTabBar, 36px, 4 SVG icons) + expandable drawer panel (28em, max 50%, renders active tab content) + main workspace (ProjectGrid always visible) + StatusBar. Settings is a regular sidebar tab. Keyboard: Alt+1..4 (tabs), Ctrl+B (toggle sidebar), Ctrl+, (settings), Escape (close).
- v3 component tree: App -> GlobalTabBar (icon rail) + sidebar-panel? (drawer) + workspace (ProjectGrid) + StatusBar. See `docs/v3-task_plan.md` for full tree.
- Svelte 5 event syntax: use `onclick` not `on:click`. Svelte 5 requires lowercase event handler attributes (no colon syntax).

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
