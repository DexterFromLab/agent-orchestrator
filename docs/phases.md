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
          AgentTree.svelte     # Subagent tree visualization (SVG)
        Markdown/
          MarkdownPane.svelte  # Live markdown file viewer
        Sidebar/
          SessionList.svelte   # Session browser
        StatusBar/
          StatusBar.svelte     # Global status bar (pane counts, cost)
        Notifications/
          ToastContainer.svelte # Toast notification display
        Settings/
          SettingsDialog.svelte # Settings modal dialog
      stores/
        sessions.svelte.ts   # Session state ($state runes)
        agents.svelte.ts     # Active agent tracking
        layout.svelte.ts     # Pane layout state
        notifications.svelte.ts # Toast notification state
      adapters/
        sdk-messages.ts      # SDK message abstraction layer
        pty-bridge.ts        # PTY IPC wrapper
        settings-bridge.ts   # Settings IPC wrapper
      utils/
        agent-tree.ts        # Agent tree builder (hierarchy from messages)
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

## Phase 3: Agent SDK Integration [status: complete] — MVP

### Backend
- [x] Node.js sidecar: spawns `claude` CLI with `--output-format stream-json` (not Agent SDK query() — avoids npm dep + version churn)
- [x] Sidecar communication: Rust spawns Node.js, stdio NDJSON
- [x] Sidecar lifecycle: auto-start on app launch, shutdown on exit
- [x] Sidecar lifecycle: detect crash, offer restart in UI (agent_restart command + restart button)
- [x] Tauri commands: agent_query, agent_stop, agent_ready, agent_restart

### Frontend
- [x] SDK message adapter: parses stream-json into 9 typed AgentMessage types (abstraction layer)
- [x] Agent bridge: Tauri IPC adapter (invoke + event listeners)
- [x] Agent dispatcher: singleton routing sidecar events to store, crash detection
- [x] Agent store: session state, message history, cost tracking (Svelte 5 $state)
- [x] Agent pane: renders structured messages
  - [x] Text -> plain text (markdown rendering deferred)
  - [x] Tool calls -> collapsible cards (tool name + input)
  - [x] Tool results -> collapsible cards
  - [x] Thinking -> collapsible details
  - [x] Init -> model badge
  - [x] Cost -> USD/tokens/turns/duration summary
  - [x] Errors -> highlighted error card
  - [ ] Subagent spawn -> tree node + optional new pane (Phase 5)
- [x] Agent status indicator (starting/running/done/error)
- [x] Start/stop agent from UI (prompt form + stop button)
- [x] Auto-scroll with scroll-lock on user scroll-up
- [ ] Session resume (SDK `resume: sessionId`)
- [x] Keyboard: Ctrl+Shift+N new agent
- [x] Sidebar: agent session button

**Milestone: After Phase 3, we have the core differentiator.** SDK agents run in structured panes alongside raw terminals.

---

## Phase 4: Session Management + Markdown Viewer [status: complete] — MVP

### Sessions
- [x] SQLite persistence for sessions (rusqlite with bundled feature)
- [x] Session types: terminal, agent, markdown (SSH via terminal args)
- [x] Session CRUD: save, delete, update_title, touch (last_used_at)
- [ ] Session groups/folders (deferred — not needed for MVP)
- [x] Remember last layout on restart (preset + pane_ids in layout_state table)
- [x] Auto-restore panes on app startup (restoreFromDb in layout store)

### Markdown Viewer
- [x] File watcher (notify crate v6) -> Tauri events -> frontend
- [x] Markdown rendering (marked.js)
- [ ] Syntax highlighting (Shiki) — deferred, adds significant bundle size
- [x] Open from sidebar (file picker button "M")
- [x] Catppuccin-themed markdown styles (h1-h3, code, pre, tables, blockquotes)
- [x] Live reload on file change

**Milestone: After Phase 4 = MVP ship.** Full session management, structured agent panes, terminal panes, markdown viewer.

---

## Phase 5: Agent Tree + Polish [status: partial] — Post-MVP

- [x] Agent tree visualization (SVG, compact horizontal layout) — AgentTree.svelte + agent-tree.ts utility
- [ ] Click tree node -> focus agent pane (onNodeClick prop exists, not wired)
- [ ] Aggregate cost per subtree (subtreeCost util exists, not displayed in UI)
- [x] Global status bar (terminal/agent counts, active agents pulse, token/cost totals) — StatusBar.svelte
- [x] Notification system (toast: success/error/warning/info, auto-dismiss 4s, max 5) — notifications.svelte.ts + ToastContainer.svelte
- [x] Agent dispatcher toast integration (agent complete, error, sidecar crash notifications)
- [x] Global keyboard shortcuts — Ctrl+W close focused pane, Ctrl+, open settings
- [x] Settings dialog (default shell, cwd, max panes) — SettingsDialog.svelte + settings-bridge.ts
- [x] Settings backend — settings table in SQLite (session.rs), Tauri commands settings_get/set/list (lib.rs)
- [ ] ctx integration (port from v1)

---

## Phase 6: Packaging + Distribution [status: complete] — Post-MVP

- [x] install-v2.sh — build-from-source installer with dependency checks (Node.js 20+, Rust 1.77+, system libs)
  - Checks: WebKit2GTK, GTK3, GLib, libayatana-appindicator, librsvg, openssl, build-essential, pkg-config, curl, wget, FUSE
  - Prompts to install missing packages via apt
  - Builds with `npx tauri build`, installs binary as `bterminal-v2` in `~/.local/bin/`
  - Creates desktop entry and installs SVG icon
- [x] Tauri bundle configuration — targets: `["deb", "appimage"]`, category: DeveloperTool
  - .deb depends: libwebkit2gtk-4.1-0, libgtk-3-0, libayatana-appindicator3-1
  - AppImage: bundleMediaFramework disabled
- [x] Icons regenerated from bterminal.svg — RGBA PNGs (32x32, 128x128, 128x128@2x, 512x512, .ico)
- [x] GitHub Actions release workflow (`.github/workflows/release.yml`)
  - Triggered on `v*` tags, Ubuntu 22.04 runner
  - Caches Rust and npm dependencies
  - Builds .deb + AppImage, uploads as GitHub Release artifacts
- [x] Build verified: .deb (4.3 MB), AppImage (103 MB)
- [ ] Auto-update mechanism (Tauri updater) — deferred, needs signing key + update server

### System Requirements
- Node.js 20+ (for Agent SDK sidecar)
- Rust 1.77+ (for building from source)
- WebKit2GTK 4.1+ (Tauri runtime)
- Linux x86_64 (primary target)
