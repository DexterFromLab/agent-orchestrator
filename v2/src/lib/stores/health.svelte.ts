// Project health tracking — Svelte 5 runes
// Tracks per-project activity state, burn rate, context pressure, and attention scoring

import { getAgentSession, type AgentSession } from './agents.svelte';

// --- Types ---

export type ActivityState = 'inactive' | 'running' | 'idle' | 'stalled';

export interface ProjectHealth {
  projectId: string;
  sessionId: string | null;
  /** Current activity state */
  activityState: ActivityState;
  /** Name of currently running tool (if any) */
  activeTool: string | null;
  /** Duration in ms since last activity (0 if running a tool) */
  idleDurationMs: number;
  /** Burn rate in USD per hour (0 if no data) */
  burnRatePerHour: number;
  /** Context pressure as fraction 0..1 (null if unknown) */
  contextPressure: number | null;
  /** Attention urgency score (higher = more urgent, 0 = no attention needed) */
  attentionScore: number;
  /** Human-readable attention reason */
  attentionReason: string | null;
}

export type AttentionItem = ProjectHealth & { projectName: string; projectIcon: string };

// --- Configuration ---

const STALL_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const TICK_INTERVAL_MS = 5_000; // Update derived state every 5s
const BURN_RATE_WINDOW_MS = 5 * 60 * 1000; // 5-minute window for burn rate calc

// Context limits by model (tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-haiku-4-20250506': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
};
const DEFAULT_CONTEXT_LIMIT = 200_000;

// Attention score weights (higher = more urgent)
const SCORE_STALLED = 100;
const SCORE_CONTEXT_CRITICAL = 80; // >90% context
const SCORE_CONTEXT_HIGH = 40; // >75% context
const SCORE_ERROR = 90;
const SCORE_IDLE_LONG = 20; // >2x stall threshold but not stalled (shouldn't happen, safety)

// --- State ---

interface ProjectTracker {
  projectId: string;
  sessionId: string | null;
  lastActivityTs: number; // epoch ms
  lastToolName: string | null;
  toolInFlight: boolean;
  /** Token snapshots for burn rate calculation: [timestamp, totalTokens] */
  tokenSnapshots: Array<[number, number]>;
  /** Cost snapshots for $/hr: [timestamp, costUsd] */
  costSnapshots: Array<[number, number]>;
}

let trackers = $state<Map<string, ProjectTracker>>(new Map());
let tickTs = $state<number>(Date.now());
let tickInterval: ReturnType<typeof setInterval> | null = null;

// --- Public API ---

/** Register a project for health tracking */
export function trackProject(projectId: string, sessionId: string | null): void {
  const existing = trackers.get(projectId);
  if (existing) {
    existing.sessionId = sessionId;
    return;
  }
  trackers.set(projectId, {
    projectId,
    sessionId,
    lastActivityTs: Date.now(),
    lastToolName: null,
    toolInFlight: false,
    tokenSnapshots: [],
    costSnapshots: [],
  });
}

/** Remove a project from health tracking */
export function untrackProject(projectId: string): void {
  trackers.delete(projectId);
}

/** Update session ID for a tracked project */
export function updateProjectSession(projectId: string, sessionId: string): void {
  const t = trackers.get(projectId);
  if (t) {
    t.sessionId = sessionId;
  }
}

/** Record activity — call on every agent message. Auto-starts tick if stopped. */
export function recordActivity(projectId: string, toolName?: string): void {
  const t = trackers.get(projectId);
  if (!t) return;
  t.lastActivityTs = Date.now();
  if (toolName !== undefined) {
    t.lastToolName = toolName;
    t.toolInFlight = true;
  }
  // Auto-start tick when activity resumes
  if (!tickInterval) startHealthTick();
}

/** Record tool completion */
export function recordToolDone(projectId: string): void {
  const t = trackers.get(projectId);
  if (!t) return;
  t.lastActivityTs = Date.now();
  t.toolInFlight = false;
}

/** Record a token/cost snapshot for burn rate calculation */
export function recordTokenSnapshot(projectId: string, totalTokens: number, costUsd: number): void {
  const t = trackers.get(projectId);
  if (!t) return;
  const now = Date.now();
  t.tokenSnapshots.push([now, totalTokens]);
  t.costSnapshots.push([now, costUsd]);
  // Prune old snapshots beyond window
  const cutoff = now - BURN_RATE_WINDOW_MS * 2;
  t.tokenSnapshots = t.tokenSnapshots.filter(([ts]) => ts > cutoff);
  t.costSnapshots = t.costSnapshots.filter(([ts]) => ts > cutoff);
}

/** Check if any tracked project has an active (running/starting) session */
function hasActiveSession(): boolean {
  for (const t of trackers.values()) {
    if (!t.sessionId) continue;
    const session = getAgentSession(t.sessionId);
    if (session && (session.status === 'running' || session.status === 'starting')) return true;
  }
  return false;
}

/** Start the health tick timer (auto-stops when no active sessions) */
export function startHealthTick(): void {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (!hasActiveSession()) {
      stopHealthTick();
      return;
    }
    tickTs = Date.now();
  }, TICK_INTERVAL_MS);
}

/** Stop the health tick timer */
export function stopHealthTick(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/** Clear all tracked projects */
export function clearHealthTracking(): void {
  trackers = new Map();
}

// --- Derived health per project ---

function getContextLimit(model?: string): number {
  if (!model) return DEFAULT_CONTEXT_LIMIT;
  return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
}

function computeBurnRate(snapshots: Array<[number, number]>): number {
  if (snapshots.length < 2) return 0;
  const windowStart = Date.now() - BURN_RATE_WINDOW_MS;
  const recent = snapshots.filter(([ts]) => ts >= windowStart);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsedHours = (last[0] - first[0]) / 3_600_000;
  if (elapsedHours < 0.001) return 0; // Less than ~4 seconds
  const costDelta = last[1] - first[1];
  return Math.max(0, costDelta / elapsedHours);
}

function computeHealth(tracker: ProjectTracker, now: number): ProjectHealth {
  const session: AgentSession | undefined = tracker.sessionId
    ? getAgentSession(tracker.sessionId)
    : undefined;

  // Activity state
  let activityState: ActivityState;
  let idleDurationMs = 0;
  let activeTool: string | null = null;

  if (!session || session.status === 'idle' || session.status === 'done' || session.status === 'error') {
    activityState = session?.status === 'error' ? 'inactive' : 'inactive';
  } else if (tracker.toolInFlight) {
    activityState = 'running';
    activeTool = tracker.lastToolName;
    idleDurationMs = 0;
  } else {
    idleDurationMs = now - tracker.lastActivityTs;
    if (idleDurationMs >= STALL_THRESHOLD_MS) {
      activityState = 'stalled';
    } else {
      activityState = 'idle';
    }
  }

  // Context pressure
  let contextPressure: number | null = null;
  if (session && (session.inputTokens + session.outputTokens) > 0) {
    const limit = getContextLimit(session.model);
    contextPressure = Math.min(1, (session.inputTokens + session.outputTokens) / limit);
  }

  // Burn rate
  const burnRatePerHour = computeBurnRate(tracker.costSnapshots);

  // Attention scoring
  let attentionScore = 0;
  let attentionReason: string | null = null;

  if (session?.status === 'error') {
    attentionScore = SCORE_ERROR;
    attentionReason = `Error: ${session.error?.slice(0, 60) ?? 'Unknown'}`;
  } else if (activityState === 'stalled') {
    attentionScore = SCORE_STALLED;
    const mins = Math.floor(idleDurationMs / 60_000);
    attentionReason = `Stalled — ${mins} min since last activity`;
  } else if (contextPressure !== null && contextPressure > 0.9) {
    attentionScore = SCORE_CONTEXT_CRITICAL;
    attentionReason = `Context ${Math.round(contextPressure * 100)}% — near limit`;
  } else if (contextPressure !== null && contextPressure > 0.75) {
    attentionScore = SCORE_CONTEXT_HIGH;
    attentionReason = `Context ${Math.round(contextPressure * 100)}%`;
  }

  return {
    projectId: tracker.projectId,
    sessionId: tracker.sessionId,
    activityState,
    activeTool,
    idleDurationMs,
    burnRatePerHour,
    contextPressure,
    attentionScore,
    attentionReason,
  };
}

/** Get health for a single project (reactive via tickTs) */
export function getProjectHealth(projectId: string): ProjectHealth | null {
  // Touch tickTs to make this reactive to the timer
  const now = tickTs;
  const t = trackers.get(projectId);
  if (!t) return null;
  return computeHealth(t, now);
}

/** Get all project health sorted by attention score descending */
export function getAllProjectHealth(): ProjectHealth[] {
  const now = tickTs;
  const results: ProjectHealth[] = [];
  for (const t of trackers.values()) {
    results.push(computeHealth(t, now));
  }
  results.sort((a, b) => b.attentionScore - a.attentionScore);
  return results;
}

/** Get top N items needing attention */
export function getAttentionQueue(limit = 5): ProjectHealth[] {
  return getAllProjectHealth().filter(h => h.attentionScore > 0).slice(0, limit);
}

/** Get aggregate stats across all tracked projects */
export function getHealthAggregates(): {
  running: number;
  idle: number;
  stalled: number;
  totalBurnRatePerHour: number;
} {
  const all = getAllProjectHealth();
  let running = 0;
  let idle = 0;
  let stalled = 0;
  let totalBurnRatePerHour = 0;
  for (const h of all) {
    if (h.activityState === 'running') running++;
    else if (h.activityState === 'idle') idle++;
    else if (h.activityState === 'stalled') stalled++;
    totalBurnRatePerHour += h.burnRatePerHour;
  }
  return { running, idle, stalled, totalBurnRatePerHour };
}
