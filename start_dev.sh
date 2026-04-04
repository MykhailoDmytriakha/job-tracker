#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$DIR/.dev-ports.env"
LOG_DIR="$DIR/.dev-logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

launch_detached() {
  local log_file="$1"
  shift

  python3 - "$log_file" "$@" <<'PY'
import os
import subprocess
import sys

log_file = sys.argv[1]
cmd = sys.argv[2:]
env = os.environ.copy()
cwd = env.pop("LAUNCH_CWD", None)

with open(log_file, "ab", buffering=0) as log:
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

print(proc.pid)
PY
}

is_pid_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

is_port_listening() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

find_free_port() {
  local port="$1"
  while is_port_listening "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

wait_for_port() {
  local label="$1"
  local port="$2"
  local pid="$3"
  local log_file="$4"
  local attempts=40

  while [ "$attempts" -gt 0 ]; do
    if is_port_listening "$port"; then
      return 0
    fi

    if ! is_pid_running "$pid"; then
      echo "$label failed to start. Check $log_file"
      return 1
    fi

    sleep 0.5
    attempts=$((attempts - 1))
  done

  echo "$label did not open port $port in time. Check $log_file"
  return 1
}

stop_port_listeners() {
  local port="${1:-}"

  if [ -z "$port" ]; then
    return 0
  fi

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi

  kill $pids 2>/dev/null || true
  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
  fi
}

cleanup_failed_start() {
  if is_pid_running "${FRONTEND_PID:-}"; then
    kill -TERM -- "-${FRONTEND_PID}" 2>/dev/null || true
  fi
  if is_pid_running "${BACKEND_PID:-}"; then
    kill -TERM -- "-${BACKEND_PID}" 2>/dev/null || true
  fi
  stop_port_listeners "${FRONTEND_PORT:-}"
  stop_port_listeners "${BACKEND_PORT:-}"
  rm -f "$STATE_FILE"
}

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  if is_pid_running "${BACKEND_PID:-}" || \
     is_pid_running "${FRONTEND_PID:-}" || \
     is_port_listening "${BACKEND_PORT:-8000}" || \
     is_port_listening "${FRONTEND_PORT:-5173}"; then
    echo "Dev services are already running."
    echo "  Backend:  http://localhost:${BACKEND_PORT:-8000}/docs"
    echo "  Frontend: http://localhost:${FRONTEND_PORT:-5173}"
    echo "Stop them with: ./stop_dev.sh"
    exit 1
  fi
  rm -f "$STATE_FILE"
fi

mkdir -p "$LOG_DIR"
: > "$BACKEND_LOG"
: > "$FRONTEND_LOG"

if [ ! -d "$DIR/.venv" ]; then
  echo "Creating Python virtualenv..."
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -r "$DIR/requirements.txt"
fi

if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$DIR/frontend" install
fi

BACKEND_PORT="$(find_free_port 8000)"
FRONTEND_PORT="$(find_free_port 5173)"
BACKEND_URL="http://localhost:$BACKEND_PORT"
FRONTEND_URL="http://localhost:$FRONTEND_PORT"
API_URL="$BACKEND_URL/api"

trap cleanup_failed_start ERR

echo "Starting backend on port $BACKEND_PORT..."
BACKEND_PID="$(
  FRONTEND_URL="$FRONTEND_URL" \
  LAUNCH_CWD="$DIR" \
  launch_detached \
  "$BACKEND_LOG" \
  "$DIR/.venv/bin/uvicorn" \
  backend.main:app \
  --reload \
  --port "$BACKEND_PORT" \
  --app-dir "$DIR"
)"

echo "Starting frontend on port $FRONTEND_PORT..."
FRONTEND_PID="$(
  VITE_API_URL="$API_URL" \
  LAUNCH_CWD="$DIR/frontend" \
  launch_detached \
  "$FRONTEND_LOG" \
  npm \
  run \
  dev \
  -- \
  --port "$FRONTEND_PORT" \
  --strictPort
)"

cat > "$STATE_FILE" <<EOF
BACKEND_PORT=$BACKEND_PORT
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
BACKEND_LOG=$BACKEND_LOG
FRONTEND_LOG=$FRONTEND_LOG
EOF

wait_for_port "Backend" "$BACKEND_PORT" "$BACKEND_PID" "$BACKEND_LOG"
wait_for_port "Frontend" "$FRONTEND_PORT" "$FRONTEND_PID" "$FRONTEND_LOG"

trap - ERR

echo ""
echo "  Backend:  $BACKEND_URL/docs"
echo "  Frontend: $FRONTEND_URL"
echo ""
echo "State file: $STATE_FILE"
echo "Logs:"
echo "  $BACKEND_LOG"
echo "  $FRONTEND_LOG"
