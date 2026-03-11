# BTerminal -- TODO

## Active

### v2/v3 Remaining
- [ ] **Register Memora adapter** -- MemoryAdapter interface exists but no concrete adapter registered at app init. Need to create a MemoraAdapter that bridges to Memora MCP/CLI and register it on startup.
- [ ] **E2E testing — expand coverage** -- 48 tests passing across 8 describe blocks (WebdriverIO v9.24 + tauri-driver, single spec file, ~23s). Add tests for agent sessions, terminal interaction.
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
- [ ] **Configurable stall threshold** -- health.yaml per-project config for stall threshold (currently hardcoded 15 min). Adaptive suggestions after 50 sessions from session_metrics data.
- [ ] **Add Codex/Ollama provider runners** -- Provider adapter pattern implemented (all 3 phases). Need to create codex-runner.ts and ollama-runner.ts sidecar runners + corresponding message adapters (codex-messages.ts, ollama-messages.ts) + register providers in App.svelte.

## Completed

- [x] **Worktree isolation per project (S-1 Phase 3)** -- UI toggle in SettingsTab, spawn with --worktree via sidecar extraArgs, CWD-based worktree detection in agent-dispatcher (matches .claude/.codex/.cursor patterns). 8 files, +125 lines. 226 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **S-2 — Session Anchors + Configurable Budget** -- Preserves important turns through compaction chains. Auto-anchors first 3 turns (observation-masked — reasoning preserved in full per research). Configurable budget via AnchorBudgetScale slider (Small=2K, Medium=6K, Large=12K, Full=20K) in SettingsTab per-project. Manual pin, promote/demote in ContextTab. Re-injection via system_prompt. 219 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **Agent provider adapter pattern** -- Multi-provider support (Claude, Codex, Ollama) via 3-phase adapter pattern. Core abstraction, Settings UI, Sidecar routing. 5 new files, 4 renames, 20+ modified. 202 vitest + 42 cargo tests. | Done: 2026-03-11
- [x] **Files tab PDF viewer + CSV table** -- PdfViewer.svelte (pdfjs-dist 5.5.207, canvas multi-page, zoom 0.5x–3x, HiDPI). CsvTable.svelte (RFC 4180 parser, delimiter auto-detect, sortable columns, sticky header). | Done: 2026-03-11
- [x] **Filesystem Write Detection (S-1 Phase 2)** -- inotify-based file change detection via notify crate (fs_watcher.rs). Timing heuristic (2s grace) for PID attribution. 202/202 vitest + 42/42 cargo tests. | Done: 2026-03-11
- [x] **Conflict Detection Enhancements (S-1 Phase 1.5)** -- Bash write detection, acknowledge/dismiss conflicts, worktree-aware suppression. 194/194 tests. | Done: 2026-03-11
- [x] **File Overlap Conflict Detection (S-1 Phase 1)** -- conflicts.svelte.ts store tracks per-session Write/Edit file paths. Detects 2+ agents writing same file. 170/170 tests. | Done: 2026-03-10
- [x] **Project Health Dashboard (S-3)** -- health.svelte.ts store, Mission Control status bar, session_metrics SQLite table. | Done: 2026-03-10
- [x] **Context tab repurpose** -- Replaced ContextPane with ContextTab (LLM context window visualization). | Done: 2026-03-10
- [x] **CodeMirror 6 editor** -- Replaced shiki viewer with CodeMirror 6. 15 language modes, Catppuccin theme. | Done: 2026-03-10
