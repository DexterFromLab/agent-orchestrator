# BTerminal v3 — Research Findings

## Adversarial Review Results (2026-03-07)

### Agent: Architect (Advocate)
- Proposed full component tree, data model, 10-phase plan
- JSON config at `~/.config/bterminal/groups.json`
- Single shared sidecar (multiplexed sessions)
- ClaudeSession + TeamAgentsPanel split from AgentPane
- SQLite tables: agent_messages, project_agent_state
- MVP at Phase 5

### Agent: Devil's Advocate
- Found 12 issues, 4 critical:
  1. xterm.js 4-instance ceiling (hard OOM wall)
  2. Single sidecar SPOF
  3. Layout store has no workspace concept
  4. 384px per project unusable on 1920px
- Recommended: fix workspace concept, xterm budget, UI density, persistence before anything else
- Proposed suspend/resume ring buffer for terminals
- Proposed per-project sidecar pool (max 3) — deferred to v3.1

### Agent: UX + Performance Specialist
- Wireframes for 5120px (5 projects) and 1920px (3 projects)
- Adaptive project count: `Math.floor(width / 520)`
- xterm budget: lazy-init + scrollback serialization
- RAF batching for 5 concurrent streams
- <100ms workspace switch via serialize/unmount/remount
- Memory budget: ~225MB total (within WebKit2GTK limits)
- Team panel: inline >2560px, overlay <2560px
- Command palette: Ctrl+K, floating overlay, fuzzy search

## Codebase Reuse Analysis

### Survives (with modifications)
- TerminalPane.svelte — add suspend/resume lifecycle
- MarkdownPane.svelte — unchanged
- AgentTree.svelte — reused inside ClaudeSession
- ContextPane.svelte — extracted to workspace tab
- StatusBar.svelte — modified for per-project costs
- ToastContainer.svelte — unchanged
- agents.svelte.ts — add projectId field
- theme.svelte.ts — unchanged
- notifications.svelte.ts — unchanged
- All adapters (agent-bridge, pty-bridge, claude-bridge, sdk-messages, session-bridge, ctx-bridge, ssh-bridge)
- All Rust backend (sidecar, pty, session, ctx, watcher)
- highlight.ts, agent-tree.ts utils

### Replaced
- layout.svelte.ts → workspace.svelte.ts
- TilingGrid.svelte → ProjectGrid.svelte
- PaneContainer.svelte → ProjectBox.svelte
- SessionList.svelte → ProjectHeader + command palette
- SettingsDialog.svelte → SettingsTab.svelte
- AgentPane.svelte → ClaudeSession.svelte + TeamAgentsPanel.svelte
- App.svelte → full rewrite

### Dropped (v3.0)
- Detached pane mode (doesn't fit workspace model)
- Drag-resize splitters (project boxes have fixed internal layout)
- Layout presets (1-col, 2-col, etc.) — replaced by adaptive project count
- Remote machine integration (deferred to v3.1, elevated to project level)
