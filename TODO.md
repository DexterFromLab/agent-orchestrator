# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **E2E testing — expand coverage** -- 48 tests passing across 8 describe blocks (WebdriverIO v9.24 + tauri-driver, single spec file, ~23s). Add tests for agent sessions, terminal interaction.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **SOLID Phase 2 — agent-dispatcher.ts** -- God module (496 lines, 9 concerns). Extract event routing, session persistence, subagent routing into separate modules.
- [ ] **SOLID Phase 2 — session.rs** -- Mixed concerns (1008 lines, 8 tables). Split by table lifecycle.
- [ ] **SOLID Phase 3 — Primitive obsession** -- SessionId, ProjectId, FilePath as raw strings across 15+ files. Introduce value objects.

## Completed

- [x] **SOLID Phase 1 Refactoring** -- Extracted AttentionScorer pure function (14 tests), shared str()/num() type guards, split lib.rs (976→170 lines, 11 command modules). 286 vitest + 49 cargo tests. | Done: 2026-03-11
- [x] **Configurable stall threshold** -- Per-project range slider (5–60 min, step 5) in SettingsTab. `stallThresholdMin` in ProjectConfig, `setStallThreshold()` API in health store, ProjectBox $effect sync. Adaptive suggestions deferred (needs 50+ sessions in session_metrics). | Done: 2026-03-11
- [x] **Register Memora adapter** -- MemoraAdapter (memora-bridge.ts) implements MemoryAdapter, reads ~/.local/share/memora/memories.db via Rust memora.rs (read-only SQLite, FTS5 search). 4 Tauri commands, 16 vitest + 7 cargo tests. 272 vitest + 49 cargo total. | Done: 2026-03-11
- [x] **Add Codex/Ollama provider runners** -- Full provider stack for both: ProviderMeta constants, message adapters (codex-messages.ts, ollama-messages.ts), sidecar runners (codex-runner.ts uses @openai/codex-sdk dynamic import, ollama-runner.ts uses direct HTTP). 30 new tests, 256 vitest total. | Done: 2026-03-11
- [x] **Worktree isolation per project (S-1 Phase 3)** -- UI toggle in SettingsTab, spawn with --worktree via sidecar extraArgs, CWD-based worktree detection in agent-dispatcher (matches .claude/.codex/.cursor patterns). 8 files, +125 lines. 226 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **S-2 — Session Anchors + Configurable Budget** -- Preserves important turns through compaction chains. Auto-anchors first 3 turns (observation-masked — reasoning preserved in full per research). Configurable budget via AnchorBudgetScale slider (Small=2K, Medium=6K, Large=12K, Full=20K) in SettingsTab per-project. Manual pin, promote/demote in ContextTab. Re-injection via system_prompt. 219 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **Agent provider adapter pattern** -- Multi-provider support (Claude, Codex, Ollama) via 3-phase adapter pattern. Core abstraction, Settings UI, Sidecar routing. 5 new files, 4 renames, 20+ modified. 202 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **Files tab PDF viewer + CSV table** -- PdfViewer.svelte (pdfjs-dist 5.5.207, canvas multi-page, zoom 0.5x–3x, HiDPI). CsvTable.svelte (RFC 4180 parser, delimiter auto-detect, sortable columns, sticky header). | Done: 2026-03-11
- [x] **Filesystem Write Detection (S-1 Phase 2)** -- inotify-based file change detection via notify crate (fs_watcher.rs). Timing heuristic (2s grace) for PID attribution. 202/202 vitest + 42/42 cargo tests. | Done: 2026-03-11
- [x] **Conflict Detection Enhancements (S-1 Phase 1.5)** -- Bash write detection, acknowledge/dismiss conflicts, worktree-aware suppression. 194/194 tests. | Done: 2026-03-11
