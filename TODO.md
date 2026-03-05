# BTerminal — TODO

## Active

- [ ] **Phase 2: Terminal Pane + Layout** — CSS Grid tiling, xterm.js with Canvas addon, PTY via portable-pty, SSH/shell/Claude CLI support.
- [ ] **Phase 3: Agent SDK Integration** — Node.js sidecar, SDK message adapter, structured agent panes with tool call cards.
- [ ] **Phase 4: Session Management + Markdown** — SQLite persistence, session CRUD, file watcher, markdown rendering. MVP ship after this phase.
- [ ] **Benchmark Canvas xterm.js** — Verify <50ms latency with 4 panes on target hardware (Phase 2 gate for Electron escape hatch).
- [ ] **Evaluate Deno as sidecar runtime** — Single binary, better packaging than Node.js. Test SDK compatibility.

## Completed

- [x] **Phase 1: Project Scaffolding** — Tauri 2.x + Svelte 5 scaffolded in `v2/`, Catppuccin theme, Rust stubs, sidecar scaffold. | Done: 2026-03-05
