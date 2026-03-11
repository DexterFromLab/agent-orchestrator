// Wake signal scorer — pure function
// Evaluates fleet health signals to determine if the Manager should wake
// Signal IDs from tribunal S-3 hybrid: AttentionSpike, ContextPressureCluster,
// BurnRateAnomaly, TaskQueuePressure, ReviewBacklog, PeriodicFloor

import type { WakeSignal, WakeEvaluation, WakeProjectSnapshot, WakeTaskSummary } from '../types/wake';

// --- Signal weights (0..1, higher = more urgent) ---

const WEIGHT_ATTENTION_SPIKE = 1.0;
const WEIGHT_CONTEXT_PRESSURE_CLUSTER = 0.9;
const WEIGHT_BURN_RATE_ANOMALY = 0.8;
const WEIGHT_TASK_QUEUE_PRESSURE = 0.7;
const WEIGHT_REVIEW_BACKLOG = 0.6;
const WEIGHT_PERIODIC_FLOOR = 0.1;

// --- Thresholds ---

const CONTEXT_PRESSURE_HIGH = 0.75;
const CONTEXT_PRESSURE_CLUSTER_MIN = 2; // 2+ projects above threshold
const BURN_RATE_SPIKE_MULTIPLIER = 3; // 3x average = anomaly
const TASK_BLOCKED_CRITICAL = 3; // 3+ blocked tasks = pressure
const REVIEW_BACKLOG_CRITICAL = 5; // 5+ tasks in review = backlog

export interface WakeScorerInput {
  projects: WakeProjectSnapshot[];
  taskSummary?: WakeTaskSummary;
  /** Average burn rate over last hour (for anomaly detection) */
  averageBurnRate?: number;
}

/** Evaluate all wake signals and produce a wake evaluation */
export function evaluateWakeSignals(input: WakeScorerInput): WakeEvaluation {
  const signals: WakeSignal[] = [];

  // Signal 1: AttentionSpike — any project in attention queue (score > 0)
  const attentionProjects = input.projects.filter(p => p.attentionScore > 0);
  if (attentionProjects.length > 0) {
    const top = attentionProjects.sort((a, b) => b.attentionScore - a.attentionScore)[0];
    signals.push({
      id: 'AttentionSpike',
      score: WEIGHT_ATTENTION_SPIKE,
      reason: `${attentionProjects.length} project${attentionProjects.length > 1 ? 's' : ''} need attention: ${top.projectName} (${top.attentionReason ?? 'urgent'})`,
    });
  }

  // Signal 2: ContextPressureCluster — 2+ projects above 75% context
  const highContextProjects = input.projects.filter(
    p => p.contextPressurePercent !== null && p.contextPressurePercent > CONTEXT_PRESSURE_HIGH * 100,
  );
  if (highContextProjects.length >= CONTEXT_PRESSURE_CLUSTER_MIN) {
    signals.push({
      id: 'ContextPressureCluster',
      score: WEIGHT_CONTEXT_PRESSURE_CLUSTER,
      reason: `${highContextProjects.length} projects above ${CONTEXT_PRESSURE_HIGH * 100}% context pressure`,
    });
  }

  // Signal 3: BurnRateAnomaly — current total burn rate >> average
  if (input.averageBurnRate !== undefined && input.averageBurnRate > 0) {
    const currentTotal = input.projects.reduce((sum, p) => sum + p.burnRatePerHour, 0);
    if (currentTotal > input.averageBurnRate * BURN_RATE_SPIKE_MULTIPLIER) {
      signals.push({
        id: 'BurnRateAnomaly',
        score: WEIGHT_BURN_RATE_ANOMALY,
        reason: `Burn rate $${currentTotal.toFixed(2)}/hr is ${(currentTotal / input.averageBurnRate).toFixed(1)}x average ($${input.averageBurnRate.toFixed(2)}/hr)`,
      });
    }
  }

  // Signal 4: TaskQueuePressure — too many blocked tasks
  if (input.taskSummary) {
    if (input.taskSummary.blocked >= TASK_BLOCKED_CRITICAL) {
      signals.push({
        id: 'TaskQueuePressure',
        score: WEIGHT_TASK_QUEUE_PRESSURE,
        reason: `${input.taskSummary.blocked} blocked tasks on the board`,
      });
    }
  }

  // Signal 5: ReviewBacklog — too many tasks waiting for review
  if (input.taskSummary) {
    if (input.taskSummary.review >= REVIEW_BACKLOG_CRITICAL) {
      signals.push({
        id: 'ReviewBacklog',
        score: WEIGHT_REVIEW_BACKLOG,
        reason: `${input.taskSummary.review} tasks pending review`,
      });
    }
  }

  // Signal 6: PeriodicFloor — always present (lowest priority)
  signals.push({
    id: 'PeriodicFloor',
    score: WEIGHT_PERIODIC_FLOOR,
    reason: 'Periodic check-in',
  });

  // Sort by score descending
  signals.sort((a, b) => b.score - a.score);

  const topScore = signals[0]?.score ?? 0;

  // Build summary for Manager prompt
  const summary = buildWakeSummary(signals, input);

  return {
    score: topScore,
    signals,
    shouldWake: true, // Caller (scheduler) gates this based on strategy + threshold
    summary,
  };
}

/** Check if wake should fire based on strategy and threshold */
export function shouldWake(
  evaluation: WakeEvaluation,
  strategy: 'persistent' | 'on-demand' | 'smart',
  threshold: number,
): boolean {
  if (strategy === 'persistent' || strategy === 'on-demand') return true;
  // Smart: only wake if score exceeds threshold
  return evaluation.score >= threshold;
}

function buildWakeSummary(signals: WakeSignal[], input: WakeScorerInput): string {
  const parts: string[] = [];

  // Headline
  const urgentSignals = signals.filter(s => s.score >= 0.5);
  if (urgentSignals.length > 0) {
    parts.push(`**Wake reason:** ${urgentSignals.map(s => s.reason).join('; ')}`);
  } else {
    parts.push('**Wake reason:** Periodic check-in (no urgent signals)');
  }

  // Fleet snapshot
  const running = input.projects.filter(p => p.activityState === 'running').length;
  const idle = input.projects.filter(p => p.activityState === 'idle').length;
  const stalled = input.projects.filter(p => p.activityState === 'stalled').length;
  const totalBurn = input.projects.reduce((sum, p) => sum + p.burnRatePerHour, 0);
  parts.push(`\n**Fleet:** ${running} running, ${idle} idle, ${stalled} stalled | $${totalBurn.toFixed(2)}/hr`);

  // Project details (only those needing attention)
  const needsAttention = input.projects.filter(p => p.attentionScore > 0);
  if (needsAttention.length > 0) {
    parts.push('\n**Needs attention:**');
    for (const p of needsAttention) {
      const ctx = p.contextPressurePercent !== null ? ` | ctx ${p.contextPressurePercent}%` : '';
      const conflicts = p.fileConflicts > 0 ? ` | ${p.fileConflicts} conflicts` : '';
      parts.push(`- ${p.projectName}: ${p.activityState}${p.idleMinutes > 0 ? ` (${p.idleMinutes}m idle)` : ''}${ctx}${conflicts} — ${p.attentionReason ?? 'check needed'}`);
    }
  }

  // Task summary
  if (input.taskSummary) {
    const ts = input.taskSummary;
    parts.push(`\n**Tasks:** ${ts.total} total (${ts.todo} todo, ${ts.inProgress} in progress, ${ts.blocked} blocked, ${ts.review} in review, ${ts.done} done)`);
  }

  return parts.join('\n');
}
