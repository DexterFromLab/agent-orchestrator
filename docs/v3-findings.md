# BTerminal v3 — Research Findings

## Current Codebase Reuse Analysis

### Can Reuse (with modifications)
- **Agent session infrastructure**: AgentPane, agent store, agent dispatcher, SDK messages adapter, sidecar bridge — core agent functionality stays
- **Terminal infrastructure**: TerminalPane, pty-bridge — terminal rendering unchanged
- **Markdown rendering**: MarkdownPane, highlight utils — markdown viewer stays
- **Sidecar management**: SidecarManager, agent-runner.mjs — backend agent orchestration
- **PTY management**: PtyManager — backend terminal management
- **Session persistence**: session-bridge, SessionDb — needs schema extension for projects
- **Theme system**: theme store, catppuccin CSS — visual layer unchanged
- **Notification system**: toast notifications — stays as-is
- **Claude bridge**: profiles + skills — reusable per project
- **StatusBar**: needs redesign but concept stays

### Must Replace
- **Layout store**: Current pane-based grid system → project-based workspace system
- **TilingGrid**: CSS Grid tiling → project box layout with internal structure
- **SessionList sidebar**: Pane list → project/group navigation
- **App.svelte**: Root layout completely changes
- **Settings dialog**: Per-app settings → per-project settings

### Can Drop
- **Detached pane mode**: Doesn't fit the workspace model
- **Drag-resize splitters**: Project boxes have fixed internal layout
- **Layout presets (1-col, 2-col, etc.)**: Replaced by N-project horizontal layout
- **Remote machine integration**: Defer to v4 (complexity too high to combine)
- **ctx ContextPane**: Becomes a workspace tab instead of a pane type

---

## Adversarial Agent Findings

(To be filled by adversarial review agents)
