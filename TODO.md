# BTerminal -- TODO

## Active

- [ ] **Phase 5 remaining** -- Click tree node -> focus agent pane (onNodeClick wiring), subtree cost display in tree.
- [ ] **Testing** -- vitest for sdk-messages adapter, cargo test for sidecar/session/watcher, Playwright for e2e.
- [ ] **Pane drag-resize handles** -- Deferred from Phase 2, current presets sufficient for MVP.
- [ ] **Copy/paste (Ctrl+Shift+C/V)** -- Deferred from Phase 2.
- [ ] **Session resume (SDK resumeSessionId)** -- Allow resuming previous agent sessions.
- [ ] **Evaluate Deno as sidecar runtime** -- Single binary, better packaging than Node.js. Test SDK compatibility.
- [ ] **Auto-update signing key + update server** -- Plugin integrated, needs signing infrastructure for full auto-update flow.
- [ ] **Terminal theme hot-swap** -- Existing open terminals don't update when theme flavor changes; only new terminals pick up the new theme.

## Completed

- [x] **SSH session management** -- CRUD in SQLite, SshDialog/SshSessionList components, SSH pane type routing to TerminalPane with ssh args. | Done: 2026-03-06
- [x] **ctx integration** -- Read-only CtxDb in Rust (ctx.rs), ContextPane with project selector/tabs/search, ctx-bridge adapter. | Done: 2026-03-06
- [x] **Catppuccin theme flavors** -- Latte/Frappe/Macchiato/Mocha selectable, themes.ts + theme.svelte.ts store, SettingsDialog dropdown. | Done: 2026-03-06
- [x] **Detached pane mode** -- Pop-out windows via URL params (?detached=1), detach.ts utility, App.svelte conditional rendering. | Done: 2026-03-06
- [x] **Syntax highlighting** -- Shiki with catppuccin-mocha theme, lazy singleton highlighter, 13 preloaded languages. Integrated in MarkdownPane and AgentPane. | Done: 2026-03-06
- [x] **Tauri auto-updater plugin** -- tauri-plugin-updater (Rust + npm) + updater.ts utility integrated. | Done: 2026-03-06
- [x] **Markdown rendering in agent messages** -- AgentPane text messages rendered as markdown with Shiki highlighting. | Done: 2026-03-06
- [x] **Phase 6: Packaging + Distribution** -- install-v2.sh, tauri.conf.json bundle config (deb+appimage), icon regeneration, GitHub Actions release workflow. | Done: 2026-03-06
- [x] **Phase 5 partial: Agent Tree + Polish** -- Agent tree SVG, status bar, toast notifications, settings dialog + SQLite backend, keyboard shortcuts. | Done: 2026-03-06
- [x] **Phase 4: Session Management + Markdown Viewer** -- SQLite persistence, session CRUD, layout restore, file watcher, MarkdownPane. | Done: 2026-03-06
