// Aider Runner — Node.js sidecar entry point for Aider coding agent
// Spawned by Rust SidecarManager, communicates via stdio NDJSON
// Runs aider in interactive mode — persistent process with stdin/stdout chat
// Pre-fetches btmsg/bttask context so the LLM has actionable data immediately.

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { accessSync, constants } from 'fs';
import { join } from 'path';

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

// --- Context pre-fetching ---
// Execute btmsg/bttask CLIs to gather context BEFORE sending prompt to LLM.
// This way the LLM gets real data to act on instead of suggesting commands.

function runCmd(cmd: string, env: Record<string, string>, cwd: string): string | null {
  try {
    const result = execSync(cmd, { env, cwd, timeout: 5000, encoding: 'utf-8' }).trim();
    log(`[prefetch] ${cmd} → ${result.length} chars`);
    return result || null;
  } catch (e: unknown) {
    log(`[prefetch] ${cmd} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function prefetchContext(env: Record<string, string>, cwd: string): string {
  log(`[prefetch] BTMSG_AGENT_ID=${env.BTMSG_AGENT_ID ?? 'NOT SET'}, cwd=${cwd}`);
  const parts: string[] = [];

  const inbox = runCmd('btmsg inbox', env, cwd);
  if (inbox) {
    parts.push(`## Your Inbox\n\`\`\`\n${inbox}\n\`\`\``);
  } else {
    parts.push('## Your Inbox\nNo messages (or btmsg unavailable).');
  }

  const board = runCmd('bttask board', env, cwd);
  if (board) {
    parts.push(`## Task Board\n\`\`\`\n${board}\n\`\`\``);
  } else {
    parts.push('## Task Board\nNo tasks (or bttask unavailable).');
  }

  return parts.join('\n\n');
}

// --- Prompt detection ---
// Aider with --no-pretty --no-fancy-input shows prompts like:
//   >  or  aider>  or  repo-name>
const PROMPT_RE = /^[a-zA-Z0-9._-]*> $/;

function looksLikePrompt(buffer: string): boolean {
  // Check the last non-empty line
  const lines = buffer.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.trim() === '') continue;
    return PROMPT_RE.test(l);
  }
  return false;
}

// Lines to suppress from UI (aider startup noise)
const SUPPRESS_RE = [
  /^Aider v\d/,
  /^Main model:/,
  /^Weak model:/,
  /^Git repo:/,
  /^Repo-map:/,
  /^Use \/help/,
];

function shouldSuppress(line: string): boolean {
  const t = line.trim();
  return t === '' || SUPPRESS_RE.some(p => p.test(t));
}

// --- Output line classification ---
// Thinking blocks: ► THINKING ... ► ANSWER
let inThinking = false;

function classifyLine(line: string): 'thinking' | 'shell' | 'cost' | 'prompt' | 'text' {
  const t = line.trim();
  if (t === '► THINKING' || t === '►  THINKING') { inThinking = true; return 'thinking'; }
  if (t === '► ANSWER' || t === '►  ANSWER') { inThinking = false; return 'thinking'; }
  if (inThinking) return 'thinking';
  if (t.startsWith('$ ') || t.startsWith('Running ')) return 'shell';
  if (/^Tokens: .+Cost:/.test(t)) return 'cost';
  if (PROMPT_RE.test(t)) return 'prompt';
  return 'text';
}

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

  const existing = sessions.get(sessionId);

  // Follow-up prompt on existing session
  if (existing && existing.process.exitCode === null) {
    log(`Continuing session ${sessionId} with follow-up prompt`);
    existing.turnBuffer = '';
    existing.lineBuffer = '';
    existing.turnStartTime = Date.now();
    existing.turns++;
    inThinking = false;

    send({ type: 'agent_started', sessionId });

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
        inThinking = false;
        log(`Aider ready, sending initial prompt (${fullPrompt.length} chars)`);
        child.stdin?.write(fullPrompt + '\n');
      }
      return;
    }

    // Phase 2: accumulate output, emit complete lines
    session.lineBuffer += text;
    session.turnBuffer += text;

    // Process complete lines only
    const parts = session.lineBuffer.split('\n');
    session.lineBuffer = parts.pop() || ''; // keep incomplete last part

    for (const line of parts) {
      if (shouldSuppress(line)) continue;

      const cls = classifyLine(line);

      switch (cls) {
        case 'thinking':
          // Emit thinking as a collapsed block
          send({
            type: 'agent_event',
            sessionId,
            event: { type: 'assistant', message: { role: 'assistant', content: line } },
          });
          break;

        case 'shell':
          send({
            type: 'agent_event',
            sessionId,
            event: {
              type: 'tool_call',
              content: {
                toolName: 'shell',
                toolUseId: `shell-${Date.now()}`,
                input: { command: line.replace(/^(Running |\$ )/, '') },
              },
            },
          });
          break;

        case 'cost':
          // Parse cost and include in result
          break;

        case 'prompt':
          // Prompt marker — turn is complete
          break;

        case 'text':
          send({
            type: 'agent_event',
            sessionId,
            event: { type: 'assistant', message: { role: 'assistant', content: line } },
          });
          break;
      }
    }

    // Check if turn is complete (aider showing prompt again)
    if (looksLikePrompt(session.turnBuffer)) {
      const duration = Date.now() - session.turnStartTime;
      const costMatch = session.turnBuffer.match(/Cost: \$([0-9.]+) message, \$([0-9.]+) session/);
      const costUsd = costMatch ? parseFloat(costMatch[2]) : 0;

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
      session.lineBuffer = '';
      inThinking = false;
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
