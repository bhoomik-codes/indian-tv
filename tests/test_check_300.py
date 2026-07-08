import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor

urls = ["http://example.com"] * 500

def check(url):
    try:
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status == 200
    except:
        return False

start = time.time()
with ThreadPoolExecutor(max_workers=300) as e:
    list(e.map(check, urls))
print("Time:", time.time() - start)
