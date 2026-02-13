#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $DAEMON_PID $VITE_PID 2>/dev/null || true
  wait $DAEMON_PID $VITE_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

echo "Starting Undoable daemon on :7433..."
npx tsx "$ROOT/packages/daemon/src/index.ts" &
DAEMON_PID=$!
sleep 1

echo "Starting Vite UI on :5173..."
npx vite --port 5173 --config "$ROOT/ui/vite.config.ts" "$ROOT/ui" &
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
