import { describe, it, expect } from 'vitest';
import { evaluateWakeSignals, shouldWake, type WakeScorerInput } from './wake-scorer';
import type { WakeProjectSnapshot, WakeTaskSummary } from '../types/wake';

function makeProject(overrides: Partial<WakeProjectSnapshot> = {}): WakeProjectSnapshot {
  return {
    projectId: 'proj-1' as any,
    projectName: 'TestProject',
    activityState: 'running',
    idleMinutes: 0,
    burnRatePerHour: 0.50,
    contextPressurePercent: 30,
    fileConflicts: 0,
    attentionScore: 0,
    attentionReason: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<WakeScorerInput> = {}): WakeScorerInput {
  return {
    projects: [makeProject()],
    ...overrides,
  };
}

describe('wake-scorer — evaluateWakeSignals', () => {
  it('always includes PeriodicFloor signal', () => {
    const result = evaluateWakeSignals(makeInput());
    const periodic = result.signals.find(s => s.id === 'PeriodicFloor');
    expect(periodic).toBeDefined();
    expect(periodic!.score).toBe(0.1);
  });

  it('returns PeriodicFloor as top signal when no issues', () => {
    const result = evaluateWakeSignals(makeInput());
    expect(result.score).toBe(0.1);
    expect(result.signals[0].id).toBe('PeriodicFloor');
  });

  it('detects AttentionSpike when projects have attention score > 0', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ attentionScore: 100, attentionReason: 'Stalled — 20 min' }),
        makeProject({ projectName: 'Proj2', attentionScore: 0 }),
      ],
    }));
    expect(result.score).toBe(1.0);
    const spike = result.signals.find(s => s.id === 'AttentionSpike');
    expect(spike).toBeDefined();
    expect(spike!.reason).toContain('1 project');
    expect(spike!.reason).toContain('TestProject');
  });

  it('AttentionSpike reports multiple projects', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ attentionScore: 100, attentionReason: 'Stalled' }),
        makeProject({ projectName: 'B', attentionScore: 80, attentionReason: 'Error' }),
      ],
    }));
    const spike = result.signals.find(s => s.id === 'AttentionSpike');
    expect(spike!.reason).toContain('2 projects');
  });

  it('detects ContextPressureCluster when 2+ projects above 75%', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ contextPressurePercent: 80 }),
        makeProject({ projectName: 'B', contextPressurePercent: 85 }),
      ],
    }));
    const cluster = result.signals.find(s => s.id === 'ContextPressureCluster');
    expect(cluster).toBeDefined();
    expect(cluster!.score).toBe(0.9);
  });

  it('does not trigger ContextPressureCluster with only 1 project above 75%', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ contextPressurePercent: 80 }),
        makeProject({ projectName: 'B', contextPressurePercent: 50 }),
      ],
    }));
    const cluster = result.signals.find(s => s.id === 'ContextPressureCluster');
    expect(cluster).toBeUndefined();
  });

  it('detects BurnRateAnomaly when current rate is 3x+ average', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [makeProject({ burnRatePerHour: 6.0 })],
      averageBurnRate: 1.5,
    }));
    const anomaly = result.signals.find(s => s.id === 'BurnRateAnomaly');
    expect(anomaly).toBeDefined();
    expect(anomaly!.score).toBe(0.8);
    expect(anomaly!.reason).toContain('4.0x');
  });

  it('does not trigger BurnRateAnomaly when rate is below 3x', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [makeProject({ burnRatePerHour: 2.0 })],
      averageBurnRate: 1.5,
    }));
    const anomaly = result.signals.find(s => s.id === 'BurnRateAnomaly');
    expect(anomaly).toBeUndefined();
  });

  it('does not trigger BurnRateAnomaly when averageBurnRate is 0', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [makeProject({ burnRatePerHour: 5.0 })],
      averageBurnRate: 0,
    }));
    const anomaly = result.signals.find(s => s.id === 'BurnRateAnomaly');
    expect(anomaly).toBeUndefined();
  });

  it('detects TaskQueuePressure when 3+ tasks blocked', () => {
    const result = evaluateWakeSignals(makeInput({
      taskSummary: { total: 10, todo: 2, inProgress: 2, blocked: 4, review: 1, done: 1 },
    }));
    const pressure = result.signals.find(s => s.id === 'TaskQueuePressure');
    expect(pressure).toBeDefined();
    expect(pressure!.score).toBe(0.7);
  });

  it('does not trigger TaskQueuePressure when fewer than 3 blocked', () => {
    const result = evaluateWakeSignals(makeInput({
      taskSummary: { total: 10, todo: 2, inProgress: 4, blocked: 2, review: 1, done: 1 },
    }));
    const pressure = result.signals.find(s => s.id === 'TaskQueuePressure');
    expect(pressure).toBeUndefined();
  });

  it('detects ReviewBacklog when 5+ tasks in review', () => {
    const result = evaluateWakeSignals(makeInput({
      taskSummary: { total: 10, todo: 0, inProgress: 0, blocked: 0, review: 5, done: 5 },
    }));
    const backlog = result.signals.find(s => s.id === 'ReviewBacklog');
    expect(backlog).toBeDefined();
    expect(backlog!.score).toBe(0.6);
  });

  it('does not trigger ReviewBacklog when fewer than 5 in review', () => {
    const result = evaluateWakeSignals(makeInput({
      taskSummary: { total: 10, todo: 2, inProgress: 2, blocked: 0, review: 4, done: 2 },
    }));
    const backlog = result.signals.find(s => s.id === 'ReviewBacklog');
    expect(backlog).toBeUndefined();
  });

  it('signals are sorted by score descending', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ attentionScore: 100, attentionReason: 'Stalled', contextPressurePercent: 80 }),
        makeProject({ projectName: 'B', contextPressurePercent: 85, attentionScore: 0 }),
      ],
      taskSummary: { total: 10, todo: 0, inProgress: 0, blocked: 5, review: 0, done: 5 },
    }));
    for (let i = 1; i < result.signals.length; i++) {
      expect(result.signals[i - 1].score).toBeGreaterThanOrEqual(result.signals[i].score);
    }
  });

  it('score is the maximum signal score', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ attentionScore: 100, attentionReason: 'Error', contextPressurePercent: 80 }),
        makeProject({ projectName: 'B', contextPressurePercent: 85 }),
      ],
    }));
    expect(result.score).toBe(1.0); // AttentionSpike
  });

  it('summary includes fleet stats', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ activityState: 'running' }),
        makeProject({ projectName: 'B', activityState: 'idle' }),
        makeProject({ projectName: 'C', activityState: 'stalled' }),
      ],
    }));
    expect(result.summary).toContain('1 running');
    expect(result.summary).toContain('1 idle');
    expect(result.summary).toContain('1 stalled');
  });

  it('summary includes task summary when provided', () => {
    const result = evaluateWakeSignals(makeInput({
      taskSummary: { total: 15, todo: 3, inProgress: 4, blocked: 2, review: 1, done: 5 },
    }));
    expect(result.summary).toContain('15 total');
    expect(result.summary).toContain('2 blocked');
  });

  it('handles empty project list', () => {
    const result = evaluateWakeSignals(makeInput({ projects: [] }));
    expect(result.score).toBe(0.1); // Only PeriodicFloor
    expect(result.signals).toHaveLength(1);
  });

  it('handles null contextPressurePercent gracefully', () => {
    const result = evaluateWakeSignals(makeInput({
      projects: [
        makeProject({ contextPressurePercent: null }),
        makeProject({ projectName: 'B', contextPressurePercent: null }),
      ],
    }));
    const cluster = result.signals.find(s => s.id === 'ContextPressureCluster');
    expect(cluster).toBeUndefined();
  });
});

describe('wake-scorer — shouldWake', () => {
  const lowEval = {
    score: 0.1,
    signals: [{ id: 'PeriodicFloor', score: 0.1, reason: 'Periodic' }],
    shouldWake: true,
    summary: 'test',
  };

  const highEval = {
    score: 0.8,
    signals: [{ id: 'BurnRateAnomaly', score: 0.8, reason: 'Spike' }],
    shouldWake: true,
    summary: 'test',
  };

  it('persistent always wakes', () => {
    expect(shouldWake(lowEval, 'persistent', 0.5)).toBe(true);
    expect(shouldWake(highEval, 'persistent', 0.5)).toBe(true);
  });

  it('on-demand always wakes', () => {
    expect(shouldWake(lowEval, 'on-demand', 0.5)).toBe(true);
    expect(shouldWake(highEval, 'on-demand', 0.5)).toBe(true);
  });

  it('smart wakes only when score >= threshold', () => {
    expect(shouldWake(lowEval, 'smart', 0.5)).toBe(false);
    expect(shouldWake(highEval, 'smart', 0.5)).toBe(true);
  });

  it('smart with threshold 0 always wakes', () => {
    expect(shouldWake(lowEval, 'smart', 0)).toBe(true);
  });

  it('smart with threshold 1.0 only wakes on max signal', () => {
    expect(shouldWake(highEval, 'smart', 1.0)).toBe(false);
    const maxEval = { ...highEval, score: 1.0 };
    expect(shouldWake(maxEval, 'smart', 1.0)).toBe(true);
  });
});
