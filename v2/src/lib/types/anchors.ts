// Session Anchor types — preserves important conversation turns through compaction chains
// Anchored turns are re-injected into system prompt on subsequent queries

/** Anchor classification */
export type AnchorType = 'auto' | 'pinned' | 'promoted';

/** A single anchored turn, stored per-project */
export interface SessionAnchor {
  id: string;
  projectId: string;
  messageId: string;
  anchorType: AnchorType;
  /** Serialized turn text for re-injection (observation-masked) */
  content: string;
  /** Estimated token count (~chars/4) */
  estimatedTokens: number;
  /** Turn index in original session */
  turnIndex: number;
  createdAt: number;
}

/** Settings for anchor behavior, stored per-project */
export interface AnchorSettings {
  /** Number of turns to auto-anchor on first compaction (default: 3) */
  anchorTurns: number;
  /** Hard cap on re-injectable anchor tokens (default: 6144) */
  anchorTokenBudget: number;
}

export const DEFAULT_ANCHOR_SETTINGS: AnchorSettings = {
  anchorTurns: 3,
  anchorTokenBudget: 6144,
};

/** Maximum token budget for re-injected anchors */
export const MAX_ANCHOR_TOKEN_BUDGET = 20_000;
/** Minimum token budget */
export const MIN_ANCHOR_TOKEN_BUDGET = 2_000;

/** Rust-side record shape (matches SessionAnchorRecord in session.rs) */
export interface SessionAnchorRecord {
  id: string;
  project_id: string;
  message_id: string;
  anchor_type: string;
  content: string;
  estimated_tokens: number;
  turn_index: number;
  created_at: number;
}
