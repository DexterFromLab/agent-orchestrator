# BTerminal -- TODO

## Active

- [ ] **Phase 5: Agent Tree + Polish** -- Agent tree visualization (SVG), global status bar, notifications, settings dialog, ctx integration.
- [ ] **Phase 6: Packaging + Distribution** -- install.sh v2, AppImage, .deb, GitHub Actions CI, auto-update.
- [ ] **Markdown rendering in agent text messages** -- Currently plain text; needs marked.js integration in AgentPane text blocks.
- [ ] **Testing** -- vitest for sdk-messages adapter, cargo test for sidecar/session/watcher, Playwright for e2e.
- [ ] **Pane drag-resize handles** -- Deferred from Phase 2, current presets sufficient for MVP.
- [ ] **Copy/paste (Ctrl+Shift+C/V)** -- Deferred from Phase 2.
- [ ] **Session resume (SDK resumeSessionId)** -- Allow resuming previous agent sessions.
- [ ] **Evaluate Deno as sidecar runtime** -- Single binary, better packaging than Node.js. Test SDK compatibility.
- [ ] **Syntax highlighting in markdown viewer** -- Shiki integration deferred for bundle size.

## Completed

- [x] **Phase 4: Session Management + Markdown Viewer** -- SQLite persistence (rusqlite, WAL), session CRUD, layout restore on startup, file watcher (notify crate), MarkdownPane with marked.js and Catppuccin styles, sidebar file picker. | Done: 2026-03-06
- [x] **Phase 3: Agent SDK Integration (core + polish)** -- Sidecar manager with restart, crash detection, auto-scroll lock, agent pane with messages/cost/stop/restart. | Done: 2026-03-06
- [x] **Phase 2: Terminal Pane + Layout** -- PTY backend (portable-pty), xterm.js + Canvas addon, CSS Grid tiling (5 presets), sidebar, keyboard shortcuts. | Done: 2026-03-05
- [x] **Phase 1: Project Scaffolding** -- Tauri 2.x + Svelte 5 scaffolded in `v2/`, Catppuccin theme, Rust stubs, sidecar scaffold. | Done: 2026-03-05
