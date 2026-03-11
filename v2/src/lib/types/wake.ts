import type { ProjectId as ProjectIdType } from './ids';

/** How the Manager agent session is managed between wake events */
export type WakeStrategy = 'persistent' | 'on-demand' | 'smart';

export const WAKE_STRATEGIES: WakeStrategy[] = ['persistent', 'on-demand', 'smart'];

export const WAKE_STRATEGY_LABELS: Record<WakeStrategy, string> = {
  persistent: 'Persistent',
  'on-demand': 'On-demand',
  smart: 'Smart',
};

export const WAKE_STRATEGY_DESCRIPTIONS: Record<WakeStrategy, string> = {
  persistent: 'Manager stays running, receives periodic context refreshes',
  'on-demand': 'Manager wakes on every interval, gets fresh context each time',
  smart: 'Manager only wakes when signal score exceeds threshold',
};

/** Individual wake signal with score and description */
export interface WakeSignal {
  id: string;
  score: number; // 0..1
  reason: string;
}

/** Aggregated wake evaluation result */
export interface WakeEvaluation {
  /** Total score (max of individual signals, not sum) */
  score: number;
  /** All triggered signals sorted by score descending */
  signals: WakeSignal[];
  /** Whether the wake should fire (always true for persistent/on-demand, threshold-gated for smart) */
  shouldWake: boolean;
  /** Human-readable summary for the Manager prompt */
  summary: string;
}

/** Context passed to the Manager when waking */
export interface WakeContext {
  /** Wake evaluation that triggered this event */
  evaluation: WakeEvaluation;
  /** Per-project health snapshot */
  projectSnapshots: WakeProjectSnapshot[];
  /** Task board summary (if available) */
  taskSummary?: WakeTaskSummary;
}

/** Per-project health snapshot included in wake context */
export interface WakeProjectSnapshot {
  projectId: ProjectIdType;
  projectName: string;
  activityState: string;
  idleMinutes: number;
  burnRatePerHour: number;
  contextPressurePercent: number | null;
  fileConflicts: number;
  attentionScore: number;
  attentionReason: string | null;
}

/** Task board summary included in wake context */
export interface WakeTaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  review: number;
  done: number;
}
