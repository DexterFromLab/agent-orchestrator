// Error classifier — categorizes API errors for actionable user messaging

export type ApiErrorType =
  | 'rate_limit'
  | 'auth'
  | 'quota'
  | 'overloaded'
  | 'network'
  | 'unknown';

export interface ClassifiedError {
  type: ApiErrorType;
  message: string;
  retryable: boolean;
  /** Suggested retry delay in seconds (0 = no retry) */
  retryDelaySec: number;
}

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /too many requests/i,
  /rate_limit_error/i,
  /throttl/i,
];

const AUTH_PATTERNS = [
  /401/,
  /invalid.?api.?key/i,
  /authentication/i,
  /unauthorized/i,
  /invalid.?x-api-key/i,
  /api_key/i,
];

const QUOTA_PATTERNS = [
  /insufficient.?quota/i,
  /billing/i,
  /payment/i,
  /exceeded.*quota/i,
  /credit/i,
  /usage.?limit/i,
];

const OVERLOADED_PATTERNS = [
  /overloaded/i,
  /503/,
  /service.?unavailable/i,
  /capacity/i,
  /busy/i,
];

const NETWORK_PATTERNS = [
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /network/i,
  /fetch.?failed/i,
  /dns/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * Classify an error message into an actionable category.
 */
export function classifyError(errorMessage: string): ClassifiedError {
  if (matchesAny(errorMessage, RATE_LIMIT_PATTERNS)) {
    return {
      type: 'rate_limit',
      message: 'Rate limited. The API will auto-retry shortly.',
      retryable: true,
      retryDelaySec: 30,
    };
  }

  if (matchesAny(errorMessage, AUTH_PATTERNS)) {
    return {
      type: 'auth',
      message: 'API key invalid or expired. Check Settings.',
      retryable: false,
      retryDelaySec: 0,
    };
  }

  if (matchesAny(errorMessage, QUOTA_PATTERNS)) {
    return {
      type: 'quota',
      message: 'API quota exceeded. Check your billing.',
      retryable: false,
      retryDelaySec: 0,
    };
  }

  if (matchesAny(errorMessage, OVERLOADED_PATTERNS)) {
    return {
      type: 'overloaded',
      message: 'API overloaded. Retrying shortly...',
      retryable: true,
      retryDelaySec: 15,
    };
  }

  if (matchesAny(errorMessage, NETWORK_PATTERNS)) {
    return {
      type: 'network',
      message: 'Network error. Check your connection.',
      retryable: true,
      retryDelaySec: 5,
    };
  }

  return {
    type: 'unknown',
    message: errorMessage,
    retryable: false,
    retryDelaySec: 0,
  };
}
