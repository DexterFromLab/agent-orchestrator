# Production Hardening

Agent Orchestrator includes several production-readiness features that ensure reliability, security, and observability. This document covers each subsystem in detail.

---

## Sidecar Supervisor (Crash Recovery)

The `SidecarSupervisor` in `bterminal-core/src/supervisor.rs` automatically restarts crashed sidecar processes.

### Behavior

When the sidecar child process exits unexpectedly:

1. The supervisor detects the exit via process monitoring
2. Waits with exponential backoff before restarting:
   - Attempt 1: wait 1 second
   - Attempt 2: wait 2 seconds
   - Attempt 3: wait 4 seconds
   - Attempt 4: wait 8 seconds
   - Attempt 5: wait 16 seconds (capped at 30s)
3. After 5 failed attempts, the supervisor gives up and reports `SidecarHealth::Failed`

### Health States

```rust
pub enum SidecarHealth {
    Healthy,
    Restarting { attempt: u32, next_retry: Duration },
    Failed { attempts: u32, last_error: String },
}
```

The frontend can query health state and offer a manual restart button when auto-recovery fails. 17 unit tests cover all recovery scenarios including edge cases like rapid successive crashes.

---

## Landlock Sandbox

Landlock is a Linux kernel (6.2+) security module that restricts filesystem access for processes. Agent Orchestrator uses it to sandbox sidecar processes, limiting what files they can read and write.

### Configuration

```rust
pub struct SandboxConfig {
    pub read_write_paths: Vec<PathBuf>,  // Full access (project dir, temp)
    pub read_only_paths: Vec<PathBuf>,   // Read-only (system libs, SDK)
}
```

The sandbox is applied via `pre_exec()` on the child process command, before the sidecar starts executing.

### Path Rules

| Path | Access | Reason |
|------|--------|--------|
| Project CWD | Read/Write | Agent needs to read and modify project files |
| `/tmp` | Read/Write | Temporary files during operation |
| `~/.local/share/bterminal/` | Read/Write | SQLite databases (btmsg, sessions) |
| System library paths | Read-only | Node.js/Deno runtime dependencies |
| `~/.claude/` or config dir | Read-only | Claude configuration and credentials |

### Graceful Fallback

If the kernel doesn't support Landlock (< 6.2) or the kernel module isn't loaded, the sandbox silently degrades — the sidecar runs without filesystem restrictions. This is logged as a warning but doesn't prevent operation.

---

## FTS5 Full-Text Search

The search system uses SQLite's FTS5 extension for full-text search across three data types. Accessed via a Spotlight-style overlay (Ctrl+Shift+F).

### Architecture

```
SearchOverlay.svelte (Ctrl+Shift+F)
    │
    └── search-bridge.ts → Tauri commands
         │
         └── search.rs → SearchDb (separate FTS5 tables)
              │
              ├── search_messages  — agent session messages
              ├── search_tasks     — bttask task content
              └── search_btmsg     — btmsg inter-agent messages
```

### Virtual Tables

The `SearchDb` struct in `search.rs` manages three FTS5 virtual tables:

| Table | Source | Indexed Columns |
|-------|--------|----------------|
| `search_messages` | Agent session messages | content, session_id, project_id |
| `search_tasks` | bttask tasks | title, description, assignee, status |
| `search_btmsg` | btmsg messages | content, sender, recipient, channel |

### Operations

| Tauri Command | Purpose |
|---------------|---------|
| `search_init` | Creates FTS5 virtual tables if not exist |
| `search_all` | Queries all 3 tables, returns ranked results |
| `search_rebuild` | Drops and rebuilds all indices (maintenance) |
| `search_index_message` | Indexes a single new message (real-time) |

### Frontend (SearchOverlay.svelte)

- Triggered by Ctrl+Shift+F
- Spotlight-style floating overlay centered on screen
- 300ms debounce on input to avoid excessive queries
- Results grouped by type (Messages, Tasks, Communications)
- Click result to navigate to source (focus project, switch tab)

---

## Plugin System

The plugin system allows extending Agent Orchestrator with custom commands and event handlers. Plugins are sandboxed JavaScript executing in a restricted environment.

### Plugin Discovery

Plugins live in `~/.config/bterminal/plugins/`. Each plugin is a directory containing a `plugin.json` manifest:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A custom plugin",
  "main": "index.js",
  "permissions": ["notifications", "settings"]
}
```

The Rust `plugins.rs` module scans for `plugin.json` files with path-traversal protection (rejects `..` in paths).

### Sandboxed Runtime (plugin-host.ts)

Plugins execute via `new Function()` in a restricted scope:

**Shadowed globals (13):**
`fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `eval`, `Function`, `importScripts`, `require`, `process`, `globalThis`, `window`, `document`, `localStorage`

**Provided API (permission-gated):**

| API | Permission | Purpose |
|-----|-----------|---------|
| `bt.notify(msg)` | `notifications` | Show toast notification |
| `bt.getSetting(key)` | `settings` | Read app setting |
| `bt.setSetting(key, val)` | `settings` | Write app setting |
| `bt.registerCommand(name, fn)` | — (always allowed) | Add command to palette |
| `bt.on(event, fn)` | — (always allowed) | Subscribe to app events |

The API object is frozen (`Object.freeze`) to prevent tampering. Strict mode is enforced.

### Plugin Store (`plugins.svelte.ts`)

The store manages plugin lifecycle:
- `loadAllPlugins()` — discover, validate permissions, execute in sandbox
- `unloadAllPlugins()` — cleanup event listeners, remove commands
- Command registry integrates with CommandPalette
- Event bus distributes app events to subscribed plugins

### Security Notes

The `new Function()` sandbox is best-effort — it is not a security boundary. A determined attacker could escape it. Landlock provides the actual filesystem restriction. The plugin sandbox primarily prevents accidental damage from buggy plugins.

35 tests cover the plugin system including permission validation, sandbox escape attempts, and lifecycle management.

---

## Secrets Management

Secrets (API keys, tokens) are stored in the system keyring rather than in plaintext files or SQLite.

### Backend (`secrets.rs`)

Uses the `keyring` crate with the `linux-native` feature (libsecret/DBUS):

```rust
pub struct SecretsManager;

impl SecretsManager {
    pub fn store(key: &str, value: &str) -> Result<()>;
    pub fn get(key: &str) -> Result<Option<String>>;
    pub fn delete(key: &str) -> Result<()>;
    pub fn list() -> Result<Vec<SecretMetadata>>;
    pub fn has_keyring() -> bool;
}
```

Metadata (key names, last modified timestamps) is stored in SQLite settings. The actual secret values never touch disk — they live only in the system keyring (gnome-keyring, KWallet, or equivalent).

### Frontend (`secrets-bridge.ts`)

| Function | Purpose |
|----------|---------|
| `storeSecret(key, value)` | Store a secret in keyring |
| `getSecret(key)` | Retrieve a secret |
| `deleteSecret(key)` | Remove a secret |
| `listSecrets()` | List all secret metadata |
| `hasKeyring()` | Check if system keyring is available |

### No Fallback

If no keyring daemon is available (no DBUS session, no gnome-keyring), secret operations fail with a clear error message. There is no plaintext fallback — this is intentional to prevent accidental credential leakage.

---

## Notifications

Agent Orchestrator has two notification systems: in-app toasts and OS-level desktop notifications.

### In-App Toasts (`notifications.svelte.ts`)

- 6 notification types: `success`, `error`, `warning`, `info`, `agent_complete`, `agent_error`
- Maximum 5 visible toasts, 4-second auto-dismiss
- Toast history (up to 100 entries) with unread badge in NotificationCenter
- Agent dispatcher emits toasts on: agent completion, agent error, sidecar crash

### Desktop Notifications (`notifications.rs`)

Uses `notify-rust` crate for native Linux notifications. Graceful fallback if notification daemon is unavailable (e.g., no D-Bus session).

Frontend triggers via `sendDesktopNotification()` in `notifications-bridge.ts`. Used for events that should be visible even when the app is not focused.

### Notification Center (`NotificationCenter.svelte`)

Bell icon in the top-right with unread badge. Dropdown panel shows notification history with timestamps, type icons, and clear/mark-read actions.

---

## Agent Health Monitoring

### Heartbeats

Tier 1 agents send periodic heartbeats via `btmsg heartbeat` CLI command. The heartbeats table tracks last heartbeat timestamp and status per agent.

### Stale Detection

The health store detects stalled agents via the `stallThresholdMin` setting (default 15 minutes). If an agent hasn't produced output within the threshold, its activity state transitions to `Stalled` and the attention score jumps to 100 (highest priority).

### Dead Letter Queue

Messages sent to agents that are offline or have crashed are moved to the dead letter queue in `btmsg.db`. This prevents silent message loss and allows debugging delivery failures.

### Audit Logging

All significant events are logged to the `audit_log` table:

| Event Type | Logged When |
|-----------|-------------|
| `message_sent` | Agent sends a btmsg message |
| `message_read` | Agent reads messages |
| `channel_created` | New btmsg channel created |
| `agent_registered` | Agent registers with btmsg |
| `heartbeat` | Agent sends heartbeat |
| `task_created` | New bttask task |
| `task_status_changed` | Task status update |
| `wake_event` | Wake scheduler triggers |
| `prompt_injection_detected` | Suspicious content in agent messages |

The AuditLogTab component in the workspace UI displays audit entries with filtering by event type and agent, with 5-second auto-refresh and max 200 entries.

---

## Error Classification

The error classifier (`utils/error-classifier.ts`) categorizes API errors into 6 types with appropriate retry behavior:

| Type | Examples | Retry? | User Message |
|------|----------|--------|--------------|
| `rate_limit` | HTTP 429, "rate limit exceeded" | Yes (with backoff) | "Rate limited — retrying in Xs" |
| `auth` | HTTP 401/403, "invalid API key" | No | "Authentication failed — check API key" |
| `quota` | "quota exceeded", "billing" | No | "Usage quota exceeded" |
| `overloaded` | HTTP 529, "overloaded" | Yes (longer backoff) | "Service overloaded — retrying" |
| `network` | ECONNREFUSED, timeout, DNS failure | Yes | "Network error — check connection" |
| `unknown` | Anything else | No | "Unexpected error" |

20 unit tests cover classification accuracy across various error message formats.

---

## WAL Checkpoint

Both SQLite databases (`sessions.db` and `btmsg.db`) use WAL (Write-Ahead Logging) mode for concurrent read/write access. Without periodic checkpoints, the WAL file grows unboundedly.

A background tokio task runs `PRAGMA wal_checkpoint(TRUNCATE)` every 5 minutes on both databases. This moves WAL data into the main database file and resets the WAL.

---

## TLS Relay Support

The `bterminal-relay` binary supports TLS for encrypted WebSocket connections:

```bash
bterminal-relay \
  --port 9750 \
  --token <secret> \
  --tls-cert /path/to/cert.pem \
  --tls-key /path/to/key.pem
```

Without `--tls-cert`/`--tls-key`, the relay only accepts connections with the `--insecure` flag (plain WebSocket). In production, TLS is mandatory — the relay rejects `ws://` connections unless `--insecure` is explicitly set.

Certificate pinning (comparing relay certificate fingerprints) is planned for v3.1.

---

## OpenTelemetry Observability

The Rust backend supports optional OTLP trace export via the `BTERMINAL_OTLP_ENDPOINT` environment variable.

### Backend (`telemetry.rs`)

- `TelemetryGuard` initializes tracing + OTLP export pipeline
- Uses `tracing` + `tracing-subscriber` + `opentelemetry` 0.28 + `tracing-opentelemetry` 0.29
- OTLP/HTTP export to configured endpoint
- `Drop`-based shutdown ensures spans are flushed

### Frontend (`telemetry-bridge.ts`)

The frontend cannot use the browser OTEL SDK (WebKit2GTK incompatible). Instead, it routes events through a `frontend_log` Tauri command that pipes into Rust's tracing system:

```typescript
tel.info('agent-started', { sessionId, provider });
tel.warn('context-pressure', { projectId, usage: 0.85 });
tel.error('sidecar-crash', { error: msg });
```

### Docker Stack

A pre-configured Tempo + Grafana stack lives in `docker/tempo/`:

```bash
cd docker/tempo && docker compose up -d
# Grafana at http://localhost:9715
# Set BTERMINAL_OTLP_ENDPOINT=http://localhost:4318 to enable export
```

---

## Session Metrics

Per-project historical session data is stored in the `session_metrics` table:

| Column | Type | Purpose |
|--------|------|---------|
| `project_id` | TEXT | Which project |
| `session_id` | TEXT | Agent session ID |
| `start_time` | INTEGER | Session start timestamp |
| `end_time` | INTEGER | Session end timestamp |
| `peak_tokens` | INTEGER | Maximum context tokens used |
| `turn_count` | INTEGER | Total conversation turns |
| `tool_call_count` | INTEGER | Total tool calls made |
| `cost_usd` | REAL | Total cost in USD |
| `model` | TEXT | Model used |
| `status` | TEXT | Final status (success/error/stopped) |
| `error_message` | TEXT | Error details if failed |

100-row retention per project (oldest pruned on insert). Metrics are persisted on agent completion via the agent dispatcher.

The MetricsPanel component displays this data as:
- **Live view** — fleet aggregates, project health grid, task board summary, attention queue
- **History view** — SVG sparklines for cost/tokens/turns/tools/duration, stats row, session table
