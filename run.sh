#!/usr/bin/env bash
# Bot Island 3D: build (reads ../bot-island data read-only), test, and serve under nohup at low priority.
#   ./run.sh           build + smoke test (one headless Chrome, niced) + serve
#   ./run.sh --quick   build + serve (no browser test)
#   ./run.sh --shots   build + re-render screenshots + test + serve
# Port: 4259 if it's free; if another app already holds it, 4261 (override with BOT_ISLAND_3D_PORT).
set -euo pipefail
cd "$(dirname "$0")"
python3 build.py
mkdir -p data
if [[ -f data/server.pid ]] && kill -0 "$(cat data/server.pid)" 2>/dev/null; then echo "already serving on :$(cat data/server.port) (pid $(cat data/server.pid))"; else
  PORT="${BOT_ISLAND_3D_PORT:-4259}"
  if ss -ltn | grep -q ":$PORT "; then echo "port $PORT is taken by another app; using 4261"; PORT=4261; fi
  BOT_ISLAND_3D_PORT=$PORT nohup nice -n 10 python3 server.py > data/server.log 2>&1 &
  echo $! > data/server.pid; echo "$PORT" > data/server.port; sleep 1; echo "serving http://127.0.0.1:$PORT/ (pid $!)"; fi
if [[ "${1:-}" == "--shots" ]]; then nice -n 15 node --experimental-websocket tests/screens.mjs; fi
if [[ "${1:-}" != "--quick" ]]; then python3 tests/smoke_test.py; fi
