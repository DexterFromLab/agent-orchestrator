# Multi-Machine Support — Architecture Design

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
  type: 'pty_data' | 'pty_exit'
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

### Reconnection

- Controller reconnects with exponential backoff (1s → 30s cap)
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

## Implementation Plan

### Phase A: Extract `bterminal-core` crate

- Extract `PtyManager` and `SidecarManager` into a shared crate
- `src-tauri` depends on `bterminal-core` instead of owning the code
- Zero behavior change — purely structural refactor
- **Estimate:** ~2h of mechanical refactoring

### Phase B: Build `bterminal-relay` binary

- WebSocket server using `tokio-tungstenite`
- Token auth on upgrade
- Routes commands to `bterminal-core` managers
- Forwards events back over WebSocket
- Includes `--port`, `--token`, `--insecure` CLI flags
- **Ships as:** single static Rust binary (~5MB), `cargo install bterminal-relay`

### Phase C: Add `RemoteManager` to controller

- New `remote.rs` module in `src-tauri`
- Manages WebSocket client connections
- Tauri commands: `remote_add`, `remote_remove`, `remote_connect`, `remote_disconnect`
- Forwards remote events as Tauri events (same `sidecar-message` / `pty-data` events, tagged with machine ID)

### Phase D: Frontend integration

- Extend bridge adapters with `remoteMachineId` routing
- Add machine management UI in settings
- Add machine status indicators in sidebar
- Add reconnection banner in pane chrome
- Test with 2 machines (local + 1 remote)

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
