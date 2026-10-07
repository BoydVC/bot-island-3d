#!/usr/bin/env python3
"""Build Bot Island 3D: read Bot Island data (read-only) and inline three.js + app + data into one offline file."""
import json, os, sys
R = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, R)
import islanddata
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()
data = islanddata.build()
os.makedirs(os.path.join(R, "data"), exist_ok=True)
json.dump(data, open(os.path.join(R, "data", "island3d.json"), "w"), separators=(",", ":"))
safe = lambda s: s.replace("</script", "<\\/script")
html = (rd("src/index.html").replace("/*__CSS__*/", rd("src/style.css")).replace("/*__THREE__*/", safe(rd("vendor/three.iife.min.js")))
        .replace("/*__DATA__*/", safe(json.dumps(data, separators=(",", ":"), ensure_ascii=False))).replace("/*__APP__*/", safe(rd("src/app.js"))))
for f in ("dist/index.html", "dist/bot-island-3d.html"): open(os.path.join(R, f), "w", encoding="utf-8").write(html)
print(f"built dist/bot-island-3d.html  {len(html.encode())/1e6:.2f} MB  ({len(data['bots'])} bots, {len(data['events'])} events, usage {data['usage'].get('used_pct')}% used)")
