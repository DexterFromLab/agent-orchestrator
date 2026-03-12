# BTerminal -- TODO

## Active

### v3 Production Readiness (from Tribunal Assessment 2026-03-12)
- [ ] **Sidecar crash recovery/supervision** -- Rust supervisor threads for sidecar processes: detect exit codes, restart with exponential backoff (max 5 retries), surface alerts in dashboard. Currently silent failure. | Impact: 9, Effort: M
- [ ] **Notification system (OS + in-app)** -- notify-rust for desktop notifications on agent events (task complete, error, review requested), in-app bell icon with notification history. | Impact: 8, Effort: S
- [ ] **Secrets management (system keyring)** -- Tauri keychain plugin for API key storage, migrate env var keys to system keyring on first run. | Impact: 8, Effort: M
- [ ] **Keyboard-first UX pass** -- Vi-style pane switching (Ctrl+hjkl), Alt+1-5 project jump, ensure command palette covers 100% of actions. | Impact: 8, Effort: S
- [ ] **Agent health monitoring + dead letter queue** -- Tier 1 agents respond to heartbeat within configurable timeout, dead agents flagged in dashboard, queue undelivered btmsg. | Impact: 9, Effort: M

### v3 Remaining
- [ ] **Multi-machine real-world testing** -- Test bterminal-relay with 2 machines. Mark as experimental until docker-compose integration tests pass.
- [ ] **Multi-machine TLS/certificate pinning** -- TLS support for bterminal-relay + certificate pinning in RemoteManager.
- [ ] **Agent Teams real-world testing** -- Env var whitelist fix done. 3 test sessions ran ($1.10, $0.69, $1.70) but model didn't spawn subagents — needs complex multi-part prompts to trigger delegation. Test with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

## Completed

- [x] **Unified test runner + testing gate rule** -- Created v2/scripts/test-all.sh (vitest + cargo + optional E2E), added npm scripts (test:all, test:all:e2e, test:cargo), added .claude/rules/20-testing-gate.md requiring full suite after major changes. | Done: 2026-03-12
- [x] **E2E testing — Phase B+ & test fixes** -- Phase B: LLM judge (llm-judge.ts, claude-haiku-4-5), 6 multi-project scenarios, CI workflow (3 jobs). Test fixes: 27 failures across 3 spec files. 388 vitest + 68 cargo + 82 E2E (0 fail, 4 skip). | Done: 2026-03-12
- [x] **Reviewer agent role** -- Tier 1 specialist with role='reviewer'. Reviewer workflow in agent-prompts.ts (8-step process). #review-queue/#review-log auto-channels. reviewQueueDepth in attention scoring (10pts/task, cap 50). 388 vitest + 76 cargo. | Done: 2026-03-12
- [x] **Auto-wake Manager** -- wake-scheduler.svelte.ts + wake-scorer.ts (24 tests). 3 strategies: persistent/on-demand/smart. 6 signals. Settings UI. 381 vitest + 72 cargo. | Done: 2026-03-12
- [x] **Dashboard metrics panel** -- MetricsPanel.svelte: live health + task board summary + SVG sparkline history. 25 tests. 357 vitest + 72 cargo. | Done: 2026-03-12
- [x] **Brand Dexter's new types (SOLID Phase 3b)** -- GroupId + AgentId branded types. Applied to ~40 sites. 332 vitest + 72 cargo. | Done: 2026-03-11
- [x] **Regression tests + sidecar env security** -- 49 new tests. Added ANTHROPIC_* to Rust env strip. 327 vitest + 72 cargo. | Done: 2026-03-11
- [x] **Integrate dexter_changes + fix 5 critical bugs** -- Fixed: btmsg.rs column index, btmsg-bridge camelCase, GroupAgentsPanel stopPropagation, ArchitectureTab PlantUML, TestingTab Tauri 2.x. | Done: 2026-03-11
- [x] **SOLID Phase 3 — Primitive obsession** -- Branded types SessionId/ProjectId. Applied to ~130 sites. 293 vitest + 49 cargo. | Done: 2026-03-11
- [x] **SOLID Phases 1-2** -- AttentionScorer extraction, type guards, lib.rs split (976→170), agent-dispatcher split (496→260), session.rs split (1008→7 modules). | Done: 2026-03-11
