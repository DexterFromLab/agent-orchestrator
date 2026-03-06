# BTerminal v2 — Claude Agent Mission Control

## Goal
Redesign BTerminal from a GTK3 terminal emulator into a **multi-session Claude agent dashboard** optimized for 32:9 ultrawide (5120x1440). Simultaneous visibility of all active sessions, agent tree visualization, inline markdown rendering, maximum information density.

## Status: Phases 1-7 + Multi-Machine (A-D) Complete — Rev 5

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

- Rust spawns Node.js/Deno child process on app launch (auto-start in setup, Deno-first)
- Communication: stdio with newline-delimited JSON (simple, no socket server)
- Node.js/Deno process uses `@anthropic-ai/claude-agent-sdk` query() function which handles claude subprocess management internally
- SDK messages forwarded as-is via NDJSON — same format as CLI stream-json
- If sidecar crashes: detect via process exit, show error in UI, offer restart
- **Packaging:** Bundle the sidecar JS as a single file (esbuild bundle). Require Node.js 20+ as system dependency. Document in install.sh.
- **Deno-first:** SidecarCommand struct abstracts runtime. Deno preferred (runs TS directly, no build step). Falls back to Node.js if Deno not in PATH.

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

See [phases.md](phases.md) for the full phased implementation plan.

- **MVP:** Phases 1-4 (scaffolding, terminal+layout, agent SDK, session mgmt+markdown)
- **Post-MVP:** Phases 5-7 (agent tree, polish, packaging, agent teams)
- **Multi-Machine:** Phases A-D (bterminal-core extraction, relay binary, RemoteManager, frontend)

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
| claude CLI over Agent SDK query() | SUPERSEDED — initially used `claude -p --output-format stream-json` to avoid SDK dep. CLI hangs with piped stdio (bug #6775). Migrated to `@anthropic-ai/claude-agent-sdk` query() which handles subprocess internally | 2026-03-06 |
| Agent SDK migration | Replaced raw CLI spawning with @anthropic-ai/claude-agent-sdk query(). SDK handles subprocess management, auth, nesting detection. Messages same format as stream-json so adapter unchanged. AbortController for session stop. | 2026-03-06 |
| `.svelte.ts` for rune stores | Svelte 5 `$state`/`$derived` runes require `.svelte.ts` extension (not `.ts`). Compiler silently passes `.ts` but runes fail at runtime. All store files must use `.svelte.ts`. | 2026-03-06 |
| SQLite settings table for app config | Key-value `settings` table in session.rs for persisting user preferences (shell, cwd, max panes). Simple and extensible without schema migrations. | 2026-03-06 |
| Toast notifications over persistent log | Ephemeral toasts (4s auto-dismiss, max 5) for agent events rather than a persistent notification log. Keeps UI clean; persistent logs can be added later if needed. | 2026-03-06 |
| Build-from-source installer over pre-built binaries | install-v2.sh checks deps and builds locally. Pre-built binaries via GitHub Actions CI (.deb + AppImage on v* tags). Auto-update deferred until signing key infrastructure is set up. | 2026-03-06 |
| ctx read-only access from Rust | Open ~/.claude-context/context.db with SQLITE_OPEN_READ_ONLY. Never write — ctx CLI owns the schema. Separate CtxDb struct in ctx.rs with Option<Connection> for graceful absence. | 2026-03-06 |
| SSH via PTY shell args | SSH sessions spawn TerminalPane with shell=/usr/bin/ssh and args=[-p, port, [-i, keyfile], user@host]. No special SSH library — PTY handles it natively. | 2026-03-06 |
| Catppuccin 4 flavors at runtime | CSS variables overridden at runtime. onThemeChange() callback registry in theme.svelte.ts allows open terminals to hot-swap themes. | 2026-03-06 |
| Detached pane via URL params | Pop-out windows use ?detached=1&type=terminal URL params. App.svelte conditionally renders single pane without sidebar/grid chrome. Simple, no IPC needed. | 2026-03-06 |
| Shiki over highlight.js | Shiki provides VS Code-grade syntax highlighting with Catppuccin theme. Lazy singleton pattern avoids repeated WASM init. 13 languages preloaded. | 2026-03-06 |
| Vitest for frontend tests | Vitest over Jest — zero-config with Vite, same transform pipeline, faster. Test config in vite.config.ts. | 2026-03-06 |
| Deno sidecar evaluation | Proof-of-concept agent-runner-deno.ts created. Deno compiles to single binary (better packaging). Same NDJSON protocol. Not yet integrated. | 2026-03-06 |
| Splitter overlays for pane resize | Fixed-position divs outside CSS Grid (avoids layout interference). Mouse drag updates customColumns/customRows state. Resets on preset change. | 2026-03-06 |
| Deno-first sidecar with Node.js fallback | SidecarCommand struct abstracts runtime. resolve_sidecar_command() checks Deno first (runs TS directly, no build step), falls back to Node.js. Both bundled in tauri.conf.json resources. | 2026-03-06 |
| Session groups/folders | group_name column in sessions table with ALTER TABLE migration. Pane.group field in layout store. Collapsible group headers in sidebar. Right-click to set group. | 2026-03-06 |
| Auto-update signing key | Generated minisign keypair. Pubkey set in tauri.conf.json. Private key for TAURI_SIGNING_PRIVATE_KEY GitHub secret. | 2026-03-06 |
| Agent teams: frontend routing only | Subagent panes created by frontend dispatcher, not separate sidecar processes. Parent sidecar handles all messages; routing uses SDK's parentId field. Avoids process explosion for nested subagents. | 2026-03-06 |
| SUBAGENT_TOOL_NAMES detection | Detect subagent spawn by tool_call name ('Agent', 'Task', 'dispatch_agent'). Simple Set lookup, easily extensible. | 2026-03-06 |
| Cargo workspace at v2/ level | Extract bterminal-core shared crate for PtyManager + SidecarManager. Workspace members: src-tauri, bterminal-core, bterminal-relay. Enables code reuse between Tauri app and relay binary. | 2026-03-06 |
| EventSink trait for event abstraction | Generic trait (emit method) decouples PtyManager/SidecarManager from Tauri. TauriEventSink wraps AppHandle; relay uses WebSocket EventSink. | 2026-03-06 |
| bterminal-relay as standalone binary | Rust binary with WebSocket server for remote machine management. Token auth + rate limiting. Per-connection isolated managers. | 2026-03-06 |
| RemoteManager WebSocket client | Controller-side WebSocket client in remote.rs. Manages connections to multiple relays with heartbeat ping. 12 new Tauri commands for remote operations. | 2026-03-06 |
| Frontend remote routing via remoteMachineId | Pane.remoteMachineId field determines local vs remote. Bridge adapters route to appropriate Tauri commands transparently. | 2026-03-06 |

## Open Questions

1. **Node.js or Deno for sidecar?** Resolved: Deno-first with Node.js fallback. SidecarCommand struct in sidecar.rs abstracts the choice. Deno preferred (runs TS directly, compiles to single binary). Falls back to Node.js if Deno not in PATH. Both now use `@anthropic-ai/claude-agent-sdk` query() instead of raw CLI spawning.
2. **Multi-machine support?** Resolved: Implemented (Phases A-D complete). See [multi-machine.md](multi-machine.md) for architecture. bterminal-core crate extracted, bterminal-relay binary built, RemoteManager + frontend integration done. Reconnection with exponential backoff implemented. Remaining: real-world testing, TLS.
3. **Agent Teams integration?** Phase 7 — frontend routing implemented (subagent pane spawning, parent/child navigation). Needs real-world testing with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
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

| Error | Cause | Fix | Date |
|---|---|---|---|
| Blank screen, "rune_outside_svelte" runtime error | Store files used `.ts` extension but contain Svelte 5 `$state`/`$derived` runes. Runes only work in `.svelte` and `.svelte.ts` files. Compiler silently passes but fails at runtime. | Renamed stores to `.svelte.ts`, updated all import paths to use `.svelte` suffix | 2026-03-06 |
| Agent sessions produce no output (silent hang) | Claude CLI v2.1.69 hangs when spawned via child_process.spawn() with piped stdio. Known bug: github.com/anthropics/claude-code/issues/6775 | Migrated sidecar from raw CLI spawning to `@anthropic-ai/claude-agent-sdk` query() function. SDK handles subprocess management internally. | 2026-03-06 |
