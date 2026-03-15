#!/usr/bin/env bash
# Launch Agent Orchestrator — used by .desktop entry
set -euo pipefail

PROJECT_DIR="/home/bartek/workspace/agent_orchestrator"

cd "$PROJECT_DIR"

# Build sidecar if missing
if [ ! -f "$PROJECT_DIR/sidecar/dist/claude-runner.mjs" ]; then
  npm run build:sidecar
fi

export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec npm run tauri dev
