# BTerminal — Claude Behavioral Guide

## Workflow

- v1 is a single-file Python app (`bterminal.py`). Changes are localized.
- v2 planning docs are in `docs/`. Architecture decisions are in `docs/task_plan.md`.
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
- Claude Agent SDK is 0.2.x (pre-1.0) — all SDK interactions go through the adapter layer (`src/lib/adapters/sdk-messages.ts`).
- Node.js sidecar communicates via stdio NDJSON, not sockets.
- Maximum 4 active xterm.js instances to avoid WebKit2GTK memory issues.

## Memora Tags

Project tag: `bterminal`
Common tag combinations: `bterminal,architecture`, `bterminal,research`, `bterminal,tech-stack`
