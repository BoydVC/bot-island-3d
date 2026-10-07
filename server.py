#!/usr/bin/env python3
"""Serve Bot Island 3D on :4259. GET / → dist/index.html (data baked in at build time);
GET /api/usage → ../usage.json re-read on every request (fuel tower refreshes each minute). Read-only."""
import http.server, json, os, sys
R = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, R)
import islanddata
PORT = int(os.environ.get("BOT_ISLAND_3D_PORT", "4259"))  # run.sh falls back to 4261 if 4259 is taken
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=os.path.join(R, "dist"), **k)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split("?")[0] in ("/api/usage",):
            body = json.dumps(islanddata.usage()).encode(); self.send_response(200)
            self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
