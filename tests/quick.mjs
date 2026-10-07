import { launch, sleep } from "./cdp.mjs";
const b = await launch(9561 + Math.floor(Math.random()*300)); await b.viewport(1440, 900);
await b.goto("file:///workspace/tokenmax/bot-island-3d/dist/index.html?mode=replay&day=2026-09-11&hour=13.25&speed=60", 6000);
console.log(JSON.stringify(await b.ev("window.__island && {s: window.__island.stats(), i: window.__island.info()}")));
await b.shot("/tmp/bi3d-q.png"); console.log(JSON.stringify(b.errors)); await b.close();
