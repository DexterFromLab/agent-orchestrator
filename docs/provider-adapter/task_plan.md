# Agent Provider Adapter — Task Plan

## Goal

Multi-provider agent support (Claude Code, Codex CLI, Ollama) via adapter pattern. Claude Code remains primary and fully functional. Zero regression.

## Architecture Decisions

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| PA-1 | 2026-03-11 | Per-provider sidecar binaries (not single multi-SDK bundle) | Independent testing, no bloat, clean separation. SidecarCommand already abstracts binary path. |
| PA-2 | 2026-03-11 | Generic provider_config blob in AgentQueryOptions (not discriminated union) | Rust passes through without parsing. TypeScript uses discriminated unions for compile-time safety. Minimal Rust changes. |
| PA-3 | 2026-03-11 | Per-provider message adapter files → common AgentMessage type | sdk-messages.ts becomes claude-messages.ts. Registry selects parser by provider. Store/UI unchanged. |
| PA-4 | 2026-03-11 | Provider selection per-project with global default | ProjectConfig.provider field (default: 'claude'). Matches real workflow. |
| PA-5 | 2026-03-11 | Capability flags drive UI rendering (not provider ID checks) | ProviderCapabilities interface. AgentPane checks hasProfiles/hasSkills/etc. No hardcoded if(provider==='claude'). |
| PA-6 | 2026-03-11 | Providers section in SettingsTab scroll (not inner tabs) | Current sections aren't long enough for tabs. Collapsible per-provider config panels. |

## Phases

### Phase 1: Core Abstraction Layer (no functional change)

**Goal:** Insert abstraction boundary. Claude remains the only registered provider. Zero user-visible change.

| # | Task | Files | Status |
|---|------|-------|--------|
| 1.1 | Create provider types | NEW: `src/lib/providers/types.ts` | pending |
| 1.2 | Create provider registry | NEW: `src/lib/providers/registry.svelte.ts` | pending |
| 1.3 | Create Claude provider meta | NEW: `src/lib/providers/claude.ts` | pending |
| 1.4 | Rename sdk-messages.ts → claude-messages.ts | RENAME + update imports | pending |
| 1.5 | Create message adapter registry | NEW: `src/lib/adapters/message-adapters.ts` | pending |
| 1.6 | Update Rust AgentQueryOptions | MOD: `bterminal-core/src/sidecar.rs` | pending |
| 1.7 | Update agent-bridge.ts options shape | MOD: `src/lib/adapters/agent-bridge.ts` | pending |
| 1.8 | Rename agent-runner.ts → claude-runner.ts | RENAME + update build script | pending |
| 1.9 | Add provider field to ProjectConfig | MOD: `src/lib/types/groups.ts` | pending |
| 1.10 | Rename ClaudeSession.svelte → AgentSession.svelte | RENAME + update imports | pending |
| 1.11 | Update agent-dispatcher provider routing | MOD: `src/lib/agent-dispatcher.ts` | pending |
| 1.12 | Update AgentPane for capability-driven rendering | MOD: `src/lib/components/Agent/AgentPane.svelte` | pending |
| 1.13 | Rename claude-bridge.ts → provider-bridge.ts | RENAME + genericize | pending |
| 1.14 | Update Rust lib.rs commands | MOD: `src-tauri/src/lib.rs` | pending |
| 1.15 | Update all tests | MOD: test files | pending |
| 1.16 | Verify: 202 vitest + 42 cargo tests pass | — | pending |

### Phase 2: Settings UI

| # | Task | Files | Status |
|---|------|-------|--------|
| 2.1 | Add Providers section to SettingsTab | MOD: `SettingsTab.svelte` | pending |
| 2.2 | Per-provider collapsible config panels | MOD: `SettingsTab.svelte` | pending |
| 2.3 | Per-project provider dropdown | MOD: `SettingsTab.svelte` | pending |
| 2.4 | Persist provider settings | MOD: `settings-bridge.ts` | pending |
| 2.5 | Provider-aware AgentPane | MOD: `AgentPane.svelte` | pending |

### Phase 3: Sidecar Routing

| # | Task | Files | Status |
|---|------|-------|--------|
| 3.1 | SidecarManager provider-based runner selection | MOD: `bterminal-core/src/sidecar.rs` | pending |
| 3.2 | Per-provider runner discovery | MOD: `bterminal-core/src/sidecar.rs` | pending |
| 3.3 | Provider-specific env var stripping | MOD: `bterminal-core/src/sidecar.rs` | pending |

## Type System

### ProviderQueryOptions (TypeScript → Rust → Sidecar)

```
Frontend (typed):
  AgentQueryOptions {
    provider: ProviderId        // 'claude' | 'codex' | 'ollama'
    session_id: string
    prompt: string
    model?: string
    max_turns?: number
    provider_config: Record<string, unknown>  // provider-specific
  }
         ↓ (Tauri invoke)
Rust (generic):
  AgentQueryOptions {
    provider: String
    session_id: String
    prompt: String
    model: Option<String>
    max_turns: Option<u32>
    provider_config: serde_json::Value
  }
         ↓ (stdin NDJSON)
Sidecar (provider-specific):
  claude-runner.ts parses provider_config as ClaudeProviderConfig
  codex-runner.ts parses provider_config as CodexProviderConfig
  ollama-runner.ts parses provider_config as OllamaProviderConfig
```

### Message Flow (Sidecar → Frontend)

```
Sidecar stdout (NDJSON, provider-specific format)
         ↓
Rust SidecarManager (pass-through, adds sessionId)
         ↓
agent-dispatcher.ts
  → message-adapters.ts registry
    → claude-messages.ts (if provider=claude)
    → codex-messages.ts (if provider=codex, future)
    → ollama-messages.ts (if provider=ollama, future)
  → AgentMessage (common type)
         ↓
agents.svelte.ts store (unchanged)
         ↓
AgentPane.svelte (renders AgentMessage, capability-driven)
```

## File Inventory

### New Files (Phase 1)
- `v2/src/lib/providers/types.ts`
- `v2/src/lib/providers/registry.svelte.ts`
- `v2/src/lib/providers/claude.ts`
- `v2/src/lib/adapters/message-adapters.ts`

### Renamed Files (Phase 1)
- `sdk-messages.ts` → `claude-messages.ts`
- `agent-runner.ts` → `claude-runner.ts`
- `ClaudeSession.svelte` → `AgentSession.svelte`
- `claude-bridge.ts` → `provider-bridge.ts` (genericized)

### Modified Files (Phase 1)
- `bterminal-core/src/sidecar.rs` — AgentQueryOptions struct
- `src-tauri/src/lib.rs` — command handlers
- `src/lib/adapters/agent-bridge.ts` — options interface
- `src/lib/agent-dispatcher.ts` — provider routing
- `src/lib/components/Agent/AgentPane.svelte` — capability checks
- `src/lib/components/Workspace/ProjectBox.svelte` — import rename
- `src/lib/types/groups.ts` — ProjectConfig.provider field
- `package.json` — build:sidecar script path
- Test files — import path updates
