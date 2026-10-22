"""Static local preview with the site's explicit Vercel HTML rewrites."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "vercel.json").read_text())
REWRITES = {
    rule["source"]: rule["destination"]
    for rule in CONFIG.get("rewrites", [])
    if rule["source"].startswith("/")
    and rule["destination"].startswith("/")
    and rule["destination"].endswith(".html")
    and ":" not in rule["source"]
}


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        original = self.path
        url = urlsplit(original)
        if url.path in REWRITES:
            self.path = urlunsplit(("", "", REWRITES[url.path], url.query, ""))
        try:
            return super().send_head()
        finally:
            self.path = original


if __name__ == "__main__":
    server = ThreadingHTTPServer(
        ("127.0.0.1", 8000), partial(PreviewHandler, directory=str(ROOT))
    )
    print("KAEMENTO preview: http://localhost:8000", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
