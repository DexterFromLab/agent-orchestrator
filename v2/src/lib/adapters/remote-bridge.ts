// Remote Machine Bridge — Tauri IPC adapter for multi-machine management

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface RemoteMachineConfig {
  label: string;
  url: string;
  token: string;
  auto_connect: boolean;
}

export interface RemoteMachineInfo {
  id: string;
  label: string;
  url: string;
  status: string;
  auto_connect: boolean;
}

// --- Machine management ---

export async function listRemoteMachines(): Promise<RemoteMachineInfo[]> {
  return invoke('remote_list');
}

export async function addRemoteMachine(config: RemoteMachineConfig): Promise<string> {
  return invoke('remote_add', { config });
}

export async function removeRemoteMachine(machineId: string): Promise<void> {
  return invoke('remote_remove', { machineId });
}

export async function connectRemoteMachine(machineId: string): Promise<void> {
  return invoke('remote_connect', { machineId });
}

export async function disconnectRemoteMachine(machineId: string): Promise<void> {
  return invoke('remote_disconnect', { machineId });
}

// --- Remote event listeners ---

export interface RemoteSidecarMessage {
  machineId: string;
  sessionId?: string;
  event?: Record<string, unknown>;
}

export interface RemotePtyData {
  machineId: string;
  sessionId?: string;
  data?: string;
}

export interface RemotePtyExit {
  machineId: string;
  sessionId?: string;
}

export interface RemoteMachineEvent {
  machineId: string;
  payload?: unknown;
  error?: unknown;
}

export async function onRemoteSidecarMessage(
  callback: (msg: RemoteSidecarMessage) => void,
): Promise<UnlistenFn> {
  return listen<RemoteSidecarMessage>('remote-sidecar-message', (event) => {
    callback(event.payload);
  });
}

export async function onRemotePtyData(
  callback: (msg: RemotePtyData) => void,
): Promise<UnlistenFn> {
  return listen<RemotePtyData>('remote-pty-data', (event) => {
    callback(event.payload);
  });
}

export async function onRemotePtyExit(
  callback: (msg: RemotePtyExit) => void,
): Promise<UnlistenFn> {
  return listen<RemotePtyExit>('remote-pty-exit', (event) => {
    callback(event.payload);
  });
}

export async function onRemoteMachineReady(
  callback: (msg: RemoteMachineEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteMachineEvent>('remote-machine-ready', (event) => {
    callback(event.payload);
  });
}

export async function onRemoteMachineDisconnected(
  callback: (msg: RemoteMachineEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteMachineEvent>('remote-machine-disconnected', (event) => {
    callback(event.payload);
  });
}

export async function onRemoteStateSync(
  callback: (msg: RemoteMachineEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteMachineEvent>('remote-state-sync', (event) => {
    callback(event.payload);
  });
}

export async function onRemoteError(
  callback: (msg: RemoteMachineEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteMachineEvent>('remote-error', (event) => {
    callback(event.payload);
  });
}

export interface RemoteReconnectingEvent {
  machineId: string;
  backoffSecs: number;
}

export async function onRemoteMachineReconnecting(
  callback: (msg: RemoteReconnectingEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteReconnectingEvent>('remote-machine-reconnecting', (event) => {
    callback(event.payload);
  });
}

export async function onRemoteMachineReconnectReady(
  callback: (msg: RemoteMachineEvent) => void,
): Promise<UnlistenFn> {
  return listen<RemoteMachineEvent>('remote-machine-reconnect-ready', (event) => {
    callback(event.payload);
  });
}
