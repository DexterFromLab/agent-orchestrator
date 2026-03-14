# BTerminal v2 — Implementation Phases

See [architecture.md](architecture.md) for system architecture and [v3-task_plan.md](v3-task_plan.md) for v3 design decisions.

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
      sidecar.rs           # Sidecar lifecycle (unified .mjs bundle, Deno-first + Node.js fallback)
      watcher.rs           # File watcher for markdown viewer
      session.rs           # Session + SSH session persistence (SQLite via rusqlite)
      ctx.rs               # Read-only ctx context DB access
    Cargo.toml
  src/
    App.svelte             # Root layout + detached pane mode
    lib/
      components/
        Layout/
          TilingGrid.svelte    # Dynamic tiling manager
          PaneContainer.svelte # Individual pane wrapper
        Terminal/
          TerminalPane.svelte  # xterm.js terminal pane (theme-aware)
        Agent/
          AgentPane.svelte     # SDK agent structured output
          AgentTree.svelte     # Subagent tree visualization (SVG)
        Markdown/
          MarkdownPane.svelte  # Live markdown file viewer (shiki highlighting)
        Context/
          ContextPane.svelte   # ctx database viewer (projects, entries, search)
        SSH/
          SshDialog.svelte     # SSH session create/edit modal
          SshSessionList.svelte # SSH session list in sidebar
        Sidebar/
          SessionList.svelte   # Session browser + SSH list
        StatusBar/
          StatusBar.svelte     # Global status bar (pane counts, cost)
        Notifications/
          ToastContainer.svelte # Toast notification display
        Settings/
          SettingsDialog.svelte # Settings modal (shell, cwd, max panes, theme)
      stores/
        sessions.svelte.ts   # Session state ($state runes)
        agents.svelte.ts     # Active agent tracking
        layout.svelte.ts     # Pane layout state
        notifications.svelte.ts # Toast notification state
        theme.svelte.ts      # Catppuccin theme flavor state
      adapters/
        sdk-messages.ts      # SDK message abstraction layer
        pty-bridge.ts        # PTY IPC wrapper
        agent-bridge.ts      # Agent IPC wrapper (local + remote routing)
        claude-bridge.ts     # Claude profiles + skills IPC wrapper
        settings-bridge.ts   # Settings IPC wrapper
        ctx-bridge.ts        # ctx database IPC wrapper
        ssh-bridge.ts        # SSH session IPC wrapper
        remote-bridge.ts     # Remote machine management IPC wrapper
        session-bridge.ts    # Session/layout persistence IPC wrapper
      utils/
        agent-tree.ts        # Agent tree builder (hierarchy from messages)
        highlight.ts         # Shiki syntax highlighter (lazy singleton)
        detach.ts            # Detached pane mode (pop-out windows)
        updater.ts           # Tauri auto-updater utility
      styles/
        catppuccin.css       # Theme CSS variables (Mocha defaults)
        themes.ts            # All 4 Catppuccin flavor definitions
    app.css
  sidecar/
    agent-runner.ts          # Sidecar source (compiled to .mjs by esbuild)
    dist/
      agent-runner.mjs       # Bundled sidecar (runs on both Deno and Node.js)
    package.json             # Agent SDK dependency
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
- [x] Pane resize via drag handles (splitter overlays in TilingGrid with mouse drag, min/max 10%/90%)
- [x] Layout presets: 1-col, 2-col, 3-col, 2x2, master+stack
- [ ] Save/restore layout to SQLite (Phase 4)
- [x] Keyboard: Ctrl+1-4 focus pane, Ctrl+N new terminal

### Terminal
- [x] xterm.js with Canvas addon (explicit — no WebGL dependency)
- [x] Catppuccin Mocha theme for xterm.js
- [x] PTY spawn from Rust (portable-pty), stream to frontend via Tauri events
- [x] Terminal resize -> PTY resize (100ms debounce)
- [x] Copy/paste (Ctrl+Shift+C/V) — via attachCustomKeyEventHandler
- [x] SSH session: spawn `ssh` command in PTY (via shell args)
- [x] Local shell: spawn user's $SHELL
- [x] Claude Code CLI: spawn `claude` in PTY (via shell args)

**Milestone: After Phase 2, we have a working multi-pane terminal.** Usable as a daily driver even without agent features.

---

## Phase 3: Agent SDK Integration [status: complete] — MVP

### Backend
- [x] Node.js/Deno sidecar: uses `@anthropic-ai/claude-agent-sdk` query() function (migrated from raw CLI spawning due to piped stdio hang bug #6775)
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
  - [x] Subagent spawn -> auto-creates child agent pane with parent/child navigation (Phase 7)
- [x] Agent status indicator (starting/running/done/error)
- [x] Start/stop agent from UI (prompt form + stop button)
- [x] Auto-scroll with scroll-lock on user scroll-up
- [x] Session resume (follow-up prompt in AgentPane, resume_session_id passed to SDK)
- [x] Keyboard: Ctrl+Shift+N new agent
- [x] Sidebar: agent session button

**Milestone: After Phase 3, we have the core differentiator.** SDK agents run in structured panes alongside raw terminals.

---

## Phase 4: Session Management + Markdown Viewer [status: complete] — MVP

### Sessions
- [x] SQLite persistence for sessions (rusqlite with bundled feature)
- [x] Session types: terminal, agent, markdown (SSH via terminal args)
- [x] Session CRUD: save, delete, update_title, touch (last_used_at)
- [x] Session groups/folders — group_name column, setPaneGroup, grouped sidebar with collapsible headers
- [x] Remember last layout on restart (preset + pane_ids in layout_state table)
- [x] Auto-restore panes on app startup (restoreFromDb in layout store)

### Markdown Viewer
- [x] File watcher (notify crate v6) -> Tauri events -> frontend
- [x] Markdown rendering (marked.js)
- [x] Syntax highlighting (Shiki) — added in Phase 5 (highlight.ts, 13 preloaded languages)
- [x] Open from sidebar (file picker button "M")
- [x] Catppuccin-themed markdown styles (h1-h3, code, pre, tables, blockquotes)
- [x] Live reload on file change

**Milestone: After Phase 4 = MVP ship.** Full session management, structured agent panes, terminal panes, markdown viewer.

---

## Phase 5: Agent Tree + Polish [status: complete] — Post-MVP

- [x] Agent tree visualization (SVG, compact horizontal layout) — AgentTree.svelte + agent-tree.ts utility
- [x] Click tree node -> scroll to message (handleTreeNodeClick in AgentPane, scrollIntoView smooth)
- [x] Aggregate cost per subtree (subtreeCost displayed in yellow below each tree node label)
- [x] Terminal copy/paste (Ctrl+Shift+C/V via attachCustomKeyEventHandler)
- [x] Terminal theme hot-swap (onThemeChange callback registry in theme.svelte.ts, TerminalPane subscribes)
- [x] Pane drag-resize handles (splitter overlays in TilingGrid with mouse drag)
- [x] Session resume (follow-up prompt, resume_session_id to SDK)
- [x] Global status bar (terminal/agent counts, active agents pulse, token/cost totals) — StatusBar.svelte
- [x] Notification system (toast: success/error/warning/info, auto-dismiss 4s, max 5) — notifications.svelte.ts + ToastContainer.svelte
- [x] Agent dispatcher toast integration (agent complete, error, sidecar crash notifications)
- [x] Global keyboard shortcuts — Ctrl+W close focused pane, Ctrl+, open settings
- [x] Settings dialog (default shell, cwd, max panes, theme flavor) — SettingsDialog.svelte + settings-bridge.ts
- [x] Settings backend — settings table in SQLite (session.rs), Tauri commands settings_get/set/list (lib.rs)
- [x] ctx integration — read-only access to ~/.claude-context/context.db (ctx.rs, ctx-bridge.ts, ContextPane.svelte)
- [x] SSH session management — CRUD in SQLite (SshSession struct, SshDialog.svelte, SshSessionList.svelte, ssh-bridge.ts)
- [x] Catppuccin theme flavors — Latte/Frappe/Macchiato/Mocha selectable (themes.ts, theme.svelte.ts)
- [x] Detached pane mode — pop-out terminal/agent into standalone windows (detach.ts, App.svelte)
- [x] Syntax highlighting — Shiki integration for markdown + agent messages (highlight.ts, shiki dep)

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
- [x] Auto-updater plugin integrated (tauri-plugin-updater Rust + @tauri-apps/plugin-updater npm + updater.ts)
- [x] Auto-update latest.json generation in CI (version, platform URL, signature from .sig file)
- [x] release.yml: TAURI_SIGNING_PRIVATE_KEY env vars passed to build step
- [x] Auto-update signing key generated, pubkey set in tauri.conf.json
- [x] TAURI_SIGNING_PRIVATE_KEY secret set in GitHub repo settings via `gh secret set`

---

## Phase 7: Agent Teams / Subagent Support [status: complete] — Post-MVP

- [x] Agent store parent/child hierarchy — parentSessionId, parentToolUseId, childSessionIds fields on AgentSession
- [x] Agent store functions — findChildByToolUseId(), getChildSessions(), parent-aware createAgentSession()
- [x] Agent dispatcher subagent detection — SUBAGENT_TOOL_NAMES Set ('Agent', 'Task', 'dispatch_agent')
- [x] Agent dispatcher message routing — parentId-bearing messages routed to child panes via toolUseToChildPane Map
- [x] Agent dispatcher pane spawning — spawnSubagentPane() creates child session + layout pane, auto-grouped under parent
- [x] AgentPane parent navigation — SUB badge + button to focus parent agent
- [x] AgentPane children bar — clickable chips per child subagent with status colors (running/done/error)
- [x] SessionList subagent icon — '↳' for subagent panes
- [x] Subagent cost aggregation — getTotalCost() recursive helper in agents.svelte.ts, total cost shown in parent pane done-bar
- [x] Dispatcher tests for subagent routing — 10 tests covering spawn, dedup, child message routing, init/cost forwarding, fallbacks (28 total dispatcher tests)
- [ ] Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

### System Requirements
- Node.js 20+ (for Agent SDK sidecar)
- Rust 1.77+ (for building from source)
- WebKit2GTK 4.1+ (Tauri runtime)
- Linux x86_64 (primary target)

---

## Multi-Machine Support (Phases A-D) [status: complete]

Architecture designed in [multi-machine.md](multi-machine.md). Implementation extends BTerminal to manage agents and terminals on remote machines over WebSocket.

### Phase A: Extract `bterminal-core` crate [status: complete]
- [x] Created Cargo workspace at v2/ level (v2/Cargo.toml with members)
- [x] Extracted PtyManager and SidecarManager into shared `bterminal-core` crate
- [x] Created EventSink trait to abstract Tauri event emission (bterminal-core/src/event.rs)
- [x] TauriEventSink in src-tauri/src/event_sink.rs implements EventSink
- [x] src-tauri pty.rs and sidecar.rs now thin re-exports from bterminal-core

### Phase B: Build `bterminal-relay` binary [status: complete]
- [x] WebSocket server using tokio-tungstenite with token auth
- [x] CLI flags: --port, --token, --insecure (clap)
- [x] Routes RelayCommand to PtyManager/SidecarManager, forwards RelayEvent over WebSocket
- [x] Rate limiting on auth failures (10 attempts, 5min lockout)
- [x] Per-connection isolated PTY + sidecar managers
- [x] Command response propagation: structured responses (pty_created, pong, error) via shared event channel
- [x] send_error() helper for consistent error reporting with commandId correlation
- [x] PTY creation confirmation: pty_created event with session ID and commandId

### Phase C: Add `RemoteManager` to controller [status: complete]
- [x] New remote.rs module in src-tauri — WebSocket client connections to relay instances
- [x] Machine lifecycle: add/remove/connect/disconnect
- [x] 12 new Tauri commands for remote operations
- [x] Heartbeat ping every 15s
- [x] PTY creation event: emits remote-pty-created Tauri event with machineId, ptyId, commandId
- [x] Exponential backoff reconnection on disconnect (1s/2s/4s/8s/16s/30s cap)
- [x] attempt_tcp_probe() function: TCP-only probe (5s timeout, default port 9750) — avoids allocating per-connection resources on relay during probes
- [x] Reconnection events: remote-machine-reconnecting, remote-machine-reconnect-ready

### Phase D: Frontend integration [status: complete]
- [x] remote-bridge.ts adapter for machine management + remote events
- [x] machines.svelte.ts store for remote machine state
- [x] Layout store: Pane.remoteMachineId field
- [x] agent-bridge.ts and pty-bridge.ts route to remote commands when remoteMachineId is set
- [x] SettingsDialog "Remote Machines" section (add/remove/connect/disconnect)
- [x] Sidebar auto-groups remote panes by machine label

### Remaining Work
- [x] Reconnection logic with exponential backoff — implemented in remote.rs
- [x] Relay command response propagation — implemented in bterminal-relay main.rs
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning

---

## Extras: Claude Profiles & Skill Discovery [status: complete]

### Claude Profile / Account Switching
- [x] Tauri command claude_list_profiles(): reads ~/.config/switcher/profiles/ directories
- [x] Profile metadata from profile.toml (email, subscription_type, display_name)
- [x] Config dir resolution: ~/.config/switcher-claude/{name}/ or fallback ~/.claude/
- [x] Default profile fallback when no switcher profiles exist
- [x] Profile selector dropdown in AgentPane toolbar (shown when >1 profile)
- [x] Selected profile's config_dir passed as claude_config_dir -> CLAUDE_CONFIG_DIR env override

### Skill Discovery & Autocomplete
- [x] Tauri command claude_list_skills(): reads ~/.claude/skills/ (dirs with SKILL.md or .md files)
- [x] Tauri command claude_read_skill(path): reads skill file content
- [x] Frontend adapter: claude-bridge.ts (ClaudeProfile, ClaudeSkill interfaces, listProfiles/listSkills/readSkill)
- [x] Skill autocomplete in AgentPane: `/` prefix triggers menu, arrow keys navigate, Tab/Enter select
- [x] expandSkillPrompt(): reads skill content, injects as prompt with optional user args

### Extended AgentQueryOptions
- [x] Rust struct (bterminal-core/src/sidecar.rs): setting_sources, system_prompt, model, claude_config_dir, additional_directories
- [x] Sidecar JSON passthrough (both agent-runner.ts and agent-runner-deno.ts)
- [x] SDK query() options: settingSources defaults to ['user', 'project'], systemPrompt, model, additionalDirectories
- [x] CLAUDE_CONFIG_DIR env injection for multi-account support
- [x] Frontend AgentQueryOptions interface (agent-bridge.ts) updated with new fields
