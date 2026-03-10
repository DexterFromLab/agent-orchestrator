import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordFileWrite,
  recordExternalWrite,
  getProjectConflicts,
  getExternalConflictCount,
  hasConflicts,
  getTotalConflictCount,
  clearSessionWrites,
  clearProjectConflicts,
  clearAllConflicts,
  acknowledgeConflicts,
  setSessionWorktree,
  EXTERNAL_SESSION_ID,
} from './conflicts.svelte';

beforeEach(() => {
  clearAllConflicts();
});

describe('conflicts store', () => {
  describe('recordFileWrite', () => {
    it('returns false for first write to a file', () => {
      expect(recordFileWrite('proj-1', 'sess-a', '/src/main.ts')).toBe(false);
    });

    it('returns false for same session writing same file again', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      expect(recordFileWrite('proj-1', 'sess-a', '/src/main.ts')).toBe(false);
    });

    it('returns true when a second session writes same file (new conflict)', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      expect(recordFileWrite('proj-1', 'sess-b', '/src/main.ts')).toBe(true);
    });

    it('returns false when third session writes already-conflicted file', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/main.ts');
      expect(recordFileWrite('proj-1', 'sess-c', '/src/main.ts')).toBe(false);
    });

    it('tracks writes per project independently', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      expect(recordFileWrite('proj-2', 'sess-b', '/src/main.ts')).toBe(false);
    });
  });

  describe('getProjectConflicts', () => {
    it('returns empty for unknown project', () => {
      const result = getProjectConflicts('nonexistent');
      expect(result.conflicts).toEqual([]);
      expect(result.conflictCount).toBe(0);
    });

    it('returns empty when no overlapping writes', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/b.ts');
      const result = getProjectConflicts('proj-1');
      expect(result.conflicts).toEqual([]);
      expect(result.conflictCount).toBe(0);
    });

    it('returns conflict when two sessions write same file', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/main.ts');
      const result = getProjectConflicts('proj-1');
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts[0].filePath).toBe('/src/main.ts');
      expect(result.conflicts[0].shortName).toBe('main.ts');
      expect(result.conflicts[0].sessionIds).toContain('sess-a');
      expect(result.conflicts[0].sessionIds).toContain('sess-b');
    });

    it('returns multiple conflicts sorted by recency', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/old.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/old.ts');
      vi.setSystemTime(2000);
      recordFileWrite('proj-1', 'sess-a', '/src/new.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/new.ts');
      const result = getProjectConflicts('proj-1');
      expect(result.conflictCount).toBe(2);
      // Most recent first
      expect(result.conflicts[0].filePath).toBe('/src/new.ts');
      vi.useRealTimers();
    });
  });

  describe('hasConflicts', () => {
    it('returns false for unknown project', () => {
      expect(hasConflicts('nonexistent')).toBe(false);
    });

    it('returns false with no overlapping writes', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/a.ts');
      expect(hasConflicts('proj-1')).toBe(false);
    });

    it('returns true with overlapping writes', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
    });
  });

  describe('getTotalConflictCount', () => {
    it('returns 0 with no conflicts', () => {
      expect(getTotalConflictCount()).toBe(0);
    });

    it('counts conflicts across projects', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      recordFileWrite('proj-2', 'sess-c', '/b.ts');
      recordFileWrite('proj-2', 'sess-d', '/b.ts');
      expect(getTotalConflictCount()).toBe(2);
    });
  });

  describe('clearSessionWrites', () => {
    it('removes session from file write tracking', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
      clearSessionWrites('proj-1', 'sess-b');
      expect(hasConflicts('proj-1')).toBe(false);
    });

    it('cleans up empty entries', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      clearSessionWrites('proj-1', 'sess-a');
      expect(getProjectConflicts('proj-1').conflictCount).toBe(0);
    });

    it('no-ops for unknown project', () => {
      clearSessionWrites('nonexistent', 'sess-a'); // Should not throw
    });
  });

  describe('clearProjectConflicts', () => {
    it('clears all tracking for a project', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      clearProjectConflicts('proj-1');
      expect(hasConflicts('proj-1')).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
    });
  });

  describe('clearAllConflicts', () => {
    it('clears everything', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      recordFileWrite('proj-2', 'sess-c', '/b.ts');
      recordFileWrite('proj-2', 'sess-d', '/b.ts');
      clearAllConflicts();
      expect(getTotalConflictCount()).toBe(0);
    });
  });

  describe('acknowledgeConflicts', () => {
    it('suppresses conflict from counts after acknowledge', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
      acknowledgeConflicts('proj-1');
      expect(hasConflicts('proj-1')).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
      expect(getProjectConflicts('proj-1').conflictCount).toBe(0);
    });

    it('resurfaces conflict when new write arrives on acknowledged file', () => {
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      acknowledgeConflicts('proj-1');
      expect(hasConflicts('proj-1')).toBe(false);
      // Third session writes same file — should resurface
      recordFileWrite('proj-1', 'sess-c', '/a.ts');
      // recordFileWrite returns false for already-conflicted file, but the ack should be cleared
      expect(hasConflicts('proj-1')).toBe(true);
    });

    it('no-ops for unknown project', () => {
      acknowledgeConflicts('nonexistent'); // Should not throw
    });
  });

  describe('worktree suppression', () => {
    it('suppresses conflict between sessions in different worktrees', () => {
      setSessionWorktree('sess-a', null); // main tree
      setSessionWorktree('sess-b', '/tmp/wt-1'); // worktree
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
    });

    it('detects conflict between sessions in same worktree', () => {
      setSessionWorktree('sess-a', '/tmp/wt-1');
      setSessionWorktree('sess-b', '/tmp/wt-1');
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
    });

    it('detects conflict between sessions both in main tree', () => {
      setSessionWorktree('sess-a', null);
      setSessionWorktree('sess-b', null);
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
    });

    it('suppresses conflict when two worktrees differ', () => {
      setSessionWorktree('sess-a', '/tmp/wt-1');
      setSessionWorktree('sess-b', '/tmp/wt-2');
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(false);
    });

    it('sessions without worktree info conflict normally (backward compat)', () => {
      // No setSessionWorktree calls — both default to null (main tree)
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
    });

    it('clearSessionWrites cleans up worktree tracking', () => {
      setSessionWorktree('sess-a', '/tmp/wt-1');
      recordFileWrite('proj-1', 'sess-a', '/a.ts');
      clearSessionWrites('proj-1', 'sess-a');
      // Subsequent session in main tree should not be compared against stale wt data
      recordFileWrite('proj-1', 'sess-b', '/a.ts');
      recordFileWrite('proj-1', 'sess-c', '/a.ts');
      expect(hasConflicts('proj-1')).toBe(true);
    });
  });

  describe('external write detection (S-1 Phase 2)', () => {
    it('suppresses external write within grace period after agent write', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      // External write arrives 500ms later — within 2s grace period
      vi.setSystemTime(1500);
      const result = recordExternalWrite('proj-1', '/src/main.ts', 1500);
      expect(result).toBe(false);
      expect(getExternalConflictCount('proj-1')).toBe(0);
      vi.useRealTimers();
    });

    it('detects external write outside grace period', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      // External write arrives 3s later — outside 2s grace period
      vi.setSystemTime(4000);
      const result = recordExternalWrite('proj-1', '/src/main.ts', 4000);
      expect(result).toBe(true);
      expect(getExternalConflictCount('proj-1')).toBe(1);
      vi.useRealTimers();
    });

    it('ignores external write to file no agent has written', () => {
      recordFileWrite('proj-1', 'sess-a', '/src/other.ts');
      const result = recordExternalWrite('proj-1', '/src/unrelated.ts', Date.now());
      expect(result).toBe(false);
    });

    it('ignores external write for project with no agent writes', () => {
      const result = recordExternalWrite('proj-1', '/src/main.ts', Date.now());
      expect(result).toBe(false);
    });

    it('marks conflict as external in getProjectConflicts', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      vi.setSystemTime(4000);
      recordExternalWrite('proj-1', '/src/main.ts', 4000);
      const result = getProjectConflicts('proj-1');
      expect(result.conflictCount).toBe(1);
      expect(result.externalConflictCount).toBe(1);
      expect(result.conflicts[0].isExternal).toBe(true);
      expect(result.conflicts[0].sessionIds).toContain(EXTERNAL_SESSION_ID);
      vi.useRealTimers();
    });

    it('external conflicts can be acknowledged', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      vi.setSystemTime(4000);
      recordExternalWrite('proj-1', '/src/main.ts', 4000);
      expect(hasConflicts('proj-1')).toBe(true);
      acknowledgeConflicts('proj-1');
      expect(hasConflicts('proj-1')).toBe(false);
      expect(getExternalConflictCount('proj-1')).toBe(0);
      vi.useRealTimers();
    });

    it('clearAllConflicts clears external write timestamps', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/main.ts');
      clearAllConflicts();
      // After clearing, external writes should not create conflicts (no agent writes tracked)
      vi.setSystemTime(4000);
      const result = recordExternalWrite('proj-1', '/src/main.ts', 4000);
      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('external conflict coexists with agent-agent conflict', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite('proj-1', 'sess-a', '/src/agent.ts');
      recordFileWrite('proj-1', 'sess-b', '/src/agent.ts');
      recordFileWrite('proj-1', 'sess-a', '/src/ext.ts');
      vi.setSystemTime(4000);
      recordExternalWrite('proj-1', '/src/ext.ts', 4000);
      const result = getProjectConflicts('proj-1');
      expect(result.conflictCount).toBe(2);
      expect(result.externalConflictCount).toBe(1);
      const extConflict = result.conflicts.find(c => c.isExternal);
      const agentConflict = result.conflicts.find(c => !c.isExternal);
      expect(extConflict?.filePath).toBe('/src/ext.ts');
      expect(agentConflict?.filePath).toBe('/src/agent.ts');
      vi.useRealTimers();
    });
  });
});
