# IndiaStream 📺

IndiaStream is a modern, lightweight web application for watching Live Indian Television channels directly from your browser. It provides a seamless, Netflix-like user interface to browse, search, and stream hundreds of live TV channels across various categories such as News, Entertainment, Movies, Sports, and more.

## ✨ Features

- **Modern UI/UX**: A clean, responsive, and intuitive interface with categorised channels.
- **Built-in HLS Player**: Custom video player powered by `hls.js` for seamless playback of m3u8 streams in any modern browser.
- **Automated Stream Validation**: Included script to test hundreds of channels concurrently and filter out offline or broken streams.
- **CORS Bypass Proxy**: A local Python proxy server that routes HLS traffic and rewrites stream segments on-the-fly to circumvent restrictive CORS policies from stream providers.
- **Zero Dependencies**: Pure HTML/CSS/Vanilla JS frontend and standard library Python backend scripts. No Node.js, npm, or heavy frameworks required.
- **Search & Filter**: Quickly find channels by name or filter by category.

## 🚀 Quick Start

The easiest way to get IndiaStream up and running is by using the automated setup script.

### Prerequisites
- Linux or macOS (for the shell script)
- Python 3.x installed on your system

### Running the App

Simply execute the `run.sh` script from the project root:

```bash
./run.sh
```

**What this script does:**
1. **Checks for a cached playlist:** Uses `working.m3u` if available.
2. **Starts the CORS Proxy:** Launches `proxy.py` on port `8081` in the background.
3. **Starts the Web Server:** Launches a static HTTP server on port `8080` in the background.
4. **Opens your Browser:** Automatically navigates to `http://localhost:8080`.

**To force a fresh scan of all channels:**
```bash
./run.sh --rescan
```

> **Note:** To stop the servers, simply press `Ctrl+C` in the terminal where you ran the script.

## 🛠️ Architecture & Components

The project consists of three main backend utilities and a static frontend:

### 1. `update_playlist.py` (Stream Validator)
Downloads the massive global playlist from `iptv-org`, extracts all channels, and tests their accessibility using a multi-threaded approach (up to 300 workers). It verifies if the stream returns an HTTP 200 and a valid `#EXTM3U` header, saving only the working channels to `working.m3u`.

### 2. `proxy.py` (Local CORS Proxy)
Many IPTV streams block cross-origin requests (CORS), preventing them from playing in a web browser. This proxy server runs on `http://localhost:8081` and fetches the streams server-side. Crucially, it reads `.m3u8` playlists and dynamically rewrites segment URLs (e.g., `EXT-X-KEY`, `EXT-X-MAP`, and `.ts` files) so they also route through the proxy, ensuring uninterrupted playback.

### 3. Frontend (`index.html`, `player.html`, `css/`, `js/`)
- **`app.js`**: Handles the homepage logic, parses the M3U playlist, categorises channels, and renders the grid UI.
- **`player.js`**: Manages the custom video player interface, interacts with `hls.js`, handles proxy fallback logic (Local proxy -> Remote proxy -> Direct), and maintains the sidebar channel list.

## 📖 How it Works (Data Flow)

1. The frontend requests the channel list (`working.m3u`).
2. User selects a channel on `index.html` and is routed to `player.html`.
3. The player constructs a stream URL pointing to the local proxy: `http://localhost:8081/proxy?url=<STREAM_URL>`.
4. `proxy.py` fetches the stream from the original source.
5. If the response is an HLS playlist (`.m3u8`), the proxy rewrites all internal URLs to also point to the proxy.
6. `hls.js` parses the proxied playlist and plays the video segments.

## ⚖️ Legal Disclaimer

No video files or streams are stored, hosted, or transmitted by this repository. This application is merely a client/player that parses publicly available M3U playlists provided by the open-source community (specifically `iptv-org`). We have no control over the destination or content of the streams. 

## 🤝 Acknowledgements

- Channel data and initial playlist sourced from the incredible [iptv-org](https://github.com/iptv-org/iptv) project.
- HLS playback powered by [hls.js](https://github.com/video-dev/hls.js).
