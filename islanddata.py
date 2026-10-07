#!/usr/bin/env python3
"""Read Bot Island's existing data READ-ONLY and shape it for the 3D island.
Sources (never written): ../bot-island/data/fleet.json, ../bot-island/config.json,
../bot-island/web/app.js (building layout + color palette), ../usage.json (fuel tower)."""
import json, os, re, collections
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
HERE = os.path.dirname(os.path.abspath(__file__))
BI = os.path.normpath(os.path.join(HERE, "..", "bot-island"))
FLEET = os.path.join(BI, "data", "fleet.json"); CONFIG = os.path.join(BI, "config.json"); APPJS = os.path.join(BI, "web", "app.js")
ET = ZoneInfo("America/New_York")
KEEP = ("ts", "type", "bot", "from", "app", "tool", "host", "ext", "approx", "status")

def _ro(path):  # open read-only
    with open(path, "r", encoding="utf-8") as f: return f.read()
def mtime_iso(p): return datetime.fromtimestamp(os.path.getmtime(p), timezone.utc).isoformat().replace("+00:00", "Z")
def et_day(ts): return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ET).date().isoformat()

def layout():
    js = _ro(APPJS)
    colors = dict(re.findall(r"(\w+):\s*'(#[0-9a-fA-F]{6})'", re.search(r"const COLORS = \{(.*?)\};", js).group(1)))
    blk = re.search(r"const BUILDINGS = \{(.*?)\n\};", js, re.S).group(1)
    b = {}
    for m in re.finditer(r"(\w+):\s*\{x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*name:\s*(['\"])(.*?)\4,\s*emoji:\s*'(.*?)'(.*?)\}", blk):
        b[m.group(1)] = {"x": float(m.group(2)), "y": float(m.group(3)), "name": m.group(5), "emoji": m.group(6), "decor": "decor" in m.group(7)}
    m = re.search(r"BUILDINGS\.boyd = \{x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*name:\s*\"(.*?)\"", js)
    if m: b["boyd"] = {"x": float(m.group(1)), "y": float(m.group(2)), "name": m.group(3), "emoji": "🏠", "decor": True}
    emo = dict(re.findall(r"'?([\w .()\-]+?)'?:\s*'([^']+)'", re.search(r"const EMOJI = \{(.*?)\};", js).group(1)))
    return colors, b, emo

def usage():
    cfg = json.loads(_ro(CONFIG)); p = cfg.get("usageFile") or "/workspace/tokenmax/usage.json"
    try: u = json.loads(_ro(p)); u["_file"] = p; u["_mtime"] = mtime_iso(p); return u
    except Exception as e: return {"error": str(e), "_file": p}

def build():
    fleet = json.loads(_ro(FLEET)); cfg = json.loads(_ro(CONFIG)); colors, buildings, emo = layout()
    hide = set(cfg.get("hide", []))
    bots = []
    for b in fleet["bots"]:
        if b["name"] in hide: continue
        bots.append({"id": b["id"], "name": b["name"], "title": b.get("title"), "color": b.get("color"), "hex": colors.get(b.get("color"), "#94a3b8"),
                     "shape": b.get("shape"), "building": b.get("building") or "commons", "emoji": emo.get(b["name"], "🤖"),
                     "routines": [{"name": r.get("name"), "cron": r.get("cron"), "enabled": r.get("enabled"),
                                   "runs": [{"start": x.get("start"), "end": x.get("end"), "status": x.get("status")} for x in r.get("runs", [])]} for r in b.get("routines", [])]})
    ids = {b["id"] for b in bots}
    events = [{k: e[k] for k in KEEP if k in e} for e in fleet["events"] if e.get("bot") in ids]
    events.sort(key=lambda e: e["ts"])
    return {"app": "Bot Island 3D", "builtAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "fleetGeneratedAt": fleet.get("generatedAt"), "fleetFile": FLEET, "fleetMtime": mtime_iso(FLEET), "sources": fleet.get("sources", {}),
            "timezone": "America/New_York", "palette": colors, "buildings": buildings, "bots": bots, "eggs": fleet.get("eggs", []),
            "events": events, "usage": usage(), "droppedEvents": len(fleet["events"]) - len(events)}

def day_counts(data):
    """ET-day → Counter(type) over the events the 3D island replays (used by tests)."""
    out = collections.defaultdict(collections.Counter)
    for e in data["events"]: out[et_day(e["ts"])][e["type"]] += 1
    return out

if __name__ == "__main__":
    d = build(); c = day_counts(d)
    print(len(d["bots"]), "bots,", len(d["events"]), "events,", len(c), "ET days; dropped", d["droppedEvents"])
    print("buildings:", list(d["buildings"])); print("Sep 11:", dict(c["2026-09-11"])); print("usage:", d["usage"])
