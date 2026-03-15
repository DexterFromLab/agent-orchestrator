// Telemetry bridge — routes frontend events to Rust tracing via IPC
// No browser OTEL SDK needed (WebKit2GTK incompatible)

import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Emit a structured log event to the Rust tracing layer */
export function telemetryLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  invoke('frontend_log', { level, message, context: context ?? null }).catch(() => {
    // Swallow IPC errors — telemetry must never break the app
  });
}

/** Convenience wrappers */
export const tel = {
  error: (msg: string, ctx?: Record<string, unknown>) => telemetryLog('error', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => telemetryLog('warn', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => telemetryLog('info', msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => telemetryLog('debug', msg, ctx),
  trace: (msg: string, ctx?: Record<string, unknown>) => telemetryLog('trace', msg, ctx),
};
