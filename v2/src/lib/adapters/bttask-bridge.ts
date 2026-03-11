// bttask Bridge — Tauri IPC adapter for task board

import { invoke } from '@tauri-apps/api/core';
import type { GroupId, AgentId } from '../types/ids';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'progress' | 'review' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: AgentId | null;
  createdBy: AgentId;
  groupId: GroupId;
  parentTaskId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  agentId: AgentId;
  content: string;
  createdAt: string;
}

export async function listTasks(groupId: GroupId): Promise<Task[]> {
  return invoke<Task[]>('bttask_list', { groupId });
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  return invoke<TaskComment[]>('bttask_comments', { taskId });
}

export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  return invoke('bttask_update_status', { taskId, status });
}

export async function addTaskComment(taskId: string, agentId: AgentId, content: string): Promise<string> {
  return invoke<string>('bttask_add_comment', { taskId, agentId, content });
}

export async function createTask(
  title: string,
  description: string,
  priority: string,
  groupId: GroupId,
  createdBy: AgentId,
  assignedTo?: AgentId,
): Promise<string> {
  return invoke<string>('bttask_create', { title, description, priority, groupId, createdBy, assignedTo });
}

export async function deleteTask(taskId: string): Promise<void> {
  return invoke('bttask_delete', { taskId });
}
