// Aider Runner — Node.js sidecar entry point for Aider coding agent
// Spawned by Rust SidecarManager, communicates via stdio NDJSON
// Runs aider in interactive mode — persistent process with stdin/stdout chat
// Pre-fetches btmsg/bttask context so the LLM has actionable data immediately.
//
// Parsing logic lives in aider-parser.ts (exported for unit testing).

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { spawn, type ChildProcess } from 'child_process';
import { accessSync, constants } from 'fs';
import { join } from 'path';
import {
  type TurnBlock,
  looksLikePrompt,
  parseTurnOutput,
  prefetchContext,
  execShell,
  extractSessionCost,
  PROMPT_RE,
} from './aider-parser.js';

const rl = createInterface({ input: stdin });

interface AiderSession {
  process: ChildProcess;
  controller: AbortController;
  sessionId: string;
  model: string;
  lineBuffer: string;        // partial line accumulator for streaming
  turnBuffer: string;        // full turn output
  turnStartTime: number;
  turns: number;
  ready: boolean;
  env: Record<string, string>;
  cwd: string;
  autonomousMode: 'restricted' | 'autonomous';
}

const sessions = new Map<string, AiderSession>();

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

// Parsing, I/O helpers, and constants are imported from aider-parser.ts

// --- Main query handler ---

async function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd: cwdOpt, model, systemPrompt, extraEnv, providerConfig } = msg;
  const cwd = cwdOpt || process.cwd();

  // Build environment
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (extraEnv) Object.assign(env, extraEnv);
  if (providerConfig?.openrouterApiKey && typeof providerConfig.openrouterApiKey === 'string') {
    env.OPENROUTER_API_KEY = providerConfig.openrouterApiKey;
  }

  const autonomousMode = (providerConfig?.autonomousMode as string) === 'autonomous' ? 'autonomous' : 'restricted' as const;

  const existing = sessions.get(sessionId);

  // Follow-up prompt on existing session
  if (existing && existing.process.exitCode === null) {
    log(`Continuing session ${sessionId} with follow-up prompt`);
    existing.turnBuffer = '';
    existing.lineBuffer = '';
    existing.turnStartTime = Date.now();
    existing.turns++;

    send({ type: 'agent_started', sessionId });

    // Show the incoming prompt in the console
    send({
      type: 'agent_event',
      sessionId,
      event: { type: 'input', prompt },
    });

    // Pre-fetch fresh context for follow-up turns too
    const ctx = prefetchContext(existing.env, existing.cwd);
    const fullPrompt = `${ctx}\n\nNow act on the above. Your current task:\n${prompt}`;
    existing.process.stdin?.write(fullPrompt + '\n');
    return;
  }

  // New session — spawn aider
  const aiderPath = which('aider');
  if (!aiderPath) {
    send({ type: 'agent_error', sessionId, message: 'Aider not found. Install with: pipx install aider-chat' });
    return;
  }

  const aiderModel = model || 'openrouter/anthropic/claude-sonnet-4';
  log(`Starting Aider session ${sessionId} with model ${aiderModel}`);

  const controller = new AbortController();

  const args: string[] = [
    '--model', aiderModel,
    '--yes-always',
    '--no-pretty',
    '--no-fancy-input',
    '--no-stream',                     // Complete responses (no token fragments)
    '--no-git',
    '--no-auto-commits',
    '--suggest-shell-commands',
    '--no-check-model-accepts-settings',
  ];

  if (providerConfig?.editFormat && typeof providerConfig.editFormat === 'string') {
    args.push('--edit-format', providerConfig.editFormat);
  }
  if (providerConfig?.architect === true) {
    args.push('--architect');
  }

  send({ type: 'agent_started', sessionId });
  send({
    type: 'agent_event',
    sessionId,
    event: { type: 'system', subtype: 'init', session_id: sessionId, model: aiderModel, cwd },
  });

  // Show the incoming prompt in the console
  send({
    type: 'agent_event',
    sessionId,
    event: { type: 'input', prompt },
  });

  const child = spawn(aiderPath, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: controller.signal,
  });

  const session: AiderSession = {
    process: child,
    controller,
    sessionId,
    model: aiderModel,
    lineBuffer: '',
    turnBuffer: '',
    turnStartTime: Date.now(),
    turns: 0,
    ready: false,
    env,
    cwd,
    autonomousMode,
  };
  sessions.set(sessionId, session);

  // Pre-fetch btmsg/bttask context
  const prefetched = prefetchContext(env, cwd);

  // Build full initial prompt — our context FIRST, with explicit override
  const promptParts: string[] = [];
  promptParts.push(`IMPORTANT: You are an autonomous agent in a multi-agent system. Your PRIMARY job is to act on messages and tasks below, NOT to ask the user for files. You can run shell commands to accomplish tasks. If you need to read files, use shell commands like \`cat\`, \`find\`, \`ls\`. If you need to send messages, use \`btmsg send <agent-id> "message"\`. If you need to update tasks, use \`bttask status <task-id> done\`.`);
  if (systemPrompt) promptParts.push(systemPrompt);
  promptParts.push(prefetched);
  promptParts.push(`---\n\nNow act on the above. Your current task:\n${prompt}`);
  const fullPrompt = promptParts.join('\n\n');

  // Startup buffer — wait for first prompt before sending
  let startupBuffer = '';

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();

    // Phase 1: wait for aider startup to finish
    if (!session.ready) {
      startupBuffer += text;
      if (looksLikePrompt(startupBuffer)) {
        session.ready = true;
        session.turns = 1;
        session.turnStartTime = Date.now();
        log(`Aider ready, sending initial prompt (${fullPrompt.length} chars)`);
        child.stdin?.write(fullPrompt + '\n');
      }
      return;
    }

    // Phase 2: accumulate entire turn output, emit as batched blocks
    session.turnBuffer += text;

    // Only process when turn is complete (aider shows prompt again)
    if (!looksLikePrompt(session.turnBuffer)) return;

    const duration = Date.now() - session.turnStartTime;
    const blocks = parseTurnOutput(session.turnBuffer);

    // Emit structured blocks and execute shell commands
    const shellResults: string[] = [];

    for (const block of blocks) {
      switch (block.type) {
        case 'thinking':
          send({
            type: 'agent_event',
            sessionId,
            event: { type: 'thinking', content: block.content },
          });
          break;

        case 'text':
          if (block.content) {
            send({
              type: 'agent_event',
              sessionId,
              event: { type: 'assistant', message: { role: 'assistant', content: block.content } },
            });
          }
          break;

        case 'shell': {
          const cmdId = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          send({
            type: 'agent_event',
            sessionId,
            event: {
              type: 'tool_use',
              id: cmdId,
              name: 'Bash',
              input: { command: block.content },
            },
          });

          if (session.autonomousMode === 'autonomous') {
            log(`[exec] Running: ${block.content}`);
            const result = execShell(block.content, session.env, session.cwd);
            const output = result.stdout || '(no output)';

            send({
              type: 'agent_event',
              sessionId,
              event: {
                type: 'tool_result',
                tool_use_id: cmdId,
                content: output,
              },
            });

            shellResults.push(`$ ${block.content}\n${output}`);
          } else {
            log(`[restricted] Blocked: ${block.content}`);
            send({
              type: 'agent_event',
              sessionId,
              event: {
                type: 'tool_result',
                tool_use_id: cmdId,
                content: `[BLOCKED] Shell execution disabled in restricted mode. Command not executed: ${block.content}`,
              },
            });
          }
          break;
        }

        case 'cost':
          // Parsed below for the result event
          break;
      }
    }

    // Extract cost and emit result
    const costUsd = extractSessionCost(session.turnBuffer);

    send({
      type: 'agent_event',
      sessionId,
      event: {
        type: 'result',
        subtype: 'result',
        result: '',
        cost_usd: costUsd,
        duration_ms: duration,
        num_turns: session.turns,
        is_error: false,
        session_id: sessionId,
      },
    });

    send({ type: 'agent_stopped', sessionId, exitCode: 0, signal: null });
    session.turnBuffer = '';

    // If commands were executed, feed results back to aider for next turn
    if (shellResults.length > 0 && child.exitCode === null) {
      const feedback = `The following commands were executed and here are the results:\n\n${shellResults.join('\n\n')}\n\nBased on these results, continue your work. If the task is complete, say "DONE".`;
      log(`[exec] Feeding ${shellResults.length} command results back to aider`);
      session.turnBuffer = '';
      session.turnStartTime = Date.now();
      session.turns++;
      send({ type: 'agent_started', sessionId });
      child.stdin?.write(feedback + '\n');
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) log(`[stderr] ${line}`);
    }
  });

  child.on('close', (code: number | null, signal: string | null) => {
    sessions.delete(sessionId);
    if (controller.signal.aborted) {
      send({ type: 'agent_stopped', sessionId, exitCode: null, signal: 'SIGTERM' });
    } else if (code !== 0 && code !== null) {
      send({ type: 'agent_error', sessionId, message: `Aider exited with code ${code}` });
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
  session.process.stdin?.write('/exit\n');
  const killTimer = setTimeout(() => {
    session.controller.abort();
    session.process.kill('SIGTERM');
  }, 3000);
  session.process.once('close', () => clearTimeout(killTimer));
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
