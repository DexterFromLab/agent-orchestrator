# BTerminal -- TODO

## Active

- [ ] **Phase 5 remaining** -- Click tree node -> focus agent pane (onNodeClick wiring), subtree cost display in tree, ctx integration (port from v1).
- [ ] **Markdown rendering in agent text messages** -- Currently plain text; needs marked.js integration in AgentPane text blocks.
- [ ] **Testing** -- vitest for sdk-messages adapter, cargo test for sidecar/session/watcher, Playwright for e2e.
- [ ] **Pane drag-resize handles** -- Deferred from Phase 2, current presets sufficient for MVP.
- [ ] **Copy/paste (Ctrl+Shift+C/V)** -- Deferred from Phase 2.
- [ ] **Session resume (SDK resumeSessionId)** -- Allow resuming previous agent sessions.
- [ ] **Evaluate Deno as sidecar runtime** -- Single binary, better packaging than Node.js. Test SDK compatibility.
- [ ] **Syntax highlighting in markdown viewer** -- Shiki integration deferred for bundle size.
- [ ] **Tauri auto-update plugin** -- Needs signing key + update server setup. Deferred from Phase 6.

## Completed

- [x] **Phase 6: Packaging + Distribution** -- install-v2.sh (build-from-source with dependency checks), tauri.conf.json bundle config (deb+appimage), icon regeneration, GitHub Actions release workflow (.deb + AppImage on v* tags). Build verified: .deb 4.3 MB, AppImage 103 MB. | Done: 2026-03-06
- [x] **Phase 5 partial: Agent Tree + Polish** -- Agent tree SVG visualization, global status bar, toast notifications, settings dialog + SQLite backend, keyboard shortcuts (Ctrl+W, Ctrl+,), agent dispatcher toast integration. | Done: 2026-03-06
- [x] **Phase 4: Session Management + Markdown Viewer** -- SQLite persistence (rusqlite, WAL), session CRUD, layout restore on startup, file watcher (notify crate), MarkdownPane with marked.js and Catppuccin styles, sidebar file picker. | Done: 2026-03-06
- [x] **Phase 3: Agent SDK Integration (core + polish)** -- Sidecar manager with restart, crash detection, auto-scroll lock, agent pane with messages/cost/stop/restart. | Done: 2026-03-06
- [x] **Phase 2: Terminal Pane + Layout** -- PTY backend (portable-pty), xterm.js + Canvas addon, CSS Grid tiling (5 presets), sidebar, keyboard shortcuts. | Done: 2026-03-05
- [x] **Phase 1: Project Scaffolding** -- Tauri 2.x + Svelte 5 scaffolded in `v2/`, Catppuccin theme, Rust stubs, sidecar scaffold. | Done: 2026-03-05
