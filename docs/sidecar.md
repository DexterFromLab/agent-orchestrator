# Sidecar Architecture

The sidecar is the bridge between Agent Orchestrator's Rust backend and AI provider APIs. Because the Claude Agent SDK, OpenAI Codex SDK, and Ollama API are JavaScript/TypeScript libraries, they cannot run inside Rust or WebKit2GTK's webview. Instead, the Rust backend spawns child processes (sidecars) that handle AI interactions and communicate back via stdio NDJSON.

---

## Overview

```
Rust Backend (SidecarManager)
    │
    ├── Spawns child process (Deno preferred, Node.js fallback)
    ├── Writes QueryMessage to stdin (NDJSON)
    ├── Reads response lines from stdout (NDJSON)
    ├── Emits Tauri events for each message
    └── Manages lifecycle (start, stop, crash recovery)
         │
         ▼
Sidecar Process (one of):
    ├── claude-runner.mjs  → @anthropic-ai/claude-agent-sdk
    ├── codex-runner.mjs   → @openai/codex-sdk
    └── ollama-runner.mjs  → native fetch to localhost:11434
```

---

## Provider Runners

Each provider has its own runner file in `sidecar/`, compiled to a standalone ESM bundle in `sidecar/dist/` by esbuild. The runners are self-contained — all dependencies (including SDKs) are bundled into the `.mjs` file.

### Claude Runner (`claude-runner.ts` → `claude-runner.mjs`)

The primary runner. Uses `@anthropic-ai/claude-agent-sdk` query() function.

**Startup sequence:**
1. Reads NDJSON messages from stdin in a loop
2. On `query` message: resolves Claude CLI path via `findClaudeCli()`
3. Calls SDK `query()` with options: prompt, cwd, permissionMode, model, settingSources, systemPrompt, additionalDirectories, worktreeName, pathToClaudeCodeExecutable
4. Streams SDK messages as NDJSON to stdout
5. On `stop` message: calls AbortController.abort()

**Claude CLI detection (`findClaudeCli()`):**
Checks paths in order: `~/.local/bin/claude` → `~/.claude/local/claude` → `/usr/local/bin/claude` → `/usr/bin/claude` → `which claude`. If none found, emits `agent_error` immediately. The path is resolved once at sidecar startup and reused for all sessions.

**Session resume:** Passes `resume: sessionId` to the SDK when a resume session ID is provided. The SDK handles transcript loading internally.

**Multi-account support:** When `claudeConfigDir` is provided (from profile selection), it is set as `CLAUDE_CONFIG_DIR` in the SDK's env option. This points the Claude CLI at a different configuration directory.

**Worktree isolation:** When `worktreeName` is provided, it is passed as `extraArgs: { worktree: name }` to the SDK, which translates to `--worktree <name>` on the CLI.

### Codex Runner (`codex-runner.ts` → `codex-runner.mjs`)

Uses `@openai/codex-sdk` via dynamic import (graceful failure if not installed).

**Key differences from Claude:**
- Authentication via `CODEX_API_KEY` environment variable
- Sandbox mode mapping: `bypassPermissions` → `full-auto`, `default` → `suggest`
- Session resume via thread ID (Codex's equivalent of session continuity)
- No profile/skill support
- ThreadEvent format differs from Claude's stream-json (parsed by `codex-messages.ts`)

### Ollama Runner (`ollama-runner.ts` → `ollama-runner.mjs`)

Direct HTTP to Ollama's REST API — zero external dependencies.

**Key differences:**
- No SDK — uses native `fetch()` to `http://localhost:11434/api/chat`
- Health check on startup (`GET /api/tags`)
- NDJSON streaming response from Ollama's `/api/chat` endpoint
- Supports Qwen3's `<think>` tags for reasoning display
- Configurable: host, model, num_ctx, temperature
- Cost is always $0 (local inference)
- No subagent support, no profiles, no skills

---

## Communication Protocol

### Messages from Rust to Sidecar (stdin)

```typescript
// Query — start a new agent session
{
  "type": "query",
  "session_id": "uuid",
  "prompt": "Fix the bug in auth.ts",
  "cwd": "/home/user/project",
  "provider": "claude",
  "model": "claude-sonnet-4-6",
  "permission_mode": "bypassPermissions",
  "resume_session_id": "previous-uuid",     // optional
  "system_prompt": "You are an architect...", // optional
  "claude_config_dir": "~/.config/switcher-claude/work/", // optional
  "setting_sources": ["user", "project"],   // optional
  "additional_directories": ["/shared/lib"], // optional
  "worktree_name": "session-123",           // optional
  "provider_config": { ... },              // provider-specific blob
  "extra_env": { "BTMSG_AGENT_ID": "manager-1" } // optional
}

// Stop — abort a running session
{
  "type": "stop",
  "session_id": "uuid"
}
```

### Messages from Sidecar to Rust (stdout)

The sidecar writes one JSON object per line (NDJSON). The format depends on the provider, but all messages include a `sessionId` field added by the Rust SidecarManager before forwarding as Tauri events.

**Claude messages** follow the same format as the Claude CLI's `--output-format stream-json`:
```typescript
// System init (carries session ID, model info)
{ "type": "system", "subtype": "init", "session_id": "...", "model": "..." }

// Assistant text
{ "type": "assistant", "message": { "content": [{ "type": "text", "text": "..." }] } }

// Tool use
{ "type": "assistant", "message": { "content": [{ "type": "tool_use", "name": "Read", "input": {...} }] } }

// Tool result
{ "type": "user", "message": { "content": [{ "type": "tool_result", "content": "..." }] } }

// Final result
{ "type": "result", "subtype": "success", "cost_usd": 0.05, "duration_ms": 12000, ... }

// Error
{ "type": "agent_error", "error": "Claude CLI not found" }
```

---

## Environment Variable Stripping

When Agent Orchestrator is launched from within a Claude Code terminal session, the parent process sets `CLAUDE*` environment variables for nesting detection and sandbox configuration. If these leak to the sidecar, Claude's SDK detects nesting and either errors or behaves unexpectedly.

The solution is **dual-layer stripping**:

1. **Rust layer (primary):** `SidecarManager` calls `env_clear()` on the child process command, then explicitly sets only the variables needed (`PATH`, `HOME`, `USER`, etc.). This prevents any parent environment from leaking.

2. **JavaScript layer (defense-in-depth):** Each runner also strips provider-specific variables via `strip_provider_env_var()`:
   - Claude: strips all `CLAUDE*` keys (whitelists `CLAUDE_CODE_EXPERIMENTAL_*`)
   - Codex: strips all `CODEX*` keys
   - Ollama: strips all `OLLAMA*` keys (except `OLLAMA_HOST`)

The `extra_env` field in AgentQueryOptions allows injecting specific variables (like `BTMSG_AGENT_ID` for Tier 1 agents) after stripping.

---

## Sidecar Lifecycle

### Startup

The SidecarManager is initialized during Tauri app setup. It does not spawn any sidecar processes at startup — processes are spawned on-demand when the first agent query arrives.

### Runtime Resolution

When a query arrives, `resolve_sidecar_for_provider(provider)` finds the appropriate runner:

1. Looks for `{provider}-runner.mjs` in the sidecar dist directory
2. Checks for Deno first (`deno` or `~/.deno/bin/deno`), then Node.js
3. Returns a `SidecarCommand` struct with the runtime binary and script path
4. If neither runtime is found, returns an error

Deno is preferred because it has faster cold-start time (~50ms vs ~150ms for Node.js) and can compile to a single binary for distribution.

### Crash Recovery (SidecarSupervisor)

The `SidecarSupervisor` in `bterminal-core/src/supervisor.rs` provides automatic crash recovery:

- Monitors the sidecar child process for unexpected exits
- On crash: waits with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s cap)
- Maximum 5 restart attempts before giving up
- Reports health via `SidecarHealth` enum: `Healthy`, `Restarting { attempt, next_retry }`, `Failed { attempts, last_error }`
- 17 unit tests covering all recovery scenarios

### Shutdown

On app exit, `SidecarManager` sends stop messages to all active sessions and kills remaining child processes. The `Drop` implementation ensures cleanup even on panic.

---

## Build Pipeline

```bash
# Build all 3 runner bundles
npm run build:sidecar

# Internally runs esbuild 3 times:
# sidecar/claude-runner.ts → sidecar/dist/claude-runner.mjs
# sidecar/codex-runner.ts  → sidecar/dist/codex-runner.mjs
# sidecar/ollama-runner.ts → sidecar/dist/ollama-runner.mjs
```

Each bundle is a standalone ESM file with all dependencies included. The Claude runner bundles `@anthropic-ai/claude-agent-sdk` directly — no `node_modules` needed at runtime. The Codex runner uses dynamic import for `@openai/codex-sdk` (graceful failure if not installed). The Ollama runner has zero external dependencies.

The built `.mjs` files are included as Tauri resources in `tauri.conf.json` and copied to the app bundle during `tauri build`.

---

## Message Adapter Layer

On the frontend, raw sidecar messages pass through a provider-specific adapter before reaching the agent store:

```
Sidecar stdout → Rust SidecarManager → Tauri event
    → agent-dispatcher.ts
    → message-adapters.ts (registry)
    → claude-messages.ts / codex-messages.ts / ollama-messages.ts
    → AgentMessage[] (common type)
    → agents.svelte.ts store
```

The `AgentMessage` type is provider-agnostic:

```typescript
interface AgentMessage {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'init'
      | 'status' | 'cost' | 'error' | 'hook';
  parentId?: string;  // for subagent tracking
  content: unknown;   // type-specific payload
  timestamp: number;
}
```

This means the agent store and AgentPane rendering code never need to know which provider generated a message. The adapter layer is the only code that understands provider-specific formats.

### Test Coverage

- `claude-messages.test.ts` — 25 tests covering all Claude message types
- `codex-messages.test.ts` — 19 tests covering all Codex ThreadEvent types
- `ollama-messages.test.ts` — 11 tests covering all Ollama chunk types
