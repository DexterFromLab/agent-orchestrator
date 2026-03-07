# BTerminal -- TODO

## Active

### v3 Post-MVP (Phases 6-10)
- [ ] **Phase 6: Session continuity** -- Persist agent messages to SQLite, persist sdkSessionId in project_agent_state, load cached messages on startup, "Continue" button with resume_session_id.
- [ ] **Phase 7: Command palette + group switching** -- Wire CommandPalette.svelte with full Ctrl+K, fuzzy search, workspace teardown/setup on group switch.
- [ ] **Phase 8: Docs tab** -- `discover_markdown_files` Tauri command (walk with depth/exclusions), DocsTab file tree + content split layout, MdFilePicker.
- [ ] **Phase 9: Settings tab** -- Per-project config editor, icon picker (nerd font), group CRUD (create/rename/delete).
- [ ] **Phase 10: Polish + cleanup** -- Remove dead v2 components (TilingGrid, PaneContainer, SessionList, SettingsDialog), update all tests, performance audit.

### v2 Remaining
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

## Completed

- [x] **v3 Mission Control MVP (Phases 1-5)** -- Data model + groups.rs + workspace store + 12 Workspace components + App.svelte rewrite + ClaudeSession + TerminalTabs + TeamAgentsPanel. 138 vitest + 36 cargo tests. | Done: 2026-03-07
- [x] **v3 Architecture planning** -- Adversarial review (3 agents, 12 issues resolved), final architecture in docs/v3-task_plan.md. | Done: 2026-03-07
- [x] **Claude profiles & skill discovery** -- switcher-claude integration, skill autocomplete, extended AgentQueryOptions. | Done: 2026-03-07
- [x] **Claude CLI path auto-detection** -- findClaudeCli() + pathToClaudeCodeExecutable. | Done: 2026-03-07
- [x] **Unified sidecar bundle** -- Single agent-runner.mjs, dual-layer CLAUDE* env var stripping. | Done: 2026-03-07
- [x] **AgentPane onDestroy bug fix** -- Stop-on-close moved to TilingGrid onClose. | Done: 2026-03-06
- [x] **Sidecar SDK migration** -- @anthropic-ai/claude-agent-sdk query(). | Done: 2026-03-06
- [x] **Multi-machine support (Phases A-D)** -- bterminal-core, bterminal-relay, RemoteManager, frontend. | Done: 2026-03-06
- [x] **Multi-machine reconnection** -- Exponential backoff, TCP probe, auto-reconnect. | Done: 2026-03-06
- [x] **Sidecar CLAUDE* env var leak fix** -- Dual-layer stripping. | Done: 2026-03-06
