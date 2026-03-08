# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **OTEL logging** -- Full-scope OpenTelemetry instrumentation: Rust backend (tracing + opentelemetry crates) + frontend bridge to Rust. Target: Tempo + Grafana. Research complete (Memora #1529).
- [ ] **Fix remaining audit findings** -- 5 HIGH + 10 MEDIUM + 6 LOW open from 2026-03-08 audit (Memora #1528). Includes: workspace teardown race, sdk-messages unvalidated casts, ANTHROPIC_* env leak, ctx CLI input validation.
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **Convert remaining components to rem** -- Apply rule 18 (relative-units.md) to all remaining px-based layout CSS across v3 components.

## Completed

- [x] **Security & correctness audit fixes** -- 5 CRITICAL + 4 HIGH findings fixed: path traversal in claude_read_skill (canonicalize + starts_with), re-entrant exit handler race (restarting guard), memory leak (clear maps in stopAgentDispatcher), listener leak (UnlistenFn array + destroyMachineListeners), fragile abort detection (controller.signal.aborted), unhandled rejection (async handleMessage + .catch), remote.rs try_lock→async lock, remove_machine task abort, session.rs transaction safety. 3 false positives dismissed. All 172 tests pass. | Done: 2026-03-08
- [x] **ctx dead code cleanup** -- Removed ContextTab.svelte (dead wrapper), CtxProject struct, list_projects() method, ctx_list_projects command, ctxListProjects() bridge function. Simplified register_project() guard. Added FTS5 limitation docs. 4 insertions, 81 deletions across 6 files. | Done: 2026-03-08
- [x] **ContextPane project-scoped redesign** -- ContextPane now takes projectName + projectCwd props from ProjectBox. Auto-registers project in ctx DB on mount (INSERT OR IGNORE). Removed project selector — context shown directly for current project. Added ctx_register_project Tauri command. | Done: 2026-03-08
- [x] **ctx init fix + UI init button** -- Fixed ctx CLI script (missing parent directory creation). Added ctx_init_db Tauri command + "Initialize Database" button in ContextPane that creates ~/.claude-context/context.db with full schema (tables + FTS5 + triggers) when DB doesn't exist. | Done: 2026-03-08
- [x] **Premium markdown typography** -- MarkdownPane CSS overhaul: hardcoded Inter font (not --ui-font-family which resolves to monospace), text-rendering optimizeLegibility, antialiased, font-feature-settings (Inter cv01-cv04, ss01). Tailwind-prose-inspired spacing (1.15-1.75em margins), gradient HR (fade to transparent edges), fade-in link underlines (text-decoration-color transition), italic blockquotes with translucent bg, inset box-shadow on code blocks, h5/h6 uppercase styles. Body color softened to --ctp-subtext1. All colors via --ctp-* vars for 17-theme compatibility. | Done: 2026-03-08
- [x] **Collapsible terminal panel** -- Terminal section on Claude tab collapses to a status bar (chevron + "Terminal" label + tab count badge). Click to expand/collapse. Default collapsed. Hidden on Files/Context tabs. | Done: 2026-03-08
- [x] **Sidebar simplification + markdown fixes** -- Sidebar stripped to Settings-only (Sessions/Docs/Context removed — project-specific). MarkdownPane file switching fixed ($effect watches filePath changes). MarkdownPane restyled: sans-serif font, --ctp-* vars, styled blockquotes/tables/links. Terminal area hidden on Files/Context tabs. | Done: 2026-03-08
- [x] **Agent preview terminal** -- AgentPreviewPane.svelte: read-only xterm.js terminal subscribing to agent session messages. Renders Bash commands (cyan), file ops (yellow), tool results, errors. 👁 button in TerminalTabs spawns preview tab. TerminalTab type extended with 'agent-preview' + agentSessionId field. | Done: 2026-03-08
- [x] **Terminal tabs close fix** -- Svelte 5 `$state<Map>` reactivity bug: Map.set() didn't trigger $derived updates. Changed projectTerminals from Map to Record (plain object). Fixes: tabs can now be closed, sequential tab naming works. | Done: 2026-03-08
- [x] **Project settings card redesign** -- SettingsTab project section redesigned: card layout per project with Svelte-state icon picker, inline-editable name, CWD left-ellipsis (direction:rtl), account/profile dropdown (listProfiles), custom toggle switch, subtle remove footer. ProjectHeader profile badge styled as blue pill. All CSS in rem. | Done: 2026-03-08
- [x] **VSCode-style sidebar redesign** -- VSCode-style left sidebar with icon rail + expandable drawer + always-visible workspace. | Done: 2026-03-08
- [x] **v3 Phases 6-10 Complete** -- Session continuity, workspace teardown, dead v2 component removal (~1,836 lines). | Done: 2026-03-07
- [x] **v3 Mission Control MVP (Phases 1-5)** -- Data model + groups.rs + workspace store + 12 Workspace components. 138 vitest + 36 cargo tests. | Done: 2026-03-07
