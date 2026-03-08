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

/** Runtime guard — returns value if it's a string, fallback otherwise */
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Runtime guard — returns value if it's a number, fallback otherwise */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/**
 * Adapt a raw SDK stream-json message to our internal format.
 * When SDK changes wire format, only this function needs updating.
 */
export function adaptSDKMessage(raw: Record<string, unknown>): AgentMessage[] {
  const uuid = str(raw.uuid) || crypto.randomUUID();
  const timestamp = Date.now();
  const parentId = typeof raw.parent_tool_use_id === 'string' ? raw.parent_tool_use_id : undefined;

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
  const subtype = str(raw.subtype);

  if (subtype === 'init') {
    return [{
      id: uuid,
      type: 'init',
      content: {
        sessionId: str(raw.session_id),
        model: str(raw.model),
        cwd: str(raw.cwd),
        tools: Array.isArray(raw.tools) ? raw.tools.filter((t): t is string => typeof t === 'string') : [],
      } satisfies InitContent,
      timestamp,
    }];
  }

  return [{
    id: uuid,
    type: 'status',
    content: {
      subtype,
      message: typeof raw.status === 'string' ? raw.status : undefined,
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
  const msg = typeof raw.message === 'object' && raw.message !== null ? raw.message as Record<string, unknown> : undefined;
  if (!msg) return messages;

  const content = Array.isArray(msg.content) ? msg.content as Array<Record<string, unknown>> : undefined;
  if (!content) return messages;

  for (const block of content) {
    switch (block.type) {
      case 'text':
        messages.push({
          id: `${uuid}-text-${messages.length}`,
          type: 'text',
          parentId,
          content: { text: str(block.text) } satisfies TextContent,
          timestamp,
        });
        break;
      case 'thinking':
        messages.push({
          id: `${uuid}-think-${messages.length}`,
          type: 'thinking',
          parentId,
          content: { text: str(block.thinking ?? block.text) } satisfies ThinkingContent,
          timestamp,
        });
        break;
      case 'tool_use':
        messages.push({
          id: `${uuid}-tool-${messages.length}`,
          type: 'tool_call',
          parentId,
          content: {
            toolUseId: str(block.id),
            name: str(block.name),
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
  const msg = typeof raw.message === 'object' && raw.message !== null ? raw.message as Record<string, unknown> : undefined;
  if (!msg) return messages;

  const content = Array.isArray(msg.content) ? msg.content as Array<Record<string, unknown>> : undefined;
  if (!content) return messages;

  for (const block of content) {
    if (block.type === 'tool_result') {
      messages.push({
        id: `${uuid}-result-${messages.length}`,
        type: 'tool_result',
        parentId,
        content: {
          toolUseId: str(block.tool_use_id),
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
  const usage = typeof raw.usage === 'object' && raw.usage !== null ? raw.usage as Record<string, unknown> : undefined;

  return [{
    id: uuid,
    type: 'cost',
    content: {
      totalCostUsd: num(raw.total_cost_usd),
      durationMs: num(raw.duration_ms),
      inputTokens: num(usage?.input_tokens),
      outputTokens: num(usage?.output_tokens),
      numTurns: num(raw.num_turns),
      isError: raw.is_error === true,
      result: typeof raw.result === 'string' ? raw.result : undefined,
      errors: Array.isArray(raw.errors) ? raw.errors.filter((e): e is string => typeof e === 'string') : undefined,
    } satisfies CostContent,
    timestamp,
  }];
}
