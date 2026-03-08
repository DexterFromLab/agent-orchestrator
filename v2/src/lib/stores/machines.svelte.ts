// Remote machines store — tracks connection state for multi-machine support

import {
  listRemoteMachines,
  addRemoteMachine,
  removeRemoteMachine,
  connectRemoteMachine,
  disconnectRemoteMachine,
  onRemoteMachineReady,
  onRemoteMachineDisconnected,
  onRemoteError,
  onRemoteMachineReconnecting,
  onRemoteMachineReconnectReady,
  type RemoteMachineConfig,
  type RemoteMachineInfo,
} from '../adapters/remote-bridge';
import { notify } from './notifications.svelte';

export interface Machine extends RemoteMachineInfo {}

let machines = $state<Machine[]>([]);

export function getMachines(): Machine[] {
  return machines;
}

export function getMachine(id: string): Machine | undefined {
  return machines.find(m => m.id === id);
}

export async function loadMachines(): Promise<void> {
  try {
    machines = await listRemoteMachines();
  } catch (e) {
    console.warn('Failed to load remote machines:', e);
  }
}

export async function addMachine(config: RemoteMachineConfig): Promise<string> {
  const id = await addRemoteMachine(config);
  machines.push({
    id,
    label: config.label,
    url: config.url,
    status: 'disconnected',
    auto_connect: config.auto_connect,
  });
  return id;
}

export async function removeMachine(id: string): Promise<void> {
  await removeRemoteMachine(id);
  machines = machines.filter(m => m.id !== id);
}

export async function connectMachine(id: string): Promise<void> {
  const machine = machines.find(m => m.id === id);
  if (machine) machine.status = 'connecting';
  try {
    await connectRemoteMachine(id);
    if (machine) machine.status = 'connected';
  } catch (e) {
    if (machine) machine.status = 'error';
    throw e;
  }
}

export async function disconnectMachine(id: string): Promise<void> {
  await disconnectRemoteMachine(id);
  const machine = machines.find(m => m.id === id);
  if (machine) machine.status = 'disconnected';
}

// Stored unlisten functions for cleanup
let unlistenFns: (() => void)[] = [];

// Initialize event listeners for machine status updates
export async function initMachineListeners(): Promise<void> {
  // Clean up any existing listeners first
  destroyMachineListeners();

  unlistenFns.push(await onRemoteMachineReady((msg) => {
    const machine = machines.find(m => m.id === msg.machineId);
    if (machine) {
      machine.status = 'connected';
      notify('success', `Connected to ${machine.label}`);
    }
  }));

  unlistenFns.push(await onRemoteMachineDisconnected((msg) => {
    const machine = machines.find(m => m.id === msg.machineId);
    if (machine) {
      machine.status = 'disconnected';
      notify('warning', `Disconnected from ${machine.label}`);
    }
  }));

  unlistenFns.push(await onRemoteError((msg) => {
    const machine = machines.find(m => m.id === msg.machineId);
    if (machine) {
      machine.status = 'error';
      notify('error', `Error from ${machine.label}: ${msg.error}`);
    }
  }));

  unlistenFns.push(await onRemoteMachineReconnecting((msg) => {
    const machine = machines.find(m => m.id === msg.machineId);
    if (machine) {
      machine.status = 'reconnecting';
      notify('info', `Reconnecting to ${machine.label} in ${msg.backoffSecs}s…`);
    }
  }));

  unlistenFns.push(await onRemoteMachineReconnectReady((msg) => {
    const machine = machines.find(m => m.id === msg.machineId);
    if (machine) {
      notify('info', `${machine.label} reachable — reconnecting…`);
      connectMachine(msg.machineId).catch((e) => {
        notify('error', `Auto-reconnect failed for ${machine.label}: ${e}`);
      });
    }
  }));
}

/** Remove all event listeners to prevent leaks */
export function destroyMachineListeners(): void {
  for (const unlisten of unlistenFns) {
    unlisten();
  }
  unlistenFns = [];
}
