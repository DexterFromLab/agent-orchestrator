# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

## Completed

- [x] **px→rem conversion** -- All ~100 px layout violations converted to rem across 10 components (AgentPane, ToastContainer, CommandPalette, SettingsTab, TeamAgentsPanel, AgentCard, StatusBar, AgentTree, TerminalPane, AgentPreviewPane). Rule 18 fully enforced. | Done: 2026-03-08
- [x] **Workspace teardown race fix** -- Added pendingPersistCount counter + waitForPendingPersistence() fence in agent-dispatcher.ts. switchGroup() awaits persistence before clearing state. Last open HIGH audit finding resolved. | Done: 2026-03-08
- [x] **OTEL telemetry** -- Full-scope OpenTelemetry: telemetry.rs (TelemetryGuard, tracing + OTLP layers), telemetry-bridge.ts (frontend→Rust), #[tracing::instrument] on 10 commands, agent dispatcher lifecycle logging, Docker Tempo+Grafana stack (port 9715). BTERMINAL_OTLP_ENDPOINT env var controls export. | Done: 2026-03-08
- [x] **Medium/Low audit fixes** -- All 6 MEDIUM + 8 LOW findings fixed: runtime type guards in sdk-messages.ts, ANTHROPIC_* env stripping, timestamp mismatch, async lock, error propagation, input validation, mutex poisoning, log warnings, payload validation. 172/172 tests pass. | Done: 2026-03-08
- [x] **Security & correctness audit fixes** -- 5 CRITICAL + 4 HIGH findings fixed: path traversal, race conditions, memory leaks, listener leaks, transaction safety. 3 false positives dismissed. | Done: 2026-03-08
- [x] **ctx dead code cleanup** -- Removed ContextTab.svelte, CtxProject struct, list_projects(), ctx_list_projects command. | Done: 2026-03-08
- [x] **ContextPane project-scoped redesign** -- Auto-registers project in ctx DB on mount. Removed project selector. | Done: 2026-03-08
- [x] **ctx init fix + UI init button** -- Fixed ctx CLI, added Initialize Database button in ContextPane. | Done: 2026-03-08
- [x] **Premium markdown typography** -- MarkdownPane CSS overhaul with Inter font, prose spacing, gradient HR. | Done: 2026-03-08
- [x] **Collapsible terminal panel** -- Terminal section collapses to status bar. Default collapsed. | Done: 2026-03-08
