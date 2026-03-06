# BTerminal -- TODO

## Active

- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server to run. Test: open terminal, run command, open agent, verify output.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines (local + 1 remote). Verify PTY + agent operations over WebSocket.
- [ ] **Multi-machine TLS/certificate pinning** -- Add TLS support to bterminal-relay and certificate pinning in RemoteManager for production security.
- [ ] **Agent Teams real-world testing** -- Frontend routing implemented (Phase 7). Needs testing with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and real subagent spawning.

## Completed

- [x] **AgentPane onDestroy bug fix** -- Removed onDestroy stopAgent() from AgentPane (fired on layout remounts). Stop-on-close moved to TilingGrid onClose handler. | Done: 2026-03-06
- [x] **Permission mode passthrough** -- Added permission_mode field flowing Rust -> sidecar -> SDK. Defaults to bypassPermissions, supports default mode. | Done: 2026-03-06
- [x] **SDK bundling fix** -- Removed --external flag from esbuild build:sidecar. SDK now bundled into agent-runner.mjs. | Done: 2026-03-06
- [x] **Sidecar SDK migration** -- Migrated both sidecar runners from raw `claude` CLI spawning to `@anthropic-ai/claude-agent-sdk` query(). Fixes silent hang bug (CLI #6775). SDK handles subprocess internally. Added ^0.2.70 dependency, build:sidecar script, updated Deno permissions. | Done: 2026-03-06
- [x] **Sidecar CLAUDE* env var leak fix** -- Both sidecar runners now strip ALL CLAUDE-prefixed env vars via SDK `env` option. Prevents nesting detection when BTerminal launched from Claude Code terminal. | Done: 2026-03-06
- [x] **Multi-machine reconnection** -- Exponential backoff reconnection (1s-30s cap) in RemoteManager, attempt_tcp_probe() (TCP-only), frontend reconnection listeners + auto-reconnect. | Done: 2026-03-06
- [x] **Relay command response propagation** -- Structured responses (pty_created, pong, error) with commandId correlation, send_error() helper. | Done: 2026-03-06
- [x] **Multi-machine support (Phases A-D)** -- bterminal-core crate extraction, bterminal-relay WebSocket binary, RemoteManager, frontend integration. | Done: 2026-03-06
- [x] **Agent Teams frontend support** -- Subagent pane spawning, parent/child navigation, message routing by parentId, SUBAGENT_TOOL_NAMES detection in dispatcher. | Done: 2026-03-06
- [x] **Subagent cost aggregation** -- `getTotalCost()` recursive helper in agents store, total cost shown in parent pane done-bar when children present. | Done: 2026-03-06
