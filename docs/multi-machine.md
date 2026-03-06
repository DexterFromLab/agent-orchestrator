# Multi-Machine Support — Architecture & Implementation

**Status: Implemented (Phases A-D complete, 2026-03-06)**

## Overview

Extend BTerminal to manage Claude agent sessions and terminal panes running on **remote machines** over WebSocket, while keeping the local sidecar path unchanged.

## Problem

Current architecture is local-only:

```
WebView ←→ Rust (Tauri IPC) ←→ Local Sidecar (stdio NDJSON)
                              ←→ Local PTY (portable-pty)
```

Target state: BTerminal acts as a **mission control** that observes agents and terminals running on multiple machines (dev servers, cloud VMs, CI runners).

## Design Constraints

1. **Zero changes to local path** — local sidecar/PTY must work identically
2. **Same NDJSON protocol** — remote and local agents speak the same message format
3. **No new runtime dependencies** — use Rust's `tokio-tungstenite` (already available via Tauri)
4. **Graceful degradation** — remote machine goes offline → pane shows disconnected state, reconnects automatically
5. **Security** — all remote connections authenticated and encrypted (TLS + token)

## Architecture

### Three-Layer Model

```
┌──────────────────────────────────────────────────────────────────┐
│  BTerminal (Controller)                                          │
│                                                                  │
│  ┌──────────┐    Tauri IPC    ┌──────────────────────────────┐  │
│  │ WebView  │ ←────────────→  │ Rust Backend                 │  │
│  │ (Svelte) │                 │                              │  │
│  └──────────┘                 │  ├── PtyManager (local)      │  │
│                               │  ├── SidecarManager (local)  │  │
│                               │  └── RemoteManager ──────────┼──┤
│                               └──────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
        │                                      │
        │ (local stdio)                        │ (WebSocket wss://)
        ▼                                      ▼
  ┌───────────┐                    ┌──────────────────────┐
  │ Local     │                    │ Remote Machine       │
  │ Sidecar   │                    │                      │
  │ (Deno/    │                    │  ┌────────────────┐  │
  │  Node.js) │                    │  │ bterminal-relay│  │
  │           │                    │  │ (Rust binary)  │  │
  └───────────┘                    │  │                │  │
                                   │  │ ├── PTY mgr   │  │
                                   │  │ ├── Sidecar mgr│  │
                                   │  │ └── WS server  │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘
```

### Components

#### 1. `bterminal-relay` — Remote Agent (Rust binary)

A standalone Rust binary that runs on each remote machine. It:

- Listens on a WebSocket port (default: 9750)
- Manages local PTYs and claude sidecar processes
- Forwards NDJSON events to the controller over WebSocket
- Receives commands (query, stop, resize, write) from the controller

**Why a Rust binary?** Reuses existing `PtyManager` and `SidecarManager` code from `src-tauri/src/`. Extracted into a shared crate.

```
bterminal-relay/
├── Cargo.toml        # depends on bterminal-core
├── src/
│   └── main.rs       # WebSocket server + auth
│
bterminal-core/       # shared crate (extracted from src-tauri)
├── Cargo.toml
├── src/
│   ├── pty.rs        # PtyManager (from v2/src-tauri/src/pty.rs)
│   ├── sidecar.rs    # SidecarManager (from v2/src-tauri/src/sidecar.rs)
│   └── lib.rs
```

#### 2. `RemoteManager` — Controller-Side (in Rust backend)

New module in `v2/src-tauri/src/remote.rs`. Manages WebSocket connections to multiple relays.

```rust
pub struct RemoteMachine {
    pub id: String,
    pub label: String,
    pub url: String,          // wss://host:9750
    pub token: String,        // auth token
    pub status: RemoteStatus, // connected | connecting | disconnected | error
}

pub enum RemoteStatus {
    Connected,
    Connecting,
    Disconnected,
    Error(String),
}

pub struct RemoteManager {
    machines: Arc<Mutex<Vec<RemoteMachine>>>,
    connections: Arc<Mutex<HashMap<String, WsConnection>>>,
}
```

#### 3. Frontend Adapters — Unified Interface

The frontend doesn't care whether a pane is local or remote. The bridge layer abstracts this:

```typescript
// adapters/agent-bridge.ts — extended
export async function queryAgent(options: AgentQueryOptions): Promise<void> {
  if (options.remote_machine_id) {
    return invoke('remote_agent_query', { machineId: options.remote_machine_id, options });
  }
  return invoke('agent_query', { options });
}
```

Same pattern for `pty-bridge.ts` — add optional `remote_machine_id` to all operations.

## Protocol

### WebSocket Wire Format

Same NDJSON as local sidecar, wrapped in an envelope for multiplexing:

```typescript
// Controller → Relay (commands)
interface RelayCommand {
  id: string;                      // request correlation ID
  type: 'pty_create' | 'pty_write' | 'pty_resize' | 'pty_close'
      | 'agent_query' | 'agent_stop' | 'sidecar_restart'
      | 'ping';
  payload: Record<string, unknown>;
}

// Relay → Controller (events)
interface RelayEvent {
  type: 'pty_data' | 'pty_exit' | 'pty_created'
      | 'sidecar_message' | 'sidecar_exited'
      | 'error' | 'pong' | 'ready';
  sessionId?: string;
  payload: unknown;
}
```

### Authentication

1. **Pre-shared token** — relay starts with `--token <secret>`. Controller sends token in WebSocket upgrade headers (`Authorization: Bearer <token>`).
2. **TLS required** — relay rejects non-TLS connections in production mode. Dev mode allows `ws://` with `--insecure` flag.
3. **Token rotation** — future: relay exposes endpoint to rotate token. Controller stores tokens in SQLite settings table.

### Connection Lifecycle

```
Controller                          Relay
    │                                 │
    │── WSS connect ─────────────────→│
    │── Authorization: Bearer token ──→│
    │                                 │
    │←── { type: "ready", ...} ───────│
    │                                 │
    │── { type: "ping" } ────────────→│
    │←── { type: "pong" } ────────────│  (every 15s)
    │                                 │
    │── { type: "agent_query", ... }──→│
    │←── { type: "sidecar_message" }──│  (streaming)
    │←── { type: "sidecar_message" }──│
    │                                 │
    │     (disconnect)                │
    │── reconnect (exp backoff) ─────→│  (1s, 2s, 4s, 8s, max 30s)
```

### Reconnection (Implemented)

- Controller reconnects with exponential backoff (1s, 2s, 4s, 8s, 16s, 30s cap)
- Reconnection runs as an async tokio task spawned on disconnect
- Uses `attempt_ws_connect()` probe: connects with auth header, immediately closes (5s timeout)
- Emits `remote-machine-reconnecting` event (with backoff duration) and `remote-machine-reconnect-ready` when probe succeeds
- Cancels if machine is removed or manually reconnected (checks status == "disconnected" && connection == None)
- On reconnect, relay sends current state snapshot (active sessions, PTY list)
- Controller reconciles: updates pane states, re-subscribes to streams
- Active agent sessions continue on relay regardless of controller connection

## Session Persistence Across Reconnects

Key insight: **remote agents keep running even when the controller disconnects**. The relay is autonomous — it doesn't need the controller to operate.

On reconnect:
1. Relay sends `{ type: "state_sync", activeSessions: [...], activePtys: [...] }`
2. Controller matches against known panes, updates status
3. Missed messages are NOT replayed (too complex, marginal value). Agent panes show "reconnected — some messages may be missing" notice

## Frontend Integration

### Pane Model Changes

```typescript
// stores/layout.svelte.ts
export interface Pane {
  id: string;
  type: 'terminal' | 'agent';
  title: string;
  group?: string;
  remoteMachineId?: string;  // NEW: undefined = local
}
```

### Sidebar — Machine Groups

Remote panes auto-group by machine label in the sidebar:

```
▾ Local
  ├── Terminal 1
  └── Agent: fix bug

▾ devbox (192.168.1.50)      ← remote machine
  ├── SSH session
  └── Agent: deploy

▾ ci-runner (10.0.0.5)       ← remote machine (disconnected)
  └── Agent: test suite ⚠️
```

### Settings Panel

New "Machines" section in settings:

| Field | Type | Notes |
|-------|------|-------|
| Label | string | Human-readable name |
| URL | string | `wss://host:9750` |
| Token | password | Pre-shared auth token |
| Auto-connect | boolean | Connect on app launch |

Stored in SQLite `settings` table as JSON: `remote_machines` key.

## Implementation (All Phases Complete)

### Phase A: Extract `bterminal-core` crate [DONE]

- Cargo workspace at v2/ level (v2/Cargo.toml with members: src-tauri, bterminal-core, bterminal-relay)
- PtyManager and SidecarManager extracted to v2/bterminal-core/
- EventSink trait (bterminal-core/src/event.rs) abstracts event emission
- TauriEventSink (src-tauri/src/event_sink.rs) implements EventSink for AppHandle
- src-tauri pty.rs and sidecar.rs are thin re-export wrappers

### Phase B: Build `bterminal-relay` binary [DONE]

- v2/bterminal-relay/src/main.rs — WebSocket server (tokio-tungstenite)
- Token auth on WebSocket upgrade (Authorization: Bearer header)
- CLI: --port (default 9750), --token (required), --insecure (allow ws://)
- Routes RelayCommand to bterminal-core managers, forwards RelayEvent over WebSocket
- Rate limiting: 10 failed auth attempts triggers 5-minute lockout
- Per-connection isolated PtyManager + SidecarManager instances
- Command response propagation: structured responses (pty_created, pong, error) sent back via shared event channel
- send_error() helper: all command failures emit RelayEvent with commandId + error message
- PTY creation confirmation: pty_create command returns pty_created event with session ID and commandId for correlation

### Phase C: Add `RemoteManager` to controller [DONE]

- v2/src-tauri/src/remote.rs — RemoteManager struct with WebSocket client connections
- 12 Tauri commands: remote_add_machine, remote_remove_machine, remote_connect, remote_disconnect, remote_list_machines, remote_pty_spawn/write/resize/kill, remote_agent_query/stop, remote_sidecar_restart
- Heartbeat ping every 15s
- PTY creation event: emits `remote-pty-created` Tauri event with machineId, ptyId, commandId
- Exponential backoff reconnection on disconnect (1s/2s/4s/8s/16s/30s cap) via `attempt_ws_connect()` probe
- Reconnection events: `remote-machine-reconnecting`, `remote-machine-reconnect-ready`

### Phase D: Frontend integration [DONE]

- v2/src/lib/adapters/remote-bridge.ts — machine management IPC adapter
- v2/src/lib/stores/machines.svelte.ts — remote machine state store
- Pane.remoteMachineId field in layout store
- agent-bridge.ts and pty-bridge.ts route to remote commands when remoteMachineId is set
- SettingsDialog "Remote Machines" section
- Sidebar auto-groups remote panes by machine label

### Remaining Work

- [x] Reconnection logic with exponential backoff (1s-30s cap) — implemented in remote.rs
- [x] Relay command response propagation (pty_created, pong, error events) — implemented in main.rs
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Token interception | TLS required (reject `ws://` without `--insecure`) |
| Token brute-force | Rate limit auth attempts (5/min), lockout after 10 failures |
| Relay impersonation | Pin relay certificate fingerprint (future: mTLS) |
| Command injection | Relay validates all command payloads against schema |
| Lateral movement | Relay runs as unprivileged user, no shell access beyond PTY/sidecar |
| Data exfiltration | Agent output streams to controller only, no relay-to-relay traffic |

## Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| WebSocket latency | Typical LAN: <1ms. WAN: 20-100ms. Acceptable for agent output (text, not video) |
| Bandwidth | Agent NDJSON: ~50KB/s peak. Terminal: ~200KB/s peak. Trivial even on slow links |
| Connection count | Max 10 machines initially (UI constraint, not technical) |
| Message ordering | Single WebSocket per machine = ordered delivery guaranteed |

## What This Does NOT Cover (Future)

- **Multi-controller** — multiple BTerminal instances observing the same relay (needs pub/sub)
- **Relay discovery** — automatic detection of relays on LAN (mDNS/Bonjour)
- **Agent migration** — moving a running agent from one machine to another
- **Relay-to-relay** — direct communication between remote machines
- **mTLS** — mutual TLS for enterprise environments (Phase B+ enhancement)
