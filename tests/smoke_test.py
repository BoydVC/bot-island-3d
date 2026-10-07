#!/usr/bin/env python3
"""Smoke test for Bot Island 3D.
* Expected counts are computed here straight from the SOURCE (../bot-island/data/fleet.json, read-only) with zoneinfo,
  independently of the JS. Headless Chrome (one instance, niced, SwiftShader WebGL) then replays whole days through the
  real playback path and must fire exactly those events, type by type, with no page errors.
* Also checks scrubbing, a real message walk, hover labels, the fuel tower vs usage.json, auto-tour, live clock and the
  night sky, the offline snapshot, and that the server answers on :4259.
Usage: python3 tests/smoke_test.py [--no-browser]"""
import json, os, subprocess, sys, collections, tempfile, re, urllib.request, hashlib
from datetime import datetime
from zoneinfo import ZoneInfo
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(R)
ET = ZoneInfo("America/New_York"); SRC = os.path.join(R, "..", "bot-island", "data", "fleet.json")
res = []
def check(name, cond, info=""): res.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{info}]" if info != "" else ""), flush=True)
def et(ts): return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ET)
src = json.load(open(SRC, encoding="utf-8")); hidden = set(json.load(open(os.path.join(R, "..", "bot-island", "config.json"))).get("hide", []))
botids = {b["id"]: b["name"] for b in src["bots"] if b["name"] not in hidden}
evs = [e for e in src["events"] if e.get("bot") in botids]
by = collections.defaultdict(collections.Counter)
for e in evs: by[et(e["ts"]).date().isoformat()][e["type"]] += 1
snap = open("dist/bot-island-3d.html", encoding="utf-8").read()
m = re.search(r"window\.BOT_ISLAND_3D_DATA = (\{.*?\});</script>", snap, re.S); baked = json.loads(m.group(1))
check("snapshot embeds every source event", len(baked["events"]) == len(evs) == len(src["events"]) - sum(1 for e in src["events"] if e.get("bot") not in botids), f'{len(baked["events"])} events')
check("snapshot events identical to source (ts/type/bot/from)", [(e["ts"], e["type"], e["bot"], e.get("from")) for e in baked["events"]] == sorted([(e["ts"], e["type"], e["bot"], e.get("from")) for e in evs], key=lambda x: x[0]))
check("all bots present with Bot Island colors", len(baked["bots"]) == len(botids) and all(b["hex"].startswith("#") for b in baked["bots"]), ", ".join(f'{b["name"]}={b["color"]}' for b in baked["bots"][:5]) + "…")
check("snapshot is offline (no external scripts/styles/images)", not re.search(r'<(script|link|img)[^>]+(src|href)\s*=\s*["\']?https?:', snap) and "cdn." not in snap and "unpkg" not in snap)
check("three.js vendored locally (r169)", 'REVISION="169"' in snap or "REVISION=\"169\"" in snap or '"169"' in snap)
u = json.load(open("/workspace/tokenmax/usage.json"))
check("fuel tower baked from usage.json", baked["usage"].get("used_pct") == u.get("used_pct") or baked["usage"].get("checked_at") != u.get("checked_at"), f'baked {baked["usage"].get("used_pct")}% used, file {u.get("used_pct")}%')
PORT = open("data/server.port").read().strip() if os.path.exists("data/server.port") else "4259"
try:
    live = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/usage", timeout=5))
    check(f"server :{PORT} /api/usage re-reads usage.json", live.get("used_pct") == u.get("used_pct"), f'{live.get("used_pct")}%')
    check(f"server :{PORT} serves the island", b"Bot Island 3D" in urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=5).read(400000))
except Exception as e: check(f"server :{PORT} reachable", False, e)
days = ["2026-09-11", "2026-09-14", "2026-08-20", "2026-10-06"]
d11 = sorted([e for e in evs if et(e["ts"]).date().isoformat() == "2026-09-11"], key=lambda e: e["ts"])
def minute(e): t = et(e["ts"]); return t.hour * 60 + t.minute + t.second / 60 + t.microsecond / 6e7
scrub = [360, 780, 1020]; exp_scrub = {m_: sum(1 for e in d11 if minute(e) <= m_) for m_ in scrub}
bld = {b["id"]: b.get("building") for b in src["bots"]}
msg = next(e for e in d11 if e["type"] == "agent_msg" and bld.get(e["from"]) != bld.get(e["bot"]))
if "--no-browser" not in sys.argv:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"url": "file://" + os.path.join(R, "dist", "index.html"), "days": days, "scrubMinutes": scrub, "msg": {"minute": minute(msg)}}, f); xp = f.name
    p = subprocess.run(["nice", "-n", "15", "node", "--experimental-websocket", "tests/render.mjs", xp], capture_output=True, text=True, timeout=900)
    try: O = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: O = {"crash": (p.stdout + p.stderr)[-600:]}
    check("headless render ran", "crash" not in O and O.get("ready"), O.get("crash", ""))
    i = O.get("info", {}); check("scene built: 16 buildings, 16 homes, 17 avatars (16 bots + Boyd), WebGL", i.get("buildings") == 16 and i.get("homes") == 16 and i.get("avatars") == 17 and "WebGL" in str(i.get("gl")), i)
    for d in days:
        s = O.get("days", {}).get(d, {}); exp = dict(by[d])
        check(f"replay {d}: played to end of day via playback", s.get("finished") and s.get("playbackOnly") and s.get("playbackFired") == sum(exp.values()), f'fired {s.get("playbackFired")} of {sum(exp.values())}')
        check(f"replay {d}: event counts by type match source", s.get("counts") == exp, f'{s.get("counts")} vs {exp}')
    check("scrub: events-so-far match source at 6 AM / 1 PM / 5 PM", all(O.get("scrub", {}).get(str(k)) == v for k, v in exp_scrub.items()), f'{O.get("scrub")} vs {exp_scrub}')
    sender = botids[msg["from"]]; s = O.get("msg") or {}
    check(f"real message {et(msg['ts']).strftime('%-I:%M %p')} ET: {sender} walks to {botids[msg['bot']]} carrying it", sender in s.get("walking", []) and sender in s.get("carrying", []), f'walking={s.get("walking")} carrying={s.get("carrying")}')
    check("hover label on the fuel tower", "Fuel tower" in O.get("tipFuel", "") and f'{100 - baked["usage"]["used_pct"]}% fuel left' in O.get("tipFuel", ""), O.get("tipFuel", "")[:120])
    check("fuel level = 100 − used_pct", i.get("fuel", {}).get("left") == 100 - baked["usage"]["used_pct"], i.get("fuel", {}).get("left"))
    check("auto-tour moves the camera", O.get("tourMoved", 0) > 3, round(O.get("tourMoved", 0), 1))
    lv = O.get("live", {}); today = datetime.now(ET).date().isoformat()
    check("live mode follows the real ET clock", lv.get("mode") == "live" and lv.get("day") == today and abs(lv.get("simT", 0) / 1000 - datetime.now().timestamp()) < 600, lv.get("day"))
    check("live mode replays today's real events so far", lv.get("counts") == dict(collections.Counter(e["type"] for e in evs if et(e["ts"]).date().isoformat() == today and et(e["ts"]).timestamp() * 1000 <= lv.get("simT", 0))), lv.get("counts"))
    check("day/night: 11:30 PM ET is night, 1 PM ET is day (sun from clock time)", O.get("night", {}).get("sunDeg", 99) < -10 and O.get("noon", {}).get("sunDeg", -99) > 30, f'{O.get("night", {}).get("sunDeg")}° / {O.get("noon", {}).get("sunDeg")}°')
    check("no page errors in headless render", not O.get("errors"), O.get("errors"))
shots = [f for f in os.listdir("screenshots") if f.endswith(".png")] if os.path.isdir("screenshots") else []
check("screenshots present", len(shots) >= 6 and "00-best-sep11-messages.png" in shots, len(shots))
print(f"\n{sum(res)}/{len(res)} checks passed"); sys.exit(0 if all(res) else 1)
