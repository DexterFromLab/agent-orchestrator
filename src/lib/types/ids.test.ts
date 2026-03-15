import { describe, it, expect } from 'vitest';
import {
  SessionId, ProjectId, GroupId, AgentId,
  type SessionId as SessionIdType,
  type ProjectId as ProjectIdType,
  type GroupId as GroupIdType,
  type AgentId as AgentIdType,
} from './ids';

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

  describe('GroupId', () => {
    it('creates a GroupId from a string', () => {
      const id = GroupId('grp-abc');
      expect(id).toBe('grp-abc');
    });

    it('is usable as a Map key', () => {
      const map = new Map<GroupIdType, string>();
      const id = GroupId('grp-1');
      map.set(id, 'test-group');
      expect(map.get(id)).toBe('test-group');
    });
  });

  describe('AgentId', () => {
    it('creates an AgentId from a string', () => {
      const id = AgentId('agent-manager');
      expect(id).toBe('agent-manager');
    });

    it('is usable as a Map key', () => {
      const map = new Map<AgentIdType, number>();
      const id = AgentId('a1');
      map.set(id, 99);
      expect(map.get(id)).toBe(99);
    });

    it('equality works between two AgentIds with same value', () => {
      const a = AgentId('a1');
      const b = AgentId('a1');
      expect(a === b).toBe(true);
    });
  });

  describe('type safety (compile-time)', () => {
    it('all four types are strings at runtime', () => {
      const sid = SessionId('s1');
      const pid = ProjectId('p1');
      const gid = GroupId('g1');
      const aid = AgentId('a1');
      expect(typeof sid).toBe('string');
      expect(typeof pid).toBe('string');
      expect(typeof gid).toBe('string');
      expect(typeof aid).toBe('string');
    });
  });
});
