# BTerminal — Claude Behavioral Guide

## Workflow

- v1 is a single-file Python app (`bterminal.py`). Changes are localized.
- v2 docs are in `docs/`. Architecture decisions are in `docs/task_plan.md`.
- Phase 3 (Agent SDK Integration) is in progress. Core implementation done, needs testing and polish.
- Consult Memora (tag: `bterminal`) before making architectural changes.

## Documentation References

- Architecture & decisions: [docs/task_plan.md](../docs/task_plan.md)
- Implementation phases: [docs/phases.md](../docs/phases.md)
- Research findings: [docs/findings.md](../docs/findings.md)
- Progress log: [docs/progress.md](../docs/progress.md)

## Rules

- Do not modify v1 code (`bterminal.py`) unless explicitly asked — it is production-stable.
- v2 work goes on a feature branch (`v2-mission-control`), not master.
- All v2 architecture decisions must reference `docs/task_plan.md` Decisions Log.
- When adding new decisions, append to the Decisions Log table with date.
- Update `docs/progress.md` after each significant work session.

## Key Technical Constraints

- WebKit2GTK has no WebGL — xterm.js must use Canvas addon explicitly.
- Agent sessions use `claude` CLI with `--output-format stream-json` (not Agent SDK npm package). All output goes through the adapter layer (`src/lib/adapters/sdk-messages.ts`).
- Node.js sidecar (`sidecar/agent-runner.ts`) spawns claude subprocesses, communicates with Rust via stdio NDJSON.
- Agent dispatcher (`src/lib/agent-dispatcher.ts`) is a singleton that routes sidecar events to the agent store.
- Maximum 4 active xterm.js instances to avoid WebKit2GTK memory issues.

## Memora Tags

Project tag: `bterminal`
Common tag combinations: `bterminal,architecture`, `bterminal,research`, `bterminal,tech-stack`

## Operational Rules

All operational rules live in `.claude/rules/`. Every `.md` file in that directory is automatically loaded at session start by Claude Code with the same priority as this file.

### Rule Index

| # | File | Scope |
|---|------|-------|
| 01 | `security.md` | **PARAMOUNT** — secrets, input validation, least privilege |
| 02 | `error-handling.md` | **PARAMOUNT** — handle every error visibly |
| 03 | `environment-safety.md` | **PARAMOUNT** — verify target, data safety, K8s isolation, cleanup |
| 04 | `communication.md` | Stop on ambiguity, scope discipline |
| 05 | `git-practices.md` | Conventional commits, authorship |
| 06 | `testing.md` | TDD, unit tests, E2E tests |
| 07 | `documentation.md` | README, CLAUDE.md sync, docs/ |
| 08 | `branch-hygiene.md` | Branches, naming, clean state before refactors |
| 09 | `dependency-discipline.md` | No deps without consent |
| 10 | `code-consistency.md` | Match existing patterns |
| 11 | `api-contracts.md` | Contract-first, flag breaking changes (path-conditional) |
| 12 | `performance-awareness.md` | No N+1, no unbounded fetches (path-conditional) |
| 13 | `logging-observability.md` | Structured logging, OTEL (path-conditional) |
| 14 | `resilience-and-config.md` | Timeouts, circuit breakers, externalized config (path-conditional) |
| 15 | `memora.md` | Persistent memory across sessions |
| 16 | `sub-agents.md` | When to use sub-agents and team agents |
| 17 | `document-imports.md` | Resolve @ imports in CLAUDE.md before acting |
