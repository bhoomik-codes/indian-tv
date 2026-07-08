#!/bin/bash
# docker-entrypoint.sh — runs inside the container
set -e

echo "╔══════════════════════════════════════════╗"
echo "║        IndiaStream — Docker Start         ║"
echo "╚══════════════════════════════════════════╝"

# ── On first run: copy static files from image into the volume ────────────────
# The named volume mounts over /app/public, so static files land here only
# once from the image's /app/static_src/ staging directory.
if [ ! -f "/app/public/index.html" ]; then
  echo "[init] First run — copying static files into volume..."
  cp -r /app/static_src/. /app/public/
fi

# ── Ensure logs directory exists ──────────────────────────────────────────────
mkdir -p /app/logs

# ── Generate playlist if missing or rescan requested ─────────────────────────
if [ ! -f "/app/public/working.m3u" ] || [ "${RESCAN:-false}" = "true" ]; then
  echo "[1/2] Generating channel playlist (may take 1–3 min)..."
  python3 /app/server/update_playlist.py
else
  echo "[1/2] Using cached playlist..."
fi

# ── Start the CORS proxy server in the background ────────────────────────────
echo "[2/2] Starting proxy on port ${PROXY_PORT:-8081}..."
python3 /app/server/proxy.py >> /app/logs/proxy.log 2>&1 &

echo ""
echo "  Web   → http://localhost:${HTTP_PORT:-8080}"
echo "  Proxy → http://localhost:${PROXY_PORT:-8081}"
echo ""

# ── Start the static HTTP server in the foreground (keeps container alive) ───
exec python3 -m http.server "${HTTP_PORT:-8080}" --directory /app/public
