# BTerminal -- TODO

## Active

### v3.1 Remaining
- [ ] **Multi-machine real-world testing** -- TLS added to relay. Needs real 2-machine test. Multi-machine UI not surfaced in v3, code exists in bridges/stores only.
- [ ] **Certificate pinning** -- TLS encryption done (v3.0). Pin cert hash in RemoteManager for v3.1.
- [ ] **Agent Teams real-world testing** -- Subagent delegation prompt fix done + env var injection. Needs real multi-agent session to verify Manager spawns child agents.
- [ ] **Plugin sandbox migration** -- `new Function()` has inherent escape vectors (prototype walking, arguments.callee.constructor). Consider Web Worker isolation for v3.2.
- [ ] **Soak test** -- Run 4-hour soak with 6+ agents across 3+ projects. Monitor memory, SQLite WAL size, xterm.js instances.

## Completed

- [x] **LLM judge refactor + E2E docs** -- Refactored llm-judge.ts to dual-mode (CLI first, API fallback), env-configurable via LLM_JUDGE_BACKEND. Wrote comprehensive docs/e2e-testing.md covering fixtures, test mode, LLM judge, all spec phases, CI, troubleshooting. 444 vitest + 151 cargo + 109 E2E. | Done: 2026-03-12
- [x] **v3 Hardening Sprint** -- Fixed subagent delegation (prompt + env var), added TLS to relay, WAL checkpoint (5min), Landlock logging, plugin sandbox tests (35), gitignore fix. Phase C E2E tests (27 new, 3 pre-existing fixes). 444 vitest + 151 cargo + 109 E2E. | Done: 2026-03-12
- [x] **v3 Production Readiness — ALL tribunal items** -- Implemented all 13 features from tribunal assessment: sidecar supervisor, notifications, secrets, keyboard UX, agent health, search, plugins, sandbox, error classifier, audit log, team agent orchestration, optimistic locking, usage meter. 409 vitest + 109 cargo. | Done: 2026-03-12
- [x] **Unified test runner + testing gate rule** -- Created v2/scripts/test-all.sh (vitest + cargo + optional E2E), added npm scripts (test:all, test:all:e2e, test:cargo), added .claude/rules/20-testing-gate.md requiring full suite after major changes. | Done: 2026-03-12
- [x] **E2E testing — Phase B+ & test fixes** -- Phase B: LLM judge (llm-judge.ts, claude-haiku-4-5), 6 multi-project scenarios, CI workflow (3 jobs). Test fixes: 27 failures across 3 spec files. 388 vitest + 68 cargo + 82 E2E (0 fail, 4 skip). | Done: 2026-03-12
- [x] **Reviewer agent role** -- Tier 1 specialist with role='reviewer'. Reviewer workflow in agent-prompts.ts (8-step process). #review-queue/#review-log auto-channels. reviewQueueDepth in attention scoring (10pts/task, cap 50). 388 vitest + 76 cargo. | Done: 2026-03-12
- [x] **Auto-wake Manager** -- wake-scheduler.svelte.ts + wake-scorer.ts (24 tests). 3 strategies: persistent/on-demand/smart. 6 signals. Settings UI. 381 vitest + 72 cargo. | Done: 2026-03-12
- [x] **Dashboard metrics panel** -- MetricsPanel.svelte: live health + task board summary + SVG sparkline history. 25 tests. 357 vitest + 72 cargo. | Done: 2026-03-12
- [x] **Brand Dexter's new types (SOLID Phase 3b)** -- GroupId + AgentId branded types. Applied to ~40 sites. 332 vitest + 72 cargo. | Done: 2026-03-11
- [x] **Regression tests + sidecar env security** -- 49 new tests. Added ANTHROPIC_* to Rust env strip. 327 vitest + 72 cargo. | Done: 2026-03-11
- [x] **Integrate dexter_changes + fix 5 critical bugs** -- Fixed: btmsg.rs column index, btmsg-bridge camelCase, GroupAgentsPanel stopPropagation, ArchitectureTab PlantUML, TestingTab Tauri 2.x. | Done: 2026-03-11
- [x] **SOLID Phase 3 — Primitive obsession** -- Branded types SessionId/ProjectId. Applied to ~130 sites. 293 vitest + 49 cargo. | Done: 2026-03-11
