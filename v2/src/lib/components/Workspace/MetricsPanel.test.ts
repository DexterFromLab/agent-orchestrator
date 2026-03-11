import { describe, it, expect } from 'vitest';

// Test the pure utility functions used in MetricsPanel
// These are extracted for testability since the component uses them internally

// --- Sparkline path generator (same logic as in MetricsPanel.svelte) ---
function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length < 2) return '';
  const max = Math.max(...points, 0.001);
  const step = width / (points.length - 1);
  return points
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// --- Format helpers (same logic as in MetricsPanel.svelte) ---
type HistoryMetric = 'cost' | 'tokens' | 'turns' | 'tools' | 'duration';

function formatMetricValue(metric: HistoryMetric, value: number): string {
  switch (metric) {
    case 'cost': return `$${value.toFixed(4)}`;
    case 'tokens': return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${value}`;
    case 'turns': return `${value}`;
    case 'tools': return `${value}`;
    case 'duration': return `${value.toFixed(1)}m`;
  }
}

function fmtBurnRate(rate: number): string {
  if (rate === 0) return '$0/hr';
  if (rate < 0.01) return `$${(rate * 100).toFixed(1)}c/hr`;
  return `$${rate.toFixed(2)}/hr`;
}

function fmtPressure(p: number | null): string {
  if (p === null) return '—';
  return `${Math.round(p * 100)}%`;
}

function fmtIdle(ms: number): string {
  if (ms === 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function pressureColor(p: number | null): string {
  if (p === null) return 'var(--ctp-overlay0)';
  if (p > 0.9) return 'var(--ctp-red)';
  if (p > 0.75) return 'var(--ctp-peach)';
  if (p > 0.5) return 'var(--ctp-yellow)';
  return 'var(--ctp-green)';
}

function stateColor(state: string): string {
  switch (state) {
    case 'running': return 'var(--ctp-green)';
    case 'idle': return 'var(--ctp-overlay1)';
    case 'stalled': return 'var(--ctp-peach)';
    default: return 'var(--ctp-overlay0)';
  }
}

describe('MetricsPanel — sparklinePath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(sparklinePath([], 400, 120)).toBe('');
    expect(sparklinePath([5], 400, 120)).toBe('');
  });

  it('generates valid SVG path for 2 points', () => {
    const path = sparklinePath([0, 10], 400, 120);
    expect(path).toMatch(/^M0\.0,120\.0 L400\.0,0\.0$/);
  });

  it('generates path with correct number of segments', () => {
    const path = sparklinePath([1, 2, 3, 4, 5], 400, 100);
    const segments = path.split(' ');
    expect(segments).toHaveLength(5);
    expect(segments[0]).toMatch(/^M/);
    expect(segments[1]).toMatch(/^L/);
  });

  it('scales Y axis to max value', () => {
    const path = sparklinePath([50, 100], 400, 100);
    // Point 1: x=0, y=100 - (50/100)*100 = 50
    // Point 2: x=400, y=100 - (100/100)*100 = 0
    expect(path).toBe('M0.0,50.0 L400.0,0.0');
  });

  it('handles all-zero values without division by zero', () => {
    const path = sparklinePath([0, 0, 0], 400, 100);
    expect(path).not.toBe('');
    expect(path).not.toContain('NaN');
  });
});

describe('MetricsPanel — formatMetricValue', () => {
  it('formats cost with 4 decimals', () => {
    expect(formatMetricValue('cost', 1.2345)).toBe('$1.2345');
    expect(formatMetricValue('cost', 0)).toBe('$0.0000');
  });

  it('formats tokens with K suffix for large values', () => {
    expect(formatMetricValue('tokens', 150000)).toBe('150.0K');
    expect(formatMetricValue('tokens', 1500)).toBe('1.5K');
    expect(formatMetricValue('tokens', 500)).toBe('500');
  });

  it('formats turns as integer', () => {
    expect(formatMetricValue('turns', 42)).toBe('42');
  });

  it('formats tools as integer', () => {
    expect(formatMetricValue('tools', 7)).toBe('7');
  });

  it('formats duration with minutes suffix', () => {
    expect(formatMetricValue('duration', 5.3)).toBe('5.3m');
  });
});

describe('MetricsPanel — fmtBurnRate', () => {
  it('shows $0/hr for zero rate', () => {
    expect(fmtBurnRate(0)).toBe('$0/hr');
  });

  it('shows cents format for tiny rates', () => {
    expect(fmtBurnRate(0.005)).toBe('$0.5c/hr');
  });

  it('shows dollar format for normal rates', () => {
    expect(fmtBurnRate(2.5)).toBe('$2.50/hr');
  });
});

describe('MetricsPanel — fmtPressure', () => {
  it('shows dash for null', () => {
    expect(fmtPressure(null)).toBe('—');
  });

  it('formats as percentage', () => {
    expect(fmtPressure(0.75)).toBe('75%');
    expect(fmtPressure(0.5)).toBe('50%');
    expect(fmtPressure(1)).toBe('100%');
  });
});

describe('MetricsPanel — fmtIdle', () => {
  it('shows dash for zero', () => {
    expect(fmtIdle(0)).toBe('—');
  });

  it('shows seconds for short durations', () => {
    expect(fmtIdle(5000)).toBe('5s');
    expect(fmtIdle(30000)).toBe('30s');
  });

  it('shows minutes for medium durations', () => {
    expect(fmtIdle(120_000)).toBe('2m');
    expect(fmtIdle(3_599_000)).toBe('59m');
  });

  it('shows hours and minutes for long durations', () => {
    expect(fmtIdle(3_600_000)).toBe('1h 0m');
    expect(fmtIdle(5_400_000)).toBe('1h 30m');
  });
});

describe('MetricsPanel — pressureColor', () => {
  it('returns overlay0 for null', () => {
    expect(pressureColor(null)).toBe('var(--ctp-overlay0)');
  });

  it('returns red for critical pressure', () => {
    expect(pressureColor(0.95)).toBe('var(--ctp-red)');
  });

  it('returns peach for high pressure', () => {
    expect(pressureColor(0.8)).toBe('var(--ctp-peach)');
  });

  it('returns yellow for moderate pressure', () => {
    expect(pressureColor(0.6)).toBe('var(--ctp-yellow)');
  });

  it('returns green for low pressure', () => {
    expect(pressureColor(0.3)).toBe('var(--ctp-green)');
  });
});

describe('MetricsPanel — stateColor', () => {
  it('maps activity states to correct colors', () => {
    expect(stateColor('running')).toBe('var(--ctp-green)');
    expect(stateColor('idle')).toBe('var(--ctp-overlay1)');
    expect(stateColor('stalled')).toBe('var(--ctp-peach)');
    expect(stateColor('inactive')).toBe('var(--ctp-overlay0)');
    expect(stateColor('unknown')).toBe('var(--ctp-overlay0)');
  });
});
