import urllib.request
from concurrent.futures import ThreadPoolExecutor

def check(url):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except:
        return False

with ThreadPoolExecutor(max_workers=50) as executor:
    urls = ['http://103.72.101.252:8080/live/185.m3u8', 'https://trs1.aynaott.com/andpictureshd/index.m3u8'] * 20
    results = list(executor.map(check, urls))
    print(f"Working: {sum(results)} / {len(results)}")
