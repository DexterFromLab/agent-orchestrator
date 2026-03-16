# Agent Orchestrator — TODO

## Multi-Machine (v3.1)

- [ ] **Real-world relay testing** — TLS added, code complete in bridges/stores. Needs 2-machine test to verify relay + RemoteManager end-to-end. Multi-machine UI not yet surfaced in v3 ProjectBox.
- [ ] **SPKI pin persistence** — TOFU pinning implemented (probe_spki_hash + in-memory pin store in RemoteManager), but pins are lost on restart. Persist to groups.json or separate config file.

## Multi-Agent (v3.1)

- [ ] **Agent Teams real-world testing** — Subagent delegation prompt + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env injection done. Needs real multi-agent session to verify Manager spawns child agents via SDK teams.

## Reliability

- [ ] **Soak test** — Run 4-hour soak with 6+ agents across 3+ projects. Monitor: memory growth, SQLite WAL size, xterm.js instance count, sidecar supervisor restarts.
- [ ] **WebKit2GTK Worker verification** — Verify Web Worker Blob URL approach works in Tauri's WebKit2GTK webview (tested in vitest only so far).

## Completed

- [x] Plugin sandbox migration — new Function() → Web Worker isolation, 26 tests | Done: 2026-03-15
- [x] seen_messages startup pruning — pruneSeen() on app startup, fire-and-forget | Done: 2026-03-15
- [x] Tribunal priorities: Aider security, SidecarManager actor, SPKI pinning, btmsg reliability, Aider tests | Done: 2026-03-14
- [x] Dead code cleanup — 7 warnings resolved, 4 new Tauri commands wired | Done: 2026-03-14
- [x] E2E fixture + judge hardening | Done: 2026-03-12
- [x] LLM judge refactor + E2E docs | Done: 2026-03-12
- [x] v3 Hardening Sprint (TLS, WAL, Landlock, plugin tests, Phase C E2E) | Done: 2026-03-12
- [x] v3 Production Readiness — all 13 tribunal items | Done: 2026-03-12
- [x] Unified test runner + testing gate rule | Done: 2026-03-12
- [x] E2E Phase B + 27 test fixes | Done: 2026-03-12
