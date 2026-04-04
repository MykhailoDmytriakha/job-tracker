#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$DIR/.dev-ports.env"

is_pid_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

stop_pid() {
  local label="$1"
  local pid="${2:-}"
  local attempts=10

  if ! is_pid_running "$pid"; then
    return 0
  fi

  echo "Stopping $label process group (leader pid $pid)..."
  kill -TERM -- "-$pid" 2>/dev/null || true

  while [ "$attempts" -gt 0 ]; do
    if ! is_pid_running "$pid"; then
      return 0
    fi
    sleep 0.5
    attempts=$((attempts - 1))
  done

  if is_pid_running "$pid"; then
    kill -9 -- "-$pid" 2>/dev/null || true
  fi
}

stop_port_listeners() {
  local label="$1"
  local port="${2:-}"

  if [ -z "$port" ]; then
    return 0
  fi

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi

  echo "Clearing $label listener(s) on port $port..."
  kill $pids 2>/dev/null || true
  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
  fi
}

if [ ! -f "$STATE_FILE" ]; then
  echo "No dev state file found. Nothing to stop."
  exit 0
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

stop_pid "frontend" "${FRONTEND_PID:-}"
stop_pid "backend" "${BACKEND_PID:-}"

stop_port_listeners "frontend" "${FRONTEND_PORT:-}"
stop_port_listeners "backend" "${BACKEND_PORT:-}"

rm -f "$STATE_FILE"
echo "Dev services stopped."
