// Session Anchors store — Svelte 5 runes
// Per-project anchor management with re-injection support

import type { SessionAnchor, AnchorType, SessionAnchorRecord } from '../types/anchors';
import { DEFAULT_ANCHOR_SETTINGS } from '../types/anchors';
import {
  saveSessionAnchors,
  loadSessionAnchors,
  deleteSessionAnchor,
  updateAnchorType as updateAnchorTypeBridge,
} from '../adapters/anchors-bridge';

// Per-project anchor state
const projectAnchors = $state<Map<string, SessionAnchor[]>>(new Map());

// Track which projects have had auto-anchoring triggered (prevents re-anchoring on subsequent compactions)
const autoAnchoredProjects = $state<Set<string>>(new Set());

export function getProjectAnchors(projectId: string): SessionAnchor[] {
  return projectAnchors.get(projectId) ?? [];
}

/** Get only re-injectable anchors (auto + promoted, not pinned-only) */
export function getInjectableAnchors(projectId: string): SessionAnchor[] {
  const anchors = projectAnchors.get(projectId) ?? [];
  return anchors.filter(a => a.anchorType === 'auto' || a.anchorType === 'promoted');
}

/** Total estimated tokens for re-injectable anchors */
export function getInjectableTokenCount(projectId: string): number {
  return getInjectableAnchors(projectId).reduce((sum, a) => sum + a.estimatedTokens, 0);
}

/** Check if auto-anchoring has already run for this project */
export function hasAutoAnchored(projectId: string): boolean {
  return autoAnchoredProjects.has(projectId);
}

/** Mark project as having been auto-anchored */
export function markAutoAnchored(projectId: string): void {
  autoAnchoredProjects.add(projectId);
}

/** Add anchors to a project (in-memory + persist) */
export async function addAnchors(projectId: string, anchors: SessionAnchor[]): Promise<void> {
  const existing = projectAnchors.get(projectId) ?? [];
  const updated = [...existing, ...anchors];
  projectAnchors.set(projectId, updated);

  // Persist to SQLite
  const records: SessionAnchorRecord[] = anchors.map(a => ({
    id: a.id,
    project_id: a.projectId,
    message_id: a.messageId,
    anchor_type: a.anchorType,
    content: a.content,
    estimated_tokens: a.estimatedTokens,
    turn_index: a.turnIndex,
    created_at: a.createdAt,
  }));

  try {
    await saveSessionAnchors(records);
  } catch (e) {
    console.warn('Failed to persist anchors:', e);
  }
}

/** Remove a single anchor */
export async function removeAnchor(projectId: string, anchorId: string): Promise<void> {
  const existing = projectAnchors.get(projectId) ?? [];
  projectAnchors.set(projectId, existing.filter(a => a.id !== anchorId));

  try {
    await deleteSessionAnchor(anchorId);
  } catch (e) {
    console.warn('Failed to delete anchor:', e);
  }
}

/** Change anchor type (pinned <-> promoted) */
export async function changeAnchorType(projectId: string, anchorId: string, newType: AnchorType): Promise<void> {
  const existing = projectAnchors.get(projectId) ?? [];
  const anchor = existing.find(a => a.id === anchorId);
  if (!anchor) return;

  anchor.anchorType = newType;
  // Trigger reactivity
  projectAnchors.set(projectId, [...existing]);

  try {
    await updateAnchorTypeBridge(anchorId, newType);
  } catch (e) {
    console.warn('Failed to update anchor type:', e);
  }
}

/** Load anchors from SQLite for a project */
export async function loadAnchorsForProject(projectId: string): Promise<void> {
  try {
    const records = await loadSessionAnchors(projectId);
    const anchors: SessionAnchor[] = records.map(r => ({
      id: r.id,
      projectId: r.project_id,
      messageId: r.message_id,
      anchorType: r.anchor_type as AnchorType,
      content: r.content,
      estimatedTokens: r.estimated_tokens,
      turnIndex: r.turn_index,
      createdAt: r.created_at,
    }));
    projectAnchors.set(projectId, anchors);
    // If anchors exist, mark as already auto-anchored
    if (anchors.some(a => a.anchorType === 'auto')) {
      autoAnchoredProjects.add(projectId);
    }
  } catch (e) {
    console.warn('Failed to load anchors for project:', e);
  }
}

/** Get anchor settings (uses defaults for now — per-project config can be added later) */
export function getAnchorSettings(_projectId: string) {
  return DEFAULT_ANCHOR_SETTINGS;
}
