#!/usr/bin/env python3
# server/proxy.py — run from project root: python3 server/proxy.py
"""
IndiaStream — Local IPTV Proxy Server
Proxies HLS streams server-side to bypass CORS restrictions.
Rewrites .m3u8 playlist segment URLs to route through this proxy.
"""

import http.server
import urllib.request
import urllib.parse
import urllib.error
import sys
import re
import os
from http import HTTPStatus
from pathlib import Path

# ── Load .env (stdlib-only, no third-party deps) ───────────────────────────────

def _load_env(path: Path) -> None:
    """Parse a .env file and populate os.environ for any missing keys."""
    if not path.is_file():
        return
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)

_load_env(Path(__file__).parent.parent / '.env')

# ── Config ─────────────────────────────────────────────────────────────────────

PROXY_PORT = int(os.environ.get('PROXY_PORT', 8081))

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
        'Chrome/125.0.0.0 Safari/537.36'
    ),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def make_proxy_url(url):
    """Wrap a URL so it goes through this proxy."""
    return f'http://localhost:{PROXY_PORT}/proxy?url={urllib.parse.quote(url, safe="")}'

def resolve_url(base_url, href):
    """Resolve a possibly-relative href against the playlist's base URL."""
    if href.startswith('http://') or href.startswith('https://'):
        return href
    base = base_url.rsplit('/', 1)[0] + '/'
    return urllib.parse.urljoin(base, href)

def rewrite_m3u8(data: bytes, base_url: str) -> bytes:
    """
    Rewrite all URI references in an HLS playlist so they point
    to this proxy instead of the original server.
    """
    try:
        text = data.decode('utf-8', errors='replace')
    except Exception:
        return data

    lines = text.splitlines(keepends=True)
    out   = []

    for line in lines:
        stripped = line.strip()

        # EXT-X-KEY URI=…
        line = re.sub(
            r'(URI=")([^"]+)(")',
            lambda m: m.group(1) + make_proxy_url(resolve_url(base_url, m.group(2))) + m.group(3),
            line,
        )

        # EXT-X-MAP URI=…
        line = re.sub(
            r'(EXT-X-MAP:.*URI=")([^"]+)(")',
            lambda m: m.group(1) + make_proxy_url(resolve_url(base_url, m.group(2))) + m.group(3),
            line,
        )

        # Plain URL lines (segment or sub-playlist)
        if stripped and not stripped.startswith('#'):
            abs_url    = resolve_url(base_url, stripped)
            proxy_url  = make_proxy_url(abs_url)
            # Preserve any trailing newline
            nl   = line[len(line.rstrip('\r\n')):]
            line = proxy_url + nl

        out.append(line)

    return ''.join(out).encode('utf-8')

# ── Request Handler ─────────────────────────────────────────────────────────────

class ProxyHandler(http.server.BaseHTTPRequestHandler):

    # ── CORS pre-flight
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs     = urllib.parse.parse_qs(parsed.query)

        if parsed.path == '/proxy':
            url = qs.get('url', [''])[0]
            if not url:
                self.send_error(400, 'Missing url parameter')
                return
            self._proxy(url)

        elif parsed.path == '/health':
            body = b'ok'
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)

        else:
            self.send_error(404)

    def _proxy(self, url: str):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            # Follow redirects automatically (urlopen does this)
            with urllib.request.urlopen(req, timeout=20) as resp:
                ctype  = resp.headers.get('Content-Type', 'application/octet-stream')
                data   = resp.read()

                # Rewrite HLS playlists
                is_m3u8 = (
                    'm3u' in ctype.lower()
                    or url.split('?')[0].endswith('.m3u8')
                    or url.split('?')[0].endswith('.m3u')
                    or (data[:7] == b'#EXTM3U')
                )
                if is_m3u8:
                    data  = rewrite_m3u8(data, url)
                    ctype = 'application/vnd.apple.mpegurl'

                self.send_response(200)
                self._cors()
                self.send_header('Content-Type',   ctype)
                self.send_header('Content-Length',  str(len(data)))
                self.send_header('Cache-Control',   'no-cache')
                self.end_headers()
                self.wfile.write(data)

        except urllib.error.HTTPError as e:
            body = f'Upstream HTTP {e.code}'.encode()
            self.send_response(e.code)
            self._cors()
            self.send_header('Content-Type',  'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        except urllib.error.URLError as e:
            body = f'URL error: {e.reason}'.encode()
            self.send_response(502)
            self._cors()
            self.send_header('Content-Type',  'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        except Exception as e:
            body = f'Proxy error: {e}'.encode()
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type',  'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Expose-Headers', '*')

    def log_message(self, fmt, *args):
        # Only log errors
        if args and str(args[1]) not in ('200', '204'):
            sys.stderr.write(f'[proxy] {self.address_string()} {fmt % args}\n')


# ── Main ────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PROXY_PORT), ProxyHandler)
    print(f'╔═══════════════════════════════════════╗')
    print(f'║  IndiaStream Proxy — port {PROXY_PORT}        ║')
    print(f'║  http://localhost:{PROXY_PORT}/proxy?url=…   ║')
    print(f'╚═══════════════════════════════════════╝')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nProxy stopped.')
        server.server_close()
