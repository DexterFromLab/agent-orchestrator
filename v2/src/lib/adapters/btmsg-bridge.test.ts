import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import {
  getGroupAgents,
  getUnreadCount,
  getUnreadMessages,
  getHistory,
  sendMessage,
  setAgentStatus,
  ensureAdmin,
  getAllFeed,
  markRead,
  getChannels,
  getChannelMessages,
  sendChannelMessage,
  createChannel,
  addChannelMember,
  type BtmsgAgent,
  type BtmsgMessage,
  type BtmsgFeedMessage,
  type BtmsgChannel,
  type BtmsgChannelMessage,
} from './btmsg-bridge';
import { GroupId, AgentId } from '../types/ids';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('btmsg-bridge', () => {
  // ---- REGRESSION: camelCase field names ----
  // Bug: TypeScript interfaces used snake_case (group_id, unread_count, from_agent, etc.)
  // but Rust serde(rename_all = "camelCase") sends camelCase.

  describe('BtmsgAgent camelCase fields', () => {
    it('receives camelCase fields from Rust backend', async () => {
      const agent: BtmsgAgent = {
        id: AgentId('a1'),
        name: 'Coder',
        role: 'developer',
        groupId: GroupId('g1'),       // was: group_id
        tier: 1,
        model: 'claude-4',
        status: 'active',
        unreadCount: 3,       // was: unread_count
      };
      mockInvoke.mockResolvedValue([agent]);

      const result = await getGroupAgents(GroupId('g1'));

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe('g1');
      expect(result[0].unreadCount).toBe(3);
      // Verify snake_case fields do NOT exist
      expect((result[0] as Record<string, unknown>)['group_id']).toBeUndefined();
      expect((result[0] as Record<string, unknown>)['unread_count']).toBeUndefined();
    });

    it('invokes btmsg_get_agents with groupId', async () => {
      mockInvoke.mockResolvedValue([]);
      await getGroupAgents(GroupId('g1'));
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_get_agents', { groupId: 'g1' });
    });
  });

  describe('BtmsgMessage camelCase fields', () => {
    it('receives camelCase fields from Rust backend', async () => {
      const msg: BtmsgMessage = {
        id: 'm1',
        fromAgent: AgentId('a1'),      // was: from_agent
        toAgent: AgentId('a2'),        // was: to_agent
        content: 'hello',
        read: false,
        replyTo: null,         // was: reply_to
        createdAt: '2026-01-01', // was: created_at
        senderName: 'Coder',  // was: sender_name
        senderRole: 'dev',    // was: sender_role
      };
      mockInvoke.mockResolvedValue([msg]);

      const result = await getUnreadMessages(AgentId('a2'));

      expect(result[0].fromAgent).toBe('a1');
      expect(result[0].toAgent).toBe('a2');
      expect(result[0].replyTo).toBeNull();
      expect(result[0].createdAt).toBe('2026-01-01');
      expect(result[0].senderName).toBe('Coder');
      expect(result[0].senderRole).toBe('dev');
    });
  });

  describe('BtmsgFeedMessage camelCase fields', () => {
    it('receives camelCase fields including recipient info', async () => {
      const feed: BtmsgFeedMessage = {
        id: 'm1',
        fromAgent: AgentId('a1'),
        toAgent: AgentId('a2'),
        content: 'review this',
        createdAt: '2026-01-01',
        replyTo: null,
        senderName: 'Coder',
        senderRole: 'developer',
        recipientName: 'Reviewer',
        recipientRole: 'reviewer',
      };
      mockInvoke.mockResolvedValue([feed]);

      const result = await getAllFeed(GroupId('g1'));

      expect(result[0].senderName).toBe('Coder');
      expect(result[0].recipientName).toBe('Reviewer');
      expect(result[0].recipientRole).toBe('reviewer');
    });
  });

  describe('BtmsgChannel camelCase fields', () => {
    it('receives camelCase fields', async () => {
      const channel: BtmsgChannel = {
        id: 'ch1',
        name: 'general',
        groupId: GroupId('g1'),        // was: group_id
        createdBy: AgentId('admin'),   // was: created_by
        memberCount: 5,       // was: member_count
        createdAt: '2026-01-01',
      };
      mockInvoke.mockResolvedValue([channel]);

      const result = await getChannels(GroupId('g1'));

      expect(result[0].groupId).toBe('g1');
      expect(result[0].createdBy).toBe('admin');
      expect(result[0].memberCount).toBe(5);
    });
  });

  describe('BtmsgChannelMessage camelCase fields', () => {
    it('receives camelCase fields', async () => {
      const msg: BtmsgChannelMessage = {
        id: 'cm1',
        channelId: 'ch1',     // was: channel_id
        fromAgent: AgentId('a1'),
        content: 'hello',
        createdAt: '2026-01-01',
        senderName: 'Coder',
        senderRole: 'dev',
      };
      mockInvoke.mockResolvedValue([msg]);

      const result = await getChannelMessages('ch1');

      expect(result[0].channelId).toBe('ch1');
      expect(result[0].fromAgent).toBe('a1');
      expect(result[0].senderName).toBe('Coder');
    });
  });

  // ---- IPC command name tests ----

  describe('IPC commands', () => {
    it('getUnreadCount invokes btmsg_unread_count', async () => {
      mockInvoke.mockResolvedValue(5);
      const result = await getUnreadCount(AgentId('a1'));
      expect(result).toBe(5);
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_unread_count', { agentId: 'a1' });
    });

    it('getHistory invokes btmsg_history', async () => {
      mockInvoke.mockResolvedValue([]);
      await getHistory(AgentId('a1'), AgentId('a2'), 50);
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_history', { agentId: 'a1', otherId: 'a2', limit: 50 });
    });

    it('getHistory defaults limit to 20', async () => {
      mockInvoke.mockResolvedValue([]);
      await getHistory(AgentId('a1'), AgentId('a2'));
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_history', { agentId: 'a1', otherId: 'a2', limit: 20 });
    });

    it('sendMessage invokes btmsg_send', async () => {
      mockInvoke.mockResolvedValue('msg-id');
      const result = await sendMessage(AgentId('a1'), AgentId('a2'), 'hello');
      expect(result).toBe('msg-id');
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_send', { fromAgent: 'a1', toAgent: 'a2', content: 'hello' });
    });

    it('setAgentStatus invokes btmsg_set_status', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await setAgentStatus(AgentId('a1'), 'active');
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_set_status', { agentId: 'a1', status: 'active' });
    });

    it('ensureAdmin invokes btmsg_ensure_admin', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await ensureAdmin(GroupId('g1'));
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_ensure_admin', { groupId: 'g1' });
    });

    it('markRead invokes btmsg_mark_read', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await markRead(AgentId('a2'), AgentId('a1'));
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_mark_read', { readerId: 'a2', senderId: 'a1' });
    });

    it('sendChannelMessage invokes btmsg_channel_send', async () => {
      mockInvoke.mockResolvedValue('cm-id');
      const result = await sendChannelMessage('ch1', AgentId('a1'), 'hello channel');
      expect(result).toBe('cm-id');
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_channel_send', { channelId: 'ch1', fromAgent: 'a1', content: 'hello channel' });
    });

    it('createChannel invokes btmsg_create_channel', async () => {
      mockInvoke.mockResolvedValue('ch-id');
      const result = await createChannel('general', GroupId('g1'), AgentId('admin'));
      expect(result).toBe('ch-id');
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_create_channel', { name: 'general', groupId: 'g1', createdBy: 'admin' });
    });

    it('addChannelMember invokes btmsg_add_channel_member', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await addChannelMember('ch1', AgentId('a1'));
      expect(mockInvoke).toHaveBeenCalledWith('btmsg_add_channel_member', { channelId: 'ch1', agentId: 'a1' });
    });
  });

  describe('error propagation', () => {
    it('propagates invoke errors', async () => {
      mockInvoke.mockRejectedValue(new Error('btmsg database not found'));
      await expect(getGroupAgents(GroupId('g1'))).rejects.toThrow('btmsg database not found');
    });
  });
});
