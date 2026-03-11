// Ollama Message Adapter — transforms Ollama chat streaming events to internal AgentMessage format
// Ollama runner emits synthesized events wrapping /api/chat NDJSON chunks

import type {
  AgentMessage,
  InitContent,
  TextContent,
  ThinkingContent,
  StatusContent,
  CostContent,
  ErrorContent,
} from './claude-messages';

import { str, num } from '../utils/type-guards';

/**
 * Adapt a raw Ollama runner event to AgentMessage[].
 *
 * The Ollama runner emits events in this format:
 * - {type:'system', subtype:'init', model, ...}
 * - {type:'chunk', message:{role,content,thinking}, done:false}
 * - {type:'chunk', message:{role,content}, done:true, done_reason, prompt_eval_count, eval_count, ...}
 * - {type:'error', message:'...'}
 */
export function adaptOllamaMessage(raw: Record<string, unknown>): AgentMessage[] {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();

  switch (raw.type) {
    case 'system':
      return adaptSystemEvent(raw, uuid, timestamp);

    case 'chunk':
      return adaptChunk(raw, uuid, timestamp);

    case 'error':
      return [{
        id: uuid,
        type: 'error',
        content: { message: str(raw.message, 'Ollama error') } satisfies ErrorContent,
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

function adaptSystemEvent(
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
        tools: [],
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

function adaptChunk(
  raw: Record<string, unknown>,
  uuid: string,
  timestamp: number,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const msg = typeof raw.message === 'object' && raw.message !== null
    ? raw.message as Record<string, unknown>
    : {};
  const done = raw.done === true;

  // Thinking content (extended thinking from Qwen3 etc.)
  const thinking = str(msg.thinking);
  if (thinking) {
    messages.push({
      id: `${uuid}-think`,
      type: 'thinking',
      content: { text: thinking } satisfies ThinkingContent,
      timestamp,
    });
  }

  // Text content
  const text = str(msg.content);
  if (text) {
    messages.push({
      id: `${uuid}-text`,
      type: 'text',
      content: { text } satisfies TextContent,
      timestamp,
    });
  }

  // Final chunk with token counts
  if (done) {
    const doneReason = str(raw.done_reason);
    const evalDuration = num(raw.eval_duration);
    const durationMs = evalDuration > 0 ? Math.round(evalDuration / 1_000_000) : 0;

    messages.push({
      id: `${uuid}-cost`,
      type: 'cost',
      content: {
        totalCostUsd: 0,
        durationMs,
        inputTokens: num(raw.prompt_eval_count),
        outputTokens: num(raw.eval_count),
        numTurns: 1,
        isError: doneReason === 'error',
      } satisfies CostContent,
      timestamp,
    });
  }

  return messages;
}
