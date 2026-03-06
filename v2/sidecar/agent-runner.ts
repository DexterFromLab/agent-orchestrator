// Agent Runner — Node.js sidecar entry point
// Spawned by Rust backend, communicates via stdio NDJSON
// Uses @anthropic-ai/claude-agent-sdk for proper Claude session management

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';

const rl = createInterface({ input: stdin });

// Active agent sessions keyed by session ID
const sessions = new Map<string, { query: Query; controller: AbortController }>();

function send(msg: Record<string, unknown>) {
  stdout.write(JSON.stringify(msg) + '\n');
}

function log(message: string) {
  stderr.write(`[sidecar] ${message}\n`);
}

rl.on('line', (line: string) => {
  try {
    const msg = JSON.parse(line);
    handleMessage(msg);
  } catch {
    log(`Invalid JSON: ${line}`);
  }
});

interface QueryMessage {
  type: 'query';
  sessionId: string;
  prompt: string;
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  resumeSessionId?: string;
  permissionMode?: string;
}

interface StopMessage {
  type: 'stop';
  sessionId: string;
}

function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
      break;
    case 'query':
      handleQuery(msg as unknown as QueryMessage);
      break;
    case 'stop':
      handleStop(msg as unknown as StopMessage);
      break;
    default:
      send({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

async function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd, maxTurns, maxBudgetUsd, resumeSessionId, permissionMode } = msg;

  if (sessions.has(sessionId)) {
    send({ type: 'error', sessionId, message: 'Session already running' });
    return;
  }

  log(`Starting agent session ${sessionId} via SDK`);

  const controller = new AbortController();

  // Strip CLAUDE* env vars to prevent nesting detection by the spawned CLI
  const cleanEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('CLAUDE')) {
      cleanEnv[key] = value;
    }
  }

  try {
    const q = query({
      prompt,
      options: {
        abortController: controller,
        cwd: cwd || process.cwd(),
        env: cleanEnv,
        maxTurns: maxTurns ?? undefined,
        maxBudgetUsd: maxBudgetUsd ?? undefined,
        resume: resumeSessionId ?? undefined,
        allowedTools: [
          'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
          'WebSearch', 'WebFetch', 'TodoWrite', 'NotebookEdit',
        ],
        permissionMode: (permissionMode ?? 'bypassPermissions') as 'bypassPermissions' | 'default',
        allowDangerouslySkipPermissions: (permissionMode ?? 'bypassPermissions') === 'bypassPermissions',
      },
    });

    sessions.set(sessionId, { query: q, controller });
    send({ type: 'agent_started', sessionId });

    for await (const message of q) {
      // Forward SDK messages as-is — they use the same format as CLI stream-json
      const sdkMsg = message as Record<string, unknown>;
      send({
        type: 'agent_event',
        sessionId,
        event: sdkMsg,
      });
    }

    // Session completed normally
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

    if (errMsg.includes('aborted') || errMsg.includes('AbortError')) {
      log(`Agent session ${sessionId} aborted`);
      send({
        type: 'agent_stopped',
        sessionId,
        exitCode: null,
        signal: 'SIGTERM',
      });
    } else {
      log(`Agent session ${sessionId} error: ${errMsg}`);
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

  log(`Stopping agent session ${sessionId}`);
  session.controller.abort();
}

log('Sidecar started');
send({ type: 'ready' });
