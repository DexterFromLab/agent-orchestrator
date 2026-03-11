# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing — expand coverage** -- 48 tests passing across 8 describe blocks (WebdriverIO v9.24 + tauri-driver, single spec file, ~23s). Add tests for agent sessions, terminal interaction.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **Brand Dexter's new types** -- GroupAgentConfig, btmsg interfaces still use plain string IDs. Apply SessionId/ProjectId branded types when next touching those files.

## Completed

- [x] **Regression tests + sidecar env security** -- 49 new tests: btmsg.rs (8, named column access regression), bttask.rs (7, named column access), sidecar strip_provider_env_var (8, env stripping), btmsg-bridge.test.ts (17, camelCase+IPC), bttask-bridge.test.ts (10, camelCase+IPC), plantuml-encode.test.ts (7, hex encoding). Added ANTHROPIC_* to Rust env strip. 327 vitest + 72 cargo. | Done: 2026-03-11
- [x] **Integrate dexter_changes + fix 5 critical bugs** -- Merged multi-agent orchestration branch. Fixed: btmsg.rs column index mismatch (positional→named), btmsg-bridge.ts camelCase mismatch, GroupAgentsPanel stopPropagation, ArchitectureTab PlantUML encoding, TestingTab Tauri 2.x asset URL. Added WAL mode + busy_timeout to btmsg/bttask SQLite. | Done: 2026-03-11
- [x] **SOLID Phase 3 — Primitive obsession** -- Branded types SessionId/ProjectId in types/ids.ts. Applied to ~130 sites: Map/Set keys in conflicts.svelte.ts (4 maps, 12 functions), health.svelte.ts (2 maps, 10 functions), session-persistence.ts (3 maps, 6 functions), auto-anchoring.ts, agent-dispatcher.ts. Boundary branding at sidecar entry. Deferred: Svelte props (75), IPC interfaces, Rust newtypes. 293 vitest + 49 cargo tests. | Done: 2026-03-11
- [x] **SOLID Phase 2 — agent-dispatcher.ts split** -- 496→260 lines. Extracted 4 modules: utils/worktree-detection.ts (pure function, 5 tests), utils/session-persistence.ts (session maps + persist), utils/auto-anchoring.ts (compaction anchor), utils/subagent-router.ts (spawn + route). Dispatcher is thin coordinator. 286 vitest + 49 cargo tests. | Done: 2026-03-11
- [x] **SOLID Phase 2 — session.rs split** -- 1008→7 sub-modules under session/ directory (mod.rs, sessions.rs, layout.rs, settings.rs, ssh.rs, agents.rs, metrics.rs, anchors.rs). pub(in crate::session) conn visibility. 21 new cargo tests. 49 cargo tests total. | Done: 2026-03-11
- [x] **SOLID Phase 1 Refactoring** -- Extracted AttentionScorer pure function (14 tests), shared str()/num() type guards, split lib.rs (976→170 lines, 11 command modules). 286 vitest + 49 cargo tests. | Done: 2026-03-11
- [x] **Configurable stall threshold** -- Per-project range slider (5–60 min, step 5) in SettingsTab. `stallThresholdMin` in ProjectConfig, `setStallThreshold()` API in health store, ProjectBox $effect sync. Adaptive suggestions deferred (needs 50+ sessions in session_metrics). | Done: 2026-03-11
- [x] **Register Memora adapter** -- MemoraAdapter (memora-bridge.ts) implements MemoryAdapter, reads ~/.local/share/memora/memories.db via Rust memora.rs (read-only SQLite, FTS5 search). 4 Tauri commands, 16 vitest + 7 cargo tests. 272 vitest + 49 cargo total. | Done: 2026-03-11
- [x] **Add Codex/Ollama provider runners** -- Full provider stack for both: ProviderMeta constants, message adapters (codex-messages.ts, ollama-messages.ts), sidecar runners (codex-runner.ts uses @openai/codex-sdk dynamic import, ollama-runner.ts uses direct HTTP). 30 new tests, 256 vitest total. | Done: 2026-03-11
- [x] **Worktree isolation per project (S-1 Phase 3)** -- UI toggle in SettingsTab, spawn with --worktree via sidecar extraArgs, CWD-based worktree detection in agent-dispatcher (matches .claude/.codex/.cursor patterns). 8 files, +125 lines. 226 vitest + 42 cargo tests. | Done: 2026-03-11
