# Agent Provider Adapter — Findings

## Architecture Exploration (2026-03-11)

### Claude-Specific Coupling Severity Map

Full codebase exploration of 13+ files revealed coupling at 4 severity levels:

#### CRITICAL (hardcoded SDK, must abstract)

| File | Coupling | Impact |
|------|----------|--------|
| `sidecar/agent-runner.ts` | Imports `@anthropic-ai/claude-agent-sdk`, calls `query()`, hardcoded `findClaudeCli()` | Entire sidecar is Claude-only. Must become `claude-runner.ts`. Other providers get own runners. |
| `bterminal-core/src/sidecar.rs` | `AgentQueryOptions` struct has no `provider` field. `SidecarCommand` hardcodes `agent-runner.mjs` path. | Must add `provider: String` field. Runner selection must be provider-based. |
| `src/lib/adapters/sdk-messages.ts` | `parseMessage()` assumes Claude SDK JSON format (assistant/user/result types, subagent tool names like `dispatch_agent`) | Must become `claude-messages.ts`. Other providers get own parsers. Registry selects by provider. |

#### HIGH (TS mirror types, provider-specific commands)

| File | Coupling | Impact |
|------|----------|--------|
| `src/lib/adapters/agent-bridge.ts` | `AgentQueryOptions` interface mirrors Rust struct — no provider field. `queryAgent()` passes options directly. | Add `provider` field. Options shape stays generic (provider_config blob). |
| `src-tauri/src/lib.rs` | `claude_list_profiles`, `claude_list_skills`, `claude_read_skill` commands are Claude-specific. | Keep as-is — they're provider-specific commands, not generic agent commands. UI gates by capability. |
| `src/lib/adapters/claude-bridge.ts` | `listClaudeProfiles()`, `listClaudeSkills()` — provider-specific adapter. | Stays as `claude-bridge.ts`. Other providers get own bridges. Provider-bridge.ts for generic routing. |

#### MEDIUM (provider-aware routing, UI rendering)

| File | Coupling | Impact |
|------|----------|--------|
| `src/lib/agent-dispatcher.ts` | `handleAgentMessage()` calls `parseMessage()` (Claude-specific). Subagent tool names hardcoded (`dispatch_agent`). | Route through message adapter registry. Subagent detection becomes provider-capability. |
| `src/lib/components/Agent/AgentPane.svelte` | Profile selector, skill autocomplete, Claude-specific tool names in rendering logic. | Gate by `ProviderCapabilities`. No `if(provider==='claude')` — use `capabilities.hasProfiles`. |
| `src/lib/components/Workspace/ClaudeSession.svelte` | Name says "Claude" but logic is mostly generic (session management, prompt, AgentPane). | Rename to `AgentSession.svelte`. Add provider prop. |

#### LOW (mostly generic already)

| File | Coupling | Impact |
|------|----------|--------|
| `src/lib/stores/agents.svelte.ts` | AgentMessage type is already generic (text, tool_call, tool_result). No Claude-specific logic. | No changes needed. Common AgentMessage type stays. |
| `src/lib/stores/health.svelte.ts` | Tracks activity/cost/context per project. Provider-agnostic. | No changes needed. |
| `src/lib/stores/conflicts.svelte.ts` | File overlap detection. Provider-agnostic (operates on tool_call file paths). | No changes needed. |
| `bterminal-relay/` | Forwards AgentQueryOptions as-is. No provider logic. | No changes needed (will forward `provider` field transparently). |

### Key Design Insights

1. **Sidecar is the natural boundary**: Each provider needs its own JS runner because SDKs are incompatible (Claude Agent SDK vs Codex CLI vs Ollama REST). The Rust sidecar manager selects which runner to spawn based on `provider` field.

2. **Message format is the main divergence**: Claude SDK emits structured JSON (assistant/user/result with specific fields). Codex CLI has different output format. Ollama uses OpenAI-compatible streaming. Per-provider message adapters normalize to common AgentMessage.

3. **Settings are per-provider + per-project**: Global defaults (API keys, model preferences) are per-provider. Project-level setting is just "which provider to use" (with override for model). Current SettingsTab has room for a collapsible Providers section without needing tabs.

4. **Capability flags eliminate provider switches**: Instead of `if (provider === 'claude') showProfiles()`, use `if (capabilities.hasProfiles) showProfiles()`. This means adding a new provider only requires registering its capabilities — no UI code changes.

5. **env var stripping is provider-specific**: Claude needs CLAUDE* vars stripped (nesting detection). Codex may need CODEX* stripped. Ollama needs nothing stripped. This is part of provider config, not generic logic.

### Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Rename breaks imports across 20+ files | High | Do renames one-at-a-time with full grep verification. Run tests after each. |
| AgentQueryOptions Rust/TS mismatch | Medium | Add provider field to both simultaneously. Default to 'claude'. |
| Message parser regression | Medium | sdk-messages.ts has 25 tests. Copy tests to claude-messages.ts test file. All must pass. |
| Settings persistence migration | Low | New settings keys (provider defaults) — no migration needed, just new keys. |
| UI regression from capability gating | Medium | Start with Claude capabilities = all true. Verify AgentPane renders identically. |
