# BTerminal v2 — Claude Agent Mission Control

## Goal
Redesign BTerminal from a GTK3 terminal emulator into a **multi-session Claude agent dashboard** optimized for 32:9 ultrawide (5120x1440). Simultaneous visibility of all active sessions, agent tree visualization, inline markdown rendering, maximum information density.

## Status: PLANNING (Rev 2 — post-adversarial review)

---

## Adversarial Review Corrections

The initial plan had critical gaps surfaced by a devil's advocate review. Key corrections:

1. **Node.js sidecar is required** — Claude Agent SDK is TS/Python, not Rust. Cannot run in Tauri's webview or Rust. Must spawn a Node.js sidecar process. This has real packaging/complexity implications.
2. **SDK is 0.2.x (pre-1.0)** — 127 versions in 5 months. We MUST have an abstraction layer (message adapter) between SDK wire format and UI renderers.
3. **Three-tier observation → Two-tier** — Drop JSONL tailing of interactive CLI sessions. Too fragile (undocumented internal format). Just two tiers: SDK (structured) and Terminal (raw).
4. **Scope reduction** — Phases 1-4 are the MVP. Phases 5-8 are post-MVP. Ship a usable tool after Phase 4.
5. **Svelte 5 over Solid.js** — Adversarial review is right: Solid's ecosystem is too small, Svelte 5 runes match its reactivity model with much larger ecosystem.
6. **Responsive layout required** — Cannot design only for 32:9. Must work on 1920x1080 with degraded but functional layout.
7. **Packaging story must be planned upfront** — Not a Phase 8 afterthought.
8. **Error handling and testing strategy required** — Not optional.

---

## Phase 0: Technology Decision [status: complete]

### Decision: **Tauri 2.x + Svelte 5 + Claude Agent SDK (via Node.js sidecar)**

**Why Tauri over Electron:**
- Rust backend is genuinely useful for PTY management and file watching
- Memory overhead matters when running 4+ agent sidecars
- Better security model (no Node.js in renderer)
- **Acknowledged limitation:** WebKit2GTK has no WebGL. xterm.js uses Canvas fallback. Acceptable for 2-4 AI output panes. NOT for 8+ high-throughput terminals.
- If Canvas proves unacceptable: escape hatch is switching to Electron (frontend code is framework-agnostic web tech, mostly portable)

**Why Svelte 5 (revised from Solid.js):**
- Fine-grained reactivity via `$state`/`$derived` runes — comparable to Solid signals
- No VDOM — same performance characteristic
- Much larger ecosystem (xterm.js wrappers, layout libraries, component libs)
- Better TypeScript support and devtools
- Svelte 5 runes eliminated the ceremony that older Svelte versions had

**Why NOT React:**
- VDOM reconciliation across 4+ simultaneously streaming panes = CPU waste
- Larger bundle (40KB vs ~5KB Svelte runtime)

### Architecture: Two-Tier Observation

| Session Type | Backend | Frontend | Observation |
|---|---|---|---|
| **SDK Agent** | Node.js sidecar → Rust bridge → Tauri events | Structured rich panels | Full: streaming, subagents, hooks, cost |
| **Terminal** (SSH/CLI/Shell) | PTY via portable-pty (Rust) | xterm.js terminal | Raw terminal only |
| **File viewer** | Rust file watcher (notify) | Markdown renderer | N/A |

**Dropped:** Interactive CLI JSONL tailing (undocumented internal format, fragile).
**Dropped:** CLI stream-json tier (SDK handles this better for non-interactive use).

### Node.js Sidecar Architecture (critical detail)

The Agent SDK cannot run in Rust or the webview. Solution:

```
┌─────────────────────────────────────────────────────┐
│ Tauri App                                            │
│                                                      │
│  ┌──────────┐    Tauri IPC    ┌──────────────────┐  │
│  │ WebView  │ ←────────────→  │ Rust Backend     │  │
│  │ (Svelte) │                 │                  │  │
│  └──────────┘                 │  ├── PTY manager │  │
│                               │  ├── File watcher│  │
│                               │  └── Sidecar mgr │──┼──→ Node.js process
│                               └──────────────────┘  │     (Agent SDK)
│                                                      │     stdio JSON-RPC
└─────────────────────────────────────────────────────┘
```

- Rust spawns Node.js child process on demand (when user starts an SDK agent session)
- Communication: stdio with newline-delimited JSON (simple, no socket server)
- Node.js process runs a thin wrapper that calls `query()` and forwards messages
- If sidecar crashes: detect via process exit, show error in UI, offer restart
- **Packaging:** Bundle the sidecar JS as a single file (esbuild bundle). Require Node.js 20+ as system dependency. Document in install.sh.
- **Future:** Could replace Node.js with Deno (single binary, no npm) for better packaging.

### SDK Abstraction Layer

```typescript
// adapters/sdk-messages.ts — insulates UI from SDK wire format changes
interface AgentMessage {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'subagent_spawn' | 'status' | 'cost';
  parentId?: string;  // for subagent tracking
  content: unknown;   // type-specific payload
  timestamp: number;
}

// Adapter function — this is the ONLY place that knows SDK internals
function adaptSDKMessage(raw: SDKMessage): AgentMessage { ... }
```

When SDK changes its message format, only the adapter needs updating.

---

## Implementation Phases

See [phases.md](phases.md) for the full phased implementation plan (Phases 1-6).

- **MVP:** Phases 1-4 (scaffolding, terminal+layout, agent SDK, session mgmt+markdown)
- **Post-MVP:** Phases 5-6 (agent tree, polish, packaging)

---

## Decisions Log

| Decision | Rationale | Date |
|---|---|---|
| Tauri 2.x over GTK4 | Web frontend for markdown, tiling, agent viz; Rust backend for PTY/SDK | 2026-03-05 |
| Tauri over Electron | Memory efficiency, Rust backend value, security model. Escape hatch: port to Electron if Canvas perf unacceptable | 2026-03-05 |
| Svelte 5 over Solid.js | Larger ecosystem, Svelte 5 runes match Solid's reactivity, better tooling | 2026-03-05 |
| Two-tier over three-tier | Drop JSONL tailing (undocumented internal format). SDK or raw terminal, nothing in between | 2026-03-05 |
| portable-pty over tauri-plugin-pty | Direct Rust crate (used by WezTerm) vs 38-star community plugin | 2026-03-05 |
| Node.js sidecar for SDK | SDK is TS/Python only. Sidecar with stdio NDJSON. Future: replace with Deno | 2026-03-05 |
| SDK abstraction layer | SDK is 0.2.x, 127 versions in 5 months. Must insulate UI from wire format changes | 2026-03-05 |
| MVP = Phases 1-4 | Ship usable tool before tackling tree viz, packaging, polish | 2026-03-05 |
| Canvas addon (not WebGL) | WebKit2GTK has no WebGL. Explicit Canvas addon avoids silent fallback | 2026-03-05 |

## Open Questions

1. **Node.js or Deno for sidecar?** Node.js has the SDK package. Deno would be a single binary (better packaging) but needs SDK compatibility testing. → Start Node.js, evaluate Deno later.
2. **Multi-machine support?** Remote agents via WebSocket. Phase 7+ feature.
3. **Agent Teams integration?** Experimental Anthropic feature. Natural fit but adds complexity. Phase 7+.
4. **Electron escape hatch threshold?** If Canvas xterm.js proves >50ms latency on target system with 4 panes, switch to Electron. Benchmark in Phase 2.

## Error Handling Strategy

| Failure | Response |
|---|---|
| Node.js sidecar crash | Detect via process exit code, show error banner, offer restart button |
| Claude API 529 (overloaded) | Exponential backoff in sidecar, show "rate limited" status in pane |
| API key expired | Sidecar reports auth error, prompt user to update key in settings |
| PTY process exit | Show exit code in terminal, offer reconnect for SSH |
| WebKit2GTK OOM | Limit to 4 active xterm.js instances, lazy-init others |
| Simultaneous resize of N terminals | Debounce resize events (100ms), batch PTY resize calls |
| SDK message format change | Adapter layer catches unknown types, logs warning, renders as raw JSON fallback |

## Testing Strategy

| Layer | Tool | What |
|---|---|---|
| SDK adapter | Vitest | Message parsing, type discrimination, unknown message fallback |
| Svelte components | Svelte testing library | Pane rendering, layout responsive breakpoints |
| Rust backend | cargo test | PTY lifecycle, sidecar spawn/kill, file watcher debounce |
| Integration | Playwright | Full app: open terminal, run command, verify output |
| Manual | Developer testing | xterm.js Canvas performance with 4 panes on target hardware |

## Errors Encountered

(none yet)
