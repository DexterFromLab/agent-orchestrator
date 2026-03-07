# BTerminal v2 — Progress Log

> Earlier sessions (2026-03-05 to 2026-03-06 early): see [progress-archive.md](progress-archive.md)

### Session: 2026-03-06 (continued) — Multi-Machine Architecture Design

#### Multi-Machine Support Architecture
- [x] Designed full multi-machine architecture in docs/multi-machine.md (303 lines)
- [x] Three-layer model: BTerminal (controller) + bterminal-relay (remote binary) + unified frontend
- [x] WebSocket NDJSON protocol: RelayCommand/RelayEvent envelope wrapping existing sidecar format
- [x] Authentication: pre-shared token + TLS, rate limiting, lockout
- [x] Autonomous relay model: agents keep running when controller disconnects
- [x] Reconnection with exponential backoff (1s-30s), state_sync on reconnect
- [x] 4-phase implementation plan: A (extract bterminal-core crate), B (relay binary), C (RemoteManager), D (frontend)
- [x] Updated TODO.md and docs/task_plan.md to reference the design

### Session: 2026-03-06 (continued) — Multi-Machine Implementation (Phases A-D)

#### Phase A: bterminal-core crate extraction
- [x] Created Cargo workspace at v2/ level (v2/Cargo.toml, workspace members: src-tauri, bterminal-core, bterminal-relay)
- [x] Extracted PtyManager into v2/bterminal-core/src/pty.rs
- [x] Extracted SidecarManager into v2/bterminal-core/src/sidecar.rs
- [x] Created EventSink trait (v2/bterminal-core/src/event.rs) to abstract event emission
- [x] TauriEventSink (v2/src-tauri/src/event_sink.rs) implements EventSink for Tauri AppHandle
- [x] src-tauri/src/pty.rs and sidecar.rs now thin re-export wrappers
- [x] Cargo.lock moved from src-tauri/ to workspace root (v2/)

#### Phase B: bterminal-relay binary
- [x] New Rust binary at v2/bterminal-relay/ with WebSocket server (tokio-tungstenite)
- [x] Token auth via Authorization: Bearer header on WebSocket upgrade
- [x] CLI flags: --port (default 9750), --token (required), --insecure (allow ws://)
- [x] Routes RelayCommand types (pty_create/write/resize/close, agent_query/stop, sidecar_restart, ping)
- [x] Forwards RelayEvent types (pty_data/exit, sidecar_message/exited, error, pong, ready)
- [x] Rate limiting: 10 failed auth attempts triggers 5-minute lockout
- [x] Per-connection isolated PtyManager + SidecarManager instances

#### Phase C: RemoteManager in controller
- [x] New v2/src-tauri/src/remote.rs module — RemoteManager struct
- [x] WebSocket client connections to relay instances (tokio-tungstenite)
- [x] RemoteMachine struct: id, label, url, token, status (Connected/Connecting/Disconnected/Error)
- [x] Machine lifecycle: add_machine, remove_machine, connect, disconnect
- [x] 12 new Tauri commands: remote_add_machine, remote_remove_machine, remote_connect, remote_disconnect, remote_list_machines, remote_pty_spawn/write/resize/kill, remote_agent_query/stop, remote_sidecar_restart
- [x] Heartbeat ping every 15s to detect stale connections

#### Phase D: Frontend integration
- [x] v2/src/lib/adapters/remote-bridge.ts — IPC adapter for machine management + remote events
- [x] v2/src/lib/stores/machines.svelte.ts — Svelte 5 store for remote machine state
- [x] Layout store: added remoteMachineId?: string to Pane interface
- [x] agent-bridge.ts: routes to remote_agent_query/stop when pane has remoteMachineId
- [x] pty-bridge.ts: routes to remote_pty_spawn/write/resize/kill when pane has remoteMachineId
- [x] SettingsDialog: new "Remote Machines" section (add/remove/connect/disconnect UI)
- [x] SessionList sidebar: auto-groups remote panes by machine label

#### Verification
- cargo check --workspace: clean (0 errors)
- vitest: 114/114 tests passing
- svelte-check: clean (0 errors)

#### New dependencies added
- bterminal-core: serde, serde_json, log, portable-pty, uuid (extracted from src-tauri)
- bterminal-relay: tokio, tokio-tungstenite, clap, env_logger, futures-util
- src-tauri: tokio-tungstenite, tokio, futures-util, uuid (added for RemoteManager)

### Session: 2026-03-06 (continued) — Relay Hardening & Reconnection

#### Relay Command Response Propagation
- [x] Shared event channel between EventSink and command response sender (sink_tx clone in bterminal-relay)
- [x] send_error() helper function: all command failures now emit RelayEvent with commandId + error message instead of just logging
- [x] ping command: now sends pong response via event channel (was a no-op)
- [x] pty_create: returns pty_created event with session ID and commandId for correlation
- [x] All error paths (pty_write, pty_resize, pty_close, agent_query, agent_stop, sidecar_restart) use send_error()

#### RemoteManager Reconnection
- [x] Exponential backoff reconnection in remote.rs: spawns async tokio task on disconnect
- [x] Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s (capped)
- [x] attempt_tcp_probe() function: TCP-only connect probe (5s timeout, default port 9750) — avoids allocating per-connection resources on relay
- [x] Emits remote-machine-reconnecting (with backoffSecs) and remote-machine-reconnect-ready Tauri events
- [x] Cancellation: stops if machine removed (not in HashMap) or manually reconnected (status != disconnected)
- [x] Fixed scoping: disconnection cleanup uses inner block to release mutex before emitting event

#### RemoteManager PTY Creation Confirmation
- [x] Handles pty_created event type from relay: emits remote-pty-created Tauri event with machineId, ptyId, commandId

### Session: 2026-03-06 (continued) — Reconnection Hardening

#### TCP Probe Refactor
- [x] Replaced attempt_ws_connect() with attempt_tcp_probe() in remote.rs: TCP-only connect (no WS upgrade), 5s timeout, default port 9750
- [x] Avoids allocating per-connection resources (PtyManager, SidecarManager) on the relay during reconnection probes
- [x] Probe no longer needs auth token — only checks TCP reachability

#### Frontend Reconnection Listeners
- [x] Added onRemoteMachineReconnecting() listener in remote-bridge.ts: receives machineId + backoffSecs
- [x] Added onRemoteMachineReconnectReady() listener in remote-bridge.ts: receives machineId when probe succeeds
- [x] machines.svelte.ts: reconnecting handler sets machine status to 'reconnecting', shows toast with backoff duration
- [x] machines.svelte.ts: reconnect-ready handler auto-calls connectMachine() to re-establish full WebSocket connection
- [x] Updated docs/multi-machine.md to reflect TCP probe and frontend listener changes

### Session: 2026-03-06 (continued) — Sidecar Env Var Bug Fix

#### CLAUDE* Environment Variable Leak (critical fix)
- [x] Diagnosed silent hang in agent sessions when BTerminal launched from Claude Code terminal
- [x] Root cause: Claude Code sets ~8 CLAUDE* env vars for nesting/sandbox detection
- [x] Fixed both sidecar runners to filter out all keys starting with 'CLAUDE'

### Session: 2026-03-06 (continued) — Sidecar SDK Migration

#### Migration from CLI Spawning to Agent SDK
- [x] Diagnosed root cause: claude CLI v2.1.69 hangs with piped stdio (bug #6775)
- [x] Migrated both runners to @anthropic-ai/claude-agent-sdk query() function
- [x] Added build:sidecar script (esbuild bundle, SDK included)
- [x] SDK options: permissionMode configurable, allowDangerouslySkipPermissions conditional

#### Bug Found and Fixed
- [x] AgentPane onDestroy killed running sessions on layout remounts (fixed: moved to TilingGrid onClose)

### Session: 2026-03-06 (continued) — Permission Mode, AgentPane Bug Fix, SDK Bundling

#### Permission Mode Passthrough
- [x] permission_mode field flows Rust -> sidecar -> SDK, defaults to 'bypassPermissions'

#### AgentPane onDestroy Bug Fix
- [x] Stop-on-close moved from AgentPane onDestroy to TilingGrid onClose handler

#### SDK Bundling Fix
- [x] SDK bundled into agent-runner.mjs (no external dependency at runtime)

### Session: 2026-03-07 — Unified Sidecar Bundle

#### Sidecar Resolution Simplification
- [x] Consolidated to single pre-built bundle (dist/agent-runner.mjs) running on both Deno and Node.js
- [x] resolve_sidecar_command() checks runtime availability upfront, prefers Deno
- [x] agent-runner-deno.ts retained in repo but not used by SidecarManager

### Session: 2026-03-07 (continued) — Rust-Side CLAUDE* Env Var Stripping

#### Dual-Layer Env Var Stripping
- [x] Rust SidecarManager uses env_clear() + envs(clean_env) before spawn (primary defense)
- [x] JS-side stripping retained as defense-in-depth

### Session: 2026-03-07 (continued) — Claude CLI Path Detection

#### pathToClaudeCodeExecutable for SDK
- [x] Added findClaudeCli() to agent-runner.ts (Node.js): checks ~/.local/bin/claude, ~/.claude/local/claude, /usr/local/bin/claude, /usr/bin/claude, then falls back to `which claude`/`where claude`
- [x] Added findClaudeCli() to agent-runner-deno.ts (Deno): same candidate paths, uses Deno.statSync() + Deno.Command("which")
- [x] Both runners now pass pathToClaudeCodeExecutable to SDK query() options
- [x] Early error: if Claude CLI not found, agent_error emitted immediately instead of cryptic SDK failure
- [x] CLI path resolved once at sidecar startup, logged for debugging

### Session: 2026-03-07 (continued) — Claude Profiles & Skill Discovery

#### Claude Profile / Account Switching (switcher-claude integration)
- [x] New Tauri commands: claude_list_profiles(), claude_list_skills(), claude_read_skill(), pick_directory()
- [x] claude_list_profiles() reads ~/.config/switcher/profiles/ for profile directories with profile.toml metadata
- [x] Config dir resolution: ~/.config/switcher-claude/{name}/ or fallback ~/.claude/
- [x] extract_toml_value() simple TOML parser for profile metadata (email, subscription_type, display_name)
- [x] Always includes "default" profile if no switcher profiles found

#### Skill Discovery & Autocomplete
- [x] claude_list_skills() reads ~/.claude/skills/ directory (directories with SKILL.md or standalone .md files)
- [x] Description extracted from first non-heading, non-empty line (max 120 chars)
- [x] claude_read_skill(path) reads full skill file content
- [x] New frontend adapter: v2/src/lib/adapters/claude-bridge.ts (ClaudeProfile, ClaudeSkill interfaces)

#### AgentPane Session Toolbar
- [x] Working directory input (cwdInput) — editable text field, replaces fixed cwd prop
- [x] Profile/account selector dropdown (shown when >1 profile available)
- [x] Selected profile's config_dir passed as claude_config_dir in AgentQueryOptions
- [x] Skill autocomplete menu: type `/` to trigger, arrow keys navigate, Tab/Enter select, Escape dismiss
- [x] expandSkillPrompt(): reads skill content via readSkill(), prepends to prompt with optional user args

#### Extended AgentQueryOptions (full stack passthrough)
- [x] New fields in Rust AgentQueryOptions struct: setting_sources, system_prompt, model, claude_config_dir, additional_directories
- [x] Sidecar QueryMessage interface updated with matching fields
- [x] Both sidecar runners (agent-runner.ts, agent-runner-deno.ts) pass new fields to SDK query()
- [x] CLAUDE_CONFIG_DIR injected into cleanEnv when claudeConfigDir provided (multi-account support)
- [x] settingSources defaults to ['user', 'project'] (loads CLAUDE.md and project settings)
- [x] Frontend AgentQueryOptions interface updated in agent-bridge.ts

### Next Steps
- [ ] Real-world relay testing (2 machines)
- [ ] TLS/certificate pinning for relay connections
- [ ] E2E testing with Playwright/WebDriver (when display server available)
- [ ] Test agent teams with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
- [ ] Model selector in AgentPane toolbar (dropdown for model override)
- [ ] System prompt field in AgentPane toolbar (custom instructions per session)
- [ ] Additional directories picker in AgentPane toolbar
