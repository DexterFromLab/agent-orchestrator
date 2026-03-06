// Agent Bridge — Tauri IPC adapter for sidecar communication
// Mirrors pty-bridge.ts pattern: invoke for commands, listen for events

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AgentQueryOptions {
  session_id: string;
  prompt: string;
  cwd?: string;
  max_turns?: number;
  max_budget_usd?: number;
  resume_session_id?: string;
}

export async function queryAgent(options: AgentQueryOptions): Promise<void> {
  return invoke('agent_query', { options });
}

export async function stopAgent(sessionId: string): Promise<void> {
  return invoke('agent_stop', { sessionId });
}

export async function isAgentReady(): Promise<boolean> {
  return invoke<boolean>('agent_ready');
}

export interface SidecarMessage {
  type: string;
  sessionId?: string;
  event?: Record<string, unknown>;
  message?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export async function onSidecarMessage(
  callback: (msg: SidecarMessage) => void,
): Promise<UnlistenFn> {
  return listen<SidecarMessage>('sidecar-message', (event) => {
    callback(event.payload as SidecarMessage);
  });
}

export async function onSidecarExited(callback: () => void): Promise<UnlistenFn> {
  return listen('sidecar-exited', () => {
    callback();
  });
}
