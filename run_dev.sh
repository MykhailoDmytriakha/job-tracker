#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# Load env vars
if [ -f "$DIR/.env" ]; then
  export $(grep -v '^#' "$DIR/.env" | xargs)
fi

# Backend
echo "Starting backend..."
cd "$DIR"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
.venv/bin/uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Frontend
echo "Starting frontend..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000/docs"
echo "  Frontend: http://localhost:5173"
echo ""

cleanup() {
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT

wait
