import { describe, it, expect } from 'vitest';
import { SessionId, ProjectId, type SessionId as SessionIdType, type ProjectId as ProjectIdType } from './ids';

describe('branded types', () => {
  describe('SessionId', () => {
    it('creates a SessionId from a string', () => {
      const id = SessionId('sess-abc-123');
      expect(id).toBe('sess-abc-123');
    });

    it('is usable as a string (template literal)', () => {
      const id = SessionId('sess-1');
      expect(`session: ${id}`).toBe('session: sess-1');
    });

    it('is usable as a Map key', () => {
      const map = new Map<SessionIdType, number>();
      const id = SessionId('sess-1');
      map.set(id, 42);
      expect(map.get(id)).toBe(42);
    });

    it('equality works between two SessionIds with same value', () => {
      const a = SessionId('sess-1');
      const b = SessionId('sess-1');
      expect(a === b).toBe(true);
    });
  });

  describe('ProjectId', () => {
    it('creates a ProjectId from a string', () => {
      const id = ProjectId('proj-xyz');
      expect(id).toBe('proj-xyz');
    });

    it('is usable as a Map key', () => {
      const map = new Map<ProjectIdType, string>();
      const id = ProjectId('proj-1');
      map.set(id, 'test-project');
      expect(map.get(id)).toBe('test-project');
    });
  });

  describe('type safety (compile-time)', () => {
    it('both types are strings at runtime', () => {
      const sid = SessionId('s1');
      const pid = ProjectId('p1');
      expect(typeof sid).toBe('string');
      expect(typeof pid).toBe('string');
    });
  });
});
