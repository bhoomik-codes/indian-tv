# ──────────────────────────────────────────────────────────────────────────────
# IndiaStream — Dockerfile
# Single container: CORS proxy (port 8081) + static web server (port 8080)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

LABEL org.opencontainers.image.title="IndiaStream"
LABEL org.opencontainers.image.description="Live Indian TV streaming app — IPTV proxy + static frontend"
LABEL org.opencontainers.image.source="https://github.com/bhoomik-codes/indian-tv"

WORKDIR /app

# ── Server code & config ───────────────────────────────────────────────────────
COPY server/           ./server/
COPY .env.example      ./.env.example

# ── Static frontend — copied to a staging dir so the volume at /app/public
#    can be pre-populated on first container start without shadowing the image.
COPY public/           ./static_src/

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# ── Create runtime directories ────────────────────────────────────────────────
RUN mkdir -p logs public

# ── Expose both server ports ──────────────────────────────────────────────────
EXPOSE 8080 8081

ENTRYPOINT ["./docker-entrypoint.sh"]
