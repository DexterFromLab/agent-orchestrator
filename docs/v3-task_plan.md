# BTerminal v3 — Mission Control Redesign

## Goal

Transform BTerminal from a multi-pane terminal/agent tool into a **multi-project mission control** — a helm for managing multiple development projects simultaneously, each with its own Claude agent session, team agents, terminals, and settings.

## Status: Planning — Rev 0

---

## Core Concept

**Project Groups** are workspaces. Each group has up to 5 projects arranged horizontally. One group visible at a time. Projects have their own Claude subscription, working directory, icon, and settings. The app is a dashboard for orchestrating Claude agents across a portfolio of projects.

### Key Mental Model

```
BTerminal v2: Terminal emulator with agent sessions (panes in a grid)
BTerminal v3: Project orchestration dashboard (projects in a workspace)
```

### User Requirements (verbatim)

1. Projects arranged in **project groups** (many groups, switch between them)
2. Each group has **up to 5 projects** shown horizontally
3. Group/project config via **main menu** (command palette / hidden drawer, on keystroke)
4. Per-project settings:
   - Claude subscription (multi-account via switcher-claude)
   - Working directory
   - Project icon (nerd font, suggested but settable)
   - Project name
   - Project identifier (derived from name, lowercase-dashed, settable)
   - Project description (optional)
   - Enabled flag (bool)
5. Project group = workspace on screen
6. Each project box has:
   - **Claude session box** (default open, continues previous session)
   - **Team agents window** (to the right, shows spawned subagents)
   - **Terminal tabs below** (agent terminals + user terminals, tabbed)
7. **3 workspace tabs**:
   - Tab 1: Sessions view (described above)
   - Tab 2: MD file viewer (auto-discovered from projects, choosable)
   - Tab 3: Settings editor (per-project settings)
8. App launchable with `--group <name>` CLI arg
9. JSON config file defines all groups
10. Session continuity: resume previous + restore history visually
11. SSH sessions: spawnable within a project's terminal tabs or in separate tabs
12. ctx viewer: separate tab

---

## Architecture Questions for Adversarial Review

1. **Config format**: JSON file vs SQLite for group/project definitions?
2. **Layout engine**: How to arrange up to 5 project boxes with internal subdivisions?
3. **Session isolation**: One sidecar per project? Shared sidecar with project context?
4. **State management**: How to handle workspace switching (mount/unmount vs hide/show)?
5. **What survives from v2**: Which components/stores/adapters carry over?
6. **Tab implementation**: Browser-style tabs or Svelte component switching?
7. **Command palette**: Build custom or use a library?
8. **Auto-discovery**: Which MD files to surface per project?
9. **Performance**: 5 projects x (session + agents + terminals) = potentially many active panes

---

## Decisions Log

| Decision | Rationale | Date |
|---|---|---|
| (pending adversarial review) | | |

## Errors Encountered

| Error | Cause | Fix | Date |
|---|---|---|---|
