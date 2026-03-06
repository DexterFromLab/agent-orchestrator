# BTerminal -- TODO

## Active

- [ ] **Deno sidecar real-world testing** -- Integrated into sidecar.rs (Deno-first + Node.js fallback). Needs testing with real claude CLI and startup time benchmark vs Node.js.
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server to run. Test: open terminal, run command, open agent, verify output.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines (local + 1 remote). Verify PTY + agent operations over WebSocket.
- [ ] **Multi-machine TLS/certificate pinning** -- Add TLS support to bterminal-relay and certificate pinning in RemoteManager for production security.
- [ ] **Agent Teams real-world testing** -- Frontend routing implemented (Phase 7). Needs testing with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and real subagent spawning.

## Completed

- [x] **Sidecar CLAUDE* env var leak fix** -- Both sidecar runners now strip ALL CLAUDE-prefixed env vars before spawning claude CLI. Prevents silent hang when BTerminal launched from Claude Code terminal. | Done: 2026-03-06
- [x] **Multi-machine reconnection** -- Exponential backoff reconnection (1s-30s cap) in RemoteManager, attempt_tcp_probe() (TCP-only), frontend reconnection listeners + auto-reconnect. | Done: 2026-03-06
- [x] **Relay command response propagation** -- Structured responses (pty_created, pong, error) with commandId correlation, send_error() helper. | Done: 2026-03-06
- [x] **Multi-machine support (Phases A-D)** -- bterminal-core crate extraction, bterminal-relay WebSocket binary, RemoteManager, frontend integration. | Done: 2026-03-06
- [x] **Agent Teams frontend support** -- Subagent pane spawning, parent/child navigation, message routing by parentId, SUBAGENT_TOOL_NAMES detection in dispatcher. | Done: 2026-03-06
- [x] **Subagent cost aggregation** -- `getTotalCost()` recursive helper in agents store, total cost shown in parent pane done-bar when children present. | Done: 2026-03-06
- [x] **Dispatcher tests for subagent routing** -- 10 new tests covering spawn, dedup, child message routing, init/cost forwarding, fallbacks. Total: 28 dispatcher tests. | Done: 2026-03-06
- [x] **Session groups/folders** -- group_name column in sessions table, setPaneGroup in layout store, collapsible group headers in sidebar, right-click to set group. | Done: 2026-03-06
- [x] **Deno sidecar integration** -- SidecarCommand struct, resolve_sidecar_command() with Deno-first + Node.js fallback, both runners bundled in tauri.conf.json resources. | Done: 2026-03-06
- [x] **E2E/integration test suite** -- 114 vitest tests + 29 cargo tests. | Done: 2026-03-06
