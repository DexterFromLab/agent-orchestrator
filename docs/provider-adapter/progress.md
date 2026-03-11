# Agent Provider Adapter — Progress

## Session Log

### 2026-03-11 — Planning Phase

**Duration:** ~30 min

**What happened:**
1. Explored 13+ files across Rust backend, TypeScript bridges, Svelte UI, and JS sidecar to map Claude-specific coupling
2. Classified coupling into 4 severity levels (CRITICAL/HIGH/MEDIUM/LOW)
3. Ran /ultra-think for deep architectural analysis — evaluated 3 design options for sidecar routing, message adapters, and settings UI
4. Made 6 architecture decisions (PA-1 through PA-6)
5. Created 3-phase implementation plan (16 + 5 + 3 tasks)
6. Created planning files: task_plan.md, findings.md, progress.md

**Architecture decisions made:**
- PA-1: Per-provider sidecar binaries (not single multi-SDK bundle)
- PA-2: Generic provider_config blob in AgentQueryOptions
- PA-3: Per-provider message adapter files → common AgentMessage type
- PA-4: Provider selection per-project with global default
- PA-5: Capability flags drive UI rendering (not provider ID checks)
- PA-6: Providers section in SettingsTab scroll (not inner tabs)

**Status:** Planning complete. Ready for Phase 1 implementation.

### 2026-03-11 — Implementation (All 3 Phases)

**Duration:** ~60 min

**What happened:**

**Phase 1 — Core Abstraction Layer (16 tasks):**
1. Created provider types (ProviderId, ProviderCapabilities, ProviderMeta, ProviderSettings)
2. Created Svelte 5 rune-based provider registry (registry.svelte.ts)
3. Created Claude provider meta constant (claude.ts)
4. Renamed sdk-messages.ts → claude-messages.ts, updated 13+ import references
5. Created message adapter registry (message-adapters.ts) with per-provider routing
6. Updated Rust AgentQueryOptions with `provider` and `provider_config` fields (serde defaults for backward compat)
7. Updated agent-bridge.ts TypeScript options
8. Renamed agent-runner.ts → claude-runner.ts, rebuilt dist bundle
9. Added provider field to ProjectConfig (groups.ts)
10. Renamed ClaudeSession.svelte → AgentSession.svelte with provider awareness
11. Updated agent-dispatcher.ts with sessionProviderMap for provider-based message routing
12. Updated AgentPane.svelte with capability-driven rendering (hasProfiles, hasSkills, supportsResume gates)
13. Created provider-bridge.ts (generic adapter delegating to provider-specific bridges)
14. Registered CLAUDE_PROVIDER in App.svelte onMount
15. Updated all test mocks (dispatcher test: adaptMessage mock with provider param)
16. Verified: 202 vitest + 42 cargo tests pass

**Phase 2 — Settings UI (5 tasks):**
1. Added "Providers" section to SettingsTab with collapsible per-provider config panels
2. Each panel: enabled toggle, default model input, capabilities badge display
3. Added per-project provider dropdown in project cards (conditional on >1 provider)
4. Provider settings persisted as JSON blob via `provider_settings` settings key
5. AgentPane already capability-aware from Phase 1

**Phase 3 — Sidecar Routing (3 tasks):**
1. Refactored resolve_sidecar_command() → resolve_sidecar_for_provider(provider) — looks for `{provider}-runner.mjs`
2. query() validates provider runner exists before sending message
3. Extracted strip_provider_env_var() — strips CLAUDE*/CODEX*/OLLAMA* env vars (whitelists CLAUDE_CODE_EXPERIMENTAL_*)

**Status:** All 3 phases complete. 202 vitest + 42 cargo tests pass. Zero regression.
