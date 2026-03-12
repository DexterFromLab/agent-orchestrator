// Aider Message Adapter — transforms Aider runner events to internal AgentMessage format
// Aider runner emits: system/init, assistant (text lines), result, error

import type {
  AgentMessage,
  InitContent,
  TextContent,
  CostContent,
  ErrorContent,
} from './claude-messages';

import { str, num } from '../utils/type-guards';

/**
 * Adapt a raw Aider runner event to AgentMessage[].
 *
 * The Aider runner emits events in this format:
 * - {type:'system', subtype:'init', model, session_id, cwd}
 * - {type:'assistant', message:{role:'assistant', content:'...'}}
 * - {type:'result', subtype:'result', result:'...', cost_usd, duration_ms, is_error}
 * - {type:'error', message:'...'}
 */
export function adaptAiderMessage(raw: Record<string, unknown>): AgentMessage[] {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();

  switch (raw.type) {
    case 'system':
      if (str(raw.subtype) === 'init') {
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
        type: 'unknown',
        content: raw,
        timestamp,
      }];

    case 'assistant': {
      const msg = typeof raw.message === 'object' && raw.message !== null
        ? raw.message as Record<string, unknown>
        : {};
      const text = str(msg.content);
      if (!text) return [];
      return [{
        id: uuid,
        type: 'text',
        content: { text } satisfies TextContent,
        timestamp,
      }];
    }

    case 'result':
      return [{
        id: uuid,
        type: 'cost',
        content: {
          totalCostUsd: num(raw.cost_usd),
          durationMs: num(raw.duration_ms),
          inputTokens: 0,
          outputTokens: 0,
          numTurns: num(raw.num_turns) || 1,
          isError: raw.is_error === true,
        } satisfies CostContent,
        timestamp,
      }];

    case 'error':
      return [{
        id: uuid,
        type: 'error',
        content: { message: str(raw.message, 'Aider error') } satisfies ErrorContent,
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
