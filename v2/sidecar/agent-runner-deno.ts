// Agent Runner — Deno sidecar entry point
// Drop-in replacement for agent-runner.ts using Deno APIs
// Uses @anthropic-ai/claude-agent-sdk via npm: specifier
// Run: deno run --allow-run --allow-env --allow-read --allow-write --allow-net agent-runner-deno.ts

import { TextLineStream } from "https://deno.land/std@0.224.0/streams/text_line_stream.ts";
import { query } from "npm:@anthropic-ai/claude-agent-sdk";

const encoder = new TextEncoder();

// Active sessions with abort controllers
const sessions = new Map<string, AbortController>();

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
  permissionMode?: string;
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

async function handleQuery(msg: QueryMessage) {
  const { sessionId, prompt, cwd, maxTurns, maxBudgetUsd, resumeSessionId, permissionMode } = msg;

  if (sessions.has(sessionId)) {
    send({ type: "error", sessionId, message: "Session already running" });
    return;
  }

  log(`Starting agent session ${sessionId} via SDK`);

  const controller = new AbortController();

  // Strip CLAUDE* env vars to prevent nesting detection
  const cleanEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (!key.startsWith("CLAUDE")) {
      cleanEnv[key] = value;
    }
  }

  try {
    const q = query({
      prompt,
      options: {
        abortController: controller,
        cwd: cwd || Deno.cwd(),
        env: cleanEnv,
        maxTurns: maxTurns ?? undefined,
        maxBudgetUsd: maxBudgetUsd ?? undefined,
        resume: resumeSessionId ?? undefined,
        allowedTools: [
          "Bash", "Read", "Write", "Edit", "Glob", "Grep",
          "WebSearch", "WebFetch", "TodoWrite", "NotebookEdit",
        ],
        permissionMode: (permissionMode ?? "bypassPermissions") as "bypassPermissions" | "default",
        allowDangerouslySkipPermissions: (permissionMode ?? "bypassPermissions") === "bypassPermissions",
      },
    });

    sessions.set(sessionId, controller);
    send({ type: "agent_started", sessionId });

    for await (const message of q) {
      const sdkMsg = message as Record<string, unknown>;
      send({
        type: "agent_event",
        sessionId,
        event: sdkMsg,
      });
    }

    sessions.delete(sessionId);
    send({
      type: "agent_stopped",
      sessionId,
      exitCode: 0,
      signal: null,
    });
  } catch (err: unknown) {
    sessions.delete(sessionId);
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes("aborted") || errMsg.includes("AbortError")) {
      log(`Agent session ${sessionId} aborted`);
      send({
        type: "agent_stopped",
        sessionId,
        exitCode: null,
        signal: "SIGTERM",
      });
    } else {
      log(`Agent session ${sessionId} error: ${errMsg}`);
      send({
        type: "agent_error",
        sessionId,
        message: errMsg,
      });
    }
  }
}

function handleStop(msg: StopMessage) {
  const { sessionId } = msg;
  const controller = sessions.get(sessionId);
  if (!controller) {
    send({ type: "error", sessionId, message: "Session not found" });
    return;
  }

  log(`Stopping agent session ${sessionId}`);
  controller.abort();
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
