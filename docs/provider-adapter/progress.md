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

### 2026-03-11 — Provider Runners (Codex + Ollama)

**Duration:** ~45 min

**What happened:**

**Research:**
1. Researched OpenAI Codex CLI programmatic interface (SDK, NDJSON stream format, thread events, sandbox/approval modes, session resume)
2. Researched Ollama REST API (/api/chat, NDJSON streaming, tool calling, token counts, health check)

**Codex Provider (3 files):**
1. Created providers/codex.ts — ProviderMeta (gpt-5.4 default, hasSandbox=true, supportsResume=true, no profiles/skills/cost)
2. Created adapters/codex-messages.ts — adaptCodexMessage() maps ThreadEvents to AgentMessage[] (agent_message→text, reasoning→thinking, command_execution→Bash tool pair, file_change→Write/Edit/Bash per change, mcp_tool_call→server:tool, web_search→WebSearch, turn.completed→cost with tokens)
3. Created sidecar/codex-runner.ts — @openai/codex-sdk wrapper (dynamic import, graceful failure, sandbox/approval mapping, CODEX_API_KEY auth, session resume via thread ID)

**Ollama Provider (3 files):**
1. Created providers/ollama.ts — ProviderMeta (qwen3:8b default, hasModelSelection only, all other capabilities false)
2. Created adapters/ollama-messages.ts — adaptOllamaMessage() maps synthesized chunk events (text, thinking from Qwen3, done→cost with eval_duration/token counts, always $0)
3. Created sidecar/ollama-runner.ts — Direct HTTP to localhost:11434/api/chat (zero deps, health check, NDJSON stream parsing, configurable host/model/num_ctx/think)

**Registration + Build:**
1. Registered CODEX_PROVIDER + OLLAMA_PROVIDER in App.svelte onMount
2. Registered adaptCodexMessage + adaptOllamaMessage in message-adapters.ts
3. Updated build:sidecar script to build all 3 runners via esbuild

**Tests:**
- 19 new tests for codex-messages.ts (all event types)
- 11 new tests for ollama-messages.ts (all event types)
- 256 vitest + 42 cargo tests pass. Zero regression.

**Status:** Provider runners complete. Both providers infrastructure-ready (will work when CLI/server installed).
