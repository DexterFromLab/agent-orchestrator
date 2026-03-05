// SDK Message Adapter — insulates UI from Claude Agent SDK wire format changes
// This is the ONLY place that knows SDK internals.
// Phase 3: full implementation

export interface AgentMessage {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'subagent_spawn' | 'subagent_stop' | 'status' | 'cost' | 'unknown';
  parentId?: string;
  content: unknown;
  timestamp: number;
}

/**
 * Adapt a raw SDK message to our internal format.
 * When SDK changes wire format, only this function needs updating.
 */
export function adaptSDKMessage(raw: Record<string, unknown>): AgentMessage {
  // Phase 3: implement based on actual SDK message types
  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    type: 'unknown',
    content: raw,
    timestamp: Date.now(),
  };
}
