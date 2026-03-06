# BTerminal -- TODO

## Active

- [ ] **Auto-update signing key** -- Generate TAURI_SIGNING_PRIVATE_KEY, set as GitHub repo secret. CI workflow ready (latest.json + signing).
- [ ] **Deno sidecar integration** -- Proof-of-concept done (agent-runner-deno.ts). Needs real claude CLI testing, benchmark vs Node.js, sidecar.rs integration.
- [ ] **E2E testing (Playwright)** -- No e2e tests yet. Test: open terminal, run command, open agent, verify output.
- [ ] **Session groups/folders** -- Organize sessions in sidebar by folder (deferred from Phase 4).

## Completed

- [x] **Copy/paste (Ctrl+Shift+C/V)** -- TerminalPane attachCustomKeyEventHandler, C copies selection, V writes clipboard to PTY. | Done: 2026-03-06
- [x] **Terminal theme hot-swap** -- onThemeChange callback registry in theme.svelte.ts, TerminalPane subscribes. All open terminals update. | Done: 2026-03-06
- [x] **Tree node click -> scroll to message** -- handleTreeNodeClick in AgentPane, scrollIntoView smooth. | Done: 2026-03-06
- [x] **Subtree cost display** -- Yellow cost text below each tree node (subtreeCost util, NODE_H 32->40). | Done: 2026-03-06
- [x] **Session resume** -- Follow-up prompt in AgentPane, resume_session_id passed to SDK. | Done: 2026-03-06
- [x] **Pane drag-resize handles** -- Splitter overlays in TilingGrid with mouse drag, 10-90% clamping. | Done: 2026-03-06
- [x] **Vitest + cargo tests** -- sdk-messages.test.ts, agent-tree.test.ts, session.rs tests, ctx.rs tests. | Done: 2026-03-06
- [x] **Auto-update CI workflow** -- latest.json generation, signing env vars, artifact upload. | Done: 2026-03-06
- [x] **Deno sidecar PoC** -- agent-runner-deno.ts proof-of-concept with same NDJSON protocol. | Done: 2026-03-06
- [x] **Phase 6: Packaging + Distribution** -- install-v2.sh, bundle config, GitHub Actions release. | Done: 2026-03-06
