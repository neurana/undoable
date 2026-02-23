#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$ROOT/node_modules/.bin"
TSX_BIN="$NODE_BIN/tsx"
VITE_BIN="$NODE_BIN/vite"
UI_VITE_BIN="$ROOT/ui/node_modules/.bin/vite"
DAEMON_DIST="$ROOT/dist/daemon/index.mjs"

cleanup() {
  echo ""
  echo "Shutting down..."
  local pids=()
  if [[ -n "${DAEMON_PID:-}" ]]; then
    kill "$DAEMON_PID" 2>/dev/null || true
    pids+=("$DAEMON_PID")
  fi
  if [[ -n "${VITE_PID:-}" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
    pids+=("$VITE_PID")
  fi
  if [[ "${#pids[@]}" -gt 0 ]]; then
    wait "${pids[@]}" 2>/dev/null || true
  fi
  echo "Done."
}
trap cleanup EXIT INT TERM

echo "Starting Undoable daemon on :7433..."
if [[ -x "$TSX_BIN" ]]; then
  "$TSX_BIN" "$ROOT/packages/daemon/src/index.ts" &
elif [[ -f "$DAEMON_DIST" ]]; then
  node "$DAEMON_DIST" &
else
  echo "Could not start daemon: missing tsx and missing built dist daemon."
  echo "Run: pnpm -C \"$ROOT\" install && pnpm -C \"$ROOT\" build"
  exit 1
fi
DAEMON_PID=$!
sleep 1

echo "Starting Vite UI on :5173..."
if [[ -x "$VITE_BIN" ]]; then
  "$VITE_BIN" --port 5173 --config "$ROOT/ui/vite.config.ts" "$ROOT/ui" &
elif [[ -x "$UI_VITE_BIN" ]]; then
  "$UI_VITE_BIN" --port 5173 --config "$ROOT/ui/vite.config.ts" "$ROOT/ui" &
elif command -v pnpm >/dev/null 2>&1; then
  pnpm -C "$ROOT/ui" exec vite --port 5173 --config "$ROOT/ui/vite.config.ts" "$ROOT/ui" &
else
  echo "Could not start UI: Vite binary not found in root or ui workspace."
  echo "Run: pnpm -C \"$ROOT\" install"
  exit 1
fi
VITE_PID=$!
sleep 1

echo ""
echo "==================================="
echo "  Undoable is running"
echo "  UI:     http://localhost:5173"
echo "  API:    http://localhost:7433"
echo "==================================="
echo "  Press Ctrl+C to stop"
echo ""

wait
