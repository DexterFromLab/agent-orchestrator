import { describe, it, expect } from 'vitest';
import { classifyError, type ApiErrorType } from './error-classifier';

describe('classifyError', () => {
  // --- Rate limit ---
  it('classifies "rate_limit_error" as rate_limit', () => {
    const result = classifyError('rate_limit_error: Too many requests');
    expect(result.type).toBe('rate_limit');
    expect(result.retryable).toBe(true);
    expect(result.retryDelaySec).toBeGreaterThan(0);
  });

  it('classifies "429" as rate_limit', () => {
    const result = classifyError('HTTP 429 Too Many Requests');
    expect(result.type).toBe('rate_limit');
  });

  it('classifies "too many requests" as rate_limit', () => {
    const result = classifyError('Error: too many requests, please slow down');
    expect(result.type).toBe('rate_limit');
  });

  it('classifies "throttled" as rate_limit', () => {
    const result = classifyError('Request throttled by API');
    expect(result.type).toBe('rate_limit');
  });

  // --- Auth ---
  it('classifies "invalid_api_key" as auth', () => {
    const result = classifyError('invalid_api_key: The provided API key is invalid');
    expect(result.type).toBe('auth');
    expect(result.retryable).toBe(false);
  });

  it('classifies "401" as auth', () => {
    const result = classifyError('HTTP 401 Unauthorized');
    expect(result.type).toBe('auth');
  });

  it('classifies "authentication failed" as auth', () => {
    const result = classifyError('Authentication failed for this request');
    expect(result.type).toBe('auth');
  });

  // --- Quota ---
  it('classifies "insufficient_quota" as quota', () => {
    const result = classifyError('insufficient_quota: You have exceeded your usage limit');
    expect(result.type).toBe('quota');
    expect(result.retryable).toBe(false);
  });

  it('classifies "billing" as quota', () => {
    const result = classifyError('Error: billing issue with your account');
    expect(result.type).toBe('quota');
  });

  it('classifies "credit" as quota', () => {
    const result = classifyError('No remaining credit on your account');
    expect(result.type).toBe('quota');
  });

  // --- Overloaded ---
  it('classifies "overloaded" as overloaded', () => {
    const result = classifyError('The API is temporarily overloaded');
    expect(result.type).toBe('overloaded');
    expect(result.retryable).toBe(true);
  });

  it('classifies "503" as overloaded', () => {
    const result = classifyError('HTTP 503 Service Unavailable');
    expect(result.type).toBe('overloaded');
  });

  // --- Network ---
  it('classifies "ECONNREFUSED" as network', () => {
    const result = classifyError('connect ECONNREFUSED 127.0.0.1:443');
    expect(result.type).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('classifies "ETIMEDOUT" as network', () => {
    const result = classifyError('connect ETIMEDOUT');
    expect(result.type).toBe('network');
  });

  it('classifies "fetch failed" as network', () => {
    const result = classifyError('TypeError: fetch failed');
    expect(result.type).toBe('network');
  });

  // --- Unknown ---
  it('classifies unrecognized errors as unknown', () => {
    const result = classifyError('Something weird happened');
    expect(result.type).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.message).toBe('Something weird happened');
  });

  it('preserves original message for unknown errors', () => {
    const msg = 'Internal server error: null pointer';
    const result = classifyError(msg);
    expect(result.message).toBe(msg);
  });

  // --- Message quality ---
  it('provides actionable messages for rate_limit', () => {
    const result = classifyError('rate_limit_error');
    expect(result.message).toContain('Rate limited');
  });

  it('provides actionable messages for auth', () => {
    const result = classifyError('invalid_api_key');
    expect(result.message).toContain('Settings');
  });

  it('provides actionable messages for quota', () => {
    const result = classifyError('insufficient_quota');
    expect(result.message).toContain('billing');
  });
});
