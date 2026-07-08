#!/bin/bash
set -e

# Change to the directory where the script is located (project root)
cd "$(dirname "$0")"

echo "==================================================="
echo "          IndiaStream Automated Setup"
echo "==================================================="
echo ""

# ── Load .env ──────────────────────────────────────────────────────────────────
if [ -f ".env" ]; then
  set -o allexport
  # shellcheck source=.env
  source .env
  set +o allexport
else
  echo "[warn] No .env file found — using built-in defaults."
fi

# ── Defaults (if not set by .env) ─────────────────────────────────────────────
PROXY_PORT="${PROXY_PORT:-8081}"
HTTP_PORT="${HTTP_PORT:-8080}"

# ── Ensure logs directory exists ───────────────────────────────────────────────
mkdir -p logs

DO_RESCAN=false

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    -r|--rescan)
      DO_RESCAN=true
      shift
      ;;
    -c|--cached)
      DO_RESCAN=false
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# If no cached playlist exists, force a rescan
if [ ! -f "public/working.m3u" ]; then
  echo "No cached playlist found. Forcing a rescan..."
  DO_RESCAN=true
fi

# 1. Update playlist to get only working channels
if [ "$DO_RESCAN" = true ]; then
  echo "[1/4] Checking for working channels (Fresh Rescan)..."
  python3 server/update_playlist.py
else
  echo "[1/4] Using cached playlist (public/working.m3u)..."
  echo "      Hint: Use './run.sh --rescan' to update the channel list."
fi

# 2. Start the proxy server in the background
echo "[2/4] Starting proxy server on port ${PROXY_PORT}..."
fuser -k "${PROXY_PORT}/tcp" 2>/dev/null || true
python3 server/proxy.py >> logs/proxy.log 2>&1 &
PROXY_PID=$!

# 3. Start the HTTP server (serves only the public/ directory)
echo "[3/4] Starting web server on port ${HTTP_PORT}..."
fuser -k "${HTTP_PORT}/tcp" 2>/dev/null || true
python3 -m http.server "${HTTP_PORT}" --directory public >> logs/http.log 2>&1 &
HTTP_PID=$!

# Wait a moment for servers to start
sleep 2

# 4. Open the browser
echo "[4/4] Opening website in browser..."
if command -v xdg-open > /dev/null; then
  xdg-open "http://localhost:${HTTP_PORT}"
elif command -v open > /dev/null; then
  open "http://localhost:${HTTP_PORT}"
else
  echo "Please open http://localhost:${HTTP_PORT} in your browser."
fi

echo ""
echo "Servers are running in the background."
echo "  Web   → http://localhost:${HTTP_PORT}"
echo "  Proxy → http://localhost:${PROXY_PORT}"
echo "  Logs  → logs/proxy.log  |  logs/http.log"
echo ""
echo "Press Ctrl+C to stop all servers and exit."

# Trap Ctrl+C (SIGINT) and kill the background processes
trap "echo -e '\nStopping servers...'; kill $PROXY_PID $HTTP_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait indefinitely until interrupted
wait
