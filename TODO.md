# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **Register Memora adapter** -- MemoryAdapter interface exists but no concrete adapter registered at app init. Need to create a MemoraAdapter that bridges to Memora MCP/CLI and register it on startup.
- [ ] **Files tab PDF viewer** -- FilesTab marks PDFs as Binary. Add pdfjs-dist Canvas 2D rendering for inline PDF viewing.
- [ ] **Files tab CSV table view** -- CSV files render as plain text. Add structured table rendering with column headers.
- [ ] **E2E testing — expand coverage** -- 48 tests passing across 8 describe blocks (WebdriverIO v9.24 + tauri-driver, single spec file, ~23s). Add tests for agent sessions, terminal interaction.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **Configurable stall threshold** -- health.yaml per-project config for stall threshold (currently hardcoded 15 min). Adaptive suggestions after 50 sessions from session_metrics data.
- [ ] **Agent provider adapter pattern** -- Abstract model interface (ProviderConfig, ProviderCapabilities) for multi-model support (Claude, Codex, Ollama). Rename agent-runner.mjs → claude-runner.mjs, capability gates in UI.

## Completed

- [x] **Project Health Dashboard (S-3)** -- health.svelte.ts store (activity state, burn rate, context pressure, attention scoring). Mission Control status bar (running/idle/stalled counts, $/hr, attention queue). ProjectHeader indicators (status dot, ctx%, $/hr). session_metrics SQLite table (100-row retention). Metric persistence on agent completion. | Done: 2026-03-10
- [x] **Context tab repurpose** -- Replaced ContextPane (ctx database viewer) with ContextTab (LLM context window visualization). Stats bar, segmented token meter, file references, turn breakdown. Tribunal debate (S-1-R4 at 82%). Token estimation via ~4 chars/token heuristic. | Done: 2026-03-10
- [x] **CodeMirror 6 editor** -- Replaced shiki viewer in FilesTab with CodeMirror 6. CodeEditor.svelte wrapper: 15 lazy-loaded language modes, Catppuccin theme, auto-close brackets, bracket matching, code folding, Ctrl+S save, dirty tracking, save-on-blur setting. write_file_content Rust command. | Done: 2026-03-10
- [x] **FilesTab reactivity fixes** -- Fixed HTML nesting (<button> inside <button>), Svelte 5 $state proxy reactivity for file content loading. | Done: 2026-03-10
- [x] **Tab system overhaul** -- Renamed Claude→Model, Files→Docs. Added Files (VSCode-style tree+viewer), SSH (CRUD+launch), Memory (pluggable adapter) tabs. PERSISTED-EAGER/LAZY mount strategies. Rust list_directory_children + read_file_content commands. | Done: 2026-03-10
- [x] **AgentPane collapsibles + aspect ratio** -- Text messages collapsible (open by default), cost summary collapsed by default. Project max aspect ratio setting (0.3–3.0, default 1.0) with CSS var + SettingsTab stepper. No-implicit-push rule 52. Desktop StartupWMClass. | Done: 2026-03-09
- [x] **AgentPane + MarkdownPane UI redesign** -- AgentPane: sans-serif font, tool call/result pairing via $derived.by, hook message collapsing, context meter, muted colors via color-mix(), responsive margins via container queries. MarkdownPane: container query wrapper, shared responsive padding variable. Tribunal-elected design (S-3-R4, 88% confidence). 139/139 tests pass. | Done: 2026-03-09
- [x] **E2E testing — consolidated & expanded** -- Consolidated 4 spec files into single bterminal.test.ts (Tauri single-session requirement). 25 tests across 4 describe blocks: Smoke(6), Workspace(8), Settings(6), Keyboard(5). Fixed WebDriver clicks on Svelte components via browser.execute(), removed tauri-plugin-log (redundant with telemetry::init()). | Done: 2026-03-08
- [x] **px→rem conversion** -- All ~100 px layout violations converted to rem across 10 components (AgentPane, ToastContainer, CommandPalette, SettingsTab, TeamAgentsPanel, AgentCard, StatusBar, AgentTree, TerminalPane, AgentPreviewPane). Rule 18 fully enforced. | Done: 2026-03-08
- [x] **Workspace teardown race fix** -- Added pendingPersistCount counter + waitForPendingPersistence() fence in agent-dispatcher.ts. switchGroup() awaits persistence before clearing state. Last open HIGH audit finding resolved. | Done: 2026-03-08
