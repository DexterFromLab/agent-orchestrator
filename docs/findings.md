# Research Findings

This document captures research conducted during v2 and v3 development — technology evaluations, architecture reviews, performance measurements, and design analysis. Each finding informed implementation decisions recorded in [decisions.md](decisions.md).

---

## 1. Claude Agent SDK (v2 Research, 2026-03-05)

**Source:** https://platform.claude.com/docs/en/agent-sdk/overview

The Claude Agent SDK (formerly Claude Code SDK, renamed Sept 2025) provides structured streaming, subagent detection, hooks, and telemetry — everything needed for a rich agent UI without terminal emulation.

### Streaming API

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the bug",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);  // structured, typed, parseable
}
```

### Subagent Detection

Messages from subagents include `parent_tool_use_id`:

```typescript
for (const block of msg.message?.content ?? []) {
  if (block.type === "tool_use" && block.name === "Task") {
    console.log(`Subagent invoked: ${block.input.subagent_type}`);
  }
}
if (msg.parent_tool_use_id) {
  console.log("Running inside subagent");
}
```

### Session Management

- `session_id` captured from init message
- Resume with `options: { resume: sessionId }`
- Subagent transcripts persist independently

### Hooks

`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`

### Telemetry

Every `SDKResultMessage` contains: `total_cost_usd`, `duration_ms`, per-model `modelUsage` breakdowns.

### Key Insight

The SDK gives structured data — we render it as rich UI (markdown, diff views, file cards, agent trees) instead of raw terminal text. Terminal emulation (xterm.js) is only needed for SSH, local shell, and legacy CLI sessions.

---

## 2. Tauri + xterm.js Integration (v2 Research, 2026-03-05)

### Existing Projects

- **tauri-terminal** — basic Tauri + xterm.js + portable-pty
- **Terminon** — Tauri v2 + React + xterm.js, SSH profiles, split panes
- **tauri-plugin-pty** — PTY plugin for Tauri 2, xterm.js bridge

### Integration Pattern

```
Frontend (xterm.js) <-> Tauri IPC <-> Rust PTY (portable-pty) <-> Shell/SSH/Claude
```

- `pty.onData()` -> `term.write()` (output)
- `term.onData()` -> `pty.write()` (input)

---

## 3. Terminal Performance Benchmarks (v2 Research, 2026-03-05)

### Native Terminal Latency

| Terminal | Latency | Notes |
|----------|---------|-------|
| xterm (native) | ~10ms | Gold standard |
| Alacritty | ~12ms | GPU-rendered Rust |
| Kitty | ~13ms | GPU-rendered |
| VTE (GNOME Terminal) | ~50ms | GTK3/4, spikes above |
| Hyper (Electron+xterm.js) | ~40ms | Web-based worst case |

### Memory

- Alacritty: ~30MB, WezTerm: ~45MB, xterm native: ~5MB

### Verdict

xterm.js in Tauri: ~20-30ms latency, ~20MB per instance. For AI output (not vim), perfectly fine. The VTE we used in v1 GTK3 is actually slower at ~50ms.

---

## 4. Zellij Architecture (v2 Inspiration, 2026-03-05)

Zellij uses WASM plugins for extensibility: message passing at WASM boundary, permission model, event types for rendering/input/lifecycle, KDL layout files.

**Relevance:** We don't need WASM plugins — our "plugins" are different pane types. But the layout concept (JSON layout definitions) is worth borrowing for saved layouts.

---

## 5. Ultrawide Design Patterns (v2 Research, 2026-03-05)

**Key Insight:** 5120px width / ~600px per pane = ~8 panes max, ~4-5 comfortable.

**Layout Philosophy:**
- Center = primary attention (1-2 main agent panes)
- Left edge = navigation (sidebar, 250-300px)
- Right edge = context (agent tree, file viewer, 350-450px)
- Never use tabs for primary content — everything visible
- Tabs only for switching saved layouts

---

## 6. Frontend Framework Choice (v2 Research, 2026-03-05)

### Why Svelte 5

- **Fine-grained reactivity** — `$state`/`$derived` runes match Solid's signals model
- **No VDOM** — critical when 4-8 panes stream data simultaneously
- **Small bundle** — ~5KB runtime vs React's ~40KB
- **Larger ecosystem** than Solid.js — more component libraries, better tooling

### Why NOT Solid.js (initially considered)

- Ecosystem too small for production use
- Svelte 5 runes eliminated the ceremony gap

### Why NOT React

- VDOM reconciliation across 4-8 simultaneously updating panes = CPU waste
- Larger bundle, state management complexity (Redux/Zustand needed)

---

## 7. Claude Code CLI Observation (v2 Research, 2026-03-05)

Three observation tiers for Claude sessions:

1. **SDK sessions** (best): Full structured streaming, subagent detection, hooks, cost tracking
2. **CLI with stream-json** (good): `claude -p "prompt" --output-format stream-json` — structured output but non-interactive
3. **Interactive CLI** (fallback): Tail JSONL session files at `~/.claude/projects/<encoded-dir>/<session-uuid>.jsonl` + show terminal via xterm.js

### JSONL Session Files

Path encoding: `/home/user/project` -> `-home-user-project`. Append-only, written immediately. Can be `tail -f`'d for external observation.

### Hooks (SDK only)

`SubagentStart`, `SubagentStop` (gives `agent_transcript_path`), `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `TeammateIdle`

---

## 8. Agent Teams (v2 Research, 2026-03-05)

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables full independent Claude Code instances sharing a task list and mailbox.

- 3-5 teammates is the practical sweet spot (linear token cost)
- Display modes: in-process (Shift+Down cycles), tmux (own pane each), auto
- Session resumption is broken for in-process teammates
- Agent Orchestrator is the ideal frontend for Agent Teams — each teammate gets its own ProjectBox

---

## 9. Competing Approaches (v2 Research, 2026-03-05)

- **claude-squad** (Go+tmux): Most adopted multi-agent manager
- **agent-deck**: MCP socket pooling (~85-90% memory savings)
- **Git worktrees**: Dominant isolation strategy for parallel Claude sessions

---

## 10. Adversarial Architecture Review (v3, 2026-03-07)

Three specialized agents reviewed the v3 Mission Control architecture before implementation. This adversarial process caught 12 issues (4 critical) that would have required expensive rework if discovered later.

### Agent: Architect (Advocate)

Proposed the core design:
- **Project Groups** as primary organizational unit (replacing free-form panes)
- **JSON config** for human-editable definitions, SQLite for runtime state
- **Single shared sidecar** with per-project isolation via `cwd`, `claude_config_dir`, `session_id`
- **Component split:** AgentPane -> AgentSession + TeamAgentsPanel
- **MVP boundary at Phase 5** (5 phases core, 5 polish)

### Agent: Devil's Advocate

Found 12 issues across the Architect's proposal:

| # | Issue | Severity | Why It Matters |
|---|-------|----------|----------------|
| 1 | xterm.js 4-instance ceiling | **Critical** | WebKit2GTK OOMs at ~5 instances. 5 projects x 1 terminal = immediate wall. |
| 2 | Single sidecar = SPOF | **Critical** | One crash kills all 5 project agents. No isolation. |
| 3 | Layout store has no workspace concept | **Critical** | v2 pane-based store cannot represent project groups. Full rewrite needed. |
| 4 | 384px per project on 1920px | **Critical** | 5 projects on 1920px = 384px each — too narrow for code. Must adapt to viewport. |
| 5 | Session identity collision | Major | Without persisted `sdkSessionId`, resuming wrong session corrupts state. |
| 6 | JSON + SQLite = split-brain risk | Major | Two sources of truth can diverge. Must clearly separate config vs state. |
| 7 | Dispatcher has no project scoping | Major | Singleton routes all messages globally. Needs projectId and per-project cleanup. |
| 8 | Markdown discovery undefined | Minor | No spec for which .md files appear in Docs tab. |
| 9 | Keyboard shortcut conflicts | Major | Three input layers can conflict without explicit precedence. |
| 10 | Remote machine support orphaned | Major | v2 remote UI doesn't map to project model. |
| 11 | No graceful degradation | Major | Broken CWD or git could fail the whole group. |
| 12 | Flat event stream wastes CPU | Minor | Messages for hidden projects still process through adapters. |

All 12 resolved before implementation. Critical items addressed in architecture. Major items implemented in MVP or deferred to v3.1 with rationale.

### Agent: UX + Performance Specialist

Provided concrete wireframes and performance budgets:
- **Adaptive layout** formula: 5 at 5120px, 3 at 1920px, 1 with scroll at <1600px
- **xterm budget:** 4 active max, suspend/resume < 50ms
- **Memory budget:** ~225MB total (4 xterm @ 20MB + Tauri + SQLite + agent stores)
- **Workspace switch:** <100ms perceived (serialize scrollbacks + unmount/mount)
- **RAF batching:** For 5 concurrent agent streams, batch DOM updates to avoid layout thrashing

---

## 11. Provider Adapter Coupling Analysis (v3, 2026-03-11)

Before implementing multi-provider support, a systematic coupling analysis mapped every Claude-specific dependency. 13+ files examined and classified into 4 severity levels.

### Coupling Severity Map

**CRITICAL — hardcoded SDK, must abstract:**
- `sidecar/agent-runner.ts` — imports Claude Agent SDK, calls `query()`, hardcoded `findClaudeCli()`. Became `claude-runner.ts` with other providers getting separate runners.
- `bterminal-core/src/sidecar.rs` — `AgentQueryOptions` had no `provider` field. `SidecarCommand` hardcoded runner path. Added provider-based runner selection.
- `src/lib/adapters/sdk-messages.ts` — `parseMessage()` assumed Claude SDK JSON format. Became `claude-messages.ts` with per-provider parsers.

**HIGH — TS mirror types, provider-specific commands:**
- `agent-bridge.ts` — `AgentQueryOptions` interface mirrored Rust with no provider field.
- `lib.rs` — `claude_list_profiles`, `claude_list_skills` are Claude-specific (kept, gated by capability).
- `claude-bridge.ts` — provider-specific adapter (kept, genericized via `provider-bridge.ts`).

**MEDIUM — provider-aware routing:**
- `agent-dispatcher.ts` — called `parseMessage()` (Claude-specific), subagent tool names hardcoded.
- `AgentPane.svelte` — profile selector, skill autocomplete assumed Claude.

**LOW — already generic:**
- `agents.svelte.ts`, `health.svelte.ts`, `conflicts.svelte.ts` — provider-agnostic.
- `bterminal-relay/` — forwards `AgentQueryOptions` as-is.

### Key Insights

1. **Sidecar is the natural abstraction boundary.** Each provider needs its own runner because SDKs are incompatible.
2. **Message format is the main divergence point.** Per-provider adapters normalize to `AgentMessage`.
3. **Capability flags eliminate provider switches.** UI checks `capabilities.hasProfiles` instead of `provider === 'claude'`.
4. **Env var stripping is provider-specific.** Claude strips `CLAUDE*`, Codex strips `CODEX*`, Ollama strips nothing.

---

## 12. Codebase Reuse Analysis: v2 to v3 (2026-03-07)

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

### Replaced

| v2 Component | v3 Replacement | Reason |
|-------------|---------------|--------|
| layout.svelte.ts | workspace.svelte.ts | Pane-based model -> project-group model |
| TilingGrid.svelte | ProjectGrid.svelte | Free-form grid -> fixed project boxes |
| PaneContainer.svelte | ProjectBox.svelte | Generic pane -> per-project container with 11 tabs |
| SessionList.svelte | ProjectHeader + CommandPalette | Sidebar list -> inline headers + Ctrl+K |
| SettingsDialog.svelte | SettingsTab.svelte | Modal dialog -> sidebar drawer tab |
| AgentPane.svelte | AgentSession + TeamAgentsPanel | Monolithic -> split for team support |
| App.svelte | Full rewrite | Tab bar -> VSCode-style sidebar layout |

### Dropped (v3.0)

| Feature | Reason |
|---------|--------|
| Detached pane mode | Doesn't fit workspace model (projects are grouped) |
| Drag-resize splitters | Project boxes have fixed internal layout |
| Layout presets | Replaced by adaptive project count from viewport |
| Remote machine UI | Deferred to v3.1 (elevated to project level) |

---

## 13. Session Anchor Design (v3, 2026-03-12)

Session anchors solve context loss during Claude's automatic context compaction.

### Problem

When Claude's context window fills up (~80% of model limit), the SDK automatically compacts older turns. This is lossy — important early decisions, architecture context, and debugging breakthroughs can be permanently lost.

### Design Decisions

1. **Auto-anchor on first compaction** — Automatically captures the first 3 turns when compaction is first detected. Preserves the session's initial context (task definition, first architecture decisions).

2. **Observation masking** — Tool outputs (Read results, Bash output) are compacted in anchors, but reasoning text is preserved in full. Dramatically reduces anchor token cost while keeping important reasoning.

3. **Budget system** — Fixed scales (2K/6K/12K/20K tokens) instead of percentage-based. "6,000 tokens" is more intuitive than "15% of context."

4. **Re-injection via system prompt** — Promoted anchors are serialized and injected as the `system_prompt` field. Simplest integration with the SDK — no conversation history modification needed.

---

## 14. Multi-Agent Orchestration Design (v3, 2026-03-11)

### Evaluated Approaches

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Claude Agent Teams (native) | Zero custom code, SDK-managed | Experimental, session resume broken | Supported but not primary |
| Message bus (Redis/NATS) | Proven, scalable | Runtime dependency, deployment complexity | Rejected |
| Shared SQLite + CLI tools | Zero deps, agents use shell | Polling-based, no real-time push | **Selected** |
| MCP server for agent comm | Standard protocol | Overhead per message, complex setup | Rejected |

### Why SQLite + CLI

Agents run Claude Code sessions with full shell access. Python CLI tools (`btmsg`, `bttask`) reading/writing SQLite is the lowest-friction integration:

- Zero configuration (`btmsg send architect "review this"`)
- No runtime services (no Redis, no MCP server)
- WAL mode handles concurrent access from multiple agent processes
- Same database readable by Rust backend for UI display
- 5s polling is acceptable — agents don't need millisecond latency

### Role Hierarchy

4 Tier 1 roles based on common development workflows:

- **Manager** — coordinates work (tech lead assigning sprint tasks). Unique: Task board tab, full bttask CRUD.
- **Architect** — designs solutions (senior engineer doing design reviews). Unique: PlantUML tab.
- **Tester** — runs tests (QA monitoring test suites). Unique: Selenium + Tests tabs.
- **Reviewer** — reviews code (processing PR queue). Unique: review queue depth in attention scoring.

---

## 15. Theme System Evolution (v3, 2026-03-07)

### Phase 1: 4 Catppuccin Flavors (v2)

Mocha, Macchiato, Frappe, Latte. All colors mapped to 26 `--ctp-*` CSS custom properties.

### Phase 2: +7 Editor Themes

VSCode Dark+, Atom One Dark, Monokai, Dracula, Nord, Solarized Dark, GitHub Dark. Same 26 variables — zero component changes. `CatppuccinFlavor` type generalized to `ThemeId`.

### Phase 3: +6 Deep Dark Themes

Tokyo Night, Gruvbox Dark, Ayu Dark, Poimandres, Vesper (warm dark), Midnight (pure OLED black). Same mapping.

### Key Decision

All 17 themes map to the same CSS custom property names. No component ever needs to know which theme is active. Adding new themes is a pure data operation: define 26 color values and add to `THEME_LIST`.

---

## 16. Performance Measurements (v3, 2026-03-11)

### xterm.js Canvas Performance

WebKit2GTK lacks WebGL — xterm.js falls back to Canvas 2D:
- **Latency:** ~20-30ms per keystroke (acceptable for AI output)
- **Memory:** ~20MB per active instance
- **OOM threshold:** ~5 simultaneous instances causes WebKit2GTK crash
- **Mitigation:** 4-instance budget with suspend/resume

### Tauri IPC Latency

- **Linux:** ~5ms for typical payloads
- **Terminal keystroke echo:** 5ms IPC + xterm render = 10-15ms total
- **Agent message forwarding:** Negligible (human-readable speed)

### SQLite WAL Concurrent Access

Both databases accessed concurrently by Rust backend + Python CLIs + frontend reads via IPC. WAL mode with 5s busy_timeout handles this reliably. 5-minute checkpoint prevents WAL growth.

### Workspace Switch Latency

- Serialize 4 xterm scrollbacks: ~30ms
- Destroy 4 xterm instances: ~10ms
- Unmount ProjectGrid children: ~5ms
- Mount new group: ~20ms
- Create new xterm instances: ~35ms
- **Total perceived: ~100ms** (acceptable)
