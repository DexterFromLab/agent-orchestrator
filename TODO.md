# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

## Completed

- [x] **v3 Phases 6-10 Complete** -- Session continuity (persist/restore agent messages), workspace teardown on group switch, dead v2 component removal (~1,836 lines), StatusBar rewrite, subagent routing fix. | Done: 2026-03-07
- [x] **v3 Mission Control MVP (Phases 1-5)** -- Data model + groups.rs + workspace store + 12 Workspace components + App.svelte rewrite + ClaudeSession + TerminalTabs + TeamAgentsPanel. 138 vitest + 36 cargo tests. | Done: 2026-03-07
- [x] **v3 Architecture planning** -- Adversarial review (3 agents, 12 issues resolved), final architecture in docs/v3-task_plan.md. | Done: 2026-03-07
- [x] **Claude profiles & skill discovery** -- switcher-claude integration, skill autocomplete, extended AgentQueryOptions. | Done: 2026-03-07
- [x] **Claude CLI path auto-detection** -- findClaudeCli() + pathToClaudeCodeExecutable. | Done: 2026-03-07
- [x] **Unified sidecar bundle** -- Single agent-runner.mjs, dual-layer CLAUDE* env var stripping. | Done: 2026-03-07
- [x] **AgentPane onDestroy bug fix** -- Stop-on-close moved to TilingGrid onClose. | Done: 2026-03-06
- [x] **Sidecar SDK migration** -- @anthropic-ai/claude-agent-sdk query(). | Done: 2026-03-06
- [x] **Multi-machine support (Phases A-D)** -- bterminal-core, bterminal-relay, RemoteManager, frontend. | Done: 2026-03-06
- [x] **Multi-machine reconnection** -- Exponential backoff, TCP probe, auto-reconnect. | Done: 2026-03-06
