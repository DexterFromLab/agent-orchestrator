# BTerminal -- TODO

## Active

- [ ] **Deno sidecar real-world testing** -- Integrated into sidecar.rs (Deno-first + Node.js fallback). Needs testing with real claude CLI and startup time benchmark vs Node.js.
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server to run. Test: open terminal, run command, open agent, verify output.
- [ ] **Multi-machine support** -- Remote agents via WebSocket (Phase 7+ feature).
- [ ] **Agent Teams real-world testing** -- Frontend routing implemented (Phase 7). Needs testing with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and real subagent spawning.

## Completed

- [x] **Set TAURI_SIGNING_PRIVATE_KEY secret** -- Set via `gh secret set` on DexterFromLab/BTerminal. | Done: 2026-03-06
- [x] **Dispatcher tests for subagent routing** -- 10 new tests covering spawn, dedup, child message routing, init/cost forwarding, fallbacks. Total: 28 dispatcher tests. | Done: 2026-03-06
- [x] **Subagent cost aggregation** -- `getTotalCost()` recursive helper in agents store, total cost shown in parent pane done-bar when children present. | Done: 2026-03-06
- [x] **Agent Teams frontend support** -- Subagent pane spawning, parent/child navigation, message routing by parentId, SUBAGENT_TOOL_NAMES detection in dispatcher. | Done: 2026-03-06
- [x] **Session groups/folders** -- group_name column in sessions table, setPaneGroup in layout store, collapsible group headers in sidebar, right-click to set group. | Done: 2026-03-06
- [x] **Auto-update signing key** -- Generated minisign keypair, pubkey set in tauri.conf.json. | Done: 2026-03-06
- [x] **Deno sidecar integration** -- SidecarCommand struct, resolve_sidecar_command() with Deno-first + Node.js fallback, both runners bundled in tauri.conf.json resources. | Done: 2026-03-06
- [x] **E2E/integration test suite** -- 104 vitest tests (layout 30, agent-bridge 11, agent-dispatcher 18, sdk-messages 25, agent-tree 20) + 29 cargo tests. | Done: 2026-03-06
- [x] **Copy/paste (Ctrl+Shift+C/V)** -- TerminalPane attachCustomKeyEventHandler, C copies selection, V writes clipboard to PTY. | Done: 2026-03-06
- [x] **Terminal theme hot-swap** -- onThemeChange callback registry in theme.svelte.ts, TerminalPane subscribes. All open terminals update. | Done: 2026-03-06
- [x] **Tree node click -> scroll to message** -- handleTreeNodeClick in AgentPane, scrollIntoView smooth. | Done: 2026-03-06
- [x] **Subtree cost display** -- Yellow cost text below each tree node (subtreeCost util, NODE_H 32->40). | Done: 2026-03-06
- [x] **Session resume** -- Follow-up prompt in AgentPane, resume_session_id passed to SDK. | Done: 2026-03-06
- [x] **Pane drag-resize handles** -- Splitter overlays in TilingGrid with mouse drag, 10-90% clamping. | Done: 2026-03-06
