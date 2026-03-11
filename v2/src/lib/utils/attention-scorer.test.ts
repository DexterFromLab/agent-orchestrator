import { describe, it, expect } from 'vitest';
import { scoreAttention, type AttentionInput } from './attention-scorer';

function makeInput(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    sessionStatus: undefined,
    sessionError: undefined,
    activityState: 'inactive',
    idleDurationMs: 0,
    contextPressure: null,
    fileConflictCount: 0,
    externalConflictCount: 0,
    ...overrides,
  };
}

describe('scoreAttention', () => {
  it('returns zero score when no attention needed', () => {
    const result = scoreAttention(makeInput());
    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  it('scores error highest after stalled', () => {
    const result = scoreAttention(makeInput({
      sessionStatus: 'error',
      sessionError: 'Connection refused',
    }));
    expect(result.score).toBe(90);
    expect(result.reason).toContain('Connection refused');
  });

  it('truncates long error messages to 60 chars', () => {
    const longError = 'A'.repeat(100);
    const result = scoreAttention(makeInput({
      sessionStatus: 'error',
      sessionError: longError,
    }));
    expect(result.reason!.length).toBeLessThanOrEqual(68); // "Error: " + 60 chars + null safety
  });

  it('scores stalled at 100', () => {
    const result = scoreAttention(makeInput({
      activityState: 'stalled',
      idleDurationMs: 20 * 60_000,
    }));
    expect(result.score).toBe(100);
    expect(result.reason).toContain('20 min');
  });

  it('scores critical context pressure (>90%) at 80', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      contextPressure: 0.95,
    }));
    expect(result.score).toBe(80);
    expect(result.reason).toContain('95%');
  });

  it('scores file conflicts at 70', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      fileConflictCount: 3,
    }));
    expect(result.score).toBe(70);
    expect(result.reason).toContain('3 file conflicts');
  });

  it('includes external conflict note when present', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      fileConflictCount: 2,
      externalConflictCount: 1,
    }));
    expect(result.reason).toContain('(1 external)');
  });

  it('scores high context pressure (>75%) at 40', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      contextPressure: 0.80,
    }));
    expect(result.score).toBe(40);
    expect(result.reason).toContain('80%');
  });

  it('error takes priority over stalled', () => {
    const result = scoreAttention(makeInput({
      sessionStatus: 'error',
      sessionError: 'fail',
      activityState: 'stalled',
      idleDurationMs: 30 * 60_000,
    }));
    expect(result.score).toBe(90);
  });

  it('stalled takes priority over context pressure', () => {
    const result = scoreAttention(makeInput({
      activityState: 'stalled',
      idleDurationMs: 20 * 60_000,
      contextPressure: 0.95,
    }));
    expect(result.score).toBe(100);
  });

  it('critical context takes priority over file conflicts', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      contextPressure: 0.92,
      fileConflictCount: 5,
    }));
    expect(result.score).toBe(80);
  });

  it('file conflicts take priority over high context', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      contextPressure: 0.78,
      fileConflictCount: 1,
    }));
    expect(result.score).toBe(70);
  });

  it('singular file conflict uses singular grammar', () => {
    const result = scoreAttention(makeInput({
      activityState: 'running',
      fileConflictCount: 1,
    }));
    expect(result.reason).toBe('1 file conflict');
  });

  it('handles undefined session error gracefully', () => {
    const result = scoreAttention(makeInput({
      sessionStatus: 'error',
      sessionError: undefined,
    }));
    expect(result.reason).toContain('Unknown');
  });
});
