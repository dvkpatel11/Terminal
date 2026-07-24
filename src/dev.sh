#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
VENV_DIR="$(dirname "$0")/../.venv-openbb"

echo "==> Killing processes on port $PORT..."
if command -v fuser &>/dev/null; then
  fuser -k "$PORT/tcp" 2>/dev/null || true
elif command -v lsof &>/dev/null; then
  lsof -ti :"$PORT" | xargs -r kill -9 2>/dev/null || true
elif command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $NF}' | grep -oP 'pid=\K[0-9]+' | xargs -r kill -9 2>/dev/null || true
else
  echo "  (no tool available to kill port $PORT — skipping)"
fi
sleep 1

echo "==> Activating Python venv at $VENV_DIR..."
if [ -f "$VENV_DIR/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  echo "  venv activated: $(python --version 2>&1)"
else
  echo "  WARNING: $VENV_DIR/bin/activate not found — proceeding without venv"
fi

echo "==> Starting dev server..."
cd "$(dirname "$0")"
exec npm run dev
