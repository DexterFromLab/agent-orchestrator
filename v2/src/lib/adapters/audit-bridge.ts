/**
 * Audit log bridge — reads/writes audit events via Tauri IPC.
 * Used by agent-dispatcher, wake-scheduler, and AgentSession for event tracking.
 */

import { invoke } from '@tauri-apps/api/core';
import type { AgentId, GroupId } from '../types/ids';

export interface AuditEntry {
  id: number;
  agentId: string;
  eventType: string;
  detail: string;
  createdAt: string;
}

/** Audit event types */
export type AuditEventType =
  | 'prompt_injection'
  | 'wake_event'
  | 'btmsg_sent'
  | 'btmsg_received'
  | 'status_change'
  | 'heartbeat_missed'
  | 'dead_letter';

/**
 * Log an audit event for an agent.
 */
export async function logAuditEvent(
  agentId: AgentId,
  eventType: AuditEventType,
  detail: string,
): Promise<void> {
  return invoke('audit_log_event', { agentId, eventType, detail });
}

/**
 * Get audit log entries for a group (reverse chronological).
 */
export async function getAuditLog(
  groupId: GroupId,
  limit: number = 200,
  offset: number = 0,
): Promise<AuditEntry[]> {
  return invoke('audit_log_list', { groupId, limit, offset });
}

/**
 * Get audit log entries for a specific agent.
 */
export async function getAuditLogForAgent(
  agentId: AgentId,
  limit: number = 50,
): Promise<AuditEntry[]> {
  return invoke('audit_log_for_agent', { agentId, limit });
}
