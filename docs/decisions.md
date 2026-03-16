# Architecture Decisions Log

This document records significant architecture decisions made during the development of Agent Orchestrator. Each entry captures the decision, its rationale, and the date it was made. Decisions are listed chronologically within each category.

---

## Data & Configuration

| Decision | Rationale | Date |
|----------|-----------|------|
| JSON for groups config, SQLite for session state | JSON is human-editable, shareable, version-controllable. SQLite for ephemeral runtime state. Load at startup only — no hot-reload, no split-brain risk. | 2026-03-07 |
| btmsg/bttask shared SQLite DB | Both CLI tools share `~/.local/share/bterminal/btmsg.db`. Single DB simplifies deployment — agents already have the path. Read-only for non-Manager roles via CLI permissions. | 2026-03-11 |

## Layout & UI

| Decision | Rationale | Date |
|----------|-----------|------|
| Adaptive project count from viewport width | `Math.min(projects.length, Math.max(1, Math.floor(containerWidth / 520)))` — 5 at 5120px, 3 at 1920px, scroll-snap for overflow. min-width 480px. Better than forcing 5 at all sizes. | 2026-03-07 |
| Flexbox + scroll-snap over CSS Grid | Allows horizontal scroll on narrow screens. Scroll-snap gives clean project-to-project scrolling. | 2026-03-07 |
| Team panel: inline >2560px, overlay <2560px | Adapts to available space. Collapsed when no subagents running. Saves ~240px on smaller screens. | 2026-03-07 |
| VSCode-style left sidebar (replaces top tab bar) | Vertical icon rail (2.75rem) + expandable drawer (max 50%) + always-visible workspace. Settings is a regular tab, not a special drawer. ProjectGrid always visible. Ctrl+B toggles. | 2026-03-08 |
| CSS relative units (rule 18) | rem/em for all layout CSS. Pixels only for icon sizes, borders, box shadows. Exception: `--ui-font-size`/`--term-font-size` store px for xterm.js API. | 2026-03-08 |
| Project accent colors from Catppuccin palette | Visual distinction: blue/green/mauve/peach/pink per slot 1-5. Applied to border + header tint via `var(--accent)`. | 2026-03-07 |

## Agent Architecture

| Decision | Rationale | Date |
|----------|-----------|------|
| Single shared sidecar (v3.0) | Existing multiplexed protocol handles concurrent sessions. Per-project pool deferred to v3.1 if crash isolation needed. Saves ~200MB RAM. | 2026-03-07 |
| xterm budget: 4 active, unlimited suspended | WebKit2GTK OOM at ~5 instances. Serialize scrollback to text buffer, destroy xterm, recreate on focus. PTY stays alive. Suspend/resume < 50ms. | 2026-03-07 |
| AgentPane splits into AgentSession + TeamAgentsPanel | Team agents shown inline in right panel, not as separate panes. Saves xterm/pane slots. | 2026-03-07 |
| Tier 1 agents as ProjectBoxes via `agentToProject()` | Agents render as full ProjectBoxes (not separate UI). `getAllWorkItems()` merges agents + projects. Unified rendering = less code, same capabilities. | 2026-03-11 |
| `extra_env` 5-layer passthrough for BTMSG_AGENT_ID | TS → Rust AgentQueryOptions → NDJSON → JS runner → SDK env. Minimal surface — only agent projects get env injection. | 2026-03-11 |
| Periodic system prompt re-injection (1 hour) | LLM context degrades over long sessions. 1-hour timer re-sends role/tools reminder when agent is idle. `autoPrompt`/`onautopromptconsumed` callback pattern. | 2026-03-11 |
| Role-specific tabs via conditional rendering | Manager=Tasks, Architect=Arch, Tester=Selenium+Tests, Reviewer=Tasks. PERSISTED-LAZY pattern (mount on first activation). Conditional on `isAgent && agentRole`. | 2026-03-11 |
| PlantUML via plantuml.com server (~h hex encoding) | Avoids Java dependency. Hex encoding simpler than deflate+base64. Works with free tier. Trade-off: requires internet. | 2026-03-11 |

## Themes & Typography

| Decision | Rationale | Date |
|----------|-----------|------|
| All 17 themes map to `--ctp-*` CSS vars | 4 Catppuccin + 7 Editor + 6 Deep Dark themes. All map to same 26 CSS custom properties — zero component changes when adding themes. Pure data operation. | 2026-03-07 |
| Typography via CSS custom properties | `--ui-font-family`/`--ui-font-size` + `--term-font-family`/`--term-font-size` in `:root`. Restored by `initTheme()` on startup. Persisted as SQLite settings. | 2026-03-07 |

## System Design

| Decision | Rationale | Date |
|----------|-----------|------|
| Keyboard shortcut layers: App > Workspace > Terminal | Prevents conflicts. Terminal captures raw keys only when focused. App layer uses Ctrl+K/G/B. | 2026-03-07 |
| Unmount/remount on group switch | Serialize xterm scrollbacks, destroy, remount new group. <100ms perceived. Frees ~80MB per switch. | 2026-03-07 |
| Remote machines deferred to v3.1 | Elevate to project level (`project.remote_machine_id`) but don't implement in MVP. Focus on local orchestration first. | 2026-03-07 |
