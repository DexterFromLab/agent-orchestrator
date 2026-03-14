/**
 * btmsg bridge — reads btmsg SQLite database for agent notifications.
 * Used by GroupAgentsPanel to show unread counts and agent statuses.
 * Polls the database periodically for new messages.
 */

import { invoke } from '@tauri-apps/api/core';
import type { GroupId, AgentId } from '../types/ids';

export interface BtmsgAgent {
  id: AgentId;
  name: string;
  role: string;
  groupId: GroupId;
  tier: number;
  model: string | null;
  status: string;
  unreadCount: number;
}

export interface BtmsgMessage {
  id: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  content: string;
  read: boolean;
  replyTo: string | null;
  createdAt: string;
  senderName?: string;
  senderRole?: string;
}

export interface BtmsgFeedMessage {
  id: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  content: string;
  createdAt: string;
  replyTo: string | null;
  senderName: string;
  senderRole: string;
  recipientName: string;
  recipientRole: string;
}

export interface BtmsgChannel {
  id: string;
  name: string;
  groupId: GroupId;
  createdBy: AgentId;
  memberCount: number;
  createdAt: string;
}

export interface BtmsgChannelMessage {
  id: string;
  channelId: string;
  fromAgent: AgentId;
  content: string;
  createdAt: string;
  senderName: string;
  senderRole: string;
}

/**
 * Get all agents in a group with their unread counts.
 */
export async function getGroupAgents(groupId: GroupId): Promise<BtmsgAgent[]> {
  return invoke('btmsg_get_agents', { groupId });
}

/**
 * Get unread message count for an agent.
 */
export async function getUnreadCount(agentId: AgentId): Promise<number> {
  return invoke('btmsg_unread_count', { agentId });
}

/**
 * Get unread messages for an agent.
 */
export async function getUnreadMessages(agentId: AgentId): Promise<BtmsgMessage[]> {
  return invoke('btmsg_unread_messages', { agentId });
}

/**
 * Get conversation history between two agents.
 */
export async function getHistory(agentId: AgentId, otherId: AgentId, limit: number = 20): Promise<BtmsgMessage[]> {
  return invoke('btmsg_history', { agentId, otherId, limit });
}

/**
 * Send a message from one agent to another.
 */
export async function sendMessage(fromAgent: AgentId, toAgent: AgentId, content: string): Promise<string> {
  return invoke('btmsg_send', { fromAgent, toAgent, content });
}

/**
 * Update agent status (active/sleeping/stopped).
 */
export async function setAgentStatus(agentId: AgentId, status: string): Promise<void> {
  return invoke('btmsg_set_status', { agentId, status });
}

/**
 * Ensure admin agent exists with contacts to all agents.
 */
export async function ensureAdmin(groupId: GroupId): Promise<void> {
  return invoke('btmsg_ensure_admin', { groupId });
}

/**
 * Get all messages in group (admin global feed).
 */
export async function getAllFeed(groupId: GroupId, limit: number = 100): Promise<BtmsgFeedMessage[]> {
  return invoke('btmsg_all_feed', { groupId, limit });
}

/**
 * Mark all messages from sender to reader as read.
 */
export async function markRead(readerId: AgentId, senderId: AgentId): Promise<void> {
  return invoke('btmsg_mark_read', { readerId, senderId });
}

/**
 * Get channels in a group.
 */
export async function getChannels(groupId: GroupId): Promise<BtmsgChannel[]> {
  return invoke('btmsg_get_channels', { groupId });
}

/**
 * Get messages in a channel.
 */
export async function getChannelMessages(channelId: string, limit: number = 100): Promise<BtmsgChannelMessage[]> {
  return invoke('btmsg_channel_messages', { channelId, limit });
}

/**
 * Send a message to a channel.
 */
export async function sendChannelMessage(channelId: string, fromAgent: AgentId, content: string): Promise<string> {
  return invoke('btmsg_channel_send', { channelId, fromAgent, content });
}

/**
 * Create a new channel.
 */
export async function createChannel(name: string, groupId: GroupId, createdBy: AgentId): Promise<string> {
  return invoke('btmsg_create_channel', { name, groupId, createdBy });
}

/**
 * Add a member to a channel.
 */
export async function addChannelMember(channelId: string, agentId: AgentId): Promise<void> {
  return invoke('btmsg_add_channel_member', { channelId, agentId });
}

/**
 * Register all agents from groups config into the btmsg database.
 * Creates/updates agent records, sets up contact permissions, ensures review channels.
 * Should be called whenever groups are loaded or switched.
 */
export async function registerAgents(config: import('../types/groups').GroupsFile): Promise<void> {
  return invoke('btmsg_register_agents', { config });
}

// ---- Per-message acknowledgment (seen_messages) ----

/**
 * Get messages not yet seen by this session (per-session tracking).
 */
export async function getUnseenMessages(agentId: AgentId, sessionId: string): Promise<BtmsgMessage[]> {
  return invoke('btmsg_unseen_messages', { agentId, sessionId });
}

/**
 * Mark specific message IDs as seen by this session.
 */
export async function markMessagesSeen(sessionId: string, messageIds: string[]): Promise<void> {
  return invoke('btmsg_mark_seen', { sessionId, messageIds });
}

/**
 * Prune old seen_messages entries (7-day default, emergency 3-day at 200k rows).
 */
export async function pruneSeen(): Promise<number> {
  return invoke('btmsg_prune_seen');
}

// ---- Heartbeat monitoring ----

/**
 * Record a heartbeat for an agent (upserts timestamp).
 */
export async function recordHeartbeat(agentId: AgentId): Promise<void> {
  return invoke('btmsg_record_heartbeat', { agentId });
}

/**
 * Get stale agents in a group (no heartbeat within threshold).
 */
export async function getStaleAgents(groupId: GroupId, thresholdSecs: number = 300): Promise<string[]> {
  return invoke('btmsg_get_stale_agents', { groupId, thresholdSecs });
}

// ---- Dead letter queue ----

export interface DeadLetter {
  id: number;
  fromAgent: string;
  toAgent: string;
  content: string;
  error: string;
  createdAt: string;
}

/**
 * Get dead letter queue entries for a group.
 */
export async function getDeadLetters(groupId: GroupId, limit: number = 50): Promise<DeadLetter[]> {
  return invoke('btmsg_get_dead_letters', { groupId, limit });
}

/**
 * Clear all dead letters for a group.
 */
export async function clearDeadLetters(groupId: GroupId): Promise<void> {
  return invoke('btmsg_clear_dead_letters', { groupId });
}
