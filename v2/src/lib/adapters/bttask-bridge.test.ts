import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import {
  listTasks,
  getTaskComments,
  updateTaskStatus,
  addTaskComment,
  createTask,
  deleteTask,
  type Task,
  type TaskComment,
} from './bttask-bridge';
import { GroupId, AgentId } from '../types/ids';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bttask-bridge', () => {
  // ---- REGRESSION: camelCase field names ----

  describe('Task camelCase fields', () => {
    it('receives camelCase fields from Rust backend', async () => {
      const task: Task = {
        id: 't1',
        title: 'Fix bug',
        description: 'Critical fix',
        status: 'progress',
        priority: 'high',
        assignedTo: AgentId('a1'),        // was: assigned_to
        createdBy: AgentId('admin'),      // was: created_by
        groupId: GroupId('g1'),           // was: group_id
        parentTaskId: null,      // was: parent_task_id
        sortOrder: 1,            // was: sort_order
        createdAt: '2026-01-01', // was: created_at
        updatedAt: '2026-01-01', // was: updated_at
      };
      mockInvoke.mockResolvedValue([task]);

      const result = await listTasks(GroupId('g1'));

      expect(result).toHaveLength(1);
      expect(result[0].assignedTo).toBe('a1');
      expect(result[0].createdBy).toBe('admin');
      expect(result[0].groupId).toBe('g1');
      expect(result[0].parentTaskId).toBeNull();
      expect(result[0].sortOrder).toBe(1);
      // Verify no snake_case leaks
      expect((result[0] as Record<string, unknown>)['assigned_to']).toBeUndefined();
      expect((result[0] as Record<string, unknown>)['created_by']).toBeUndefined();
      expect((result[0] as Record<string, unknown>)['group_id']).toBeUndefined();
    });
  });

  describe('TaskComment camelCase fields', () => {
    it('receives camelCase fields from Rust backend', async () => {
      const comment: TaskComment = {
        id: 'c1',
        taskId: 't1',           // was: task_id
        agentId: AgentId('a1'),          // was: agent_id
        content: 'Working on it',
        createdAt: '2026-01-01',
      };
      mockInvoke.mockResolvedValue([comment]);

      const result = await getTaskComments('t1');

      expect(result[0].taskId).toBe('t1');
      expect(result[0].agentId).toBe('a1');
      expect((result[0] as Record<string, unknown>)['task_id']).toBeUndefined();
      expect((result[0] as Record<string, unknown>)['agent_id']).toBeUndefined();
    });
  });

  // ---- IPC command name tests ----

  describe('IPC commands', () => {
    it('listTasks invokes bttask_list', async () => {
      mockInvoke.mockResolvedValue([]);
      await listTasks(GroupId('g1'));
      expect(mockInvoke).toHaveBeenCalledWith('bttask_list', { groupId: 'g1' });
    });

    it('getTaskComments invokes bttask_comments', async () => {
      mockInvoke.mockResolvedValue([]);
      await getTaskComments('t1');
      expect(mockInvoke).toHaveBeenCalledWith('bttask_comments', { taskId: 't1' });
    });

    it('updateTaskStatus invokes bttask_update_status', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await updateTaskStatus('t1', 'done');
      expect(mockInvoke).toHaveBeenCalledWith('bttask_update_status', { taskId: 't1', status: 'done' });
    });

    it('addTaskComment invokes bttask_add_comment', async () => {
      mockInvoke.mockResolvedValue('c-id');
      const result = await addTaskComment('t1', AgentId('a1'), 'Done!');
      expect(result).toBe('c-id');
      expect(mockInvoke).toHaveBeenCalledWith('bttask_add_comment', { taskId: 't1', agentId: 'a1', content: 'Done!' });
    });

    it('createTask invokes bttask_create with all fields', async () => {
      mockInvoke.mockResolvedValue('t-id');
      const result = await createTask('Fix bug', 'desc', 'high', GroupId('g1'), AgentId('admin'), AgentId('a1'));
      expect(result).toBe('t-id');
      expect(mockInvoke).toHaveBeenCalledWith('bttask_create', {
        title: 'Fix bug',
        description: 'desc',
        priority: 'high',
        groupId: 'g1',
        createdBy: 'admin',
        assignedTo: 'a1',
      });
    });

    it('createTask invokes bttask_create without assignedTo', async () => {
      mockInvoke.mockResolvedValue('t-id');
      await createTask('Add tests', '', 'medium', GroupId('g1'), AgentId('a1'));
      expect(mockInvoke).toHaveBeenCalledWith('bttask_create', {
        title: 'Add tests',
        description: '',
        priority: 'medium',
        groupId: 'g1',
        createdBy: 'a1',
        assignedTo: undefined,
      });
    });

    it('deleteTask invokes bttask_delete', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await deleteTask('t1');
      expect(mockInvoke).toHaveBeenCalledWith('bttask_delete', { taskId: 't1' });
    });
  });

  describe('error propagation', () => {
    it('propagates invoke errors', async () => {
      mockInvoke.mockRejectedValue(new Error('btmsg database not found'));
      await expect(listTasks(GroupId('g1'))).rejects.toThrow('btmsg database not found');
    });
  });
});
