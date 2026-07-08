import urllib.request
def check(url):
    req = urllib.request.Request(url, method='GET', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=3) as resp:
        head = resp.read(20).decode('utf-8', errors='ignore')
        return head, '#EXTM3U' in head
print(check("https://dai.google.com/linear/hls/event/JCAm25qkRXiKcK1AJMlvKQ/master.m3u8"))
