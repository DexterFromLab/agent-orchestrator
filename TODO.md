# BTerminal -- TODO

## Active

- [ ] **Set TAURI_SIGNING_PRIVATE_KEY secret** -- Private key generated; must be added to GitHub repo settings for auto-update signing to work in CI.
- [ ] **Deno sidecar real-world testing** -- Integrated into sidecar.rs (Deno-first + Node.js fallback). Needs testing with real claude CLI and startup time benchmark vs Node.js.
- [ ] **E2E testing (Playwright/WebDriver)** -- Scaffold at v2/tests/e2e/README.md. Needs display server to run. Test: open terminal, run command, open agent, verify output.
- [ ] **Multi-machine support** -- Remote agents via WebSocket (Phase 7+ feature).
- [ ] **Agent Teams integration** -- Experimental Anthropic feature. Each teammate gets its own pane (Phase 7+ feature).

## Completed

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
