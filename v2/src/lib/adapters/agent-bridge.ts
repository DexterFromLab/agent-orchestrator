// Agent Bridge — Tauri IPC adapter for sidecar communication
// Mirrors pty-bridge.ts pattern: invoke for commands, listen for events

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { ProviderId } from '../providers/types';

export interface AgentQueryOptions {
  provider?: ProviderId;
  session_id: string;
  prompt: string;
  cwd?: string;
  max_turns?: number;
  max_budget_usd?: number;
  resume_session_id?: string;
  permission_mode?: string;
  setting_sources?: string[];
  system_prompt?: string;
  model?: string;
  claude_config_dir?: string;
  additional_directories?: string[];
  provider_config?: Record<string, unknown>;
  remote_machine_id?: string;
}

export async function queryAgent(options: AgentQueryOptions): Promise<void> {
  if (options.remote_machine_id) {
    const { remote_machine_id: machineId, ...agentOptions } = options;
    return invoke('remote_agent_query', { machineId, options: agentOptions });
  }
  return invoke('agent_query', { options });
}

export async function stopAgent(sessionId: string, remoteMachineId?: string): Promise<void> {
  if (remoteMachineId) {
    return invoke('remote_agent_stop', { machineId: remoteMachineId, sessionId });
  }
  return invoke('agent_stop', { sessionId });
}

export async function isAgentReady(): Promise<boolean> {
  return invoke<boolean>('agent_ready');
}

export async function restartAgent(): Promise<void> {
  return invoke('agent_restart');
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
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) return;
    callback(payload as SidecarMessage);
  });
}

export async function onSidecarExited(callback: () => void): Promise<UnlistenFn> {
  return listen('sidecar-exited', () => {
    callback();
  });
}
