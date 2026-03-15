// Message Adapter Registry — routes raw provider messages to the correct parser
// Each provider registers its own adapter; the dispatcher calls adaptMessage()

import type { AgentMessage } from './claude-messages';
import type { ProviderId } from '../providers/types';
import { adaptSDKMessage } from './claude-messages';
import { adaptCodexMessage } from './codex-messages';
import { adaptOllamaMessage } from './ollama-messages';
import { adaptAiderMessage } from './aider-messages';

/** Function signature for a provider message adapter */
export type MessageAdapter = (raw: Record<string, unknown>) => AgentMessage[];

const adapters = new Map<ProviderId, MessageAdapter>();

/** Register a message adapter for a provider */
export function registerMessageAdapter(providerId: ProviderId, adapter: MessageAdapter): void {
  adapters.set(providerId, adapter);
}

/** Adapt a raw message using the appropriate provider adapter */
export function adaptMessage(providerId: ProviderId, raw: Record<string, unknown>): AgentMessage[] {
  const adapter = adapters.get(providerId);
  if (!adapter) {
    console.warn(`No message adapter for provider: ${providerId}, falling back to claude`);
    return adaptSDKMessage(raw);
  }
  return adapter(raw);
}

// Register all provider adapters
registerMessageAdapter('claude', adaptSDKMessage);
registerMessageAdapter('codex', adaptCodexMessage);
registerMessageAdapter('ollama', adaptOllamaMessage);
registerMessageAdapter('aider', adaptAiderMessage);
