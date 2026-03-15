import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionId, ProjectId } from '../types/ids';
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

// Test helpers — branded IDs
const P1 = ProjectId('proj-1');
const P2 = ProjectId('proj-2');
const SA = SessionId('sess-a');
const SB = SessionId('sess-b');
const SC = SessionId('sess-c');
const SD = SessionId('sess-d');

beforeEach(() => {
  clearAllConflicts();
});

describe('conflicts store', () => {
  describe('recordFileWrite', () => {
    it('returns false for first write to a file', () => {
      expect(recordFileWrite(P1, SA, '/src/main.ts')).toBe(false);
    });

    it('returns false for same session writing same file again', () => {
      recordFileWrite(P1, SA, '/src/main.ts');
      expect(recordFileWrite(P1, SA, '/src/main.ts')).toBe(false);
    });

    it('returns true when a second session writes same file (new conflict)', () => {
      recordFileWrite(P1, SA, '/src/main.ts');
      expect(recordFileWrite(P1, SB, '/src/main.ts')).toBe(true);
    });

    it('returns false when third session writes already-conflicted file', () => {
      recordFileWrite(P1, SA, '/src/main.ts');
      recordFileWrite(P1, SB, '/src/main.ts');
      expect(recordFileWrite(P1, SC, '/src/main.ts')).toBe(false);
    });

    it('tracks writes per project independently', () => {
      recordFileWrite(P1, SA, '/src/main.ts');
      expect(recordFileWrite(P2, SB, '/src/main.ts')).toBe(false);
    });
  });

  describe('getProjectConflicts', () => {
    it('returns empty for unknown project', () => {
      const result = getProjectConflicts(ProjectId('nonexistent'));
      expect(result.conflicts).toEqual([]);
      expect(result.conflictCount).toBe(0);
    });

    it('returns empty when no overlapping writes', () => {
      recordFileWrite(P1, SA, '/src/a.ts');
      recordFileWrite(P1, SB, '/src/b.ts');
      const result = getProjectConflicts(P1);
      expect(result.conflicts).toEqual([]);
      expect(result.conflictCount).toBe(0);
    });

    it('returns conflict when two sessions write same file', () => {
      recordFileWrite(P1, SA, '/src/main.ts');
      recordFileWrite(P1, SB, '/src/main.ts');
      const result = getProjectConflicts(P1);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts[0].filePath).toBe('/src/main.ts');
      expect(result.conflicts[0].shortName).toBe('main.ts');
      expect(result.conflicts[0].sessionIds).toContain(SA);
      expect(result.conflicts[0].sessionIds).toContain(SB);
    });

    it('returns multiple conflicts sorted by recency', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/old.ts');
      recordFileWrite(P1, SB, '/src/old.ts');
      vi.setSystemTime(2000);
      recordFileWrite(P1, SA, '/src/new.ts');
      recordFileWrite(P1, SB, '/src/new.ts');
      const result = getProjectConflicts(P1);
      expect(result.conflictCount).toBe(2);
      // Most recent first
      expect(result.conflicts[0].filePath).toBe('/src/new.ts');
      vi.useRealTimers();
    });
  });

  describe('hasConflicts', () => {
    it('returns false for unknown project', () => {
      expect(hasConflicts(ProjectId('nonexistent'))).toBe(false);
    });

    it('returns false with no overlapping writes', () => {
      recordFileWrite(P1, SA, '/src/a.ts');
      expect(hasConflicts(P1)).toBe(false);
    });

    it('returns true with overlapping writes', () => {
      recordFileWrite(P1, SA, '/src/a.ts');
      recordFileWrite(P1, SB, '/src/a.ts');
      expect(hasConflicts(P1)).toBe(true);
    });
  });

  describe('getTotalConflictCount', () => {
    it('returns 0 with no conflicts', () => {
      expect(getTotalConflictCount()).toBe(0);
    });

    it('counts conflicts across projects', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      recordFileWrite(P2, SC, '/b.ts');
      recordFileWrite(P2, SD, '/b.ts');
      expect(getTotalConflictCount()).toBe(2);
    });
  });

  describe('clearSessionWrites', () => {
    it('removes session from file write tracking', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
      clearSessionWrites(P1, SB);
      expect(hasConflicts(P1)).toBe(false);
    });

    it('cleans up empty entries', () => {
      recordFileWrite(P1, SA, '/a.ts');
      clearSessionWrites(P1, SA);
      expect(getProjectConflicts(P1).conflictCount).toBe(0);
    });

    it('no-ops for unknown project', () => {
      clearSessionWrites(ProjectId('nonexistent'), SA); // Should not throw
    });
  });

  describe('clearProjectConflicts', () => {
    it('clears all tracking for a project', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      clearProjectConflicts(P1);
      expect(hasConflicts(P1)).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
    });
  });

  describe('clearAllConflicts', () => {
    it('clears everything', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      recordFileWrite(P2, SC, '/b.ts');
      recordFileWrite(P2, SD, '/b.ts');
      clearAllConflicts();
      expect(getTotalConflictCount()).toBe(0);
    });
  });

  describe('acknowledgeConflicts', () => {
    it('suppresses conflict from counts after acknowledge', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
      acknowledgeConflicts(P1);
      expect(hasConflicts(P1)).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
      expect(getProjectConflicts(P1).conflictCount).toBe(0);
    });

    it('resurfaces conflict when new write arrives on acknowledged file', () => {
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      acknowledgeConflicts(P1);
      expect(hasConflicts(P1)).toBe(false);
      // Third session writes same file — should resurface
      recordFileWrite(P1, SC, '/a.ts');
      // recordFileWrite returns false for already-conflicted file, but the ack should be cleared
      expect(hasConflicts(P1)).toBe(true);
    });

    it('no-ops for unknown project', () => {
      acknowledgeConflicts(ProjectId('nonexistent')); // Should not throw
    });
  });

  describe('worktree suppression', () => {
    it('suppresses conflict between sessions in different worktrees', () => {
      setSessionWorktree(SA, null); // main tree
      setSessionWorktree(SB, '/tmp/wt-1'); // worktree
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(false);
      expect(getTotalConflictCount()).toBe(0);
    });

    it('detects conflict between sessions in same worktree', () => {
      setSessionWorktree(SA, '/tmp/wt-1');
      setSessionWorktree(SB, '/tmp/wt-1');
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
    });

    it('detects conflict between sessions both in main tree', () => {
      setSessionWorktree(SA, null);
      setSessionWorktree(SB, null);
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
    });

    it('suppresses conflict when two worktrees differ', () => {
      setSessionWorktree(SA, '/tmp/wt-1');
      setSessionWorktree(SB, '/tmp/wt-2');
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(false);
    });

    it('sessions without worktree info conflict normally (backward compat)', () => {
      // No setSessionWorktree calls — both default to null (main tree)
      recordFileWrite(P1, SA, '/a.ts');
      recordFileWrite(P1, SB, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
    });

    it('clearSessionWrites cleans up worktree tracking', () => {
      setSessionWorktree(SA, '/tmp/wt-1');
      recordFileWrite(P1, SA, '/a.ts');
      clearSessionWrites(P1, SA);
      // Subsequent session in main tree should not be compared against stale wt data
      recordFileWrite(P1, SB, '/a.ts');
      recordFileWrite(P1, SC, '/a.ts');
      expect(hasConflicts(P1)).toBe(true);
    });
  });

  describe('external write detection (S-1 Phase 2)', () => {
    it('suppresses external write within grace period after agent write', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/main.ts');
      // External write arrives 500ms later — within 2s grace period
      vi.setSystemTime(1500);
      const result = recordExternalWrite(P1, '/src/main.ts', 1500);
      expect(result).toBe(false);
      expect(getExternalConflictCount(P1)).toBe(0);
      vi.useRealTimers();
    });

    it('detects external write outside grace period', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/main.ts');
      // External write arrives 3s later — outside 2s grace period
      vi.setSystemTime(4000);
      const result = recordExternalWrite(P1, '/src/main.ts', 4000);
      expect(result).toBe(true);
      expect(getExternalConflictCount(P1)).toBe(1);
      vi.useRealTimers();
    });

    it('ignores external write to file no agent has written', () => {
      recordFileWrite(P1, SA, '/src/other.ts');
      const result = recordExternalWrite(P1, '/src/unrelated.ts', Date.now());
      expect(result).toBe(false);
    });

    it('ignores external write for project with no agent writes', () => {
      const result = recordExternalWrite(P1, '/src/main.ts', Date.now());
      expect(result).toBe(false);
    });

    it('marks conflict as external in getProjectConflicts', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/main.ts');
      vi.setSystemTime(4000);
      recordExternalWrite(P1, '/src/main.ts', 4000);
      const result = getProjectConflicts(P1);
      expect(result.conflictCount).toBe(1);
      expect(result.externalConflictCount).toBe(1);
      expect(result.conflicts[0].isExternal).toBe(true);
      expect(result.conflicts[0].sessionIds).toContain(EXTERNAL_SESSION_ID);
      vi.useRealTimers();
    });

    it('external conflicts can be acknowledged', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/main.ts');
      vi.setSystemTime(4000);
      recordExternalWrite(P1, '/src/main.ts', 4000);
      expect(hasConflicts(P1)).toBe(true);
      acknowledgeConflicts(P1);
      expect(hasConflicts(P1)).toBe(false);
      expect(getExternalConflictCount(P1)).toBe(0);
      vi.useRealTimers();
    });

    it('clearAllConflicts clears external write timestamps', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/main.ts');
      clearAllConflicts();
      // After clearing, external writes should not create conflicts (no agent writes tracked)
      vi.setSystemTime(4000);
      const result = recordExternalWrite(P1, '/src/main.ts', 4000);
      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('external conflict coexists with agent-agent conflict', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      recordFileWrite(P1, SA, '/src/agent.ts');
      recordFileWrite(P1, SB, '/src/agent.ts');
      recordFileWrite(P1, SA, '/src/ext.ts');
      vi.setSystemTime(4000);
      recordExternalWrite(P1, '/src/ext.ts', 4000);
      const result = getProjectConflicts(P1);
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
