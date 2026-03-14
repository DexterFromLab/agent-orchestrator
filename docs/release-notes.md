# v3.0 Release Notes

## Mission Control — Multi-Project AI Agent Orchestration

BTerminal v3.0 is a ground-up redesign of the terminal interface, built for managing multiple AI agent sessions across multiple projects simultaneously. The Mission Control dashboard replaces the single-pane terminal with a full orchestration workspace.

### What's New

**Mission Control Dashboard**
- VSCode-style layout: icon sidebar + expandable settings drawer + project grid + status bar
- Per-project boxes with 11 tab types (Model, Docs, Context, Files, SSH, Memory, Metrics, Tasks, Architecture, Selenium, Tests)
- Command palette (Ctrl+K) with 18+ commands across 6 categories
- Keyboard-first navigation: Alt+1-5 project jump, Ctrl+H/L vi-nav, Ctrl+Shift+1-9 tab switch
- 17 themes in 3 groups (Catppuccin, Editor, Deep Dark)

**Multi-Agent Orchestration**
- 4 Tier 1 management roles: Manager, Architect, Tester, Reviewer
- btmsg: inter-agent messaging (DMs, channels, contacts ACL, heartbeats, dead letter queue)
- bttask: kanban task board (5 columns, optimistic locking, review queue auto-notifications)
- Agent prompt generator with role-specific workflows and tool documentation
- Manager subagent delegation via Claude Agent SDK teams
- Auto-wake scheduler: 3 strategies (persistent, on-demand, smart) with 6 wake signals

**Multi-Provider Support**
- Claude Code (primary), OpenAI Codex, Ollama
- Provider-specific sidecar runners with unified message adapter layer
- Per-project provider selection with capability-gated UI

**Session Continuity**
- SQLite persistence for agent sessions, messages, and cost tracking
- Session anchors: preserve important turns through context compaction
- Auto-anchoring on first compaction (observation-masked, reasoning preserved)
- Configurable anchor budget (2K–20K tokens)

**Dashboard Metrics**
- Real-time fleet overview: running/idle/stalled counts, burn rate ($/hr)
- Per-project health: activity state, context pressure, file conflicts, attention scoring
- Historical sparklines for cost, tokens, turns, tools, and duration
- Attention queue with priority-scored cards (click to focus)

**File Management**
- VSCode-style directory tree with CodeMirror 6 editor (15 language modes)
- PDF viewer (pdfjs-dist, multi-page, zoom 0.5x–3x)
- CSV table viewer (RFC 4180, delimiter auto-detect, sortable columns)
- Filesystem watcher for external write conflict detection

**Terminal**
- xterm.js with Canvas addon (WebKit2GTK compatible)
- Agent preview pane (read-only view of agent activity)
- SSH session management (native PTY, no library required)
- Worktree isolation per project (optional)

### Production Readiness

**Reliability**
- Sidecar crash recovery: auto-restart with exponential backoff (1s–30s, 5 retries)
- WAL checkpoint: periodic TRUNCATE every 5 minutes (sessions.db + btmsg.db)
- Error classification: 6 types with actionable messages and retry logic
- Optimistic locking for concurrent task board updates

**Security**
- Landlock sandbox: kernel 6.2+ filesystem restriction for sidecar processes
- Plugin sandbox: 13 shadowed globals, strict mode, frozen API, permission-gated
- Secrets management: system keyring (libsecret), no plaintext fallback
- TLS support for bterminal-relay (optional `--tls-cert`/`--tls-key`)
- Sidecar environment stripping: dual-layer (Rust + JS) credential isolation
- Audit logging: agent events, task changes, wake events, prompt injections

**Observability**
- OpenTelemetry: tracing + OTLP export to Tempo (optional)
- FTS5 full-text search across messages, tasks, and agent comms
- Agent health monitoring: heartbeats, stale detection, dead letter queue
- Desktop + in-app notifications with history

### Multi-Machine (Early Access)

bterminal-relay enables running agent sessions across multiple Linux machines via WebSocket. TLS encryption is supported. This feature is architecturally complete but not yet surfaced in the v3 UI — available for advanced users via the relay binary and bridges.

**v3.1 roadmap:** Certificate pinning, UI integration, real-world multi-machine testing.

### Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| Vitest (frontend) | 444 | Pass |
| Cargo (backend) | 151 | Pass |
| E2E (WebDriverIO) | 109 | Pass |
| **Total** | **704** | **All passing** |

### Breaking Changes from v2

- Layout system replaced by workspace store (project groups)
- Configuration moved from sessions.json to groups.json
- App.svelte rewritten (VSCode-style sidebar replaces TilingGrid)
- Settings moved from modal dialog to sidebar drawer tab

### Requirements

- Linux x86_64
- Kernel 6.2+ recommended (for Landlock sandbox enforcement)
- libsecret / DBUS session (for secrets management)
- Node.js 20+ and Rust 1.77+ (build from source)
- Claude CLI installed (`~/.local/bin/claude` or system path)

### Known Limitations

- Maximum 4 active xterm.js instances (WebKit2GTK memory constraint)
- Plugin sandbox uses `new Function()` — best-effort, not a security boundary
- Multi-machine UI not yet integrated into Mission Control
- Agent Teams delegation requires complex prompts to trigger reliably
