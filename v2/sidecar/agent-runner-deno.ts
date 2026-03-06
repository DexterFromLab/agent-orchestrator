// Agent Runner — Deno sidecar entry point (experimental)
// Drop-in replacement for agent-runner.ts using Deno APIs
// Build: deno compile --allow-run --allow-env --allow-read agent-runner-deno.ts -o dist/agent-runner
// Run:   deno run --allow-run --allow-env --allow-read agent-runner-deno.ts

import { TextLineStream } from "https://deno.land/std@0.224.0/streams/text_line_stream.ts";

const encoder = new TextEncoder();

// Active agent sessions keyed by session ID
const sessions = new Map<string, Deno.ChildProcess>();

function send(msg: Record<string, unknown>) {
  Deno.stdout.writeSync(encoder.encode(JSON.stringify(msg) + "\n"));
}

function log(message: string) {
  Deno.stderr.writeSync(encoder.encode(`[sidecar] ${message}\n`));
}

interface QueryMessage {
  type: "query";
  sessionId: string;
  prompt: string;
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  resumeSessionId?: string;
}

interface StopMessage {
  type: "stop";
  sessionId: string;
}

function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case "ping":
      send({ type: "pong" });
      break;
    case "query":
      handleQuery(msg as unknown as QueryMessage);
      break;
    case "stop":
      handleStop(msg as unknown as StopMessage);
      break;
    default:
      send({ type: "error", message: `Unknown message type: ${msg.type}` });
  }
}

function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd, maxTurns, maxBudgetUsd, resumeSessionId } = msg;

  if (sessions.has(sessionId)) {
    send({ type: "error", sessionId, message: "Session already running" });
    return;
  }

  const args = ["-p", "--output-format", "stream-json", "--verbose"];

  if (maxTurns) args.push("--max-turns", String(maxTurns));
  if (maxBudgetUsd) args.push("--max-budget-usd", String(maxBudgetUsd));
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  args.push(prompt);

  log(`Starting agent session ${sessionId}: claude ${args.join(" ")}`);

  // Strip all CLAUDE* env vars to prevent nesting detection by claude CLI
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (!key.startsWith("CLAUDE")) {
      env[key] = value;
    }
  }

  const command = new Deno.Command("claude", {
    args,
    cwd: cwd || Deno.cwd(),
    env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  sessions.set(sessionId, child);
  send({ type: "agent_started", sessionId });

  // Parse NDJSON from claude's stdout
  (async () => {
    const lines = child.stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());
    for await (const line of lines) {
      try {
        const sdkMsg = JSON.parse(line);
        send({ type: "agent_event", sessionId, event: sdkMsg });
      } catch {
        log(`Non-JSON from claude stdout: ${line}`);
      }
    }
  })();

  // Capture stderr
  (async () => {
    const lines = child.stderr
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());
    for await (const line of lines) {
      log(`[claude:${sessionId}] ${line}`);
      send({ type: "agent_log", sessionId, message: line });
    }
  })();

  // Wait for exit
  child.status.then((status) => {
    log(`Claude process exited for ${sessionId}: code=${status.code} signal=${status.signal}`);
    sessions.delete(sessionId);
    send({
      type: "agent_stopped",
      sessionId,
      exitCode: status.code,
      signal: status.signal,
    });
  });
}

function handleStop(msg: StopMessage) {
  const { sessionId } = msg;
  const child = sessions.get(sessionId);
  if (!child) {
    send({ type: "error", sessionId, message: "Session not found" });
    return;
  }

  log(`Stopping agent session ${sessionId}`);
  child.kill("SIGTERM");

  // Force kill after 5s
  setTimeout(() => {
    if (sessions.has(sessionId)) {
      log(`Force killing agent session ${sessionId}`);
      child.kill("SIGKILL");
    }
  }, 5000);
}

// Main: read NDJSON from stdin
log("Sidecar started (Deno)");
send({ type: "ready" });

const lines = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream());

for await (const line of lines) {
  try {
    const msg = JSON.parse(line);
    handleMessage(msg);
  } catch {
    log(`Invalid JSON: ${line}`);
  }
}
