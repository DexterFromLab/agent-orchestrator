#!/bin/bash
# BTerminal Docker launcher — runs bterminal in windowed mode via X11 forwarding

set -euo pipefail

IMAGE="bterminal:latest"
CONTAINER_HOME="/home/bterminal"

# ─── Check requirements ────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker not found." >&2
    exit 1
fi

if ! docker image inspect "$IMAGE" &>/dev/null; then
    echo "Image '$IMAGE' not found. Building..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    docker build -t "$IMAGE" "$SCRIPT_DIR"
fi

if [[ -z "${DISPLAY:-}" ]]; then
    echo "ERROR: DISPLAY not set. Are you running in a graphical session?" >&2
    exit 1
fi

# ─── X11 access ───────────────────────────────────────────────────────

xhost +local:docker 2>/dev/null || true

# ─── Launch ───────────────────────────────────────────────────────────

exec docker run --rm \
  -e DISPLAY="$DISPLAY" \
  -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
  -v "$HOME/.claude-context:$CONTAINER_HOME/.claude-context" \
  -v "$HOME/.config/bterminal:$CONTAINER_HOME/.config/bterminal" \
  -v "$HOME/.local/share/bterminal:$CONTAINER_HOME/.local/share/bterminal" \
  --network host \
  "$IMAGE" bterminal "$@"
