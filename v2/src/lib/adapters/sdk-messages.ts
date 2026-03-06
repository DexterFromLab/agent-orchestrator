// SDK Message Adapter — insulates UI from Claude Agent SDK wire format changes
// This is the ONLY place that knows SDK internals.

export type AgentMessageType =
  | 'init'
  | 'text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'cost'
  | 'error'
  | 'unknown';

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  parentId?: string;
  content: unknown;
  timestamp: number;
}

export interface InitContent {
  sessionId: string;
  model: string;
  cwd: string;
  tools: string[];
}

export interface TextContent {
  text: string;
}

export interface ThinkingContent {
  text: string;
}

export interface ToolCallContent {
  toolUseId: string;
  name: string;
  input: unknown;
}

export interface ToolResultContent {
  toolUseId: string;
  output: unknown;
}

export interface StatusContent {
  subtype: string;
  message?: string;
}

export interface CostContent {
  totalCostUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  isError: boolean;
  result?: string;
  errors?: string[];
}

export interface ErrorContent {
  message: string;
}

/**
 * Adapt a raw SDK stream-json message to our internal format.
 * When SDK changes wire format, only this function needs updating.
 */
export function adaptSDKMessage(raw: Record<string, unknown>): AgentMessage[] {
  const uuid = (raw.uuid as string) ?? crypto.randomUUID();
  const timestamp = Date.now();
  const parentId = raw.parent_tool_use_id as string | undefined;

  switch (raw.type) {
    case 'system':
      return adaptSystemMessage(raw, uuid, timestamp);
    case 'assistant':
      return adaptAssistantMessage(raw, uuid, timestamp, parentId);
    case 'user':
      return adaptUserMessage(raw, uuid, timestamp, parentId);
    case 'result':
      return adaptResultMessage(raw, uuid, timestamp);
    default:
      return [{
        id: uuid,
        type: 'unknown',
        content: raw,
        timestamp,
      }];
  }
}

function adaptSystemMessage(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
): AgentMessage[] {
  const subtype = raw.subtype as string;

  if (subtype === 'init') {
    return [{
      id: uuid,
      type: 'init',
      content: {
        sessionId: raw.session_id as string,
        model: raw.model as string,
        cwd: raw.cwd as string,
        tools: (raw.tools as string[]) ?? [],
      } satisfies InitContent,
      timestamp,
    }];
  }

  return [{
    id: uuid,
    type: 'status',
    content: {
      subtype,
      message: raw.status as string | undefined,
    } satisfies StatusContent,
    timestamp,
  }];
}

function adaptAssistantMessage(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
  parentId?: string,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const msg = raw.message as Record<string, unknown> | undefined;
  if (!msg) return messages;

  const content = msg.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return messages;

  for (const block of content) {
    switch (block.type) {
      case 'text':
        messages.push({
          id: `${uuid}-text-${messages.length}`,
          type: 'text',
          parentId,
          content: { text: block.text as string } satisfies TextContent,
          timestamp,
        });
        break;
      case 'thinking':
        messages.push({
          id: `${uuid}-think-${messages.length}`,
          type: 'thinking',
          parentId,
          content: { text: (block.thinking ?? block.text) as string } satisfies ThinkingContent,
          timestamp,
        });
        break;
      case 'tool_use':
        messages.push({
          id: `${uuid}-tool-${messages.length}`,
          type: 'tool_call',
          parentId,
          content: {
            toolUseId: block.id as string,
            name: block.name as string,
            input: block.input,
          } satisfies ToolCallContent,
          timestamp,
        });
        break;
    }
  }

  return messages;
}

function adaptUserMessage(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
  parentId?: string,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const msg = raw.message as Record<string, unknown> | undefined;
  if (!msg) return messages;

  const content = msg.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return messages;

  for (const block of content) {
    if (block.type === 'tool_result') {
      messages.push({
        id: `${uuid}-result-${messages.length}`,
        type: 'tool_result',
        parentId,
        content: {
          toolUseId: block.tool_use_id as string,
          output: block.content ?? raw.tool_use_result,
        } satisfies ToolResultContent,
        timestamp,
      });
    }
  }

  return messages;
}

function adaptResultMessage(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
): AgentMessage[] {
  const usage = raw.usage as Record<string, number> | undefined;

  return [{
    id: uuid,
    type: 'cost',
    content: {
      totalCostUsd: (raw.total_cost_usd as number) ?? 0,
      durationMs: (raw.duration_ms as number) ?? 0,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      numTurns: (raw.num_turns as number) ?? 0,
      isError: (raw.is_error as boolean) ?? false,
      result: raw.result as string | undefined,
      errors: raw.errors as string[] | undefined,
    } satisfies CostContent,
    timestamp,
  }];
}
