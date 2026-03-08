#!/usr/bin/env bash
# Checks which dev ports are in use and reports status.
# Ports: 5173 (web), 3000 (server), 3001 (assistant), 3002 (notifications)

set -euo pipefail

PORTS=(5173 3000 3001 3002)
NAMES=(web server assistant notifications)
ANY_BUSY=false

echo "📡 Port status check:"
for i in "${!PORTS[@]}"; do
  PORT="${PORTS[$i]}"
  NAME="${NAMES[$i]}"
  if lsof -ti ":$PORT" >/dev/null 2>&1; then
    PID=$(lsof -ti ":$PORT" | head -1)
    PROC=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
    echo "  ✅ :$PORT ($NAME) — RUNNING (pid $PID / $PROC)"
    ANY_BUSY=true
  else
    echo "  ⬜ :$PORT ($NAME) — not running"
  fi
done

if $ANY_BUSY; then
  echo ""
  echo "Some dev services are already running. Starting the dev server may cause port conflicts."
else
  echo ""
  echo "✅ All dev ports free — safe to start dev services."
fi
