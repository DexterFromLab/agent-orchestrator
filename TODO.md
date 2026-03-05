# BTerminal — TODO

## Active

- [ ] **Phase 3: Agent SDK Integration** — Node.js sidecar, SDK message adapter, structured agent panes with tool call cards.
- [ ] **Phase 4: Session Management + Markdown** — SQLite persistence, session CRUD, file watcher, markdown rendering. MVP ship after this phase.
- [ ] **Pane drag-resize handles** — Deferred from Phase 2, current presets sufficient for MVP.
- [ ] **Copy/paste (Ctrl+Shift+C/V)** — Deferred from Phase 2.
- [ ] **Evaluate Deno as sidecar runtime** — Single binary, better packaging than Node.js. Test SDK compatibility.

## Completed

- [x] **Phase 2: Terminal Pane + Layout** — PTY backend (portable-pty), xterm.js + Canvas addon, CSS Grid tiling (5 presets), sidebar, keyboard shortcuts. | Done: 2026-03-05
- [x] **Phase 1: Project Scaffolding** — Tauri 2.x + Svelte 5 scaffolded in `v2/`, Catppuccin theme, Rust stubs, sidecar scaffold. | Done: 2026-03-05
