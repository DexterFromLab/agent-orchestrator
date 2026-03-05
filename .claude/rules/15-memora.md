# Memora Memory

Use Memora proactively for persistent memory across sessions. Full instructions are in the global `~/.claude/CLAUDE.md` and `~/.claude/docs/memora-guide.md`.

## Key Behaviors

- **Session start:** Query existing project context via `memory_semantic_search` + `memory_list`. Follow connections — navigate the graph.
- **During work:** Create granular memories (one per concept, not per session). Link related memories deliberately. Update existing memories instead of creating duplicates.
- **Session end:** Capture all significant learnings. Create issues for bugs found, TODOs for incomplete work. Verify new memories are connected to existing ones.

## Every Memory Must Have

1. **Tags** — project identifier first, then topic tags.
2. **Hierarchy metadata** — places the memory in the knowledge graph.
3. **Links** — explicit connections to related memories.
4. **Sufficient granularity** — specific enough to be actionable, with file paths and function names.
