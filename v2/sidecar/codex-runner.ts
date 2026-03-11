// Codex Runner — Node.js sidecar entry point for OpenAI Codex provider
// Spawned by Rust SidecarManager, communicates via stdio NDJSON
// Uses @openai/codex-sdk for Codex session management

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const rl = createInterface({ input: stdin });

const sessions = new Map<string, { controller: AbortController }>();

function send(msg: Record<string, unknown>) {
  stdout.write(JSON.stringify(msg) + '\n');
}

function log(message: string) {
  stderr.write(`[codex-sidecar] ${message}\n`);
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
  maxTurns?: number;
  resumeSessionId?: string;
  permissionMode?: string;
  systemPrompt?: string;
  model?: string;
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
  const { sessionId, prompt, cwd, maxTurns, resumeSessionId, permissionMode, model, providerConfig } = msg;

  if (sessions.has(sessionId)) {
    send({ type: 'error', sessionId, message: 'Session already running' });
    return;
  }

  log(`Starting Codex session ${sessionId}`);

  const controller = new AbortController();

  // Strip CODEX*/OPENAI* env vars to prevent nesting issues
  const cleanEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('CODEX') && !key.startsWith('OPENAI')) {
      cleanEnv[key] = value;
    }
  }
  // Re-inject the API key
  const apiKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    cleanEnv['CODEX_API_KEY'] = apiKey;
  }

  // Dynamically import SDK — fails gracefully if not installed
  let Codex: any;
  try {
    const sdk = await import('@openai/codex-sdk');
    Codex = sdk.Codex ?? sdk.default;
  } catch {
    send({ type: 'agent_error', sessionId, message: 'Codex SDK not installed. Run: npm install @openai/codex-sdk' });
    return;
  }

  if (!apiKey) {
    send({ type: 'agent_error', sessionId, message: 'No API key. Set CODEX_API_KEY or OPENAI_API_KEY.' });
    return;
  }

  try {
    // Map permission mode to Codex sandbox/approval settings
    const sandbox = mapSandboxMode(providerConfig?.sandbox as string | undefined, permissionMode);
    const approvalPolicy = permissionMode === 'bypassPermissions' ? 'never' : 'on-request';

    const codex = new Codex({
      env: cleanEnv as Record<string, string>,
      config: {
        model: model ?? 'gpt-5.4',
        approval_policy: approvalPolicy,
        sandbox: sandbox,
      },
    });

    const threadOpts: Record<string, unknown> = {
      workingDirectory: cwd || process.cwd(),
    };

    const thread = resumeSessionId
      ? codex.resumeThread(resumeSessionId)
      : codex.startThread(threadOpts);

    sessions.set(sessionId, { controller });
    send({ type: 'agent_started', sessionId });

    const streamResult = await thread.runStreamed(prompt);

    for await (const event of streamResult.events) {
      if (controller.signal.aborted) break;

      // Forward raw Codex events — the message adapter parses them
      send({
        type: 'agent_event',
        sessionId,
        event: event as Record<string, unknown>,
      });
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
      log(`Codex session ${sessionId} aborted`);
      send({
        type: 'agent_stopped',
        sessionId,
        exitCode: null,
        signal: 'SIGTERM',
      });
    } else {
      log(`Codex session ${sessionId} error: ${errMsg}`);
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

  log(`Stopping Codex session ${sessionId}`);
  session.controller.abort();
}

function mapSandboxMode(
  configSandbox: string | undefined,
  permissionMode: string | undefined,
): string {
  if (configSandbox) return configSandbox;
  if (permissionMode === 'bypassPermissions') return 'danger-full-access';
  return 'workspace-write';
}

function findCodexCli(): string | undefined {
  const candidates = [
    join(homedir(), '.local', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/usr/bin/codex',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    return execSync('which codex 2>/dev/null || where codex 2>nul', { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

const codexPath = findCodexCli();
if (codexPath) {
  log(`Found Codex CLI at ${codexPath}`);
} else {
  log('Codex CLI not found — will use SDK if available');
}

log('Codex sidecar started');
send({ type: 'ready' });
