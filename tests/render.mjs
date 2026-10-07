// Headless render + replay check. Prints JSON results; Python (smoke_test.py) compares them with the source data.
// usage: node --experimental-websocket tests/render.mjs <expect.json>
import { launch, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const X = JSON.parse(readFileSync(process.argv[2], "utf8")), URL0 = X.url, out = { days: {}, scrub: {}, msg: null };
const b = await launch(9600 + Math.floor(Math.random() * 300), 1280, 720); await b.viewport(1280, 720);
const ev = b.ev, st = () => ev("window.__island.stats()");
async function waitFor(expr, ms = 90000) { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(250); } return false; }
try {
  await b.goto(URL0 + "?mode=replay&day=2026-09-11&hour=0&play=0&lite=1", 4000);
  out.ready = await waitFor("!!(window.__island && window.__island.ready)", 20000); out.info = await ev("window.__island.info()");
  for (const day of X.days) {   // full-day replay through the real playback path
    await ev(`window.__island.setDay(${JSON.stringify(day)}); window.__island.setTime(0); window.__island.play(true, 40000)`);
    const done = await waitFor("!window.__island.stats().playing", 120000); const s = await st(); out.days[day] = Object.assign({ finished: done }, s);
  }
  await ev(`window.__island.setDay("2026-09-11")`);
  for (const m of X.scrubMinutes) { await ev(`window.__island.setTime(${m})`); await sleep(300); out.scrub[m] = (await st()).cursor; }
  // a real message: sender should be walking with an envelope just after the timestamp
  await ev(`window.__island.setTime(${X.msg.minute + 0.3}); window.__island.play(false)`); await sleep(1500); out.msg = await st();
  // hover label on the fuel tower and on a bot
  await ev(`window.__island.camera.position.set(40,30,10); window.__island.controls.target.set(40,2,-17); window.__island.controls.update()`); await sleep(1500);
  let p = await ev(`window.__island.project("fuel")`); await b.mouse(p.x, p.y); await sleep(2500);
  out.tipFuel = await ev(`(()=>{const t=document.querySelector('#tip');return t.style.display==='block'?t.textContent:''})()`);
  // tour moves the camera
  const c0 = (await st()).cam; await ev("window.__island.setTour(true)"); await sleep(6000); const c1 = (await st()).cam; await ev("window.__island.setTour(false)");
  out.tourMoved = Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
  // live mode (real ET clock) and a night preview
  await b.goto(URL0 + "?lite=1", 4000); out.live = await st();
  await b.goto(URL0 + "?lite=1&at=" + encodeURIComponent("2026-10-07T23:30:00-04:00"), 4000); out.night = await st();
  await b.goto(URL0 + "?lite=1&at=" + encodeURIComponent("2026-10-07T13:00:00-04:00"), 4000); out.noon = await st();
  out.wireText = await ev("document.querySelector('#counts').textContent");
} catch (e) { out.crash = String(e.stack || e); }
out.errors = b.errors.concat(await ev("window.__island ? window.__island.errors : []").catch(() => []));
await b.close(); console.log(JSON.stringify(out));
