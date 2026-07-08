#!/usr/bin/env python3
# server/update_playlist.py — run from project root: python3 server/update_playlist.py
import urllib.request
import urllib.error
import re
import sys
import time
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

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

PLAYLIST_URL = os.environ.get('PLAYLIST_URL', 'https://iptv-org.github.io/iptv/index.m3u')
OUTPUT_FILE  = os.environ.get('OUTPUT_FILE',  'public/working.m3u')
MAX_WORKERS  = int(os.environ.get('MAX_WORKERS', 300))
TIMEOUT      = int(os.environ.get('TIMEOUT',     3))

def check_stream(item):
    extinf, url = item
    try:
        req = urllib.request.Request(url, method='GET', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if resp.status == 200:
                head = resp.read(20).decode('utf-8', errors='ignore')
                if '#EXTM3U' in head:
                    return item
    except Exception:
        pass
    return None

def main():
    print(f"[*] Downloading global playlist from {PLAYLIST_URL} ...")
    try:
        req = urllib.request.Request(PLAYLIST_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
    except Exception as e:
        print(f"[!] Failed to download playlist: {e}")
        sys.exit(1)

    lines = [line.strip() for line in content.splitlines() if line.strip()]
    items = []
    
    # Parse #EXTINF and following URL
    current_extinf = None
    for line in lines:
        if line.startswith('#EXTINF'):
            current_extinf = line
        elif current_extinf and not line.startswith('#'):
            items.append((current_extinf, line))
            current_extinf = None

    total = len(items)
    print(f"[*] Found {total} channels. Testing accessibility with {MAX_WORKERS} threads (Timeout: {TIMEOUT}s)...")
    print(f"[*] This may take 1-3 minutes. Please wait.")
    
    working_items = []
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(check_stream, item): item for item in items}
        completed = 0
        
        for future in as_completed(futures):
            completed += 1
            result = future.result()
            if result:
                working_items.append(result)
            
            # Print progress every 100 channels
            if completed % 100 == 0 or completed == total:
                percent = (completed / total) * 100
                working_count = len(working_items)
                print(f"    Progress: {completed}/{total} ({percent:.1f}%) | Working so far: {working_count}", end='\r')

    print()
    elapsed = time.time() - start_time
    print(f"[*] Testing completed in {elapsed:.1f} seconds.")
    print(f"[*] Accessible channels: {len(working_items)} out of {total}")
    
    print(f"[*] Saving to {OUTPUT_FILE} ...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('#EXTM3U\n')
        for extinf, url in working_items:
            f.write(extinf + '\n')
            f.write(url + '\n')
    print("[*] Done!")

if __name__ == '__main__':
    main()
