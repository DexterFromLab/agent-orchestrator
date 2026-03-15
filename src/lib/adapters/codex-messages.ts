// Codex Message Adapter — transforms Codex CLI NDJSON events to internal AgentMessage format
// Codex events: thread.started, turn.started, item.started/updated/completed, turn.completed/failed

import type {
  AgentMessage,
  InitContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultContent,
  StatusContent,
  CostContent,
  ErrorContent,
} from './claude-messages';

import { str, num } from '../utils/type-guards';

export function adaptCodexMessage(raw: Record<string, unknown>): AgentMessage[] {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();

  switch (raw.type) {
    case 'thread.started':
      return [{
        id: uuid,
        type: 'init',
        content: {
          sessionId: str(raw.thread_id),
          model: '',
          cwd: '',
          tools: [],
        } satisfies InitContent,
        timestamp,
      }];

    case 'turn.started':
      return [{
        id: uuid,
        type: 'status',
        content: { subtype: 'turn_started' } satisfies StatusContent,
        timestamp,
      }];

    case 'turn.completed':
      return adaptTurnCompleted(raw, uuid, timestamp);

    case 'turn.failed':
      return [{
        id: uuid,
        type: 'error',
        content: {
          message: str((raw.error as Record<string, unknown>)?.message, 'Turn failed'),
        } satisfies ErrorContent,
        timestamp,
      }];

    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      return adaptItem(raw, uuid, timestamp);

    case 'error':
      return [{
        id: uuid,
        type: 'error',
        content: { message: str(raw.message, 'Unknown error') } satisfies ErrorContent,
        timestamp,
      }];

    default:
      return [{
        id: uuid,
        type: 'unknown',
        content: raw,
        timestamp,
      }];
  }
}

function adaptTurnCompleted(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
): AgentMessage[] {
  const usage = typeof raw.usage === 'object' && raw.usage !== null
    ? raw.usage as Record<string, unknown>
    : {};

  return [{
    id: uuid,
    type: 'cost',
    content: {
      totalCostUsd: 0,
      durationMs: 0,
      inputTokens: num(usage.input_tokens),
      outputTokens: num(usage.output_tokens),
      numTurns: 1,
      isError: false,
    } satisfies CostContent,
    timestamp,
  }];
}

function adaptItem(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
): AgentMessage[] {
  const item = typeof raw.item === 'object' && raw.item !== null
    ? raw.item as Record<string, unknown>
    : {};
  const itemType = str(item.type);
  const eventType = str(raw.type);

  switch (itemType) {
    case 'agent_message':
      if (eventType !== 'item.completed') return [];
      return [{
        id: uuid,
        type: 'text',
        content: { text: str(item.text) } satisfies TextContent,
        timestamp,
      }];

    case 'reasoning':
      if (eventType !== 'item.completed') return [];
      return [{
        id: uuid,
        type: 'thinking',
        content: { text: str(item.text) } satisfies ThinkingContent,
        timestamp,
      }];

    case 'command_execution':
      return adaptCommandExecution(item, uuid, timestamp, eventType);

    case 'file_change':
      return adaptFileChange(item, uuid, timestamp, eventType);

    case 'mcp_tool_call':
      return adaptMcpToolCall(item, uuid, timestamp, eventType);

    case 'web_search':
      if (eventType !== 'item.completed') return [];
      return [{
        id: uuid,
        type: 'tool_call',
        content: {
          toolUseId: str(item.id, uuid),
          name: 'WebSearch',
          input: { query: str(item.query) },
        } satisfies ToolCallContent,
        timestamp,
      }];

    case 'error':
      return [{
        id: uuid,
        type: 'error',
        content: { message: str(item.message, 'Item error') } satisfies ErrorContent,
        timestamp,
      }];

    default:
      return [];
  }
}

function adaptCommandExecution(
  item: Record<string, unknown>,
  uuid: string,
  timestamp: number,
  eventType: string,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const toolUseId = str(item.id, uuid);

  if (eventType === 'item.started' || eventType === 'item.completed') {
    messages.push({
      id: `${uuid}-call`,
      type: 'tool_call',
      content: {
        toolUseId,
        name: 'Bash',
        input: { command: str(item.command) },
      } satisfies ToolCallContent,
      timestamp,
    });
  }

  if (eventType === 'item.completed') {
    messages.push({
      id: `${uuid}-result`,
      type: 'tool_result',
      content: {
        toolUseId,
        output: str(item.aggregated_output),
      } satisfies ToolResultContent,
      timestamp,
    });
  }

  return messages;
}

function adaptFileChange(
  item: Record<string, unknown>,
  uuid: string,
  timestamp: number,
  eventType: string,
): AgentMessage[] {
  if (eventType !== 'item.completed') return [];

  const changes = Array.isArray(item.changes) ? item.changes as Array<Record<string, unknown>> : [];
  if (changes.length === 0) return [];

  const messages: AgentMessage[] = [];
  for (const change of changes) {
    const kind = str(change.kind);
    const toolName = kind === 'delete' ? 'Bash' : kind === 'add' ? 'Write' : 'Edit';
    const toolUseId = `${uuid}-${str(change.path)}`;

    messages.push({
      id: `${toolUseId}-call`,
      type: 'tool_call',
      content: {
        toolUseId,
        name: toolName,
        input: { file_path: str(change.path) },
      } satisfies ToolCallContent,
      timestamp,
    });

    messages.push({
      id: `${toolUseId}-result`,
      type: 'tool_result',
      content: {
        toolUseId,
        output: `File ${kind}: ${str(change.path)}`,
      } satisfies ToolResultContent,
      timestamp,
    });
  }

  return messages;
}

function adaptMcpToolCall(
  item: Record<string, unknown>,
  uuid: string,
  timestamp: number,
  eventType: string,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const toolUseId = str(item.id, uuid);
  const toolName = `${str(item.server)}:${str(item.tool)}`;

  if (eventType === 'item.started' || eventType === 'item.completed') {
    messages.push({
      id: `${uuid}-call`,
      type: 'tool_call',
      content: {
        toolUseId,
        name: toolName,
        input: item.arguments,
      } satisfies ToolCallContent,
      timestamp,
    });
  }

  if (eventType === 'item.completed') {
    const result = typeof item.result === 'object' && item.result !== null
      ? item.result as Record<string, unknown>
      : undefined;
    const error = typeof item.error === 'object' && item.error !== null
      ? item.error as Record<string, unknown>
      : undefined;

    messages.push({
      id: `${uuid}-result`,
      type: 'tool_result',
      content: {
        toolUseId,
        output: error ? str(error.message, 'MCP tool error') : (result?.content ?? result?.structured_content ?? 'OK'),
      } satisfies ToolResultContent,
      timestamp,
    });
  }

  return messages;
}
