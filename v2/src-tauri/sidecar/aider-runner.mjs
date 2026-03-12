// sidecar/aider-runner.ts
import { stdin, stdout, stderr } from "process";
import { createInterface } from "readline";
import { spawn, execSync } from "child_process";
import { accessSync, constants } from "fs";
import { join } from "path";
var rl = createInterface({ input: stdin });
var sessions = /* @__PURE__ */ new Map();
function send(msg) {
  stdout.write(JSON.stringify(msg) + "\n");
}
function log(message) {
  stderr.write(`[aider-sidecar] ${message}
`);
}
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).catch((err) => {
      log(`Unhandled error in message handler: ${err}`);
    });
  } catch {
    log(`Invalid JSON: ${line}`);
  }
});
async function handleMessage(msg) {
  switch (msg.type) {
    case "ping":
      send({ type: "pong" });
      break;
    case "query":
      await handleQuery(msg);
      break;
    case "stop":
      handleStop(msg);
      break;
    default:
      send({ type: "error", message: `Unknown message type: ${msg.type}` });
  }
}
function runCmd(cmd, env, cwd) {
  try {
    const result = execSync(cmd, { env, cwd, timeout: 5e3, encoding: "utf-8" }).trim();
    log(`[prefetch] ${cmd} \u2192 ${result.length} chars`);
    return result || null;
  } catch (e) {
    log(`[prefetch] ${cmd} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
function prefetchContext(env, cwd) {
  log(`[prefetch] BTMSG_AGENT_ID=${env.BTMSG_AGENT_ID ?? "NOT SET"}, cwd=${cwd}`);
  const parts = [];
  const inbox = runCmd("btmsg inbox", env, cwd);
  if (inbox) {
    parts.push(`## Your Inbox
\`\`\`
${inbox}
\`\`\``);
  } else {
    parts.push("## Your Inbox\nNo messages (or btmsg unavailable).");
  }
  const board = runCmd("bttask board", env, cwd);
  if (board) {
    parts.push(`## Task Board
\`\`\`
${board}
\`\`\``);
  } else {
    parts.push("## Task Board\nNo tasks (or bttask unavailable).");
  }
  return parts.join("\n\n");
}
var PROMPT_RE = /^[a-zA-Z0-9._-]*> $/;
function looksLikePrompt(buffer) {
  const lines = buffer.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.trim() === "") continue;
    return PROMPT_RE.test(l);
  }
  return false;
}
var SUPPRESS_RE = [
  /^Aider v\d/,
  /^Main model:/,
  /^Weak model:/,
  /^Git repo:/,
  /^Repo-map:/,
  /^Use \/help/
];
function shouldSuppress(line) {
  const t = line.trim();
  return t === "" || SUPPRESS_RE.some((p) => p.test(t));
}
function parseTurnOutput(buffer) {
  const blocks = [];
  const lines = buffer.split("\n");
  let thinkingLines = [];
  let answerLines = [];
  let inThinking = false;
  let inAnswer = false;
  for (const line of lines) {
    const t = line.trim();
    if (shouldSuppress(line)) continue;
    if (PROMPT_RE.test(t)) continue;
    if (t === "\u25BA THINKING" || t === "\u25BA  THINKING") {
      inThinking = true;
      inAnswer = false;
      continue;
    }
    if (t === "\u25BA ANSWER" || t === "\u25BA  ANSWER") {
      if (thinkingLines.length > 0) {
        blocks.push({ type: "thinking", content: thinkingLines.join("\n") });
        thinkingLines = [];
      }
      inThinking = false;
      inAnswer = true;
      continue;
    }
    if (/^Tokens: .+Cost:/.test(t)) {
      blocks.push({ type: "cost", content: t });
      continue;
    }
    if (t.startsWith("$ ") || t.startsWith("Running ")) {
      if (answerLines.length > 0) {
        blocks.push({ type: "text", content: answerLines.join("\n") });
        answerLines = [];
      }
      blocks.push({ type: "shell", content: t.replace(/^(Running |\$ )/, "") });
      continue;
    }
    if (inThinking) {
      thinkingLines.push(line);
    } else {
      answerLines.push(line);
    }
  }
  if (thinkingLines.length > 0) {
    blocks.push({ type: "thinking", content: thinkingLines.join("\n") });
  }
  if (answerLines.length > 0) {
    blocks.push({ type: "text", content: answerLines.join("\n").trim() });
  }
  return blocks;
}
async function handleQuery(msg) {
  const { sessionId, prompt, cwd: cwdOpt, model, systemPrompt, extraEnv, providerConfig } = msg;
  const cwd = cwdOpt || process.cwd();
  const env = { ...process.env };
  if (extraEnv) Object.assign(env, extraEnv);
  if (providerConfig?.openrouterApiKey && typeof providerConfig.openrouterApiKey === "string") {
    env.OPENROUTER_API_KEY = providerConfig.openrouterApiKey;
  }
  const existing = sessions.get(sessionId);
  if (existing && existing.process.exitCode === null) {
    log(`Continuing session ${sessionId} with follow-up prompt`);
    existing.turnBuffer = "";
    existing.lineBuffer = "";
    existing.turnStartTime = Date.now();
    existing.turns++;
    send({ type: "agent_started", sessionId });
    const ctx = prefetchContext(existing.env, existing.cwd);
    const fullPrompt2 = `${ctx}

Now act on the above. Your current task:
${prompt}`;
    existing.process.stdin?.write(fullPrompt2 + "\n");
    return;
  }
  const aiderPath = which("aider");
  if (!aiderPath) {
    send({ type: "agent_error", sessionId, message: "Aider not found. Install with: pipx install aider-chat" });
    return;
  }
  const aiderModel = model || "openrouter/anthropic/claude-sonnet-4";
  log(`Starting Aider session ${sessionId} with model ${aiderModel}`);
  const controller = new AbortController();
  const args = [
    "--model",
    aiderModel,
    "--yes-always",
    "--no-pretty",
    "--no-fancy-input",
    "--no-stream",
    // Complete responses (no token fragments)
    "--no-git",
    "--no-auto-commits",
    "--suggest-shell-commands",
    "--no-check-model-accepts-settings"
  ];
  if (providerConfig?.editFormat && typeof providerConfig.editFormat === "string") {
    args.push("--edit-format", providerConfig.editFormat);
  }
  if (providerConfig?.architect === true) {
    args.push("--architect");
  }
  send({ type: "agent_started", sessionId });
  send({
    type: "agent_event",
    sessionId,
    event: { type: "system", subtype: "init", session_id: sessionId, model: aiderModel, cwd }
  });
  const child = spawn(aiderPath, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    signal: controller.signal
  });
  const session = {
    process: child,
    controller,
    sessionId,
    model: aiderModel,
    lineBuffer: "",
    turnBuffer: "",
    turnStartTime: Date.now(),
    turns: 0,
    ready: false,
    env,
    cwd
  };
  sessions.set(sessionId, session);
  const prefetched = prefetchContext(env, cwd);
  const promptParts = [];
  promptParts.push(`IMPORTANT: You are an autonomous agent in a multi-agent system. Your PRIMARY job is to act on messages and tasks below, NOT to ask the user for files. You can run shell commands to accomplish tasks. If you need to read files, use shell commands like \`cat\`, \`find\`, \`ls\`. If you need to send messages, use \`btmsg send <agent-id> "message"\`. If you need to update tasks, use \`bttask status <task-id> done\`.`);
  if (systemPrompt) promptParts.push(systemPrompt);
  promptParts.push(prefetched);
  promptParts.push(`---

Now act on the above. Your current task:
${prompt}`);
  const fullPrompt = promptParts.join("\n\n");
  let startupBuffer = "";
  child.stdout?.on("data", (data) => {
    const text = data.toString();
    if (!session.ready) {
      startupBuffer += text;
      if (looksLikePrompt(startupBuffer)) {
        session.ready = true;
        session.turns = 1;
        session.turnStartTime = Date.now();
        log(`Aider ready, sending initial prompt (${fullPrompt.length} chars)`);
        child.stdin?.write(fullPrompt + "\n");
      }
      return;
    }
    session.turnBuffer += text;
    if (!looksLikePrompt(session.turnBuffer)) return;
    const duration = Date.now() - session.turnStartTime;
    const blocks = parseTurnOutput(session.turnBuffer);
    for (const block of blocks) {
      switch (block.type) {
        case "thinking":
          send({
            type: "agent_event",
            sessionId,
            event: { type: "thinking", content: block.content }
          });
          break;
        case "text":
          if (block.content) {
            send({
              type: "agent_event",
              sessionId,
              event: { type: "assistant", message: { role: "assistant", content: block.content } }
            });
          }
          break;
        case "shell":
          send({
            type: "agent_event",
            sessionId,
            event: {
              type: "tool_use",
              id: `shell-${Date.now()}`,
              name: "Bash",
              input: { command: block.content }
            }
          });
          break;
        case "cost":
          break;
      }
    }
    const costMatch = session.turnBuffer.match(/Cost: \$([0-9.]+) message, \$([0-9.]+) session/);
    const costUsd = costMatch ? parseFloat(costMatch[2]) : 0;
    send({
      type: "agent_event",
      sessionId,
      event: {
        type: "result",
        subtype: "result",
        result: "",
        cost_usd: costUsd,
        duration_ms: duration,
        num_turns: session.turns,
        is_error: false,
        session_id: sessionId
      }
    });
    send({ type: "agent_stopped", sessionId, exitCode: 0, signal: null });
    session.turnBuffer = "";
  });
  child.stderr?.on("data", (data) => {
    for (const line of data.toString().split("\n")) {
      if (line.trim()) log(`[stderr] ${line}`);
    }
  });
  child.on("close", (code, signal) => {
    sessions.delete(sessionId);
    if (controller.signal.aborted) {
      send({ type: "agent_stopped", sessionId, exitCode: null, signal: "SIGTERM" });
    } else if (code !== 0 && code !== null) {
      send({ type: "agent_error", sessionId, message: `Aider exited with code ${code}` });
    } else {
      send({ type: "agent_stopped", sessionId, exitCode: code, signal });
    }
  });
  child.on("error", (err) => {
    sessions.delete(sessionId);
    log(`Aider spawn error: ${err.message}`);
    send({ type: "agent_error", sessionId, message: `Failed to start Aider: ${err.message}` });
  });
}
function handleStop(msg) {
  const { sessionId } = msg;
  const session = sessions.get(sessionId);
  if (!session) {
    send({ type: "error", sessionId, message: "Session not found" });
    return;
  }
  log(`Stopping Aider session ${sessionId}`);
  session.process.stdin?.write("/exit\n");
  const killTimer = setTimeout(() => {
    session.controller.abort();
    session.process.kill("SIGTERM");
  }, 3e3);
  session.process.once("close", () => clearTimeout(killTimer));
}
function which(name) {
  const pathDirs = (process.env.PATH || "").split(":");
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
log("Aider sidecar started");
log(`Found aider at: ${which("aider") ?? "NOT FOUND"}`);
send({ type: "ready" });
