// Anchors Bridge — Tauri IPC adapter for session anchor CRUD
// Mirrors groups-bridge.ts pattern

import { invoke } from '@tauri-apps/api/core';
import type { SessionAnchorRecord } from '../types/anchors';

export async function saveSessionAnchors(anchors: SessionAnchorRecord[]): Promise<void> {
  return invoke('session_anchors_save', { anchors });
}

export async function loadSessionAnchors(projectId: string): Promise<SessionAnchorRecord[]> {
  return invoke('session_anchors_load', { projectId });
}

export async function deleteSessionAnchor(id: string): Promise<void> {
  return invoke('session_anchor_delete', { id });
}

export async function clearProjectAnchors(projectId: string): Promise<void> {
  return invoke('session_anchors_clear', { projectId });
}

export async function updateAnchorType(id: string, anchorType: string): Promise<void> {
  return invoke('session_anchor_update_type', { id, anchorType });
}
