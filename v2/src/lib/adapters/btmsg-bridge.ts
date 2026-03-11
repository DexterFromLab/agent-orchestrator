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
  groupId: string;
  tier: number;
  model: string | null;
  status: string;
  unreadCount: number;
}

export interface BtmsgMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  read: boolean;
  replyTo: string | null;
  createdAt: string;
  senderName?: string;
  senderRole?: string;
}

export interface BtmsgFeedMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
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
  groupId: string;
  createdBy: string;
  memberCount: number;
  createdAt: string;
}

export interface BtmsgChannelMessage {
  id: string;
  channelId: string;
  fromAgent: string;
  content: string;
  createdAt: string;
  senderName: string;
  senderRole: string;
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

/**
 * Ensure admin agent exists with contacts to all agents.
 */
export async function ensureAdmin(groupId: string): Promise<void> {
  return invoke('btmsg_ensure_admin', { groupId });
}

/**
 * Get all messages in group (admin global feed).
 */
export async function getAllFeed(groupId: string, limit: number = 100): Promise<BtmsgFeedMessage[]> {
  return invoke('btmsg_all_feed', { groupId, limit });
}

/**
 * Mark all messages from sender to reader as read.
 */
export async function markRead(readerId: string, senderId: string): Promise<void> {
  return invoke('btmsg_mark_read', { readerId, senderId });
}

/**
 * Get channels in a group.
 */
export async function getChannels(groupId: string): Promise<BtmsgChannel[]> {
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
export async function sendChannelMessage(channelId: string, fromAgent: string, content: string): Promise<string> {
  return invoke('btmsg_channel_send', { channelId, fromAgent, content });
}

/**
 * Create a new channel.
 */
export async function createChannel(name: string, groupId: string, createdBy: string): Promise<string> {
  return invoke('btmsg_create_channel', { name, groupId, createdBy });
}

/**
 * Add a member to a channel.
 */
export async function addChannelMember(channelId: string, agentId: string): Promise<void> {
  return invoke('btmsg_add_channel_member', { channelId, agentId });
}
