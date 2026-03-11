// Ollama Runner — Node.js sidecar entry point for local Ollama provider
// Spawned by Rust SidecarManager, communicates via stdio NDJSON
// Uses direct HTTP to Ollama REST API (no external dependencies)

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';

const rl = createInterface({ input: stdin });

const sessions = new Map<string, { controller: AbortController }>();

function send(msg: Record<string, unknown>) {
  stdout.write(JSON.stringify(msg) + '\n');
}

function log(message: string) {
  stderr.write(`[ollama-sidecar] ${message}\n`);
}

rl.on('line', (line: string) => {
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).catch((err: unknown) => {
      log(`Unhandled error in message handler: ${err}`);
    });
  } catch {
    log(`Invalid JSON: ${line}`);
  }
});

interface QueryMessage {
  type: 'query';
  sessionId: string;
  prompt: string;
  cwd?: string;
  model?: string;
  systemPrompt?: string;
  providerConfig?: Record<string, unknown>;
}

interface StopMessage {
  type: 'stop';
  sessionId: string;
}

async function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
      break;
    case 'query':
      await handleQuery(msg as unknown as QueryMessage);
      break;
    case 'stop':
      handleStop(msg as unknown as StopMessage);
      break;
    default:
      send({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

async function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd, model, systemPrompt, providerConfig } = msg;

  if (sessions.has(sessionId)) {
    send({ type: 'error', sessionId, message: 'Session already running' });
    return;
  }

  const ollamaHost = (providerConfig?.host as string) || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const ollamaModel = model || 'qwen3:8b';
  const numCtx = (providerConfig?.num_ctx as number) || 32768;
  const think = (providerConfig?.think as boolean) ?? false;

  log(`Starting Ollama session ${sessionId} with model ${ollamaModel}`);

  // Health check
  try {
    const healthRes = await fetch(`${ollamaHost}/api/version`);
    if (!healthRes.ok) {
      send({ type: 'agent_error', sessionId, message: `Ollama not reachable at ${ollamaHost} (HTTP ${healthRes.status})` });
      return;
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    send({ type: 'agent_error', sessionId, message: `Cannot connect to Ollama at ${ollamaHost}: ${errMsg}` });
    return;
  }

  const controller = new AbortController();
  sessions.set(sessionId, { controller });
  send({ type: 'agent_started', sessionId });

  // Emit init event
  send({
    type: 'agent_event',
    sessionId,
    event: {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      model: ollamaModel,
      cwd: cwd || process.cwd(),
    },
  });

  // Build messages array
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt && typeof systemPrompt === 'string') {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages,
        stream: true,
        options: { num_ctx: numCtx },
        think,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errMsg: string;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed.error || errBody;
      } catch {
        errMsg = errBody;
      }
      send({ type: 'agent_error', sessionId, message: `Ollama error (${res.status}): ${errMsg}` });
      sessions.delete(sessionId);
      return;
    }

    if (!res.body) {
      send({ type: 'agent_error', sessionId, message: 'No response body from Ollama' });
      sessions.delete(sessionId);
      return;
    }

    // Parse NDJSON stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (controller.signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const chunk = JSON.parse(trimmed) as Record<string, unknown>;

          // Check for mid-stream error
          if (typeof chunk.error === 'string') {
            send({
              type: 'agent_event',
              sessionId,
              event: { type: 'error', message: chunk.error },
            });
            continue;
          }

          // Forward as chunk event for the message adapter
          send({
            type: 'agent_event',
            sessionId,
            event: {
              type: 'chunk',
              message: chunk.message,
              done: chunk.done,
              done_reason: chunk.done_reason,
              model: chunk.model,
              prompt_eval_count: chunk.prompt_eval_count,
              eval_count: chunk.eval_count,
              eval_duration: chunk.eval_duration,
              total_duration: chunk.total_duration,
            },
          });
        } catch {
          log(`Failed to parse Ollama chunk: ${trimmed}`);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as Record<string, unknown>;
        send({
          type: 'agent_event',
          sessionId,
          event: {
            type: 'chunk',
            message: chunk.message,
            done: chunk.done,
            done_reason: chunk.done_reason,
            model: chunk.model,
            prompt_eval_count: chunk.prompt_eval_count,
            eval_count: chunk.eval_count,
            eval_duration: chunk.eval_duration,
            total_duration: chunk.total_duration,
          },
        });
      } catch {
        log(`Failed to parse final Ollama buffer: ${buffer}`);
      }
    }

    sessions.delete(sessionId);
    send({
      type: 'agent_stopped',
      sessionId,
      exitCode: 0,
      signal: null,
    });
  } catch (err: unknown) {
    sessions.delete(sessionId);
    const errMsg = err instanceof Error ? err.message : String(err);

    if (controller.signal.aborted) {
      log(`Ollama session ${sessionId} aborted`);
      send({
        type: 'agent_stopped',
        sessionId,
        exitCode: null,
        signal: 'SIGTERM',
      });
    } else {
      log(`Ollama session ${sessionId} error: ${errMsg}`);
      send({
        type: 'agent_error',
        sessionId,
        message: errMsg,
      });
    }
  }
}

function handleStop(msg: StopMessage) {
  const { sessionId } = msg;
  const session = sessions.get(sessionId);
  if (!session) {
    send({ type: 'error', sessionId, message: 'Session not found' });
    return;
  }

  log(`Stopping Ollama session ${sessionId}`);
  session.controller.abort();
}

log('Ollama sidecar started');
send({ type: 'ready' });
