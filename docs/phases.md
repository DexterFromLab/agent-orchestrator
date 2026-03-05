# BTerminal v2 — Implementation Phases

See [task_plan.md](task_plan.md) for architecture decisions, error handling, and testing strategy.

---

## Phase 1: Project Scaffolding [status: complete] — MVP

- [x] Create feature branch `v2-mission-control`
- [x] Initialize Tauri 2.x project with Svelte 5 frontend
- [x] Project structure (see below)
- [x] Basic Tauri window with Catppuccin Mocha CSS variables
- [x] Verify Tauri builds and launches on target system
- [x] Set up dev scripts (dev, build, lint)

### File Structure
```
bterminal-v2/
  src-tauri/
    src/
      main.rs              # Tauri app entry
      pty.rs               # PTY management (portable-pty, not plugin)
      sidecar.rs           # Node.js sidecar lifecycle (spawn, restart, health)
      watcher.rs           # File watcher for markdown viewer
      session.rs           # Session persistence (SQLite via rusqlite)
    Cargo.toml
  src/
    App.svelte             # Root layout
    lib/
      components/
        Layout/
          TilingGrid.svelte    # Dynamic tiling manager
          PaneContainer.svelte # Individual pane wrapper
          PaneHeader.svelte    # Pane title bar with controls
        Terminal/
          TerminalPane.svelte  # xterm.js terminal pane
        Agent/
          AgentPane.svelte     # SDK agent structured output
          AgentTree.svelte     # Subagent tree visualization
          ToolCallCard.svelte  # Individual tool call display
        Markdown/
          MarkdownPane.svelte  # Live markdown file viewer
        Sidebar/
          SessionList.svelte   # Session browser
      stores/
        sessions.ts          # Session state ($state runes)
        agents.ts            # Active agent tracking
        layout.ts            # Pane layout state
      adapters/
        sdk-messages.ts      # SDK message abstraction layer
        pty-bridge.ts        # PTY IPC wrapper
      styles/
        catppuccin.css       # Theme CSS variables
    app.css
  sidecar/
    agent-runner.ts          # Node.js sidecar entry point
    package.json             # Agent SDK dependency
    esbuild.config.ts        # Bundle to single file
  package.json
  svelte.config.js
  vite.config.ts
  tauri.conf.json
```

**Key change from v1:** Using portable-pty directly from Rust instead of tauri-plugin-pty (38-star community plugin). portable-pty is well-maintained (used by WezTerm). More work upfront, more reliable long-term.

---

## Phase 2: Terminal Pane + Layout [status: complete] — MVP

### Layout (responsive)

**32:9 (5120px) — full density:**
```
+--------+------------------------------------+--------+
|Sidebar |  2-4 panes, CSS Grid, resizable    | Right  |
| 260px  |                                     | 380px  |
+--------+------------------------------------+--------+
```

**16:9 (1920px) — degraded but functional:**
```
+--------+-------------------------+
|Sidebar |  1-2 panes              |  (right panel collapses to overlay)
| 240px  |                         |
+--------+-------------------------+
```

- [x] CSS Grid layout with sidebar + main area + optional right panel
- [x] Responsive breakpoints (ultrawide / standard / narrow)
- [ ] Pane resize via drag handles (deferred — current presets sufficient for MVP)
- [x] Layout presets: 1-col, 2-col, 3-col, 2x2, master+stack
- [ ] Save/restore layout to SQLite (Phase 4)
- [x] Keyboard: Ctrl+1-4 focus pane, Ctrl+N new terminal

### Terminal
- [x] xterm.js with Canvas addon (explicit — no WebGL dependency)
- [x] Catppuccin Mocha theme for xterm.js
- [x] PTY spawn from Rust (portable-pty), stream to frontend via Tauri events
- [x] Terminal resize -> PTY resize (100ms debounce)
- [ ] Copy/paste (Ctrl+Shift+C/V) — deferred
- [x] SSH session: spawn `ssh` command in PTY (via shell args)
- [x] Local shell: spawn user's $SHELL
- [x] Claude Code CLI: spawn `claude` in PTY (via shell args)

**Milestone: After Phase 2, we have a working multi-pane terminal.** Usable as a daily driver even without agent features.

---

## Phase 3: Agent SDK Integration [status: not_started] — MVP

- [ ] Node.js sidecar: thin wrapper around Agent SDK `query()`
- [ ] Sidecar communication: Rust spawns Node.js, stdio NDJSON
- [ ] Sidecar lifecycle: spawn on demand, detect crash, restart
- [ ] SDK message adapter (abstraction layer)
- [ ] Agent pane: renders structured messages
  - Text -> markdown rendered
  - Tool calls -> collapsible cards (tool name + input + output)
  - Subagent spawn -> tree node + optional new pane
  - Errors -> highlighted error card
  - Cost/tokens -> pane header metrics
- [ ] Auto-scroll with scroll-lock on user scroll-up
- [ ] Agent status indicator (running/thinking/waiting/done/error)
- [ ] Start/stop/cancel agent from UI
- [ ] Session resume (SDK `resume: sessionId`)

**Milestone: After Phase 3, we have the core differentiator.** SDK agents run in structured panes alongside raw terminals.

---

## Phase 4: Session Management + Markdown Viewer [status: not_started] — MVP

### Sessions
- [ ] SQLite persistence for sessions (rusqlite)
- [ ] Session types: SSH, Claude CLI, Agent SDK, Local Shell
- [ ] Session CRUD in sidebar
- [ ] Session groups/folders
- [ ] Remember last layout on restart

### Markdown Viewer
- [ ] File watcher (notify crate) -> Tauri events -> frontend
- [ ] Markdown rendering (marked.js or remark)
- [ ] Syntax highlighting (Shiki)
- [ ] Open from sidebar or from agent output file references
- [ ] Debounce file watcher (200ms)

**Milestone: After Phase 4 = MVP ship.** Full session management, structured agent panes, terminal panes, markdown viewer.

---

## Phase 5: Agent Tree + Polish [status: not_started] — Post-MVP

- [ ] Agent tree visualization (SVG, compact horizontal layout)
- [ ] Click tree node -> focus agent pane
- [ ] Aggregate cost per subtree
- [ ] Global status bar (total cost, active agents, uptime)
- [ ] Notification system (agent done, error)
- [ ] Global keyboard shortcuts
- [ ] Settings dialog
- [ ] ctx integration (port from v1)

---

## Phase 6: Packaging + Distribution [status: not_started] — Post-MVP

- [ ] install.sh v2 (check Node.js, install Tauri runtime deps)
- [ ] AppImage build (single file, works everywhere)
- [ ] .deb package (Debian/Ubuntu)
- [ ] GitHub Actions CI for building releases
- [ ] Auto-update mechanism (Tauri updater)
- [ ] Migrate bterminal.svg icon
- [ ] README update

### System Requirements
- Node.js 20+ (for Agent SDK sidecar)
- WebKit2GTK 4.1+ (Tauri runtime)
- Linux x86_64 (primary target)
