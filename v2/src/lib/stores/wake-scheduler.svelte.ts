// Wake scheduler — manages per-manager wake timers and signal evaluation
// Supports 3 strategies: persistent, on-demand, smart (threshold-gated)

import type { WakeStrategy, WakeContext, WakeProjectSnapshot, WakeTaskSummary } from '../types/wake';
import type { AgentId } from '../types/ids';
import { evaluateWakeSignals, shouldWake } from '../utils/wake-scorer';
import { getAllProjectHealth, getHealthAggregates } from './health.svelte';
import { getAllWorkItems } from './workspace.svelte';
import { listTasks } from '../adapters/bttask-bridge';
import { getAgentSession } from './agents.svelte';
import type { GroupId } from '../types/ids';

// --- Types ---

interface ManagerRegistration {
  agentId: AgentId;
  groupId: GroupId;
  sessionId: string;
  strategy: WakeStrategy;
  intervalMs: number;
  threshold: number;
  timerId: ReturnType<typeof setInterval> | null;
  /** Burn rate samples for anomaly detection: [timestamp, totalRate] */
  burnRateSamples: Array<[number, number]>;
}

export interface WakeEvent {
  agentId: AgentId;
  strategy: WakeStrategy;
  context: WakeContext;
  /** For persistent: resume with context. For on-demand/smart: fresh session with context. */
  mode: 'resume' | 'fresh';
}

// --- State ---

let registrations = $state<Map<string, ManagerRegistration>>(new Map());
let pendingWakes = $state<Map<string, WakeEvent>>(new Map());
/** When true, registerManager() becomes a no-op (set in test mode) */
let schedulerDisabled = false;

// --- Public API ---

/** Disable the wake scheduler (call during app init in test mode) */
export function disableWakeScheduler(): void {
  schedulerDisabled = true;
  clearWakeScheduler();
}

/** Register a Manager agent for wake scheduling */
export function registerManager(
  agentId: AgentId,
  groupId: GroupId,
  sessionId: string,
  strategy: WakeStrategy,
  intervalMin: number,
  threshold: number,
): void {
  if (schedulerDisabled) return;

  // Unregister first to clear any existing timer
  unregisterManager(agentId);

  const reg: ManagerRegistration = {
    agentId,
    groupId,
    sessionId,
    strategy,
    intervalMs: intervalMin * 60 * 1000,
    threshold,
    timerId: null,
    burnRateSamples: [],
  };

  registrations.set(agentId, reg);
  startTimer(reg);
}

/** Unregister a Manager agent and stop its timer */
export function unregisterManager(agentId: string): void {
  const reg = registrations.get(agentId);
  if (reg?.timerId) {
    clearInterval(reg.timerId);
  }
  registrations.delete(agentId);
  pendingWakes.delete(agentId);
}

/** Update wake config for an already-registered manager */
export function updateManagerConfig(
  agentId: string,
  strategy: WakeStrategy,
  intervalMin: number,
  threshold: number,
): void {
  const reg = registrations.get(agentId);
  if (!reg) return;

  const needsRestart = reg.strategy !== strategy || reg.intervalMs !== intervalMin * 60 * 1000;
  reg.strategy = strategy;
  reg.intervalMs = intervalMin * 60 * 1000;
  reg.threshold = threshold;

  if (needsRestart) {
    if (reg.timerId) clearInterval(reg.timerId);
    startTimer(reg);
  }
}

/** Update session ID for a registered manager (e.g., after session reset) */
export function updateManagerSession(agentId: string, sessionId: string): void {
  const reg = registrations.get(agentId);
  if (reg) {
    reg.sessionId = sessionId;
  }
}

/** Get pending wake event for a manager (consumed by AgentSession) */
export function getWakeEvent(agentId: string): WakeEvent | undefined {
  return pendingWakes.get(agentId);
}

/** Consume (clear) a pending wake event after AgentSession handles it */
export function consumeWakeEvent(agentId: string): void {
  pendingWakes.delete(agentId);
}

/** Get all registered managers (for debugging/UI) */
export function getRegisteredManagers(): Array<{
  agentId: string;
  strategy: WakeStrategy;
  intervalMin: number;
  threshold: number;
  hasPendingWake: boolean;
}> {
  const result: Array<{
    agentId: string;
    strategy: WakeStrategy;
    intervalMin: number;
    threshold: number;
    hasPendingWake: boolean;
  }> = [];
  for (const [id, reg] of registrations) {
    result.push({
      agentId: id,
      strategy: reg.strategy,
      intervalMin: reg.intervalMs / 60_000,
      threshold: reg.threshold,
      hasPendingWake: pendingWakes.has(id),
    });
  }
  return result;
}

/** Force a manual wake evaluation for a manager (for testing/UI) */
export function forceWake(agentId: string): void {
  const reg = registrations.get(agentId);
  if (reg) {
    evaluateAndEmit(reg);
  }
}

/** Clear all registrations (for workspace teardown) */
export function clearWakeScheduler(): void {
  for (const reg of registrations.values()) {
    if (reg.timerId) clearInterval(reg.timerId);
  }
  registrations = new Map();
  pendingWakes = new Map();
}

// --- Internal ---

function startTimer(reg: ManagerRegistration): void {
  reg.timerId = setInterval(() => {
    evaluateAndEmit(reg);
  }, reg.intervalMs);
}

async function evaluateAndEmit(reg: ManagerRegistration): Promise<void> {
  // Don't queue a new wake if one is already pending
  if (pendingWakes.has(reg.agentId)) return;

  // For persistent strategy, skip if session is actively running a query
  if (reg.strategy === 'persistent') {
    const session = getAgentSession(reg.sessionId);
    if (session && session.status === 'running') return;
  }

  // Build project snapshots from health store
  const healthItems = getAllProjectHealth();
  const workItems = getAllWorkItems();
  const projectSnapshots: WakeProjectSnapshot[] = healthItems.map(h => {
    const workItem = workItems.find(w => w.id === h.projectId);
    return {
      projectId: h.projectId,
      projectName: workItem?.name ?? String(h.projectId),
      activityState: h.activityState,
      idleMinutes: Math.floor(h.idleDurationMs / 60_000),
      burnRatePerHour: h.burnRatePerHour,
      contextPressurePercent: h.contextPressure !== null ? Math.round(h.contextPressure * 100) : null,
      fileConflicts: h.fileConflictCount + h.externalConflictCount,
      attentionScore: h.attentionScore,
      attentionReason: h.attentionReason,
    };
  });

  // Fetch task summary (best-effort)
  let taskSummary: WakeTaskSummary | undefined;
  try {
    const tasks = await listTasks(reg.groupId);
    taskSummary = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inProgress: tasks.filter(t => t.status === 'progress').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      review: tasks.filter(t => t.status === 'review').length,
      done: tasks.filter(t => t.status === 'done').length,
    };
  } catch {
    // bttask may not be available — continue without task data
  }

  // Compute average burn rate for anomaly detection
  const aggregates = getHealthAggregates();
  const now = Date.now();
  reg.burnRateSamples.push([now, aggregates.totalBurnRatePerHour]);
  // Keep 1 hour of samples
  const hourAgo = now - 3_600_000;
  reg.burnRateSamples = reg.burnRateSamples.filter(([ts]) => ts > hourAgo);
  const averageBurnRate = reg.burnRateSamples.length > 1
    ? reg.burnRateSamples.reduce((sum, [, r]) => sum + r, 0) / reg.burnRateSamples.length
    : undefined;

  // Evaluate signals
  const evaluation = evaluateWakeSignals({
    projects: projectSnapshots,
    taskSummary,
    averageBurnRate,
  });

  // Check if we should actually wake based on strategy
  if (!shouldWake(evaluation, reg.strategy, reg.threshold)) return;

  // Build wake context
  const context: WakeContext = {
    evaluation,
    projectSnapshots,
    taskSummary,
  };

  // Determine mode
  const mode: 'resume' | 'fresh' = reg.strategy === 'persistent' ? 'resume' : 'fresh';

  pendingWakes.set(reg.agentId, {
    agentId: reg.agentId,
    strategy: reg.strategy,
    context,
    mode,
  });
}
