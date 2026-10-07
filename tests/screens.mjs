// Screenshots (one niced headless Chrome, SwiftShader WebGL). Every scene is real data at a real timestamp.
import { launch, sleep } from "./cdp.mjs";
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
const R = join(dirname(fileURLToPath(import.meta.url)), ".."), OUT = join(R, "screenshots"), U = "file://" + join(R, "dist/index.html");
const b = await launch(9900 + Math.floor(Math.random() * 90), 1440, 900); await b.viewport(1440, 900);
const cam = (c) => b.ev(`(()=>{const i=window.__island;i.camera.position.set(${c[0]},${c[1]},${c[2]});i.controls.target.set(${c[3]},${c[4]},${c[5]});i.controls.update()})()`);
const shot = async (n) => { await b.shot(join(OUT, n)); console.log("shot", n); };
const hover = async (what, dx = 0, dy = 0) => { const p = await b.ev(`window.__island.project(${JSON.stringify(what)})`); await b.mouse(p.x + dx, p.y + dy); await sleep(2500); };
try {
  // 1) Sep 11, 1:21 PM: Michael coordinating the tutors and Oscar by message (real timestamps)
  await b.goto(U + "?mode=replay&day=2026-09-11&hour=13.355&speed=60", 5000); await cam([4, 44, 58, 2, 0, -3]); await sleep(5000);
  await b.ev("window.__island.play(false)"); await shot("00-best-sep11-messages.png");
  await b.ev("document.querySelector('#labels').click()"); await sleep(1200); await shot("01-sep11-labels.png"); await b.ev("document.querySelector('#labels').click()");
  await cam([-2, 22, 18, -3, 1, -12]); await sleep(1500); await hover("Vic Tutor", 0, 0); await shot("02-hover-label.png"); await b.mouse(5, 450);
  // 2) Sep 14 morning: Oscar's money check message to Michael
  await b.goto(U + "?mode=replay&day=2026-09-14&hour=8.73&speed=60", 5000); await sleep(4000); await b.ev("window.__island.play(false)"); await shot("03-sep14-morning.png");
  // 3) fuel tower close-up with hover
  await cam([52, 20, 2, 39, 6, -17]); await sleep(1500); await hover("fuel"); await shot("04-fuel-tower.png"); await b.mouse(5, 450);
  // 4) tonight, 9:30 PM ET (preview clock): windows lit, lighthouse beam, stars, everyone home
  await b.goto(U + "?at=" + encodeURIComponent("2026-10-07T21:30:00-04:00"), 6000); await shot("05-night-tonight.png");
  // 5) right now, real ET clock
  await b.goto(U, 6000); await b.ev("document.querySelector('#banner').style.display='none'"); await shot("06-live-now.png");
  // 6) auto-tour on Sep 11 midday
  await b.goto(U + "?mode=replay&day=2026-09-11&hour=13.45&speed=60&tour=1", 14000); await shot("07-auto-tour.png");
  // 7) tablet
  await b.viewport(1024, 768); await b.goto(U + "?mode=replay&day=2026-09-11&hour=13.37&speed=60", 6000); await shot("08-tablet.png");
} catch (e) { console.error(e.stack); process.exitCode = 1; }
console.log("errors", JSON.stringify(b.errors)); await b.close();
