// Aider Runner — Node.js sidecar entry point for Aider coding agent
// Spawned by Rust SidecarManager, communicates via stdio NDJSON
// Spawns `aider` CLI as subprocess in non-interactive mode

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { spawn, type ChildProcess } from 'child_process';
import { accessSync, constants } from 'fs';
import { join } from 'path';

const rl = createInterface({ input: stdin });

const sessions = new Map<string, { process: ChildProcess; controller: AbortController }>();

function send(msg: Record<string, unknown>) {
  stdout.write(JSON.stringify(msg) + '\n');
}

function log(message: string) {
  stderr.write(`[aider-sidecar] ${message}\n`);
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
  extraEnv?: Record<string, string>;
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
  const { sessionId, prompt, cwd, model, systemPrompt, extraEnv, providerConfig } = msg;

  if (sessions.has(sessionId)) {
    send({ type: 'error', sessionId, message: 'Session already running' });
    return;
  }

  // Find aider binary
  const aiderPath = which('aider');
  if (!aiderPath) {
    send({
      type: 'agent_error',
      sessionId,
      message: 'Aider not found. Install with: pipx install aider-chat',
    });
    return;
  }

  const aiderModel = model || 'openrouter/anthropic/claude-sonnet-4';
  log(`Starting Aider session ${sessionId} with model ${aiderModel}`);

  const controller = new AbortController();

  // Build aider command args
  const args: string[] = [
    '--model', aiderModel,
    '--message', prompt,
    '--yes-always',       // Auto-accept all file changes
    '--no-pretty',        // Plain text output (no terminal formatting)
    '--no-stream',        // Complete response (easier to parse)
    '--no-git',           // Let the outer project handle git
    '--no-auto-commits',  // Don't auto-commit changes
    '--no-check-model-accepts-settings', // Don't warn about model settings
  ];

  // Add system prompt via --read or environment
  if (systemPrompt) {
    // Aider doesn't have --system-prompt flag, pass via environment
    // The model will receive it as part of the conversation
    args.push('--message', `[System Context] ${systemPrompt}\n\n${prompt}`);
    // Remove the earlier --message prompt since we're combining
    const msgIdx = args.indexOf('--message');
    if (msgIdx !== -1) {
      args.splice(msgIdx, 2); // Remove first --message and its value
    }
  }

  // Extra aider flags from providerConfig
  if (providerConfig?.editFormat && typeof providerConfig.editFormat === 'string') {
    args.push('--edit-format', providerConfig.editFormat);
  }
  if (providerConfig?.architect === true) {
    args.push('--architect');
  }

  // Build environment
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  // Pass through API keys from extraEnv
  if (extraEnv) {
    Object.assign(env, extraEnv);
  }

  // OpenRouter API key from environment or providerConfig
  if (providerConfig?.openrouterApiKey && typeof providerConfig.openrouterApiKey === 'string') {
    env.OPENROUTER_API_KEY = providerConfig.openrouterApiKey;
  }

  send({ type: 'agent_started', sessionId });

  // Emit init event
  send({
    type: 'agent_event',
    sessionId,
    event: {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      model: aiderModel,
      cwd: cwd || process.cwd(),
    },
  });

  // Spawn aider process
  const child = spawn(aiderPath, args, {
    cwd: cwd || process.cwd(),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: controller.signal,
  });

  sessions.set(sessionId, { process: child, controller });

  let stdoutBuffer = '';
  let stderrBuffer = '';

  // Stream stdout as text chunks
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    stdoutBuffer += text;

    // Emit each line as a text event
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line) continue;
      send({
        type: 'agent_event',
        sessionId,
        event: {
          type: 'assistant',
          message: { role: 'assistant', content: line },
        },
      });
    }
  });

  // Capture stderr for logging
  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    stderrBuffer += text;
    // Log but don't emit to UI (same pattern as other runners)
    for (const line of text.split('\n')) {
      if (line.trim()) log(`[stderr] ${line}`);
    }
  });

  // Handle process exit
  child.on('close', (code: number | null, signal: string | null) => {
    sessions.delete(sessionId);

    // Emit final result as a single text block
    if (stdoutBuffer.trim()) {
      send({
        type: 'agent_event',
        sessionId,
        event: {
          type: 'result',
          subtype: 'result',
          result: stdoutBuffer.trim(),
          cost_usd: 0,
          duration_ms: 0,
          num_turns: 1,
          is_error: code !== 0 && code !== null,
          session_id: sessionId,
        },
      });
    }

    if (controller.signal.aborted) {
      send({ type: 'agent_stopped', sessionId, exitCode: null, signal: 'SIGTERM' });
    } else if (code !== 0 && code !== null) {
      const errorDetail = stderrBuffer.trim() || `Aider exited with code ${code}`;
      send({ type: 'agent_error', sessionId, message: errorDetail });
    } else {
      send({ type: 'agent_stopped', sessionId, exitCode: code, signal });
    }
  });

  child.on('error', (err: Error) => {
    sessions.delete(sessionId);
    log(`Aider spawn error: ${err.message}`);
    send({ type: 'agent_error', sessionId, message: `Failed to start Aider: ${err.message}` });
  });
}

function handleStop(msg: StopMessage) {
  const { sessionId } = msg;
  const session = sessions.get(sessionId);
  if (!session) {
    send({ type: 'error', sessionId, message: 'Session not found' });
    return;
  }

  log(`Stopping Aider session ${sessionId}`);
  session.controller.abort();
  session.process.kill('SIGTERM');
}

function which(name: string): string | null {
  const pathDirs = (process.env.PATH || '').split(':');
  for (const dir of pathDirs) {
    const full = join(dir, name);
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      continue;
    }
  }
  return null;
}

log('Aider sidecar started');
log(`Found aider at: ${which('aider') ?? 'NOT FOUND'}`);
send({ type: 'ready' });
