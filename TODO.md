# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing — expand coverage** -- 48 tests passing across 8 describe blocks (WebdriverIO v9.24 + tauri-driver, single spec file, ~23s). Add tests for agent sessions, terminal interaction.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

## Completed

- [x] **AgentPane collapsibles + aspect ratio** -- Text messages collapsible (open by default), cost summary collapsed by default. Project max aspect ratio setting (0.3–3.0, default 1.0) with CSS var + SettingsTab stepper. No-implicit-push rule 52. Desktop StartupWMClass. | Done: 2026-03-09
- [x] **AgentPane + MarkdownPane UI redesign** -- AgentPane: sans-serif font, tool call/result pairing via $derived.by, hook message collapsing, context meter, muted colors via color-mix(), responsive margins via container queries. MarkdownPane: container query wrapper, shared responsive padding variable. Tribunal-elected design (S-3-R4, 88% confidence). 139/139 tests pass. | Done: 2026-03-09
- [x] **E2E testing — consolidated & expanded** -- Consolidated 4 spec files into single bterminal.test.ts (Tauri single-session requirement). 25 tests across 4 describe blocks: Smoke(6), Workspace(8), Settings(6), Keyboard(5). Fixed WebDriver clicks on Svelte components via browser.execute(), removed tauri-plugin-log (redundant with telemetry::init()). | Done: 2026-03-08
- [x] **px→rem conversion** -- All ~100 px layout violations converted to rem across 10 components (AgentPane, ToastContainer, CommandPalette, SettingsTab, TeamAgentsPanel, AgentCard, StatusBar, AgentTree, TerminalPane, AgentPreviewPane). Rule 18 fully enforced. | Done: 2026-03-08
- [x] **Workspace teardown race fix** -- Added pendingPersistCount counter + waitForPendingPersistence() fence in agent-dispatcher.ts. switchGroup() awaits persistence before clearing state. Last open HIGH audit finding resolved. | Done: 2026-03-08
- [x] **OTEL telemetry** -- Full-scope OpenTelemetry: telemetry.rs (TelemetryGuard, tracing + OTLP layers), telemetry-bridge.ts (frontend→Rust), #[tracing::instrument] on 10 commands, agent dispatcher lifecycle logging, Docker Tempo+Grafana stack (port 9715). BTERMINAL_OTLP_ENDPOINT env var controls export. | Done: 2026-03-08
- [x] **Medium/Low audit fixes** -- All 6 MEDIUM + 8 LOW findings fixed: runtime type guards in sdk-messages.ts, ANTHROPIC_* env stripping, timestamp mismatch, async lock, error propagation, input validation, mutex poisoning, log warnings, payload validation. 172/172 tests pass. | Done: 2026-03-08
- [x] **Security & correctness audit fixes** -- 5 CRITICAL + 4 HIGH findings fixed: path traversal, race conditions, memory leaks, listener leaks, transaction safety. 3 false positives dismissed. | Done: 2026-03-08
- [x] **ctx dead code cleanup** -- Removed ContextTab.svelte, CtxProject struct, list_projects(), ctx_list_projects command. | Done: 2026-03-08
- [x] **ContextPane project-scoped redesign** -- Auto-registers project in ctx DB on mount. Removed project selector. | Done: 2026-03-08
