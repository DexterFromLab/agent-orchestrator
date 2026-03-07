# BTerminal -- TODO

## Active

- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server to run. Test: open terminal, run command, open agent, verify output.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines (local + 1 remote). Verify PTY + agent operations over WebSocket.
- [ ] **Multi-machine TLS/certificate pinning** -- Add TLS support to bterminal-relay and certificate pinning in RemoteManager for production security.
- [ ] **Agent Teams real-world testing** -- Frontend routing implemented (Phase 7). Needs testing with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and real subagent spawning.

## Completed

- [x] **Claude CLI path auto-detection** -- findClaudeCli() in both sidecar runners auto-detects Claude CLI path, passes to SDK via pathToClaudeCodeExecutable. Early error if CLI not found. | Done: 2026-03-07
- [x] **Unified sidecar bundle** -- Single agent-runner.mjs runs on both Deno and Node.js. Rust-side CLAUDE* env var stripping (dual-layer). | Done: 2026-03-07
- [x] **AgentPane onDestroy bug fix** -- Stop-on-close moved to TilingGrid onClose handler. | Done: 2026-03-06
- [x] **Permission mode passthrough** -- permission_mode field flowing Rust -> sidecar -> SDK. | Done: 2026-03-06
- [x] **Sidecar SDK migration** -- Migrated from raw CLI spawning to @anthropic-ai/claude-agent-sdk query(). | Done: 2026-03-06
- [x] **Sidecar CLAUDE* env var leak fix** -- Strip ALL CLAUDE-prefixed env vars (dual-layer). | Done: 2026-03-06
- [x] **Multi-machine reconnection** -- Exponential backoff, TCP probe, frontend listeners + auto-reconnect. | Done: 2026-03-06
- [x] **Multi-machine support (Phases A-D)** -- bterminal-core, bterminal-relay, RemoteManager, frontend. | Done: 2026-03-06
- [x] **Agent Teams frontend support** -- Subagent pane spawning, parent/child navigation, message routing. | Done: 2026-03-06
- [x] **Subagent cost aggregation** -- getTotalCost() recursive helper, total cost in parent pane. | Done: 2026-03-06
