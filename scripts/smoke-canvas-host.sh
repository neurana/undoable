#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-17433}"
TOKEN="${UNDOABLE_SMOKE_TOKEN:-smoke-token}"
LOG_FILE="${TMPDIR:-/tmp}/undoable-canvas-smoke.log"

DAEMON_PID=""
cleanup() {
  if [[ -n "$DAEMON_PID" ]] && kill -0 "$DAEMON_PID" >/dev/null 2>&1; then
    kill "$DAEMON_PID" >/dev/null 2>&1 || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[smoke] starting daemon on 127.0.0.1:${PORT}"
(
  cd "$ROOT_DIR"
  NRN_PORT="$PORT" UNDOABLE_TOKEN="$TOKEN" pnpm dev >"$LOG_FILE" 2>&1
) &
DAEMON_PID="$!"

HEALTH_STATUS=""
for _ in $(seq 1 30); do
  HEALTH_STATUS="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/health" || true)"
  if [[ "$HEALTH_STATUS" == "200" ]]; then
    break
  fi
  sleep 1
done

if [[ "$HEALTH_STATUS" != "200" ]]; then
  echo "[smoke] daemon did not become ready (health=${HEALTH_STATUS})"
  echo "[smoke] log tail:"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

echo "[smoke] health endpoint OK"

CANVAS_STATUS="$(curl -sS -o /tmp/undoable-canvas-smoke-body.html -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/__undoable__/canvas" || true)"
if [[ "$CANVAS_STATUS" != "200" ]]; then
  echo "[smoke] canvas host endpoint failed: HTTP ${CANVAS_STATUS}"
  exit 1
fi

echo "[smoke] canvas host endpoint OK (HTTP ${CANVAS_STATUS})"

WS_UNAUTH_STATUS="$(curl -sS -o /tmp/undoable-canvas-smoke-ws-unauth.txt -w "%{http_code}" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dW5kb2FibGUtc21va2U=" \
  "http://127.0.0.1:${PORT}/__undoable__/ws" || true)"

if [[ "$WS_UNAUTH_STATUS" != "401" ]]; then
  echo "[smoke] unauthorized WS check failed: expected 401, got ${WS_UNAUTH_STATUS}"
  exit 1
fi

echo "[smoke] unauthorized websocket upgrade correctly rejected (HTTP ${WS_UNAUTH_STATUS})"
echo "[smoke] PASS"
