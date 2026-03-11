// Runtime type guards for safely extracting values from untyped wire formats

/** Returns value if it's a string, fallback otherwise */
export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Returns value if it's a number, fallback otherwise */
export function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
