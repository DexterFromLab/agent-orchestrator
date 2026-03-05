# BTerminal v2 — Research Findings

## 1. Claude Agent SDK — The Foundation

**Source:** https://platform.claude.com/docs/en/agent-sdk/overview

The Claude Agent SDK (formerly Claude Code SDK, renamed Sept 2025) provides everything we need:

### Streaming API
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the bug",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  // Each message is structured, typed, parseable
  console.log(message);
}
```

### Subagent Detection
Messages from subagents include `parent_tool_use_id`:
```typescript
// Check for subagent invocation
for (const block of msg.message?.content ?? []) {
  if (block.type === "tool_use" && block.name === "Task") {
    console.log(`Subagent invoked: ${block.input.subagent_type}`);
  }
}
// Check if message is from within a subagent
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
**We don't need terminal emulation for SDK agents.** The SDK gives us structured data — we can render it as rich UI (markdown, diff views, file cards, agent trees) instead of raw terminal text. Terminal emulation (xterm.js) is only needed for SSH, local shell, and legacy Claude CLI sessions.

---

## 2. Tauri + xterm.js — Proven Stack

### Existing Projects
- **tauri-terminal** (github.com/marc2332/tauri-terminal) — basic Tauri + xterm.js + portable-pty
- **Terminon** (github.com/Shabari-K-S/terminon) — Tauri v2 + React + xterm.js, SSH profiles, split panes
- **terraphim-liquid-glass-terminal** — Tauri + xterm.js with design effects
- **tauri-plugin-pty** (github.com/Tnze/tauri-plugin-pty) — PTY plugin for Tauri 2, xterm.js bridge

### Integration Pattern
```
Frontend (xterm.js) ←→ Tauri IPC ←→ Rust PTY (portable-pty) ←→ Shell/SSH/Claude
```
- `pty.onData()` → `term.write()` (output)
- `term.onData()` → `pty.write()` (input)

### Tauri IPC Latency
- Linux: ~5ms for typical payloads (serialization-free IPC in v2)
- For terminal output: irrelevant. Claude outputs text at human-readable speed.
- For keystroke echo: 5ms + xterm.js render = ~10-15ms total. Acceptable.

---

## 3. Terminal Performance Context

### Native Terminal Latency (for reference)
| Terminal | Latency | Notes |
|---|---|---|
| xterm (native) | ~10ms | Gold standard |
| Alacritty | ~12ms | GPU-rendered Rust |
| Kitty | ~13ms | GPU-rendered |
| VTE (GNOME Terminal) | ~50ms | GTK3/4, spikes above |
| Hyper (Electron+xterm.js) | ~40ms | Web-based worst case |

### Throughput (find /usr benchmark)
All within 0.5s of each other: xterm 2.2s, alacritty 2.2s, wezterm 2.8s. "Not meaningfully different to a human."

### Memory
- Alacritty: ~30MB
- WezTerm: ~45MB
- xterm (native): ~5MB

### Verdict for BTerminal v2
xterm.js in Tauri will be ~20-30ms latency, ~40MB per terminal instance. For Claude sessions (AI output, not vim), this is perfectly fine. The VTE we currently use in GTK3 is actually *slower* at ~50ms.

---

## 4. Zellij Architecture (Inspiration)

**Source:** Research agent findings

Zellij uses WASM plugins for extensibility:
- Plugins communicate via message passing at WASM boundary
- Permission model controls what plugins can access
- Event types for rendering, input, lifecycle
- Layout defined in KDL files

**Relevance:** We don't need WASM plugins. Our "plugins" are just different pane types (terminal, agent, markdown). But the layout concept (KDL or JSON layout definitions) is worth borrowing for saved layouts.

---

## 5. 32:9 Ultrawide Design Patterns

**Key Insight:** 5120px width ÷ ~600px per useful pane = ~8 panes max, ~4-5 comfortable.

**Layout Philosophy:**
- Center of screen = primary attention (1-2 main agent panes)
- Left edge = navigation (session sidebar, 250-300px)
- Right edge = context (agent tree, file viewer, 350-450px)
- Never use tabs for primary content — everything visible
- Tabs only for switching between saved layouts

**Interaction Model:**
- Click sidebar session → opens in next available pane slot
- Agent spawns subagent → new pane auto-appears (or tree node if panes full)
- File reference in agent output → click to open markdown viewer pane
- Drag pane borders to resize
- Keyboard: Ctrl+1-8 to focus pane, Ctrl+Shift+Arrow to move pane

---

## 6. Frontend Framework Choice

### Why Svelte 5 (revised from initial Solid.js choice)
- **Fine-grained reactivity** — $state/$derived runes match Solid's signals model
- **No VDOM** — critical when we have 4-8 panes each streaming data
- **Small bundle** — ~5KB runtime vs React's ~40KB
- **Larger ecosystem** — more component libraries, xterm.js wrappers, better tooling
- **Better TypeScript support** — improved in Svelte 5

### Why NOT Solid.js (initial choice, revised)
- Ecosystem too small for production use
- Fewer component libraries and integrations
- Svelte 5 runes eliminated the ceremony gap

### NOT React
- VDOM reconciliation across 4-8 simultaneously updating panes = CPU waste
- Larger bundle
- State management complexity (need Redux/Zustand for cross-pane state)

---

## 7. Key Technical Risks

| Risk | Mitigation |
|---|---|
| **WebKit2GTK has NO WebGL** — xterm.js falls back to Canvas on Linux | Use xterm.js Canvas addon explicitly. For AI output (not vim), Canvas at 60fps is fine. |
| xterm.js performance with 4+ instances (Canvas mode) | Lazy init (create xterm only when pane visible), limit to 4-6 active terminals |
| Agent SDK TS package may not run in Tauri's webview | Run SDK in Rust sidecar process, stream to frontend via Tauri events |
| Tauri IPC bottleneck with high-throughput agent output | Batch messages, use Tauri events (push) not commands (pull) |
| File watcher flooding on rapid saves | Debounce 200ms in Rust before sending to frontend |
| Layout state persistence across restarts | SQLite for sessions + layout, atomic writes |
| Tauri multi-webview behind `unstable` flag | Single webview with CSS Grid panes, not multiple webviews |

---

## 8. Claude Code CLI Observation (Alternative to SDK)

**Critical discovery:** We can observe ANY running Claude Code session (even interactive CLI ones) via two mechanisms:

### A. `stream-json` output mode
```bash
claude -p "fix the bug" --output-format stream-json
```
Emits typed events: `stream_event`, `assistant`, `user`, `system` (init carries session_id), `result`.

### B. JSONL session file tailing
Session files live at `~/.claude/projects/<encoded-dir-path>/<session-uuid>.jsonl`. Append-only, written immediately. Can be `tail -f`'d for external observation.

Path encoding: `/home/user/project` → `-home-user-project`

### C. Hooks (SDK only)
`SubagentStart`, `SubagentStop` (gives `agent_transcript_path`), `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `TeammateIdle`

### Implication for BTerminal v2
**Three observation tiers:**
1. **SDK sessions** (best): Full structured streaming, subagent detection, hooks, cost tracking
2. **CLI sessions with stream-json** (good): Structured output, but requires spawning claude with `-p` flag (non-interactive)
3. **Interactive CLI sessions** (fallback): Tail JSONL session files + show terminal via xterm.js

---

## 9. Agent Teams (Experimental)

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables full independent Claude Code instances sharing a task list and mailbox.

- 3-5 teammates is the practical sweet spot (linear token cost)
- Display modes: in-process (Shift+Down cycles), tmux (own pane each), auto
- Session resumption is broken for in-process teammates
- BTerminal v2 could become the ideal frontend for Agent Teams — each teammate gets its own pane

---

## 10. Competing Approaches

- **claude-squad** (Go+tmux): Most adopted multi-agent manager. BTerminal v2 would replace this.
- **agent-deck**: MCP socket pooling (~85-90% memory savings). Could integrate as backend.
- **Git worktrees**: Dominant isolation strategy for parallel Claude sessions. BTerminal should support spawning agents in worktrees.
