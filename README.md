# IndiaStream 📺

IndiaStream is a modern, lightweight web application for watching Live Indian Television channels directly from your browser. It provides a seamless, Netflix-like interface to browse, search, and stream hundreds of live TV channels across News, Entertainment, Movies, Sports, and more.

---

## ✨ Features

- **Modern UI/UX** — Clean, responsive Netflix-style interface with categorised channel rows.
- **Built-in HLS Player** — Custom player powered by `hls.js` for smooth m3u8 playback in any modern browser.
- **Automated Stream Validation** — Multi-threaded scanner tests hundreds of channels concurrently, keeping only the live ones.
- **CORS Bypass Proxy** — Local Python proxy fetches streams server-side and rewrites HLS segment URLs on-the-fly.
- **Zero Runtime Dependencies** — Pure HTML/CSS/Vanilla JS frontend and stdlib-only Python backend. No Node.js, pip installs, or heavy frameworks required.
- **Search & Filter** — Find channels by name or browse by category.
- **Cross-Platform Launchers** — Dedicated start scripts for Linux/macOS (`run.sh`) and Windows (`run.ps1`).
- **Docker Support** — Fully containerised with `docker compose` for one-command deployment anywhere.

---

## 📁 Project Structure

```
indian-tv/
├── .env.example            ← configuration template (copy to .env)
├── .gitignore
├── Dockerfile              ← container image definition
├── docker-compose.yml      ← orchestration (proxy + web server)
├── docker-entrypoint.sh    ← container startup script
├── run.sh                  ← Linux / macOS launcher
├── run.ps1                 ← Windows PowerShell launcher
│
├── server/                 ← Python backend
│   ├── proxy.py            ← CORS proxy server  (port 8081)
│   └── update_playlist.py  ← playlist scanner / stream tester
│
├── public/                 ← static web app (served by HTTP server)
│   ├── index.html
│   ├── player.html
│   ├── css/style.css
│   └── js/
│       ├── config.js       ← all client-side URLs/ports in one place
│       ├── app.js          ← homepage logic
│       └── player.js       ← video player logic
│
├── logs/                   ← runtime log files (gitignored)
│   ├── proxy.log
│   └── http.log
│
└── tests/                  ← ad-hoc debug scripts
    ├── test_check.py
    ├── test_check_300.py
    └── test_get.py
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and adjust as needed. All launchers and Python scripts read from this file automatically — no third-party library required.

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `HTTP_PORT` | `8080` | Port for the static web server |
| `PROXY_PORT` | `8081` | Port for the CORS proxy server |
| `PLAYLIST_URL` | iptv-org global index | Source M3U playlist URL |
| `OUTPUT_FILE` | `public/working.m3u` | Where the scanned playlist is saved |
| `MAX_WORKERS` | `300` | Parallel threads for stream testing |
| `TIMEOUT` | `3` | Per-stream timeout in seconds |

---

## 🚀 Quick Start

### Linux / macOS

```bash
# First run — scans for working channels (takes 1–3 min)
./run.sh

# Subsequent runs — skip the scan, use cached playlist
./run.sh --cached

# Force a fresh channel scan
./run.sh --rescan
```

### Windows (PowerShell)

```powershell
# Allow scripts the first time (run once as Administrator)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Start the app
.\run.ps1

# Force a fresh channel scan
.\run.ps1 -Rescan
```

**What the launcher does:**
1. Sources `.env` and applies configuration.
2. Ensures `logs/` directory exists.
3. Scans for working channels (skipped if `public/working.m3u` already exists).
4. Kills any stale process on the proxy/web ports.
5. Starts `server/proxy.py` on `PROXY_PORT` (logs → `logs/proxy.log`).
6. Starts a static HTTP server from `public/` on `HTTP_PORT` (logs → `logs/http.log`).
7. Opens `http://localhost:8080` in your default browser.

> Press **Ctrl+C** to gracefully stop both servers.

---

## 🐳 Docker

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (`docker compose`).

### Start

```bash
# Build and start (uses cached playlist if volume exists)
docker compose up

# Force a fresh channel scan on startup
docker compose up -e RESCAN=true

# Run in the background
docker compose up -d
```

Open `http://localhost:8080` in your browser.

### Stop

```bash
docker compose down        # stop containers, keep volumes
docker compose down -v     # stop containers AND delete volumes (clears playlist cache)
```

### How the container works

The Docker image uses a **two-directory** approach to handle mutable data alongside static assets:

- Static files (`index.html`, CSS, JS) are baked into the image under `/app/static_src/`.
- On first start, the entrypoint copies them into the `/app/public` named volume.
- `working.m3u` is generated into the same volume, so it is served by the web server automatically.
- Logs are written to a separate `log_data` named volume at `/app/logs`.

This means the playlist **persists across container restarts** without a rebuild.

---

## 🛠️ Architecture & Components

### `server/proxy.py` — CORS Proxy (port 8081)
Many IPTV streams block cross-origin browser requests. This proxy fetches streams server-side and dynamically rewrites HLS playlist segment URLs (`EXT-X-KEY`, `EXT-X-MAP`, `.ts` files) so every request routes through the proxy, ensuring uninterrupted playback.

### `server/update_playlist.py` — Stream Validator
Downloads the global playlist from `iptv-org`, then tests each channel with up to 300 concurrent threads. It verifies HTTP 200 + a valid `#EXTM3U` header, saving only live channels to `public/working.m3u`.

### `public/js/config.js` — Client Configuration
Single source of truth for all browser-side URLs and ports. Edit this one file to change the proxy address or playlist source without touching application logic.

### Frontend (`public/`)
- **`app.js`** — Homepage: parses M3U, groups by category, renders the card grid.
- **`player.js`** — Player page: drives `hls.js`, handles proxy fallback (local → remote → direct), sidebar channel list.

---

## 📖 Data Flow

```
Browser (index.html)
  └─ fetches working.m3u (served by HTTP server from public/)
  └─ user clicks channel → player.html

Browser (player.html)
  └─ builds stream URL: http://localhost:8081/proxy?url=<STREAM_URL>
  └─ hls.js loads the proxied HLS playlist

server/proxy.py
  └─ fetches original stream from provider
  └─ rewrites all segment URLs to go through proxy
  └─ returns rewritten playlist to hls.js

hls.js
  └─ requests each segment through proxy → plays video
```

---

## ⚖️ Legal Disclaimer

No video files or streams are stored, hosted, or transmitted by this repository. This application is a client/player that parses publicly available M3U playlists provided by the open-source community (`iptv-org`). We have no control over the destination or content of the streams.

---

## 🤝 Acknowledgements

- Channel data sourced from [iptv-org/iptv](https://github.com/iptv-org/iptv).
- HLS playback powered by [hls.js](https://github.com/video-dev/hls.js).
