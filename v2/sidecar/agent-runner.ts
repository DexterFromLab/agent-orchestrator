// Agent Runner — Node.js sidecar entry point
// Spawned by Rust backend, communicates via stdio NDJSON
// Phase 3: full Agent SDK integration

import { stdin, stdout, stderr } from 'process';
import { createInterface } from 'readline';

const rl = createInterface({ input: stdin });

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

function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
      break;
    case 'query':
      // Phase 3: call Agent SDK query()
      send({ type: 'error', message: 'Agent SDK not yet integrated — Phase 3' });
      break;
    default:
      send({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

log('Sidecar started');
send({ type: 'ready' });
