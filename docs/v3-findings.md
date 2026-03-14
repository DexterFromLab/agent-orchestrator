# BTerminal v3 — Research Findings

## 1. Adversarial Architecture Review (2026-03-07)

Three specialized agents reviewed the v3 Mission Control architecture before implementation began. This adversarial process caught 12 issues (4 critical) that would have required expensive rework if discovered later.

### Agent: Architect (Advocate)

The Architect proposed the core design:

- **Project Groups** as the primary organizational unit (replacing free-form panes)
- **JSON config** (`groups.json`) for human-editable group/project definitions, SQLite for runtime state
- **Single shared sidecar** with per-project isolation via `cwd`, `claude_config_dir`, and `session_id`
- **Component split:** AgentPane → AgentSession + TeamAgentsPanel (subagents shown inline, not as separate panes)
- **New SQLite tables:** `agent_messages` (per-project message persistence), `project_agent_state` (sdkSessionId, cost, status)
- **MVP boundary at Phase 5** (5 phases for core, 5 for polish)
- **10-phase implementation plan** covering data model, shell, session integration, terminals, team panel, continuity, palette, docs, settings, cleanup

### Agent: Devil's Advocate

The Devil's Advocate found 12 issues across the Architect's proposal:

| # | Issue | Severity | Why It Matters |
|---|-------|----------|----------------|
| 1 | xterm.js 4-instance ceiling | **Critical** | WebKit2GTK OOMs at ~5 xterm instances. With 5 projects × 1 terminal each, we hit the wall immediately. |
| 2 | Single sidecar = SPOF | **Critical** | One sidecar crash kills all 5 project agents simultaneously. No isolation between projects. |
| 3 | Layout store has no workspace concept | **Critical** | The v2 layout store (pane-based) cannot represent project groups. Needs a full rewrite, not incremental modification. |
| 4 | 384px per project unusable on 1920px | **Critical** | 5 projects on a 1920px screen means 384px per project — too narrow for code or agent output. Must adapt to viewport. |
| 5 | Session identity collision | Major | Without persisting `sdkSessionId`, resuming the wrong session corrupts agent state. Per-project CLAUDE_CONFIG_DIR isolation is also needed. |
| 6 | JSON config + SQLite = split-brain | Major | Two sources of truth (JSON for config, SQLite for state) can diverge. Must clearly separate what lives where. |
| 7 | Agent dispatcher has no project scoping | Major | The singleton dispatcher routes all messages globally. Adding projectId to sessions and cleanup on workspace switch is essential. |
| 8 | Markdown discovery is undefined | Minor | No specification for which markdown files appear in the Docs tab. Needs a priority list and depth limit. |
| 9 | Keyboard shortcut conflicts | Major | Three input layers (terminal, workspace, app) can conflict. Needs a shortcut manager with explicit precedence. |
| 10 | Remote machine support orphaned | Major | v2's remote machine UI doesn't map to the project model. Must elevate to project level. |
| 11 | No graceful degradation for broken projects | Major | If a project's CWD doesn't exist or git is broken, the whole group could fail. Need per-project health states. |
| 12 | Flat event stream wastes CPU for hidden projects | Minor | Messages for inactive workspace projects still process through adapters. Should buffer and flush on activation. |

**Resolutions:** All 12 issues were resolved before implementation. Critical items (#1-4) were addressed in the architecture. Major items were either implemented in MVP phases or explicitly deferred to v3.1 with documented rationale. See [v3-task_plan.md](v3-task_plan.md) for the full resolution table.

### Agent: UX + Performance Specialist

The UX specialist provided concrete wireframes and performance budgets:

- **Adaptive layout:** `Math.min(projects.length, Math.max(1, Math.floor(containerWidth / 520)))` — 5 projects at 5120px, 3 at 1920px, 1 with scroll at <1600px
- **xterm.js budget:** 4 active instances max. Suspended terminals serialize scrollback to text, destroy the xterm instance, recreate on focus. PTY stays alive. Suspend/resume cycle < 50ms.
- **Memory budget:** ~225MB total (4 xterm @ 20MB + Tauri + SQLite + 5 agent stores). Well within WebKit2GTK limits.
- **Workspace switch performance:** Serialize all xterm scrollbacks, unmount ProjectGrid children, mount new group. Target: <100ms perceived latency (frees ~80MB).
- **Team panel:** Inline at >2560px viewport (240px wide), overlay at <2560px. Collapsed when no subagents.
- **Command palette:** Ctrl+K, floating overlay, fuzzy search across commands + groups + projects. 18+ commands across 6 categories.
- **RAF batching:** For 5 concurrent agent streams, batch DOM updates into requestAnimationFrame frames to avoid layout thrashing.

---

## 2. Provider Adapter Coupling Analysis (2026-03-11)

Before implementing multi-provider support, a systematic coupling analysis mapped every Claude-specific dependency in the codebase. 13+ files were examined and classified into 4 severity levels.

### Coupling Severity Map

**CRITICAL — hardcoded SDK, must abstract:**
- `sidecar/agent-runner.ts` — imports Claude Agent SDK, calls `query()`, hardcoded `findClaudeCli()`. Must become `claude-runner.ts` with other providers getting separate runners.
- `bterminal-core/src/sidecar.rs` — `AgentQueryOptions` struct had no `provider` field. `SidecarCommand` hardcoded `agent-runner.mjs` path. Must add provider-based runner selection.
- `src/lib/adapters/sdk-messages.ts` — `parseMessage()` assumes Claude SDK JSON format. Must become `claude-messages.ts` with per-provider parsers.

**HIGH — TS mirror types, provider-specific commands:**
- `src/lib/adapters/agent-bridge.ts` — `AgentQueryOptions` interface mirrors Rust struct with no provider field.
- `src-tauri/src/lib.rs` — `claude_list_profiles`, `claude_list_skills` are Claude-specific commands (kept as-is, gated by capability).
- `src/lib/adapters/claude-bridge.ts` — provider-specific adapter (kept, genericized via provider-bridge.ts).

**MEDIUM — provider-aware routing:**
- `src/lib/agent-dispatcher.ts` — calls `parseMessage()` (Claude-specific), subagent tool names hardcoded.
- `src/lib/components/Agent/AgentPane.svelte` — profile selector, skill autocomplete assume Claude.
- `ClaudeSession.svelte` — name says "Claude" but logic is mostly generic.

**LOW — already generic:**
- `agents.svelte.ts` — `AgentMessage` type has no Claude-specific logic.
- `health.svelte.ts`, `conflicts.svelte.ts` — provider-agnostic health and conflict tracking.
- `bterminal-relay/` — forwards `AgentQueryOptions` as-is.

### Key Insights from Analysis

1. **Sidecar is the natural abstraction boundary.** Each provider needs its own runner because SDKs are incompatible. The Rust sidecar manager selects which runner to spawn based on the `provider` field.

2. **Message format is the main divergence point.** Claude SDK emits structured JSON (assistant/user/result), Codex uses ThreadEvents, Ollama uses OpenAI-compatible streaming. Per-provider message adapters normalize everything to `AgentMessage`.

3. **Capability flags eliminate provider switches.** Instead of `if (provider === 'claude') showProfiles()`, the UI checks `capabilities.hasProfiles`. Adding a new provider only requires registering its capabilities — zero UI code changes.

4. **Environment variable stripping is provider-specific.** Claude needs `CLAUDE*` vars stripped (nesting detection). Codex needs `CODEX*` stripped. Ollama needs nothing stripped. Extracted to `strip_provider_env_var()` function.

---

## 3. Codebase Reuse Analysis (v2 → v3)

The v3 redesign reused significant portions of the v2 codebase. This analysis determined what could survive, what needed replacement, and what could be dropped entirely.

### Survived (with modifications)

| Component/Module | Modifications |
|-----------------|---------------|
| TerminalPane.svelte | Added suspend/resume lifecycle for xterm budget |
| MarkdownPane.svelte | Unchanged |
| AgentTree.svelte | Reused inside AgentSession |
| StatusBar.svelte | Rewritten for workspace store (group name, fleet status, attention queue) |
| ToastContainer.svelte | Unchanged |
| agents.svelte.ts | Added projectId field to AgentSession |
| theme.svelte.ts | Unchanged |
| notifications.svelte.ts | Unchanged |
| All adapters | Minor updates for provider routing |
| All Rust backend | Added new modules (btmsg, bttask, search, secrets, plugins) |
| highlight.ts, agent-tree.ts | Unchanged |

### Replaced

| v2 Component | v3 Replacement | Reason |
|-------------|---------------|--------|
| layout.svelte.ts | workspace.svelte.ts | Pane-based model → project-group model |
| TilingGrid.svelte | ProjectGrid.svelte | Free-form grid → fixed project boxes |
| PaneContainer.svelte | ProjectBox.svelte | Generic pane → per-project container with 11 tabs |
| SessionList.svelte | ProjectHeader + CommandPalette | Sidebar session list → inline headers + Ctrl+K |
| SettingsDialog.svelte | SettingsTab.svelte | Modal dialog → sidebar drawer tab |
| AgentPane.svelte | AgentSession + TeamAgentsPanel | Monolithic → split for team support |
| App.svelte | Full rewrite | Tab bar → VSCode-style sidebar layout |

### Dropped (v3.0)

| Feature | Reason |
|---------|--------|
| Detached pane mode | Doesn't fit workspace model (projects are grouped, not independent) |
| Drag-resize splitters | Project boxes have fixed internal layout |
| Layout presets (1-col, 2-col, etc.) | Replaced by adaptive project count from viewport |
| Remote machine UI integration | Deferred to v3.1 (elevated to project level) |

---

## 4. Session Anchor Design Analysis (2026-03-12)

Session anchors were designed to solve context loss during Claude's automatic context compaction. Research into compaction behavior informed the design.

### Problem

When Claude's context window fills up, the SDK automatically compacts older turns. This compaction is lossy — important early decisions, architecture context, and debugging breakthroughs can be permanently lost.

### Compaction Behavior (Observed)

- Compaction triggers when context exceeds ~80% of model limit
- The SDK emits a compaction event that the sidecar can observe
- Compacted turns are summarized, losing granular detail
- Multiple compaction rounds can occur in long sessions

### Design Decisions

1. **Auto-anchor on first compaction** — The system automatically captures the first 3 turns when compaction is first detected. This preserves the session's initial context (usually the task definition and first architecture decisions).

2. **Observation masking** — Tool outputs (Read results, Bash output) are compacted in anchors, but reasoning text is preserved in full. This dramatically reduces anchor token cost while keeping the important reasoning.

3. **Budget system** — Fixed budget scales (2K/6K/12K/20K tokens) instead of percentage-based. Users understand "6,000 tokens" more intuitively than "15% of context."

4. **Re-injection via system prompt** — Promoted anchors are serialized and injected as the `system_prompt` field. This is the simplest integration point with the SDK and doesn't require modifying the conversation history.

---

## 5. Multi-Agent Orchestration Design (2026-03-11)

Research into multi-agent coordination patterns informed the btmsg/bttask design.

### Evaluated Approaches

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Claude Agent Teams (native) | Zero custom code, SDK-managed | Experimental, session resume broken, no custom roles | Supported but not primary |
| Message bus (Redis/NATS) | Proven, scalable | Runtime dependency, deployment complexity | Rejected |
| Shared SQLite + CLI tools | Zero deps, agents use shell commands | Polling-based, no real-time push | **Selected** |
| MCP server for agent comm | Standard protocol | Overhead per message, complex setup | Rejected |

### Why SQLite + CLI

Agents run Claude Code sessions that have full shell access. A Python CLI tool (`btmsg`, `bttask`) that reads/writes SQLite is the lowest-friction integration:

- Agents can use it with zero configuration (just `btmsg send architect "review this"`)
- No runtime services to manage (no Redis, no MCP server)
- WAL mode handles concurrent access from multiple agent processes
- The same database is readable by the Rust backend for UI display
- Polling-based (5s) is acceptable for coordination — agents don't need millisecond latency

### Role Hierarchy

The 4 Tier 1 roles were chosen based on common development workflows:

- **Manager** — coordinates work, like a tech lead assigning tasks in a sprint
- **Architect** — designs solutions, like a senior engineer doing design reviews
- **Tester** — runs tests, like a QA engineer monitoring test suites
- **Reviewer** — reviews code, like a reviewer processing a PR queue

Each role has unique tabs (Task board for Manager, PlantUML for Architect, Selenium for Tester, Review queue for Reviewer) and unique bttask permissions (Manager has full CRUD, others are read-only with comments).

---

## 6. Theme System Evolution (2026-03-07)

### Original: 4 Catppuccin Flavors

v2 launched with 4 Catppuccin flavors (Mocha, Macchiato, Frappé, Latte). All colors mapped to 26 `--ctp-*` CSS custom properties.

### Extension: 7 Editor Themes

Added VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark. Each theme maps to the same 26 `--ctp-*` variables — zero component changes needed. The `CatppuccinFlavor` type was generalized to `ThemeId` union type. Deprecated wrapper functions maintain backward compatibility.

### Extension: 6 Deep Dark Themes

Added Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper (warm dark), Midnight (pure OLED black). Same 26-variable mapping.

### Key Design Decision

By mapping all 17 themes to the same CSS custom property names, no component ever needs to know which theme is active. This makes adding new themes a pure data operation — define 26 color values and add to `THEME_LIST`. The `ThemeMeta` type includes group metadata for the custom themed dropdown in SettingsTab.

---

## 7. Performance Findings

### xterm.js Canvas Performance

WebKit2GTK lacks WebGL, so xterm.js falls back to Canvas 2D rendering. Testing showed:
- **Latency:** ~20-30ms per keystroke (acceptable for AI output, not ideal for vim)
- **Memory:** ~20MB per active instance
- **OOM threshold:** ~5 simultaneous instances causes WebKit2GTK to crash
- **Mitigation:** 4-instance budget with suspend/resume for inactive terminals

### Tauri IPC Latency

- **Linux:** ~5ms for typical payloads (serialization-free IPC in Tauri 2.x)
- **Terminal keystroke echo:** 5ms IPC + xterm.js render ≈ 10-15ms total
- **Agent message forwarding:** Negligible — agent output arrives at human-readable speed

### SQLite WAL Concurrent Access

Both sessions.db and btmsg.db are accessed concurrently by:
- Rust backend (Tauri commands)
- Python CLI tools (btmsg, bttask from agent shells)
- Frontend reads via IPC

WAL mode with 5s busy_timeout handles this reliably. The 5-minute checkpoint prevents WAL file growth.

### Workspace Switch Latency

Measured during v3 development:
- Serialize 4 xterm scrollbacks: ~30ms
- Destroy 4 xterm instances: ~10ms
- Unmount ProjectGrid children: ~5ms
- Mount new group's ProjectGrid: ~20ms
- Create new xterm instances: ~35ms
- **Total perceived:** ~100ms (acceptable)
