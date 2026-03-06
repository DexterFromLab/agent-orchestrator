// Agent Runner — Node.js sidecar entry point
// Spawned by Rust backend, communicates via stdio NDJSON
// Manages claude CLI subprocess with --output-format stream-json

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { spawn, type ChildProcess } from 'child_process';

const rl = createInterface({ input: stdin });

// Active agent sessions keyed by session ID
const sessions = new Map<string, ChildProcess>();

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

function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd, maxTurns, maxBudgetUsd, resumeSessionId } = msg;

  if (sessions.has(sessionId)) {
    send({ type: 'error', sessionId, message: 'Session already running' });
    return;
  }

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
  ];

  if (maxTurns) {
    args.push('--max-turns', String(maxTurns));
  }

  if (maxBudgetUsd) {
    args.push('--max-budget-usd', String(maxBudgetUsd));
  }

  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }

  args.push(prompt);

  log(`Starting agent session ${sessionId}: claude ${args.join(' ')}`);

  const child = spawn('claude', args, {
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      // Unset CLAUDECODE to avoid nesting detection
      CLAUDECODE: undefined,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  sessions.set(sessionId, child);

  send({ type: 'agent_started', sessionId });

  // Parse NDJSON from claude's stdout
  const childRl = createInterface({ input: child.stdout! });
  childRl.on('line', (line: string) => {
    try {
      const sdkMsg = JSON.parse(line);
      send({
        type: 'agent_event',
        sessionId,
        event: sdkMsg,
      });
    } catch {
      // Non-JSON output from claude (shouldn't happen with stream-json)
      log(`Non-JSON from claude stdout: ${line}`);
    }
  });

  // Capture stderr for debugging
  const stderrRl = createInterface({ input: child.stderr! });
  stderrRl.on('line', (line: string) => {
    log(`[claude:${sessionId}] ${line}`);
    send({
      type: 'agent_log',
      sessionId,
      message: line,
    });
  });

  child.on('error', (err: Error) => {
    log(`Claude process error for ${sessionId}: ${err.message}`);
    sessions.delete(sessionId);
    send({
      type: 'agent_error',
      sessionId,
      message: err.message,
    });
  });

  child.on('exit', (code: number | null, signal: string | null) => {
    log(`Claude process exited for ${sessionId}: code=${code} signal=${signal}`);
    sessions.delete(sessionId);
    send({
      type: 'agent_stopped',
      sessionId,
      exitCode: code,
      signal,
    });
  });
}

function handleStop(msg: StopMessage) {
  const { sessionId } = msg;
  const child = sessions.get(sessionId);
  if (!child) {
    send({ type: 'error', sessionId, message: 'Session not found' });
    return;
  }

  log(`Stopping agent session ${sessionId}`);
  child.kill('SIGTERM');

  // Force kill after 5s if still running
  setTimeout(() => {
    if (sessions.has(sessionId)) {
      log(`Force killing agent session ${sessionId}`);
      child.kill('SIGKILL');
    }
  }, 5000);
}

log('Sidecar started');
send({ type: 'ready' });
