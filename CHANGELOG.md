# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project-level tab bar in ProjectBox: Claude | Files | Context tabs switch the content area between ClaudeSession, ProjectFiles, and ContextPane
- ProjectFiles.svelte: project-scoped markdown file viewer (file picker sidebar + MarkdownPane), accepts cwd/projectName props
- ProjectHeader info bar: CWD path (ellipsized from start via `direction: rtl`) + profile name displayed as read-only info alongside project icon/name
- Emoji icon picker in SettingsTab: 24 project-relevant emoji in 8-column grid popup, replaces plain text icon input
- Native directory picker for CWD fields: custom `pick_directory` Tauri command using `rfd` crate with `set_parent(&window)` for modal behavior on Linux; browse buttons added to Default CWD, existing project CWD, and Add Project path inputs in SettingsTab
- `rfd = { version = "0.16", default-features = false, features = ["gtk3"] }` direct dependency for modal file dialogs (zero extra compile — already built transitively via tauri-plugin-dialog)
- CSS relative units rule (`.claude/rules/18-relative-units.md`): enforces rem/em for layout CSS, px only for icons/borders/shadows

### Changed
- ProjectBox layout: CSS grid with 4 rows (`auto auto 1fr auto`) — header | tab bar | content | terminal; content area switches by tab
- AgentPane: removed DIR/ACC toolbar entirely — CWD and profile now passed as props from parent (set in Settings, shown in ProjectHeader); clean chat window with prompt + send button only
- AgentPane prompt area: anchored to bottom (`justify-content: flex-end`) instead of vertical center, removed `max-width: 600px` constraint — uses full panel width
- ClaudeSession passes `project.profile` to AgentPane for automatic profile resolution
- ProjectGrid.svelte CSS converted from px to rem: gap 0.25rem, padding 0.25rem, min-width 30rem
- TerminalTabs.svelte CSS converted from px to rem: tab bar, tabs, close/add buttons, empty state

### Removed
- AgentPane session toolbar (DIR/ACC inputs) — CWD and profile are now props, not interactive inputs
- Nerd Font codepoints for project icons — replaced with emoji (`📁` default) for cross-platform compatibility
- Nerd Font `font-family` declarations from ProjectHeader and TerminalTabs
- Stub `pick_directory` Tauri command (replaced by `tauri-plugin-dialog` frontend API)

### Fixed
- Project icons showing "?" — Nerd Font codepoint `\uf120` not rendering without font installed; switched to emoji
- Native directory picker not opening: added missing `"dialog:default"` permission to `v2/src-tauri/capabilities/default.json` — Tauri's IPC security layer silently blocked `invoke()` calls without this capability
- Native directory picker not modal on Linux: replaced `@tauri-apps/plugin-dialog` `open()` with custom `pick_directory` Tauri command using `rfd::AsyncFileDialog::set_parent(&window)` — the plugin skips `set_parent` on Linux via `cfg(any(windows, target_os = "macos"))` gate
- Native directory picker not dark-themed: set `GTK_THEME=Adwaita:dark` via `std::env::set_var` at Tauri startup to force dark theme on native GTK dialogs
- Sidebar drawer not scaling to content width: removed leftover v2 grid layout on `#app` in `app.css` (`display: grid; grid-template-columns: var(--sidebar-width) 1fr` + media queries) that constrained `.app-shell` to 260px first column; v3 `.app-shell` manages its own flexbox layout internally
- ContextPane.svelte CSS converted from px to rem: font-size, padding, margin, gap; added `white-space: nowrap` on `.ctx-header`/`.ctx-error` for intrinsic width measurement

### Changed
- GlobalTabBar.svelte CSS converted from px to rem: rail width 2.75rem, button 2rem, gap 0.25rem, padding 0.5rem 0.375rem, border-radius 0.375rem; rail-btn color changed from --ctp-overlay1 to --ctp-subtext0 for better contrast
- App.svelte sidebar header CSS converted from px to rem: padding 0.5rem 0.75rem, close button 1.375rem, border-radius 0.25rem
- App.svelte sidebar drawer: JS `$effect` measures content width via `requestAnimationFrame` + `querySelectorAll` for nowrap elements, headings, inputs, and tab-specific selectors; `panelWidth` state drives inline `style:width` on `aside.sidebar-panel`
- Sidebar panel changed from fixed width (28em) to content-driven sizing with `min-width: 16em` and `max-width: 50%`; each tab component defines its own `min-width: 22em`
- Sidebar panel and panel-content overflow changed from `hidden` to `overflow-y: auto` to allow content to drive parent width
- SettingsTab.svelte padding converted from px to rem (0.75rem 1rem)
- DocsTab.svelte converted from px to rem: file-picker 14em, picker-title/file-btn/empty padding in rem
- ContextTab.svelte, DocsTab.svelte, SettingsTab.svelte all now set `min-width: 22em` for content-driven drawer sizing
- UI redesigned from top tab bar + right-side settings drawer to VSCode-style left sidebar: vertical icon rail (GlobalTabBar, 2.75rem, 4 SVG icons) + expandable drawer panel (content-driven width) + always-visible main workspace (ProjectGrid)
- GlobalTabBar rewritten from horizontal text tabs + gear icon to vertical icon rail with SVG icons for Sessions, Docs, Context, Settings; Props: `expanded`/`ontoggle` (was `settingsOpen`/`ontoggleSettings`)
- Settings is now a regular sidebar tab (not a special right-side drawer); `WorkspaceTab` type: `'sessions' | 'docs' | 'context' | 'settings'`
- App.svelte layout: `.main-row` flex container with icon rail + optional sidebar panel + workspace; state renamed `settingsOpen` -> `drawerOpen`
- Keyboard shortcuts: Alt+1..4 (switch tabs + open drawer), Ctrl+B (toggle sidebar), Ctrl+, (toggle settings), Escape (close drawer)
- SettingsTab CSS: `height: 100%` (was `flex: 1`) for sidebar panel context

### Added
- SettingsTab split font controls: separate UI font (sans-serif options: System Sans-Serif, Inter, Roboto, Open Sans, Lato, Noto Sans, Source Sans 3, IBM Plex Sans, Ubuntu) and Terminal font (monospace options: JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro, IBM Plex Mono, Hack, Inconsolata, Ubuntu Mono, monospace), each with custom themed dropdown + size stepper (8-24px), font previews in own typeface
- `--term-font-family` and `--term-font-size` CSS custom properties in catppuccin.css (defaults: JetBrains Mono fallback chain, 13px)
- Deep Dark theme group: 6 new themes (Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper, Midnight) — total 17 themes across 3 groups (Catppuccin, Editor, Deep Dark). Midnight is pure OLED black (#000000), Ayu Dark near-black (#0b0e14), Vesper warm dark (#101010)
- Multi-theme system: 7 new editor themes (VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark) alongside 4 Catppuccin flavors
- `ThemeId` union type, `ThemePalette` (26-color interface), `ThemeMeta` (id/label/group/isDark), `THEME_LIST` registry with group metadata, `ALL_THEME_IDS` for validation
- Theme store `getCurrentTheme()`/`setTheme()` as primary API; deprecated `getCurrentFlavor()`/`setFlavor()` wrappers for backwards compat
- SettingsTab custom themed dropdown for theme selection: color swatches (base color per theme), 4 accent color dots (red/green/blue/yellow), grouped sections (Catppuccin/Editor/Deep Dark) with styled headers, click-outside and Escape to close
- SettingsTab global settings section: theme selector, UI font dropdown (sans-serif options), Terminal font dropdown (monospace options), each with size stepper (8-24px), default shell input, default CWD input — all custom themed dropdowns (no native `<select>`), all persisted via settings-bridge
- Typography CSS custom properties (`--ui-font-family`, `--ui-font-size`, `--term-font-family`, `--term-font-size`) in catppuccin.css with defaults; consumed by app.css body rule
- `initTheme()` now restores 4 saved font settings (ui_font_family, ui_font_size, term_font_family, term_font_size) from SQLite on startup alongside theme restoration
- v3 Mission Control (All Phases 1-10 complete): multi-project dashboard with project groups, per-project Claude sessions, team agents panel, terminal tabs, 3 workspace tabs (Sessions/Docs/Context) + settings drawer
- v3 session continuity (P6): `persistSessionForProject()` saves agent state + messages to SQLite on session complete; `registerSessionProject()` maps session to project; `ClaudeSession.restoreMessagesFromRecords()` restores cached messages on mount
- v3 workspace teardown (P7): `clearAllAgentSessions()` clears agent sessions on group switch; terminal tabs reset via `switchGroup()`
- v3 data model: `groups.rs` (Rust structs + load/save `~/.config/bterminal/groups.json`), `groups.ts` (TypeScript interfaces), `groups-bridge.ts` (IPC adapter), `--group` CLI argument
- v3 workspace store (`workspace.svelte.ts`): replaces `layout.svelte.ts`, manages groups/activeGroupId/activeTab/focusedProjectId with Svelte 5 runes
- v3 SQLite migrations: `agent_messages` table (per-project message persistence), `project_agent_state` table (sdkSessionId/cost/status per project), `project_id` column on sessions
- 12 new Workspace components: GlobalTabBar, ProjectGrid, ProjectBox, ProjectHeader, ClaudeSession, TeamAgentsPanel, AgentCard, TerminalTabs, CommandPalette, DocsTab, ContextTab, SettingsTab
- v3 App.svelte full rewrite: GlobalTabBar + tab content area + StatusBar (no sidebar, no TilingGrid)
- 24 new vitest tests for workspace store, 7 new cargo tests for groups (total: 138 vitest + 36 cargo)
- v3 adversarial architecture review: 3 agents (Architect, Devil's Advocate, UX+Performance Specialist), 12 issues identified and resolved
- v3 Mission Control redesign planning: architecture docs (`docs/v3-task_plan.md`, `docs/v3-findings.md`, `docs/v3-progress.md`), codebase reuse analysis
- Claude profile/account switching: `claude_list_profiles()` reads `~/.config/switcher/profiles/` directories with `profile.toml` metadata (email, subscription_type, display_name); profile selector dropdown in AgentPane toolbar when multiple profiles available; selected profile's `config_dir` passed as `CLAUDE_CONFIG_DIR` env override to SDK
- Skill discovery and autocomplete: `claude_list_skills()` reads `~/.claude/skills/` (directories with `SKILL.md` or standalone `.md` files); type `/` in agent prompt textarea to trigger autocomplete menu with arrow key navigation, Tab/Enter selection, Escape dismiss; `expandSkillPrompt()` reads skill content and injects as prompt
- New frontend adapter `claude-bridge.ts`: `ClaudeProfile` and `ClaudeSkill` interfaces, `listProfiles()`, `listSkills()`, `readSkill()` IPC wrappers
- AgentPane session toolbar: editable working directory input, profile/account selector (shown when >1 profile), all rendered above prompt form
- Extended `AgentQueryOptions` with 5 new fields across full stack (Rust struct, sidecar JSON, SDK options): `setting_sources` (defaults to `['user', 'project']`), `system_prompt`, `model`, `claude_config_dir`, `additional_directories`
- 4 new Tauri commands: `claude_list_profiles`, `claude_list_skills`, `claude_read_skill`, `pick_directory`
- Claude CLI path auto-detection: `findClaudeCli()` in both sidecar runners checks common paths (~/.local/bin/claude, ~/.claude/local/claude, /usr/local/bin/claude, /usr/bin/claude) then falls back to `which`/`where`; resolved path passed to SDK via `pathToClaudeCodeExecutable` option
- Early error reporting when Claude CLI is not found — sidecar emits `agent_error` immediately instead of cryptic SDK failure

### Changed
- SettingsTab global settings restructured to single-column layout with labels above controls, split into "Appearance" (theme, UI font, terminal font) and "Defaults" (shell, CWD) subsections; all native `<select>` replaced with custom themed dropdowns
- Font setting keys changed from `font_family`/`font_size` to `ui_font_family`/`ui_font_size` + `term_font_family`/`term_font_size`; UI font fallback changed from monospace to sans-serif
- `app.css` body font-family and font-size now use CSS custom properties (`var(--ui-font-family)`, `var(--ui-font-size)`) instead of hardcoded values
- Theme system generalized from Catppuccin-only to multi-theme: all 17 themes map to same `--ctp-*` CSS custom properties (26 vars) — zero component-level changes needed
- `CatppuccinFlavor` type deprecated in favor of `ThemeId`; `CatppuccinPalette` deprecated in favor of `ThemePalette`; `FLAVOR_LABELS` and `ALL_FLAVORS` deprecated in favor of `THEME_LIST` and `ALL_THEME_IDS`

### Fixed
- SettingsTab theme dropdown sizing: set `min-width: 180px` on trigger container, `min-width: 280px` and `max-height: 400px` on dropdown menu, `white-space: nowrap` on option labels to prevent text truncation
- SettingsTab input overflow: added `min-width: 0` on `.setting-row` to prevent flex children from overflowing container
- SettingsTab a11y: project field labels changed from `<div><label>` to wrapping `<label><span class="field-label">` pattern for proper label/input association
- SettingsTab CSS: removed unused `.project-field label` selector, simplified input selector to `.project-field input:not([type="checkbox"])`

### Removed
- Dead `update_ssh_session()` method from session.rs and its unit test (method was unused after SSH CRUD refactoring)
- Stale TilingGrid reference in AgentPane.svelte comment (TilingGrid was deleted in v3 P10)

### Changed
- StatusBar rewritten for v3 workspace store: shows active group name, project count, agent count instead of pane counts; version label updated to "BTerminal v3"
- Agent dispatcher subagent routing: project-scoped sessions skip layout pane creation (subagents render in TeamAgentsPanel instead); detached mode still creates layout pane
- AgentPane `cwd` prop renamed to `initialCwd` — now editable via text input in session toolbar instead of fixed prop

### Removed
- Dead v2 components deleted in P10 (~1,836 lines): `TilingGrid.svelte` (328), `PaneContainer.svelte` (113), `PaneHeader.svelte` (44), `SessionList.svelte` (374), `SshSessionList.svelte` (263), `SshDialog.svelte` (281), `SettingsDialog.svelte` (433)
- Empty component directories removed: `Layout/`, `Sidebar/`, `Settings/`, `SSH/`
- Sidecar runners now pass `settingSources` (defaults to `['user', 'project']`), `systemPrompt`, `model`, and `additionalDirectories` to SDK `query()` options
- Sidecar runners inject `CLAUDE_CONFIG_DIR` into clean env when `claudeConfigDir` provided in query message (multi-account support)

### Fixed
- AgentPane Svelte 5 event modifier syntax: `on:click` changed to `onclick` (Svelte 5 requires lowercase event handler attributes, not colon syntax)
- CLAUDE* env var stripping now applied at Rust level in SidecarManager (bterminal-core/src/sidecar.rs): `env_clear()` + `envs(clean_env)` strips all CLAUDE-prefixed vars before spawning sidecar process, providing primary defense against nesting detection (JS-side stripping retained as defense-in-depth)

### Changed
- Sidecar resolution unified: single pre-built `agent-runner.mjs` bundle replaces separate `agent-runner-deno.ts` + `agent-runner.ts` lookup; same `.mjs` file runs under both Deno and Node.js
- `resolve_sidecar_command()` in sidecar.rs now checks deno/node availability upfront before searching paths, improved error message with runtime availability note
- Removed `agent-runner-deno.ts` from tauri.conf.json bundled resources (only `dist/agent-runner.mjs` shipped)

### Added
- `@anthropic-ai/claude-agent-sdk` ^0.2.70 npm dependency for sidecar agent session management
- `build:sidecar` npm script for esbuild bundling of agent-runner.ts (SDK bundled in, no external dependency at runtime)
- `permission_mode` field in AgentQueryOptions (Rust, TypeScript) — flows from controller through sidecar to SDK, defaults to 'bypassPermissions', supports 'default' mode

### Changed
- Sidecar agent runners migrated from raw `claude` CLI spawning (`child_process.spawn`/`Deno.Command`) to `@anthropic-ai/claude-agent-sdk` query() function — fixes silent hang when CLI spawned with piped stdio (known bug github.com/anthropics/claude-code/issues/6775)
- agent-runner.ts: sessions now use `{ query: Query, controller: AbortController }` map instead of `ChildProcess` map; stop uses `controller.abort()` instead of `child.kill()`
- agent-runner-deno.ts: sessions now use `AbortController` map; uses `npm:@anthropic-ai/claude-agent-sdk` import specifier
- Deno sidecar permissions expanded: added `--allow-write` and `--allow-net` flags in sidecar.rs (required by SDK)
- CLAUDE* env var stripping now passes clean env via SDK's `env` option in query() instead of filtering process.env before spawn
- SDK permissionMode and allowDangerouslySkipPermissions now dynamically set based on permission_mode option (was hardcoded to bypassPermissions)
- build:sidecar esbuild command no longer uses --external for SDK (SDK bundled into output)

### Fixed
- AgentPane onDestroy no longer kills running agent sessions on component remount — stopAgent() moved from AgentPane.svelte onDestroy to TilingGrid.svelte onClose handler, ensuring agents only stop on explicit user close action

### Previously Added
- Exponential backoff reconnection in RemoteManager: on disconnect, spawns async task with 1s/2s/4s/8s/16s/30s-cap backoff, uses attempt_tcp_probe() (TCP-only, no WS upgrade, 5s timeout, default port 9750), emits remote-machine-reconnecting and remote-machine-reconnect-ready events
- Frontend reconnection listeners: onRemoteMachineReconnecting and onRemoteMachineReconnectReady in remote-bridge.ts; machines store sets status to 'reconnecting' and auto-calls connectMachine() on ready
- Relay command response propagation: bterminal-relay now sends structured responses (pty_created, pong, error) back to client via shared event channel with commandId correlation
- send_error() helper in bterminal-relay for consistent error reporting across all command handlers
- PTY creation confirmation flow: pty_create command returns pty_created event with session ID and commandId; RemoteManager emits remote-pty-created Tauri event
- bterminal-core shared crate with EventSink trait: extracted PtyManager and SidecarManager into reusable crate at v2/bterminal-core/, EventSink trait abstracts event emission for both Tauri and WebSocket contexts
- bterminal-relay WebSocket server binary: standalone Rust binary at v2/bterminal-relay/ with token auth (--port, --token, --insecure CLI flags), rate limiting (10 attempts, 5min lockout), per-connection isolated PTY + sidecar managers
- RemoteManager for multi-machine WebSocket connections: v2/src-tauri/src/remote.rs manages WebSocket client connections to relay instances, 12 new Tauri commands for remote operations, heartbeat ping every 15s
- Remote machine management UI in settings: SettingsDialog "Remote Machines" section for add/remove/connect/disconnect
- Auto-grouping of remote panes in sidebar: remote panes auto-grouped by machine label in SessionList
- remote-bridge.ts adapter for remote machine IPC operations
- machines.svelte.ts store for remote machine state management (Svelte 5 runes)
- Pane.remoteMachineId field in layout store for local vs remote routing
- TauriEventSink (event_sink.rs) implementing EventSink trait for Tauri AppHandle
- Multi-machine support architecture design (`docs/multi-machine.md`): WebSocket NDJSON protocol, pre-shared token + TLS auth, autonomous relay model
- Subagent cost aggregation: getTotalCost() recursive helper in agents store aggregates cost across parent + all child sessions; total cost displayed in parent pane done-bar when children present
- 10 new subagent routing tests in agent-dispatcher.test.ts: spawn, dedup, child message routing, init/cost forwarding, fallbacks (28 total dispatcher tests, 114 vitest tests overall)
- TAURI_SIGNING_PRIVATE_KEY secret set in GitHub repo for auto-update signing
- Agent teams/subagent support (Phase 7): auto-detects subagent tool calls ('Agent', 'Task', 'dispatch_agent'), spawns child agent panes with parent/child navigation, routes messages via parentId field
- Agent store parent/child hierarchy: AgentSession extended with parentSessionId, parentToolUseId, childSessionIds; findChildByToolUseId() and getChildSessions() query functions
- AgentPane parent link bar: SUB badge with navigate-to-parent button for subagent panes
- AgentPane children bar: clickable chips per child subagent with status-colored indicators (running/done/error)
- SessionList subagent icon: subagent panes show '↳' instead of '*' in sidebar
- Session groups/folders: group_name column in sessions table, setPaneGroup in layout store, collapsible group headers in sidebar with arrow/count, right-click pane to set group
- Auto-update signing key: generated minisign keypair, pubkey configured in tauri.conf.json updater section
- Deno-first sidecar: SidecarCommand struct in sidecar.rs, resolve_sidecar_command() prefers Deno (runs TS directly) with Node.js fallback, both runners bundled via tauri.conf.json resources
- Vitest integration tests: layout.test.ts (30 tests), agent-bridge.test.ts (11 tests), agent-dispatcher.test.ts (28 tests) — total 114 vitest tests passing
- E2E test scaffold: v2/tests/e2e/README.md documenting WebDriver approach
- Terminal copy/paste: Ctrl+Shift+C copies selection, Ctrl+Shift+V pastes from clipboard to PTY (TerminalPane.svelte)
- Terminal theme hot-swap: onThemeChange() callback registry in theme.svelte.ts, open terminals update immediately when flavor changes
- Agent tree node click: clicking a tree node scrolls to the corresponding message in the agent pane (scrollIntoView smooth)
- Agent tree subtree cost: cumulative cost displayed in yellow below each tree node label (subtreeCost utility)
- Agent session resume: follow-up prompt input after session completes or errors, passes resume_session_id to SDK
- Pane drag-resize handles: splitter overlays in TilingGrid with mouse drag, supports 2-col/3-col/2-row layouts with 10-90% ratio clamping
- Auto-update CI workflow: release.yml generates latest.json with version, platform URL, and signature from .sig file; uploads as release artifact
- Deno sidecar proof-of-concept: agent-runner-deno.ts with same NDJSON protocol, compiles to single binary via deno compile
- Vitest test suite: sdk-messages.test.ts (SDK message adapter) and agent-tree.test.ts (tree builder/cost), vite.config.ts test config, npm run test script
- Cargo test suite: session.rs tests (SessionDb CRUD for sessions, SSH sessions, settings, layout) and ctx.rs tests (CtxDb error handling with missing database)
- tempfile dev dependency for Rust test isolation

### Fixed
- Sidecar env var leak: both agent-runner.ts and agent-runner-deno.ts now strip ALL `CLAUDE*` prefixed env vars before spawning the claude CLI, preventing silent hangs when BTerminal is launched from within a Claude Code terminal session (previously only CLAUDECODE was removed)

### Changed
- RemoteManager reconnection probe refactored from attempt_ws_connect() (full WS handshake + auth) to attempt_tcp_probe() (TCP-only connect, no resource allocation on relay)
- bterminal-relay command handlers refactored: all error paths now use send_error() helper instead of log::error!() only; pong response sent via event channel instead of no-op
- RemoteManager disconnect handler: scoped mutex release before event emission to prevent deadlocks; spawns reconnection task
- PtyManager and SidecarManager extracted from src-tauri to bterminal-core shared crate (src-tauri now has thin re-export wrappers)
- Cargo workspace structure at v2/ level: members = [src-tauri, bterminal-core, bterminal-relay], Cargo.lock moved from src-tauri/ to workspace root
- agent-bridge.ts and pty-bridge.ts extended with remote routing (check remoteMachineId, route to remote_* commands)
- Agent dispatcher refactored to split messages: parentId-bearing messages routed to child panes via toolUseToChildPane Map, main session messages stay in parent
- Agent store createAgentSession() now accepts optional parent parameter for registering bidirectional parent/child links
- Agent store removeAgentSession() cleans up parent's childSessionIds on removal
- Sidecar manager refactored from Node.js-only to Deno-first with Node.js fallback (SidecarCommand abstraction)
- Session struct: added group_name field with serde default
- SessionDb: added update_group method, list/save queries updated for group_name column
- SessionList sidebar: uses Svelte 5 snippets for grouped pane rendering with collapsible headers
- Agent tree NODE_H increased from 32 to 40 to accommodate subtree cost display
- release.yml build step now passes TAURI_SIGNING_PRIVATE_KEY and PASSWORD env vars from secrets
- release.yml uploads latest.json alongside .deb and .AppImage artifacts
- vitest ^4.0.18 added as npm dev dependency

### Previously Added
- SSH session management: SshSession CRUD in SQLite, SshDialog create/edit modal, SshSessionList grouped by folder with color dots, SSH pane type routing to TerminalPane with shell=/usr/bin/ssh (Phase 5)
- ctx context database integration: read-only CtxDb (Rust, SQLITE_OPEN_READ_ONLY), ContextPane with project selector, tabs for entries/summaries/search, ctx-bridge adapter (Phase 5)
- Catppuccin theme flavors: all 4 palettes (Latte/Frappe/Macchiato/Mocha) selectable via Settings dialog, theme.svelte.ts reactive store with SQLite persistence, TerminalPane theme-aware (Phase 5)
- Detached pane mode: pop-out terminal/agent panes into standalone windows via URL params (?detached=1), detach.ts utility, App.svelte conditional rendering (Phase 5)
- Shiki syntax highlighting: lazy singleton highlighter with catppuccin-mocha theme, 13 preloaded languages, integrated in MarkdownPane and AgentPane text messages (Phase 5)
- Tauri auto-updater plugin: tauri-plugin-updater (Rust + npm) + updater.ts frontend utility (Phase 6)
- Markdown rendering in agent text messages with Shiki code highlighting (Phase 5)
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
