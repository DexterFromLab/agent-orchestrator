# Agent Orchestrator — TODO

## Multi-Machine (v3.1)

- [ ] **Real-world relay testing** — TLS added, code complete in bridges/stores. Needs 2-machine test to verify relay + RemoteManager end-to-end. Multi-machine UI not yet surfaced in v3 ProjectBox.
- [ ] **SPKI pin persistence** — TOFU pinning implemented (probe_spki_hash + in-memory pin store in RemoteManager), but pins are lost on restart. Persist to groups.json or separate config file.

## Multi-Agent (v3.1)

- [ ] **Agent Teams real-world testing** — Subagent delegation prompt + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env injection done. Needs real multi-agent session to verify Manager spawns child agents via SDK teams.
- [ ] **seen_messages periodic pruning** — `btmsg_prune_seen` command exists but no scheduler calls it. Wire to a periodic timer (e.g., every 6 hours) to prevent unbounded growth.

## Security (v3.2)

- [ ] **Plugin sandbox migration** — Current `new Function()` sandbox has escape vectors (prototype walking, `arguments.callee.constructor`). Migrate to Web Worker isolation for true process-level sandboxing.

## Reliability

- [ ] **Soak test** — Run 4-hour soak with 6+ agents across 3+ projects. Monitor: memory growth, SQLite WAL size, xterm.js instance count, sidecar supervisor restarts.

## Completed

- [x] Tribunal priorities: Aider security, SidecarManager actor, SPKI pinning, btmsg reliability, Aider tests | Done: 2026-03-14
- [x] Dead code cleanup — 7 warnings resolved, 4 new Tauri commands wired | Done: 2026-03-14
- [x] E2E fixture + judge hardening | Done: 2026-03-12
- [x] LLM judge refactor + E2E docs | Done: 2026-03-12
- [x] v3 Hardening Sprint (TLS, WAL, Landlock, plugin tests, Phase C E2E) | Done: 2026-03-12
- [x] v3 Production Readiness — all 13 tribunal items | Done: 2026-03-12
- [x] Unified test runner + testing gate rule | Done: 2026-03-12
- [x] E2E Phase B + 27 test fixes | Done: 2026-03-12
- [x] Reviewer agent role | Done: 2026-03-12
- [x] Auto-wake Manager scheduler | Done: 2026-03-12
- [x] Dashboard metrics panel | Done: 2026-03-12
- [x] Branded types (GroupId, AgentId, SessionId, ProjectId) | Done: 2026-03-11
- [x] Regression tests + sidecar env security | Done: 2026-03-11
- [x] Integration fix (btmsg column, camelCase, PlantUML, Tauri 2.x assets) | Done: 2026-03-11
