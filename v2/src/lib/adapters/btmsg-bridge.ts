/**
 * btmsg bridge — reads btmsg SQLite database for agent notifications.
 * Used by GroupAgentsPanel to show unread counts and agent statuses.
 * Polls the database periodically for new messages.
 */

import { invoke } from '@tauri-apps/api/core';

export interface BtmsgAgent {
  id: string;
  name: string;
  role: string;
  group_id: string;
  tier: number;
  model: string | null;
  status: string;
  unread_count: number;
}

export interface BtmsgMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  content: string;
  read: boolean;
  reply_to: string | null;
  created_at: string;
  sender_name?: string;
  sender_role?: string;
}

/**
 * Get all agents in a group with their unread counts.
 */
export async function getGroupAgents(groupId: string): Promise<BtmsgAgent[]> {
  return invoke('btmsg_get_agents', { groupId });
}

/**
 * Get unread message count for an agent.
 */
export async function getUnreadCount(agentId: string): Promise<number> {
  return invoke('btmsg_unread_count', { agentId });
}

/**
 * Get unread messages for an agent.
 */
export async function getUnreadMessages(agentId: string): Promise<BtmsgMessage[]> {
  return invoke('btmsg_unread_messages', { agentId });
}

/**
 * Get conversation history between two agents.
 */
export async function getHistory(agentId: string, otherId: string, limit: number = 20): Promise<BtmsgMessage[]> {
  return invoke('btmsg_history', { agentId, otherId, limit });
}

/**
 * Send a message from one agent to another.
 */
export async function sendMessage(fromAgent: string, toAgent: string, content: string): Promise<string> {
  return invoke('btmsg_send', { fromAgent, toAgent, content });
}

/**
 * Update agent status (active/sleeping/stopped).
 */
export async function setAgentStatus(agentId: string, status: string): Promise<void> {
  return invoke('btmsg_set_status', { agentId, status });
}
