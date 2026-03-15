// Attention scoring — pure function extracted from health store
// Determines which project needs attention most urgently

import type { ActivityState } from '../stores/health.svelte';

// Attention score weights (higher = more urgent)
const SCORE_STALLED = 100;
const SCORE_ERROR = 90;
const SCORE_CONTEXT_CRITICAL = 80; // >90% context
const SCORE_FILE_CONFLICT = 70;
const SCORE_CONTEXT_HIGH = 40; // >75% context

// Review queue scoring: 10pts per stale review, capped at 50
const SCORE_REVIEW_PER_TASK = 10;
const SCORE_REVIEW_CAP = 50;

export interface AttentionInput {
  sessionStatus: string | undefined;
  sessionError: string | undefined;
  activityState: ActivityState;
  idleDurationMs: number;
  contextPressure: number | null;
  fileConflictCount: number;
  externalConflictCount: number;
  /** Number of tasks in 'review' status (for reviewer agents) */
  reviewQueueDepth?: number;
}

export interface AttentionResult {
  score: number;
  reason: string | null;
}

/** Score how urgently a project needs human attention. Highest-priority signal wins. */
export function scoreAttention(input: AttentionInput): AttentionResult {
  if (input.sessionStatus === 'error') {
    return {
      score: SCORE_ERROR,
      reason: `Error: ${input.sessionError?.slice(0, 60) ?? 'Unknown'}`,
    };
  }

  if (input.activityState === 'stalled') {
    const mins = Math.floor(input.idleDurationMs / 60_000);
    return {
      score: SCORE_STALLED,
      reason: `Stalled — ${mins} min since last activity`,
    };
  }

  if (input.contextPressure !== null && input.contextPressure > 0.9) {
    return {
      score: SCORE_CONTEXT_CRITICAL,
      reason: `Context ${Math.round(input.contextPressure * 100)}% — near limit`,
    };
  }

  if (input.fileConflictCount > 0) {
    const extNote = input.externalConflictCount > 0 ? ` (${input.externalConflictCount} external)` : '';
    return {
      score: SCORE_FILE_CONFLICT,
      reason: `${input.fileConflictCount} file conflict${input.fileConflictCount > 1 ? 's' : ''}${extNote}`,
    };
  }

  if (input.reviewQueueDepth && input.reviewQueueDepth > 0) {
    const score = Math.min(input.reviewQueueDepth * SCORE_REVIEW_PER_TASK, SCORE_REVIEW_CAP);
    return {
      score,
      reason: `${input.reviewQueueDepth} task${input.reviewQueueDepth > 1 ? 's' : ''} awaiting review`,
    };
  }

  if (input.contextPressure !== null && input.contextPressure > 0.75) {
    return {
      score: SCORE_CONTEXT_HIGH,
      reason: `Context ${Math.round(input.contextPressure * 100)}%`,
    };
  }

  return { score: 0, reason: null };
}
