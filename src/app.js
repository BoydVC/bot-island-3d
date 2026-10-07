/* Bot Island 3D: a Three.js remake of Bot Island. All activity comes from Bot Island's own data files
   (data/fleet.json events + routine runs) and ../usage.json. Nothing is invented and nothing is sent anywhere. */
(function () {
"use strict";
const T = window.THREE, D = window.BOT_ISLAND_3D_DATA, QS = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s), MIN = 60000, HOUR = 60 * MIN;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message)));
const pad = (n) => String(n).padStart(2, "0");
// ---------- ET time helpers ----------
const FP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function etParts(ms) { const o = {}; for (const p of FP.formatToParts(ms)) o[p.type] = p.value; return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second }; }
function etDay(ms) { const p = etParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
function etMidnight(day) { const [y, m, d] = day.split("-").map(Number); let g = Date.UTC(y, m - 1, d, 4);
  for (let i = 0; i < 3; i++) { const p = etParts(g); g -= ((p.h * 60 + p.mi) * 60 + p.s) * 1000 + (Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(y, m - 1, d)); } return g; }
function nextDay(day) { const [y, m, d] = day.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + 1)); return t.toISOString().slice(0, 10); }
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const fmtDayStr = (day) => fmtDay(etMidnight(day) + 12 * HOUR);
// ---------- sun position (NOAA-style approximation) for Baltimore ----------
const LAT = 39.29, LON = -76.61, RAD = Math.PI / 180;
function sunPos(ms) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0, g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24, H = (gmst * 15 + LON) * RAD - ra, la = LAT * RAD;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  return { alt, az };
}
function sunTimes(day) { const t0 = etMidnight(day); let rise = null, set = null, prev = sunPos(t0).alt;
  for (let t = t0 + 2 * MIN; t <= t0 + 24 * HOUR; t += 2 * MIN) { const a = sunPos(t).alt, th = -0.833 * RAD; if (prev < th && a >= th) rise = t; if (prev >= th && a < th) set = t; prev = a; } return { rise, set }; }
// ---------- data ----------
const BLD = D.buildings, bots = D.bots, byId = Object.fromEntries(bots.map((b) => [b.id, b]));
const EV = D.events.map((e, i) => Object.assign({}, e, { t: Date.parse(e.ts), i })).filter((e) => !isNaN(e.t)).sort((a, b) => a.t - b.t);
const byDay = {}; for (const e of EV) (byDay[etDay(e.t)] ||= []).push(e);
const days = Object.keys(byDay).sort();
const RUNS = []; for (const b of bots) for (const r of b.routines || []) for (const x of r.runs || []) { const s = Date.parse(x.start), en = Date.parse(x.end || x.start); if (!isNaN(s)) RUNS.push({ bot: b.id, routine: r.name, s, e: isNaN(en) ? s + 10 * MIN : Math.max(en, s), status: x.status }); }
const runsByDay = {}; for (const r of RUNS) (runsByDay[etDay(r.s)] ||= []).push(r);
const W = (x, y) => new T.Vector3((x - 600) / 10, 0, (y - 395) / 10);
function islandRadius(a) { return 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.045 * Math.sin(a * 5 + 2.1) + 0.03 * Math.sin(a * 9 + 1.3); } // same outline as Bot Island
const ISLE = { cx: 600, cy: 395, rx: 545, ry: 330 };
const islePoint = (a, k) => { const r = islandRadius(a) * k; return { x: ISLE.cx + Math.cos(a) * ISLE.rx * r, y: ISLE.cy + Math.sin(a) * ISLE.ry * r }; };
const GROUND = 1.6;
function rng(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const shade = (hex, k) => { const c = new T.Color(hex); c.multiplyScalar(k); return c; };
// ---------- renderer / scene ----------
const LITE = QS.get("lite") === "1";
let renderer;
try { renderer = new T.WebGLRenderer({ canvas: $("#gl"), antialias: !LITE, preserveDrawingBuffer: true }); }
catch (e) { $("#banner").textContent = "WebGL isn't available in this browser."; $("#banner").style.display = "block"; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1 : 2));
renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene(); scene.fog = new T.Fog(0x87c5ff, 160, 420);
const camera = new T.PerspectiveCamera(42, 1, 0.5, 1200); camera.position.set(8, 60, 80);
const controls = new T.OrbitControls(camera, renderer.domElement);
controls.target.set(9, 0, 4); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.38; controls.minDistance = 14; controls.maxDistance = 190; controls.update();
const hemi = new T.HemisphereLight(0xdbeafe, 0x335533, 0.9); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff4e0, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 10, far: 400 }); sun.shadow.bias = -0.0008; scene.add(sun, sun.target);
const moonLight = new T.DirectionalLight(0x93b4ff, 0); scene.add(moonLight);
const M = (hex, o = {}) => new T.MeshStandardMaterial(Object.assign({ color: hex, flatShading: true, roughness: 0.85, metalness: 0.02 }, o));
const pickables = [];
function mesh(geo, mat, pick, cast = true) { const m = new T.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; if (pick) m.userData.pick = pick; return m; }
function tagPick(obj, pick) { obj.traverse((o) => { if (o.isMesh && !o.userData.nopick) { o.userData.pick = pick; pickables.push(o); } }); }
function shown(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
// water
const waterGeo = new T.PlaneGeometry(700, 700, 48, 48); waterGeo.rotateX(-Math.PI / 2);
const waterMat = M(0x2a8fd6, { roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 });
const water = new T.Mesh(waterGeo, waterMat); water.receiveShadow = true; scene.add(water);
const wBase = Float32Array.from(waterGeo.attributes.position.array);
// island
function outline(k, n = 84) { const s = new T.Shape(); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, p = islePoint(a, k), v = W(p.x, p.y); i ? s.lineTo(v.x, -v.z) : s.moveTo(v.x, -v.z); } return s; }
function slab(k, depth, y, color, bevel) { const g = new T.ExtrudeGeometry(outline(k), { depth, bevelEnabled: true, bevelThickness: 0.4, bevelSize: bevel, bevelSegments: 1 }); g.rotateX(-Math.PI / 2); const m = mesh(g, M(color), null, false); m.position.y = y; return m; }
scene.add(slab(1.0, 1.6, -1.0, 0xe6d2a0, 1.6)); const grass = slab(0.9, 1.0, 0.2, 0x5fb35a, 0.9); scene.add(grass);
// stars + moon
const starGeo = new T.BufferGeometry(), sp = []; const sr = rng("stars"); for (let i = 0; i < 700; i++) { const a = sr() * Math.PI * 2, el = Math.asin(sr() * 0.95 + 0.05), r = 500; sp.push(Math.cos(el) * Math.cos(a) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(a) * r); }
starGeo.setAttribute("position", new T.Float32BufferAttribute(sp, 3)); const starMat = new T.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }); scene.add(new T.Points(starGeo, starMat));
const sunBall = new T.Mesh(new T.SphereGeometry(9, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1b8, fog: false })); scene.add(sunBall);
const moon = new T.Mesh(new T.SphereGeometry(6, 16, 12), new T.MeshBasicMaterial({ color: 0xe5e7eb, fog: false })); scene.add(moon);
// shared bits
const windowMat = new T.MeshStandardMaterial({ color: 0x1e293b, emissive: 0xffd27a, emissiveIntensity: 0.0, flatShading: true });
const glowMats = [];
function windows(group, w, h, z, n, y) { for (let i = 0; i < n; i++) { const m = mesh(new T.BoxGeometry(0.55, 0.6, 0.08), windowMat, null, false); m.position.set(-w / 2 + (w / (n + 1)) * (i + 1), y, z); group.add(m); } }
function gable(w, h, d, color) { const s = new T.Shape(); s.moveTo(-w / 2 - 0.3, 0); s.lineTo(w / 2 + 0.3, 0); s.lineTo(0, h); s.lineTo(-w / 2 - 0.3, 0); const g = new T.ExtrudeGeometry(s, { depth: d + 0.4, bevelEnabled: false }); g.translate(0, 0, -(d + 0.4) / 2); return mesh(g, M(color)); }
function box(w, h, d, color, y = 0) { const m = mesh(new T.BoxGeometry(w, h, d), M(color)); m.position.y = y + h / 2; return m; }
function cyl(rt, rb, h, seg, color, y = 0) { const m = mesh(new T.CylinderGeometry(rt, rb, h, seg), M(color)); m.position.y = y + h / 2; return m; }
function flag(color, h = 2.2) { const g = new T.Group(); const p = cyl(0.06, 0.06, h, 5, 0xe5e7eb); g.add(p); const f = mesh(new T.BoxGeometry(0.9, 0.55, 0.04), M(color), null, false); f.position.set(0.47, h - 0.35, 0); g.add(f); return g; }
const residents = (key) => bots.filter((b) => b.building === key);
function bodyColors(key, fallback) { const r = residents(key); return r.length ? r.map((b) => b.hex) : [fallback]; }
function striped(w, h, d, colors, y = 0) { const g = new T.Group(), n = colors.length; colors.forEach((c, i) => { const m = box(w / n, h, d, c, y); m.position.x = -w / 2 + (w / n) * (i + 0.5); g.add(m); }); return g; }
const anim = { gear: null, beam: null, smoke: [], radio: [], rocket: null, beacon: null, fluid: null, fountain: null };
const builders = {
  hq(c) { const g = new T.Group(); g.add(box(7.5, 0.5, 5.5, 0xd6d3d1)); g.add(striped(6.6, 3.4, 4.6, c, 0.5));
    for (let i = 0; i < 6; i++) { const col = cyl(0.22, 0.22, 3.4, 8, 0xf5f5f4, 0.5); col.position.set(-2.8 + i * 1.12, col.position.y, 2.75); g.add(col); }
    const ped = gable(6.8, 1.3, 5, 0xf5f5f4); ped.position.y = 3.9; g.add(ped); const dome = mesh(new T.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xfbbf24, { metalness: 0.4, roughness: 0.4 })); dome.position.y = 5.0; g.add(dome);
    const f1 = flag(0xf97316); f1.position.set(-0.6, 6.2, 0); const f2 = flag(0x4c1d95); f2.position.set(0.6, 6.2, 0); g.add(f1, f2); windows(g, 6.6, 3.4, 2.32, 0, 0); return g; },
  library(c) { const g = new T.Group(); g.add(striped(6, 3.2, 4.4, c)); const r = gable(6, 1.8, 4.4, shade(c[0], 0.6)); r.position.y = 3.2; g.add(r); windows(g, 6, 3, 2.22, 4, 1.8);
    for (let i = 0; i < 4; i++) { const b = box(0.5, 0.7 + i * 0.25, 0.9, [0xef4444, 0x22c55e, 0xfbbf24, 0x3b82f6][i]); b.position.set(3.6, b.position.y, -1 + i * 0.55); g.add(b); } return g; },
  observatory(c) { const g = new T.Group(); g.add(cyl(2.4, 2.6, 3.2, 10, c[0])); const d = mesh(new T.SphereGeometry(2.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf8fafc)); d.position.y = 3.2; g.add(d);
    const tel = cyl(0.35, 0.45, 3.4, 8, 0x334155); tel.position.set(0.8, 4.6, 0); tel.rotation.z = -0.8; g.add(tel); windows(g, 2, 2, 2.6, 1, 1.6); return g; },
  bank(c) { const g = new T.Group(); g.add(box(6.6, 0.4, 4.8, 0xd6d3d1)); g.add(striped(6, 3, 4.2, c, 0.4)); const ped = gable(6.2, 1.2, 4.4, shade(c[0], 1.25)); ped.position.y = 3.4; g.add(ped);
    for (let i = 0; i < 4; i++) { const col = cyl(0.2, 0.2, 3, 8, 0xf8fafc, 0.4); col.position.set(-2.2 + i * 1.46, col.position.y, 2.25); g.add(col); }
    const coin = mesh(new T.CylinderGeometry(0.8, 0.8, 0.2, 14), M(0xfbbf24, { metalness: 0.6, roughness: 0.3 })); coin.rotation.x = Math.PI / 2; coin.position.y = 5.5; g.add(coin); anim.coin = coin; return g; },
  clubhouse(c) { const g = new T.Group(); g.add(striped(6, 2.6, 4.4, c)); const r = gable(6, 2, 4.4, 0xf8fafc); r.position.y = 2.6; g.add(r); const ch = box(0.6, 1.6, 0.6, 0x9a3412, 3.0); ch.position.x = 1.8; g.add(ch); windows(g, 6, 2.6, 2.22, 3, 1.4); return g; },
  school(c) { const g = new T.Group(); g.add(striped(7, 2.8, 4.4, c)); const r = gable(7, 1.8, 4.4, 0x9f1239); r.position.y = 2.8; g.add(r); const tw = box(1.2, 1.6, 1.2, 0xf8fafc, 4.2); g.add(tw); const tp = mesh(new T.ConeGeometry(1.0, 1.2, 4), M(0x9f1239)); tp.position.y = 6.4; tp.rotation.y = Math.PI / 4; g.add(tp); windows(g, 7, 2.8, 2.22, 4, 1.5); return g; },
  press(c) { const g = new T.Group(); g.add(striped(6.4, 3, 4.4, c)); g.add(box(6.8, 0.3, 4.8, shade(c[0], 0.6), 3)); const st = cyl(0.5, 0.6, 3.4, 8, 0x7c2d12, 3); st.position.x = 2.2; g.add(st); anim.pressStack = st; windows(g, 6.4, 3, 2.22, 4, 1.7); return g; },
  radio(c) { const g = new T.Group(); g.add(box(3.2, 2, 3, c[0])); const t = mesh(new T.CylinderGeometry(0.15, 1.1, 11, 4, 1, true), M(0xcbd5e1, { wireframe: true })); t.position.set(0, 7.5, -0.4); g.add(t);
    const b = mesh(new T.SphereGeometry(0.35, 8, 6), new T.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1 })); b.position.set(0, 13.1, -0.4); g.add(b); anim.beacon = b; anim.radioTop = new T.Vector3(0, 13, -0.4); return g; },
  postoffice(c) { const g = new T.Group(); g.add(striped(5.4, 2.6, 4, c)); g.add(box(6, 0.35, 4.6, 0xf8fafc, 2.6)); const mb = box(0.7, 1.1, 0.7, 0x1d4ed8); mb.position.set(3.4, mb.position.y, 1.6); g.add(mb); windows(g, 5.4, 2.6, 2.02, 2, 1.5); return g; },
  workshop(c) { const g = new T.Group(); g.add(striped(6, 2.6, 4.2, c)); for (let i = 0; i < 3; i++) { const s = gable(2, 1.3, 4.2, 0x57534e); s.position.set(-2 + i * 2, 2.6, 0); s.scale.set(1, 1, 1); g.add(s); }
    const gear = new T.Group(); gear.add(mesh(new T.CylinderGeometry(1.1, 1.1, 0.35, 12), M(0x94a3b8, { metalness: 0.5 }))); for (let i = 0; i < 10; i++) { const tth = mesh(new T.BoxGeometry(0.35, 0.35, 0.5), M(0x94a3b8, { metalness: 0.5 })); const a = i / 10 * Math.PI * 2; tth.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); gear.add(tth); }
    gear.rotation.x = Math.PI / 2; gear.position.set(0, 2.0, 2.4); g.add(gear); anim.gear = gear; return g; },
  hatchery(c) { const g = new T.Group(); g.add(striped(4.4, 2.2, 3.6, c)); const r = gable(4.4, 1.4, 3.6, 0xf8fafc); r.position.y = 2.2; g.add(r); const n = Math.max(1, (D.eggs || []).length);
    for (let i = 0; i < n; i++) { const nest = mesh(new T.TorusGeometry(0.8, 0.25, 5, 10), M(0xa16207)); nest.rotation.x = Math.PI / 2; nest.position.set(3.4, 0.3, -0.8 + i * 1.8); g.add(nest); const egg = mesh(new T.SphereGeometry(0.62, 10, 8), M(0xfef3c7)); egg.scale.y = 1.3; egg.position.set(3.4, 0.9, -0.8 + i * 1.8); g.add(egg); } return g; },
  lighthouse(c) { const g = new T.Group(); for (let i = 0; i < 5; i++) { const s = cyl(1.3 - i * 0.16, 1.45 - i * 0.16, 1.6, 10, i % 2 ? 0xf8fafc : c[0], i * 1.6); g.add(s); }
    const lamp = mesh(new T.CylinderGeometry(0.8, 0.8, 1, 8), new T.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfde68a, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 })); lamp.position.y = 8.5; g.add(lamp); glowMats.push(lamp.material);
    const cap = mesh(new T.ConeGeometry(1.0, 1, 8), M(c[0])); cap.position.y = 9.5; g.add(cap);
    const beamG = new T.ConeGeometry(2.4, 26, 16, 1, true); beamG.translate(0, -13, 0); beamG.rotateZ(Math.PI / 2);
    const beam = new T.Mesh(beamG, new T.MeshBasicMaterial({ color: 0xfff7c2, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })); beam.position.y = 8.5; beam.userData.nopick = true; g.add(beam); anim.beam = beam; return g; },
  launchpad(c) { const g = new T.Group(); g.add(cyl(3, 3.2, 0.5, 12, 0x64748b)); const r = new T.Group(); r.add(cyl(0.8, 0.8, 4.6, 10, 0xf8fafc, 0.5)); const band = cyl(0.82, 0.82, 0.6, 10, c[0], 3.2); r.add(band);
    const nose = mesh(new T.ConeGeometry(0.8, 1.8, 10), M(c[0])); nose.position.y = 6.0; r.add(nose); for (let i = 0; i < 3; i++) { const f = mesh(new T.BoxGeometry(0.12, 1.4, 1.2), M(c[0])); const a = i / 3 * Math.PI * 2; f.position.set(Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8); f.rotation.y = -a; r.add(f); }
    g.add(r); anim.rocket = r; const gan = box(0.5, 7, 0.5, 0xb91c1c, 0.5); gan.position.x = -2; g.add(gan); return g; },
  stadium() { const g = new T.Group(); const pts = []; for (const [x, y] of [[5, 0], [5.6, 0], [7.4, 3.2], [7.0, 3.4], [5.4, 0.6]]) pts.push(new T.Vector2(x, y));
    const bowl = mesh(new T.LatheGeometry(pts, 18), M(0x6d28d9, { side: T.DoubleSide })); bowl.scale.z = 0.72; g.add(bowl); const field = mesh(new T.CircleGeometry(5.2, 18), M(0x16a34a), null, false); field.rotation.x = -Math.PI / 2; field.position.y = 0.08; field.scale.y = 0.72; g.add(field);
    [0xf97316, 0x4c1d95, 0x034694, 0xe21833].forEach((col, i) => { const f = flag(col, 2.6); const a = i / 4 * Math.PI * 2 + 0.4; f.position.set(Math.cos(a) * 7.2, 3.2, Math.sin(a) * 5.2); g.add(f); }); return g; },
  commons() { const g = new T.Group(); g.add(cyl(2.4, 2.6, 0.6, 12, 0xd6d3d1)); const w = cyl(2.1, 2.1, 0.12, 12, 0x60a5fa, 0.55); w.material = M(0x60a5fa, { roughness: 0.2, emissive: 0x1e3a8a, emissiveIntensity: 0.2 }); g.add(w); g.add(cyl(0.3, 0.4, 2.0, 8, 0xe7e5e4)); const top = cyl(0.9, 0.5, 0.3, 10, 0xe7e5e4, 2.0); g.add(top); anim.fountain = w; return g; },
  boyd() { const g = new T.Group(); g.add(box(3.4, 2.2, 3, 0xf1f5f9)); const r = gable(3.4, 1.5, 3, 0x4c1d95); r.position.y = 2.2; g.add(r); windows(g, 3.4, 2.2, 1.52, 2, 1.3); return g; },
};
const buildingObjs = {}, workSpots = {};
const plaza = W(BLD.commons.x, BLD.commons.y);
for (const [key, b] of Object.entries(BLD)) {
  const fn = builders[key]; if (!fn) continue; const g = fn(bodyColors(key, 0x94a3b8)); const p = W(b.x, b.y); g.position.set(p.x, GROUND, p.z);
  if (key !== "commons") g.rotation.y = Math.atan2(plaza.x - p.x, plaza.z - p.z); scene.add(g);
  tagPick(g, { kind: "building", key }); buildingObjs[key] = g;
  const dir = new T.Vector3(plaza.x - p.x, 0, plaza.z - p.z); const dist = dir.length() || 1; dir.divideScalar(dist);
  workSpots[key] = { p, dir, door: key === "commons" ? p.clone().add(new T.Vector3(0, 0, 3.4)) : p.clone().addScaledVector(dir, key === "stadium" ? 8.5 : key === "radio" ? 3.2 : 4.4) };
  if (key !== "commons" && key !== "stadium") { const len = Math.max(0, dist - 6); if (len > 0) { const path = mesh(new T.BoxGeometry(1.5, 0.05, len), M(0xe4cf98), null, false); const mid = p.clone().addScaledVector(dir, 4.4 + len / 2); path.position.set(mid.x, GROUND + 0.03, mid.z); path.rotation.y = Math.atan2(dir.x, dir.z); scene.add(path); } }
}
// homes around the rim (same rule as Bot Island: alphabetical, 0.8 of the island radius)
const order = [...bots].sort((a, b) => a.name.localeCompare(b.name)); const homes = {};
order.forEach((b, i) => { const a = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / order.length) + 0.12, q = islePoint(a, 0.8), p = W(q.x, q.y);
  const g = new T.Group(); g.add(box(2.4, 1.7, 2.2, b.hex)); const r = gable(2.4, 1.2, 2.2, shade(b.hex, 0.55)); r.position.y = 1.7; g.add(r); const door = box(0.55, 0.95, 0.06, 0x3f2a1a); door.position.z = 1.12; g.add(door);
  g.position.set(p.x, GROUND, p.z); const to = new T.Vector3(plaza.x - p.x, 0, plaza.z - p.z).normalize(); g.rotation.y = Math.atan2(to.x, to.z); scene.add(g); tagPick(g, { kind: "home", bot: b.id });
  homes[b.id] = { p, spot: p.clone().addScaledVector(to, 2.6) }; });
const boydHome = W(BLD.boyd.x, BLD.boyd.y), boydSpot = workSpots.boyd ? workSpots.boyd.door : boydHome;
// fuel tower (reads ../usage.json via the build / server)
const fuelPos = W(1010, 232); const fuel = new T.Group(); fuel.position.set(fuelPos.x, GROUND, fuelPos.z); scene.add(fuel);
fuel.add(cyl(1.9, 2.2, 0.6, 10, 0x475569)); const FH = 12;
const glass = mesh(new T.CylinderGeometry(1.25, 1.25, FH, 14, 1, true), new T.MeshStandardMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.28, roughness: 0.1, side: T.DoubleSide, depthWrite: false })); glass.position.y = 0.6 + FH / 2; fuel.add(glass);
const fluidMat = new T.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.45, flatShading: true });
const fluid = mesh(new T.CylinderGeometry(1.05, 1.05, 1, 14), fluidMat); fluid.position.y = 0.6; fuel.add(fluid);
for (let i = 0; i <= 4; i++) { const ring = mesh(new T.TorusGeometry(1.32, 0.09, 4, 16), M(0x94a3b8, { metalness: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6 + (FH * i) / 4; fuel.add(ring); }
const fcap = mesh(new T.ConeGeometry(1.5, 1.4, 10), M(0xd946ef)); fcap.position.y = 0.6 + FH + 0.7; fuel.add(fcap);
tagPick(fuel, { kind: "fuel" });
function fuelInfo() { const u = D.usage || {}; const used = Number(u.used_pct); const ok = isFinite(used);
  const resetAt = u.reset_at ? Date.parse(u.reset_at) : u.reset_date ? Date.parse(u.reset_date + "T00:00:00Z") : NaN;
  return { ok, used, left: ok ? Math.max(0, Math.min(100, 100 - used)) : null, resetAt, exact: !!u.reset_at, checked: u.checked_at ? Date.parse(u.checked_at) : NaN, label: u.label || "weekly usage", source: u.source || "", file: u._file || "usage.json" }; }
function applyFuel() { const f = fuelInfo(); const frac = f.ok ? f.left / 100 : 0; fluid.scale.y = Math.max(0.02, FH * frac); fluid.position.y = 0.6 + (FH * frac) / 2;
  const col = new T.Color(frac > 0.5 ? 0x22c55e : frac > 0.2 ? 0xeab308 : 0xef4444); fluidMat.color.copy(col); fluidMat.emissive.copy(col);
  $("#fuelcard").innerHTML = f.ok ? `<h3>⛽ Fuel tower</h3><div class="fuel"><div class="tube"><i style="height:${f.left}%;background:${"#" + col.getHexString()}"></i></div><div><b>${f.left}%</b> left<div class="sub">${f.used}% of ${esc(f.label)} used</div><div class="sub" id="resetline"></div><div class="sub">Checked ${isNaN(f.checked) ? "?" : fmtDay(f.checked) + ", " + fmtTime(f.checked) + " ET"}</div></div></div><div class="sub" style="margin-top:4px">Source: ${esc(f.source)} · <code>${esc(f.file)}</code></div>`
    : `<h3>⛽ Fuel tower</h3><div class="sub">Couldn't read usage.json (${esc((D.usage || {}).error || "no data")})</div>`; }
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// trees / rocks (decor only, deterministic, kept clear of buildings, homes and paths)
{ const r = rng("trees"), spots = [...Object.values(workSpots).map((w) => w.p), ...Object.values(homes).map((h) => h.p), fuelPos, boydHome]; const pts = [];
  for (let k = 0; k < 900 && pts.length < 85; k++) { const a = r() * Math.PI * 2, kk = 0.25 + r() * 0.6, q = islePoint(a, kk), v = W(q.x, q.y);
    if (spots.some((s) => s.distanceTo(v) < 7.5) || v.distanceTo(plaza) < 9) continue; let onPath = false; for (const w of Object.values(workSpots)) { const ab = new T.Vector3().subVectors(plaza, w.p), t = Math.max(0, Math.min(1, new T.Vector3().subVectors(v, w.p).dot(ab) / ab.lengthSq())); if (w.p.clone().addScaledVector(ab, t).distanceTo(v) < 2.2) onPath = true; } if (onPath) continue; pts.push([v, 0.7 + r() * 0.7]); }
  const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.25, 1.2, 5), M(0x7c4a21), pts.length), crown = new T.InstancedMesh(new T.ConeGeometry(1.1, 2.6, 6), M(0x2f7d3b), pts.length); const m4 = new T.Matrix4();
  pts.forEach(([v, s], i) => { m4.compose(new T.Vector3(v.x, GROUND + 0.6 * s, v.z), new T.Quaternion(), new T.Vector3(s, s, s)); trunk.setMatrixAt(i, m4); m4.compose(new T.Vector3(v.x, GROUND + (1.2 + 1.3) * s, v.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), r() * 3), new T.Vector3(s, s, s)); crown.setMatrixAt(i, m4); });
  trunk.castShadow = crown.castShadow = true; trunk.receiveShadow = crown.receiveShadow = true; scene.add(trunk, crown); }
// ---------- avatars ----------
function bodyGeo(shape) { switch (shape) {
  case "squircle": return [new T.BoxGeometry(0.95, 0.95, 0.95)]; case "tablet": return [new T.BoxGeometry(0.8, 1.2, 0.42)]; case "hex": return [new T.CylinderGeometry(0.58, 0.58, 0.95, 6)];
  case "pebble": { const g = new T.SphereGeometry(0.6, 10, 8); g.scale(1.15, 0.8, 0.95); return [g]; } case "blob": return [new T.IcosahedronGeometry(0.62, 0)];
  case "cloud": { const a = new T.SphereGeometry(0.42, 8, 6), b = new T.SphereGeometry(0.36, 8, 6), c = new T.SphereGeometry(0.36, 8, 6); b.translate(-0.38, -0.08, 0); c.translate(0.38, -0.08, 0); return [a, b, c]; }
  case "wedge": { const g = new T.CylinderGeometry(0.7, 0.7, 0.55, 3); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2 + Math.PI); return [g]; }
  case "teardrop": { const s = new T.SphereGeometry(0.5, 10, 8), c = new T.ConeGeometry(0.46, 0.7, 10); c.translate(0, 0.55, 0); s.translate(0, -0.1, 0); return [s, c]; }
  case "sparkle": return [new T.OctahedronGeometry(0.68, 0)]; default: return [new T.SphereGeometry(0.56, 12, 9)]; } }
const eyeW = M(0xffffff), eyeB = new T.MeshBasicMaterial({ color: 0x111827 }), legM = M(0x1f2937);
function makeAvatar(hex, shape, pick) { const g = new T.Group(), body = new T.Group(); for (const geo of bodyGeo(shape)) body.add(mesh(geo, M(hex, { emissive: hex, emissiveIntensity: 0.08 }))); body.position.y = 1.05; g.add(body);
  for (const sx of [-0.2, 0.2]) { const e = mesh(new T.SphereGeometry(0.13, 8, 6), eyeW, null, false); e.position.set(sx, 1.18, 0.5); const p = new T.Mesh(new T.SphereGeometry(0.065, 6, 5), eyeB); p.position.set(sx, 1.18, 0.6); g.add(e, p); }
  const legs = []; for (const sx of [-0.2, 0.2]) { const l = mesh(new T.CylinderGeometry(0.08, 0.08, 0.5, 5), legM); l.position.set(sx, 0.3, 0); g.add(l); legs.push(l); }
  const env = new T.Group(); env.add(mesh(new T.BoxGeometry(0.75, 0.48, 0.06), M(0xffffff), null, false)); const seal = new T.Mesh(new T.CircleGeometry(0.09, 8), new T.MeshBasicMaterial({ color: 0xdc2626 })); seal.position.z = 0.04; env.add(seal); env.position.set(0, 2.2, 0); env.visible = false; g.add(env);
  const ring = new T.Mesh(new T.RingGeometry(0.75, 0.95, 20), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const z = textSprite("z z", "#e0e7ff", 64); z.position.set(0.5, 2.1, 0); z.visible = false; g.add(z);
  g.scale.setScalar(1.6); tagPick(g, pick); scene.add(g); return { g, body, legs, env, ring, z }; }
function textSprite(text, color, px = 48) { const c = document.createElement("canvas"); c.width = 128; c.height = 64; const x = c.getContext("2d"); x.font = `bold ${px * 0.7}px sans-serif`; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 64, 34);
  const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false })); s.scale.set(1.6, 0.8, 1); return s; }
const actors = {}; for (const b of bots) actors[b.id] = Object.assign(makeAvatar(b.hex, b.shape, { kind: "bot", bot: b.id }), { bot: b });
const boyd = makeAvatar(0x4c1d95, "tablet", { kind: "boyd" }); { const n = textSprite("8", "#facc15", 60); n.position.set(0, 1.05, 0.25); n.scale.set(0.9, 0.45, 1); boyd.g.add(n); }
// ---------- schedule → tracks (pure function of the day's real events) ----------
const SPEED = 5 / MIN, DWELL = 2.5 * MIN; // world units per ms; time spent delivering
function posAt(kf, t) { let i = kf.length - 1; while (i > 0 && kf[i].t > t) i--; const a = kf[i], b = kf[i + 1]; if (!b || b.t <= a.t || t <= a.t) return { p: a.p.clone(), walking: false, dir: null };
  const k = Math.min(1, (t - a.t) / (b.t - a.t)); const dir = new T.Vector3().subVectors(b.p, a.p); return { p: a.p.clone().lerp(b.p, k), walking: k < 1 && dir.lengthSq() > 0.01, dir }; }
function moveTo(tr, t, target) { const cur = posAt(tr.kf, t).p; tr.kf = tr.kf.filter((k) => k.t <= t); tr.kf.push({ t, p: cur }); const dur = cur.distanceTo(target) / SPEED; tr.kf.push({ t: t + Math.max(dur, 1), p: target.clone() }); return t + dur; }
function clusters(evts, gap = 6 * MIN) { const out = []; let c = null; for (const e of evts) { if (c && e.t - c.e <= gap) { c.e = e.t; c.ev.push(e); } else { c = { s: e.t, e: e.t, ev: [e] }; out.push(c); } } return out.map((c) => ({ s: c.s - 1.5 * MIN, e: c.e + 2.5 * MIN, ev: c.ev })); }
function mergeIv(iv) { iv.sort((a, b) => a.s - b.s); const out = []; for (const x of iv) { const l = out[out.length - 1]; if (l && x.s <= l.e) { l.e = Math.max(l.e, x.e); l.ev = (l.ev || []).concat(x.ev || []); l.runs = (l.runs || []).concat(x.runs || []); } else out.push(Object.assign({}, x)); } return out; }
function visitSpot(key, who) { const w = workSpots[key] || workSpots.commons; const side = new T.Vector3(w.dir.z, 0, -w.dir.x); const h = rng(who)(); return w.door.clone().addScaledVector(side, (h - 0.5) * 3.2).addScaledVector(w.dir, 1.4); }
function workSpot(b) { const key = b.building, w = workSpots[key] || workSpots.commons; const rs = residents(key), i = Math.max(0, rs.indexOf(b)); const side = new T.Vector3(w.dir.z, 0, -w.dir.x); return w.door.clone().addScaledVector(side, (i - (rs.length - 1) / 2) * 1.5); }
let DAY = null;
function buildDay(day) {
  const t0 = etMidnight(day), t1 = etMidnight(nextDay(day)), evs = byDay[day] || [], runs = (runsByDay[day] || []);
  const tracks = {};
  for (const b of bots) {
    const own = evs.filter((e) => e.bot === b.id && e.type !== "agent_msg" && e.type !== "boyd_msg");
    const sess = mergeIv([...clusters(own), ...runs.filter((r) => r.bot === b.id).map((r) => ({ s: r.s, e: r.e, runs: [r], ev: [] }))]);
    const home = homes[b.id].spot, work = workSpot(b), inS = (t) => sess.some((s) => t >= s.s && t < s.e), base = (t) => (inS(t) ? work : home);
    const tr = { kf: [{ t: t0 - 1, p: (inS(t0) ? work : home).clone() }], trips: [], sess, base };
    const intents = []; for (const s of sess) { intents.push({ t: s.s, k: "go" }, { t: s.e, k: "go" }); }
    for (const e of evs) if (e.type === "agent_msg" && e.from === b.id && byId[e.bot]) intents.push({ t: e.t, k: "visit", to: byId[e.bot], e });
    intents.sort((a, b2) => a.t - b2.t);
    while (intents.length) { const it = intents.shift();
      if (it.k === "visit") { const arr = moveTo(tr, it.t, visitSpot(it.to.building, b.id)); tr.trips.push({ s: it.t, e: arr, to: it.to }); const ret = { t: arr + DWELL, k: "go" }; let j = intents.findIndex((x) => x.t > ret.t); intents.splice(j < 0 ? intents.length : j, 0, ret); }
      else moveTo(tr, it.t, base(it.t + 1)); }
    tracks[b.id] = tr; }
  // Boyd walks to whichever bot he messaged (real boyd_msg times), then home
  const bt = { kf: [{ t: t0 - 1, p: boydSpot.clone() }], trips: [] }; const bi = evs.filter((e) => e.type === "boyd_msg" && byId[e.bot]).map((e) => ({ t: e.t, k: "visit", to: byId[e.bot] }));
  while (bi.length) { const it = bi.shift(); const tgt = posAt(tracks[it.to.id].kf, it.t).p.clone().add(new T.Vector3(1.3, 0, 1.0)); const arr = moveTo(bt, it.t, tgt); bt.trips.push({ s: it.t, e: arr, to: it.to }); const ret = { t: arr + 4 * MIN, k: "home" };
    if (!bi.length || bi[0].t > ret.t) moveTo(bt, ret.t, boydSpot); }
  const hist = new Array(144).fill(0), histMsg = new Array(144).fill(0); for (const e of evs) { const k = Math.min(143, Math.floor((e.t - t0) / (10 * MIN))); hist[k]++; if (e.type === "agent_msg" || e.type === "boyd_msg") histMsg[k]++; }
  const src = {}; for (const e of evs) src[e.type] = (src[e.type] || 0) + 1;
  DAY = { day, t0, t1, evs, runs, tracks, boyd: bt, hist, histMsg, src, sun: sunTimes(day) };
  resetCursor(S.simT); drawHist(); return DAY; }
// ---------- replay cursor ----------
const S = { mode: QS.get("mode") === "replay" ? "replay" : "live", speed: 60, playing: QS.get("play") !== "0", simT: Date.now(), lastT: null, cursor: 0, counts: {}, playbackOnly: true, playbackFired: 0,
  tour: QS.get("tour") === "1", labels: QS.get("labels") === "1", wire: [], fx: [], planes: [], frames: 0, liveAt: QS.get("at") ? Date.parse(QS.get("at")) : null, liveAtSet: Date.now() };
function upper(evs, t) { let lo = 0, hi = evs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (evs[m].t <= t) lo = m + 1; else hi = m; } return lo; }
function resetCursor(t) { const evs = DAY.evs; S.cursor = upper(evs, t); S.counts = {}; for (let i = 0; i < S.cursor; i++) S.counts[evs[i].type] = (S.counts[evs[i].type] || 0) + 1;
  S.playbackOnly = S.cursor === 0; S.playbackFired = 0; S.wire = evs.slice(Math.max(0, S.cursor - 30), S.cursor).map(wireItem).reverse(); clearFx(); S.lastT = t; wireDirty = true; }
function clearFx() { for (const f of S.fx) scene.remove(f.obj); S.fx = []; }
function advance(t) { const evs = DAY.evs; if (S.lastT == null || t < S.lastT || t - S.lastT > 6 * HOUR && !S.playing) { resetCursor(t); return; }
  let n = 0; while (S.cursor < evs.length && evs[S.cursor].t <= t) { fire(evs[S.cursor], n++ < 40); S.cursor++; S.playbackFired++; } S.lastT = t; }
function fire(e, fx) { S.counts[e.type] = (S.counts[e.type] || 0) + 1; S.wire.unshift(wireItem(e)); if (S.wire.length > 60) S.wire.length = 60; wireDirty = true;
  if (!fx) return; const b = byId[e.bot]; if (!b) return;
  if (e.type === "agent_msg" && byId[e.from]) { const a = actors[e.from].g.position.clone(), to = (workSpots[b.building] || workSpots.commons).p.clone(); plane(a, to, byId[e.from].hex); if (S.tour) tourFocus = b.building; }
  else if (e.type === "boyd_msg") pulse(actors[b.id].g.position, 0x8b5cf6, 2.2);
  else pulse((workSpots[b.building] || workSpots.commons).p, b.hex, 1); }
const ringGeo = new T.RingGeometry(0.8, 1.15, 28); ringGeo.rotateX(-Math.PI / 2);
function pulse(p, hex, size) { if (S.fx.length > 60) return; const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(p.x, GROUND + 0.12, p.z); scene.add(m); S.fx.push({ obj: m, born: performance.now(), life: 1400, kind: "pulse", size }); }
const planeGeo = new T.ConeGeometry(0.4, 1.3, 3); planeGeo.rotateX(Math.PI / 2);
function plane(a, b, hex) { if (S.fx.length > 60) return; const m = new T.Mesh(planeGeo, new T.MeshStandardMaterial({ color: 0xffffff, emissive: hex, emissiveIntensity: 0.35, flatShading: true })); m.castShadow = true; scene.add(m);
  S.fx.push({ obj: m, born: performance.now(), life: 2600, kind: "plane", a: a.clone().setY(GROUND + 2.2), b: b.clone().setY(GROUND + 4) }); }
function label(e) { const app = e.app || ""; switch (e.type) {
  case "mcp_tool_call": return `${app}${e.tool ? " · " + e.tool.replace(/_/g, " ") : ""}`; case "shell_command": return "Shell command"; case "browser_navigation": return `Browsing ${e.host || "the web"}`;
  case "computer_use_session": return "Desktop (computer use)"; case "file_write": return `Wrote a ${e.ext || ""} file`; case "dated_output": return `${e.tool || "Output"}${e.approx ? " (time approx.)" : ""}`;
  case "routine_touch": return "Routine ran"; case "agent_msg": return `✉️ message from ${byId[e.from] ? byId[e.from].name : "a bot"}`; case "boyd_msg": return "📱 chatting with Boyd"; default: return e.type; } }
function wireItem(e) { const b = byId[e.bot]; return { t: e.t, hex: b ? b.hex : "#fff", text: e.type === "agent_msg" ? `${byId[e.from] ? byId[e.from].name : "?"} → ${b ? b.name : "?"} ✉️` : `${b ? b.name : "?"}: ${label(e)}` }; }
let wireDirty = true, lastWire = 0;
const TYPE_NAMES = { mcp_tool_call: "🔧 Tool calls", shell_command: "💻 Shell commands", browser_navigation: "🌐 Page visits", agent_msg: "✉️ Bot-to-bot messages", boyd_msg: "📱 Boyd → bot chats", computer_use_session: "🖥️ Desktop sessions", file_write: "📝 Files written", dated_output: "📰 Dated outputs", routine_touch: "⏰ Routine touches" };
function renderWire() { $("#wire").innerHTML = S.wire.slice(0, 40).map((w) => `<li><span class="t">${fmtTime(w.t)}</span><span class="dot" style="background:${w.hex}"></span><span>${esc(w.text)}</span></li>`).join("") || `<li><span class="sub">Nothing yet on ${fmtDayStr(DAY.day)}${S.mode === "live" ? " (local logs stop Sep 16; recent days only have dated outputs)" : ""}.</span></li>`;
  const keys = Object.keys(DAY.src).sort((a, b) => DAY.src[b] - DAY.src[a]); const tot = DAY.evs.length;
  $("#cnt-title").textContent = `${S.mode === "live" ? "Today so far" : "Replayed"} · ${fmtDayStr(DAY.day)}`;
  $("#counts").innerHTML = keys.map((k) => `<span>${TYPE_NAMES[k] || k}</span><span>${S.counts[k] || 0} / ${DAY.src[k]}</span>`).join("") + `<span class="tot">All events</span><span class="tot" id="cnt-total">${S.cursor} / ${tot}</span>` + `<span class="sub">⏰ Routine runs (sessions)</span><span class="sub">${DAY.runs.filter((r) => r.s <= S.simT).length} / ${DAY.runs.length}</span>`; }
// ---------- UI ----------
const daySel = $("#day"); const top = [...days].sort((a, b) => byDay[b].length - byDay[a].length).slice(0, 6);
daySel.innerHTML = days.map((d) => `<option value="${d}">${top.includes(d) ? "🔥 " : ""}${fmtDayStr(d)} · ${byDay[d].length}</option>`).join("");
function setMode(m, day) { S.mode = m; document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  if (m === "live") { S.speed = 1; $("#speed").value = "1"; $("#speed").disabled = true; daySel.disabled = true; S.playing = true; S.simT = liveNow(); const d = etDay(S.simT); daySel.value = d; if (!DAY || DAY.day !== d) buildDay(d); else resetCursor(S.simT); }
  else { $("#speed").disabled = false; daySel.disabled = false; const d = day || (DAY && DAY.day) || "2026-09-11"; if (S.speed === 1) { S.speed = 60; $("#speed").value = "60"; } daySel.value = d; if (!DAY || DAY.day !== d) { if (!(S.simT >= etMidnight(d) && S.simT < etMidnight(nextDay(d)))) S.simT = etMidnight(d) + firstHour(d); buildDay(d); } }
  $("#play").textContent = S.playing ? "⏸" : "▶"; wireDirty = true; }
function firstHour(d) { const e = byDay[d]; return e && e.length ? Math.max(0, e[0].t - etMidnight(d) - 15 * MIN) : 8 * HOUR; }
function liveNow() { return S.liveAt ? S.liveAt + (Date.now() - S.liveAtSet) : Date.now(); }
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
daySel.onchange = () => { S.simT = etMidnight(daySel.value) + firstHour(daySel.value); buildDay(daySel.value); };
$("#play").onclick = () => { S.playing = !S.playing; $("#play").textContent = S.playing ? "⏸" : "▶"; S.lastT = S.simT; };
$("#speed").onchange = () => { S.speed = +$("#speed").value || 60; S.speedCustom = false; };
$("#tour").onclick = () => setTour(!S.tour); $("#labels").onclick = () => { S.labels = !S.labels; $("#labels").classList.toggle("on", S.labels); if (!S.labels) $("#labelsLayer").innerHTML = ""; };
const range = $("#range"); range.oninput = () => { if (S.mode === "live") setMode("replay", DAY.day); S.simT = DAY.t0 + +range.value * MIN; resetCursor(S.simT); };
window.addEventListener("keydown", (e) => { if (e.target.tagName === "SELECT") return; if (e.key === " ") { e.preventDefault(); $("#play").click(); } else if (e.key === "t") setTour(!S.tour); else if (e.key === "l") $("#labels").click(); });
// histogram
const hist = $("#hist"); function drawHist() { if (!DAY) return; const r = hist.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; hist.width = Math.max(10, r.width * dpr); hist.height = Math.max(10, r.height * dpr);
  const x = hist.getContext("2d"), w = hist.width, h = hist.height, mx = Math.max(4, ...DAY.hist); x.clearRect(0, 0, w, h);
  const sr = DAY.sun.rise, ss = DAY.sun.set; if (sr && ss) { x.fillStyle = "rgba(253,224,71,.08)"; x.fillRect(((sr - DAY.t0) / (24 * HOUR)) * w, 0, ((ss - sr) / (24 * HOUR)) * w, h); }
  DAY.hist.forEach((v, i) => { if (!v) return; const bh = Math.max(2, (v / mx) * (h - 6)); x.fillStyle = "rgba(96,165,250,.85)"; x.fillRect((i / 144) * w + 1, h - bh, w / 144 - 1.5, bh); const m = DAY.histMsg[i]; if (m) { const mh = Math.max(3, (m / mx) * (h - 6)); x.fillStyle = "#e879f9"; x.fillRect((i / 144) * w + 1, h - mh, w / 144 - 1.5, mh); } });
  for (const r2 of DAY.runs) { x.fillStyle = "rgba(74,222,128,.9)"; x.fillRect(((r2.s - DAY.t0) / (24 * HOUR)) * w, 0, Math.max(2, ((r2.e - r2.s) / (24 * HOUR)) * w), 3 * dpr); } }
window.addEventListener("resize", () => { resize(); drawHist(); });
// tour
let tourFocus = null, tourNext = 0, tourAng = 0.6, tourIdx = 0; const tourStops = ["hq", "library", "launchpad", "fuel", "bank", "clubhouse", "lighthouse", "radio", "postoffice", "press", "school", "stadium", "hatchery", "observatory", "workshop"];
const camGoal = { pos: new T.Vector3(), tgt: new T.Vector3() };
function setTour(on) { S.tour = on; $("#tour").classList.toggle("on", on); tourNext = 0; controls.enabled = !on; }
renderer.domElement.addEventListener("pointerdown", () => { if (S.tour) setTour(false); });
function tourStep(now, dt) { if (now > tourNext) { const key = tourFocus || tourStops[tourIdx++ % tourStops.length]; tourFocus = null; tourNext = now + 6500;
    const p = key === "fuel" ? fuelPos : (workSpots[key] || workSpots.commons).p; camGoal.tgt.set(p.x, GROUND + 2.5, p.z); camGoal.key = key; tourAng += 1.1; }
  tourAng += dt * 0.00012; const r = 30; camGoal.pos.set(camGoal.tgt.x + Math.sin(tourAng) * r, camGoal.tgt.y + 17, camGoal.tgt.z + Math.cos(tourAng) * r);
  const k = 1 - Math.exp(-dt * 0.0018); camera.position.lerp(camGoal.pos, k); controls.target.lerp(camGoal.tgt, k); camera.lookAt(controls.target); }
// hover labels
const ray = new T.Raycaster(), mouse = new T.Vector2(), tip = $("#tip"); let mouseIn = false, mx = 0, my = 0;
renderer.domElement.addEventListener("pointermove", (e) => { mouseIn = true; mx = e.clientX; my = e.clientY; mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
renderer.domElement.addEventListener("pointerleave", () => { mouseIn = false; tip.style.display = "none"; });
function botState(b) { const tr = DAY.tracks[b.id], t = S.simT, q = posAt(tr.kf, t), trip = tr.trips.find((x) => t >= x.s && t < x.e + DWELL);
  if (trip) return t < trip.e ? `Walking a message to ${trip.to.name} ✉️` : `Delivering a message to ${trip.to.name} ✉️`;
  const s = tr.sess.find((x) => t >= x.s && t < x.e); if (s) { const last = (s.ev || []).filter((e) => e.t <= t).pop(); const run = (s.runs || []).find((r) => t >= r.s && t < r.e);
    return q.walking ? "Heading to work" : `Working${run ? ` · “${run.routine}”` : ""}${last ? ` · ${label(last)}` : ""}`; }
  if (q.walking) return "Walking home"; const h = etParts(t).h; return h >= 22 || h < 6 ? "Asleep at home 💤" : "Resting at home"; }
function tipHtml(pk) { const t = S.simT, dayEv = DAY.evs.filter((e) => e.t <= t);
  if (pk.kind === "building") { const b = BLD[pk.key], rs = residents(pk.key); const busy = rs.filter((r) => DAY.tracks[r.id].sess.some((s) => t >= s.s && t < s.e));
    return `<b>${b.emoji} ${esc(b.name)}</b>${rs.length ? `<div>${rs.map((r) => `<span style="color:${r.hex}">●</span> ${esc(r.name)}${busy.includes(r) ? " (working)" : ""}`).join("<br>")}</div>` : `<div class="s">${pk.key === "stadium" ? "Purple Stadium: Ravens, Orioles, Chelsea and Terps flags" : pk.key === "boyd" ? "Where Boyd lives" : "Town Square"}</div>`}`; }
  if (pk.kind === "home") { const b = byId[pk.bot]; return `<b><span style="color:${b.hex}">●</span> ${esc(b.name)}'s house</b><div class="s">${esc(botState(b))}</div>`; }
  if (pk.kind === "bot") { const b = byId[pk.bot]; const n = dayEv.filter((e) => e.bot === b.id).length; return `<b>${b.emoji} ${esc(b.name)}</b> <span class="s">${esc(b.title || "")}</span><div>${esc(botState(b))}</div><div class="s">${n} event${n === 1 ? "" : "s"} so far on ${fmtDayStr(DAY.day)} · works at ${esc((BLD[b.building] || BLD.commons).name)}</div>`; }
  if (pk.kind === "boyd") { const trip = DAY.boyd.trips.find((x) => t >= x.s && t < x.e + 4 * MIN); return `<b>🧑 Boyd</b> <span class="s">Ravens #8</span><div>${trip ? `Chatting with ${esc(trip.to.name)} 📱` : "At Boyd's Place"}</div>`; }
  if (pk.kind === "fuel") { const f = fuelInfo(); return `<b>⛽ Fuel tower</b><div>${f.ok ? `${f.left}% fuel left (${f.used}% used)` : "usage.json unreadable"}</div><div class="s">${esc(f.label)}. Checked ${isNaN(f.checked) ? "?" : fmtTime(f.checked) + " ET"}. Resets ${f.exact ? "at" : "as early as"} ${isNaN(f.resetAt) ? "?" : fmtDay(f.resetAt) + ", " + fmtTime(f.resetAt) + " ET"}</div>`; }
  return ""; }
// ---------- per-frame ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
resize();
const skyDay = new T.Color(0x8ccfff), skyDusk = new T.Color(0xf6a77a), skyNight = new T.Color(0x0b1530), waterDay = new T.Color(0x2a8fd6), waterNight = new T.Color(0x0c2a55), tmpC = new T.Color();
function lighting(t) { const { alt, az } = sunPos(t), dir = new T.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)); const deg = alt / RAD;
  sun.position.copy(dir).multiplyScalar(160); sun.target.position.set(0, 0, 0); sunBall.position.copy(dir).multiplyScalar(420); sunBall.visible = deg > -3;
  moon.position.copy(dir).multiplyScalar(-400).setY(Math.max(60, -dir.y * 400)); moon.visible = deg < 0;
  const day = Math.max(0, Math.min(1, (deg + 4) / 14)), dusk = Math.max(0, 1 - Math.abs(deg - 1) / 9);
  sun.intensity = 2.4 * Math.max(0, Math.min(1, deg / 12)); hemi.intensity = 0.28 + 0.7 * day; moonLight.intensity = 0.55 * (1 - day); moonLight.position.copy(moon.position);
  tmpC.copy(skyNight).lerp(skyDay, day); tmpC.lerp(skyDusk, dusk * 0.55); scene.background = tmpC.clone(); scene.fog.color.copy(tmpC);
  waterMat.color.copy(waterNight).lerp(waterDay, day); starMat.opacity = Math.max(0, Math.min(1, (-deg - 3) / 8));
  const night = 1 - day; windowMat.emissiveIntensity = 1.3 * night; for (const m of glowMats) m.emissiveIntensity = 0.3 + 1.5 * night; fluidMat.emissiveIntensity = 0.35 + 0.8 * night; return { deg, night }; }
let lastFrame = performance.now(), lastLabel = 0;
function frame(now) {
  const dt = Math.min(100, now - lastFrame); lastFrame = now; S.frames++;
  if (S.mode === "live") { S.simT = liveNow(); const d = etDay(S.simT); if (d !== DAY.day) { daySel.value = d; buildDay(d); } }
  else if (S.playing) { S.simT += dt * S.speed; if (S.simT >= DAY.t1 - 1) { S.simT = DAY.t1 - 1; S.playing = false; $("#play").textContent = "▶"; } }
  advance(S.simT);
  const L = lighting(S.simT); S.sunDeg = L.deg;
  // water
  const pa = waterGeo.attributes.position, tt = now / 1000; for (let i = 0; i < pa.count; i++) { const x = wBase[i * 3], z = wBase[i * 3 + 2]; pa.array[i * 3 + 1] = -0.25 + Math.sin(x * 0.08 + tt * 0.9) * 0.18 + Math.cos(z * 0.1 + tt * 0.7) * 0.14; } pa.needsUpdate = true; if (S.frames % 3 === 0) waterGeo.computeVertexNormals();
  // actors
  const t = S.simT, hr = etParts(t).h;
  for (const b of bots) { const a = actors[b.id], tr = DAY.tracks[b.id], q = posAt(tr.kf, t); a.g.position.set(q.p.x, GROUND, q.p.z);
    if (q.dir && q.walking) a.g.rotation.y = Math.atan2(q.dir.x, q.dir.z); else if (!q.walking) { const home = q.p.distanceTo(homes[b.id].spot) < 0.5; const look = home ? plaza : (workSpots[b.building] || workSpots.commons).p; a.g.rotation.y = Math.atan2(q.p.x - look.x, q.p.z - look.z) + Math.PI; }
    const sw = q.walking ? Math.sin(now / 90) : 0; a.legs[0].rotation.x = sw * 0.6; a.legs[1].rotation.x = -sw * 0.6; a.body.position.y = 1.05 + (q.walking ? Math.abs(Math.sin(now / 90)) * 0.15 : Math.sin(now / 700 + b.name.length) * 0.03);
    a.env.visible = tr.trips.some((x) => t >= x.s && t < x.e); if (a.env.visible) a.env.rotation.y = now / 300;
    const working = !q.walking && tr.sess.some((s) => t >= s.s && t < s.e); a.ring.material.opacity = working ? 0.55 + 0.3 * Math.sin(now / 250) : 0;
    const asleep = !q.walking && !working && (hr >= 22 || hr < 6) && q.p.distanceTo(homes[b.id].spot) < 0.5; a.z.visible = asleep; if (asleep) a.z.position.y = 2.0 + 0.15 * Math.sin(now / 500 + b.name.length); }
  { const q = posAt(DAY.boyd.kf, t); boyd.g.position.set(q.p.x, GROUND, q.p.z); if (q.dir && q.walking) boyd.g.rotation.y = Math.atan2(q.dir.x, q.dir.z); const sw = q.walking ? Math.sin(now / 90) : 0; boyd.legs[0].rotation.x = sw * 0.6; boyd.legs[1].rotation.x = -sw * 0.6;
    boyd.z.visible = !q.walking && (hr >= 23 || hr < 6); }
  // building animation (only from real activity)
  const busy = (key) => residents(key).some((r) => DAY.tracks[r.id].sess.some((s) => t >= s.s && t < s.e));
  if (anim.gear) anim.gear.rotation.y += dt * (busy("workshop") ? 0.004 : 0.0004);
  if (anim.coin) anim.coin.rotation.z += dt * (busy("bank") ? 0.003 : 0.0006);
  if (anim.beacon) anim.beacon.material.emissiveIntensity = (now % 1400) < 700 ? 1.4 : 0.15;
  if (anim.beam) { anim.beam.material.opacity = 0.16 * L.night; anim.beam.rotation.y = now / 1500; }
  if (anim.rocket) anim.rocket.position.y = busy("launchpad") ? Math.sin(now / 60) * 0.03 : 0;
  // effects
  for (let i = S.fx.length - 1; i >= 0; i--) { const f = S.fx[i], k = (now - f.born) / f.life; if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); S.fx.splice(i, 1); continue; }
    if (f.kind === "pulse") { const s = (0.6 + k * 3) * f.size; f.obj.scale.set(s, 1, s); f.obj.material.opacity = 0.9 * (1 - k); }
    else { const p = new T.Vector3().lerpVectors(f.a, f.b, k); p.y += Math.sin(k * Math.PI) * 9; const p2 = new T.Vector3().lerpVectors(f.a, f.b, Math.min(1, k + 0.02)); p2.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * 9; f.obj.position.copy(p); f.obj.lookAt(p2); } }
  if (S.tour) tourStep(now, dt); else controls.update();
  // hover tooltip
  if (mouseIn && !S.tour) { ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects(pickables, false).find((h) => shown(h.object) && h.object.material.opacity !== 0); if (hit) { tip.innerHTML = tipHtml(hit.object.userData.pick); tip.style.display = "block"; tip.style.left = Math.min(innerWidth - 290, mx + 14) + "px"; tip.style.top = (my + 14) + "px"; renderer.domElement.style.cursor = "pointer"; } else { tip.style.display = "none"; renderer.domElement.style.cursor = "grab"; } }
  if (S.labels && now - lastLabel > 60) { lastLabel = now; renderLabels(); }
  // HUD
  if (!range.matches(":active")) range.value = String((S.simT - DAY.t0) / MIN);
  $("#clock").textContent = `${fmtDay(S.simT)} · ${fmtTime(S.simT)} ET`;
  if (S.frames % 15 === 1) { const st = DAY.sun; $("#sun").textContent = `${S.mode === "live" ? (S.liveAt ? "PREVIEW CLOCK" : "LIVE · real ET clock") : `REPLAY · ${S.speed === 1 ? "1×" : S.speed === 60 ? "60×" : S.speed === 300 ? "5 min/s" : S.speed === 1800 ? "30 min/s" : S.speed + "×"}`} · ☀️ ${st.rise ? fmtTime(st.rise) : "?"} – 🌙 ${st.set ? fmtTime(st.set) : "?"}`;
    const f = fuelInfo(), rl = $("#resetline"); if (rl && !isNaN(f.resetAt)) { const left = f.resetAt - Date.now(); rl.textContent = `Resets ${f.exact ? "at" : "as early as"} ${fmtDay(f.resetAt)}, ${fmtTime(f.resetAt)} ET${left > 0 ? ` (in ${Math.floor(left / HOUR)}h ${Math.floor((left % HOUR) / MIN)}m)` : ""}`; } }
  if (wireDirty && now - lastWire > 200) { wireDirty = false; lastWire = now; renderWire(); }
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
function renderLabels() { const layer = $("#labelsLayer"), out = []; const add = (p, text, c) => { const v = p.clone().project(camera); if (v.z > 1) return; out.push(`<div class="lbl" style="left:${(v.x + 1) / 2 * innerWidth}px;top:${(1 - v.y) / 2 * innerHeight}px;--c:${c}">${esc(text)}</div>`); };
  for (const [k, b] of Object.entries(BLD)) { const p = W(b.x, b.y); p.y = GROUND + (k === "radio" ? 14 : k === "lighthouse" ? 11 : 7); add(p, `${b.emoji} ${b.name}`, "#fde047"); }
  for (const b of bots) { const p = actors[b.id].g.position.clone(); p.y += 2.6; add(p, `${b.emoji} ${b.name}`, b.hex); }
  const fp = fuelPos.clone(); fp.y = GROUND + 15; const f = fuelInfo(); add(fp, `⛽ Fuel ${f.ok ? f.left + "% left" : "?"}`, "#22c55e"); layer.innerHTML = out.join(""); }
// ---------- optional live refresh (when served by server.py) ----------
async function refresh() { if (!/^https?:/.test(location.protocol)) return; try { const r = await fetch("api/usage", { cache: "no-store" }); if (r.ok) { D.usage = await r.json(); applyFuel(); } } catch (e) {} }
setInterval(refresh, 60000);
// ---------- start ----------
applyFuel();
if (QS.get("speed")) { S.speed = +QS.get("speed"); S.speedCustom = true; }
const startDay = QS.get("day") && byDay[QS.get("day")] ? QS.get("day") : "2026-09-11";
if (S.mode === "replay") { S.simT = etMidnight(startDay) + (QS.get("hour") != null ? +QS.get("hour") * HOUR : firstHour(startDay)); const sp = S.speed; setMode("replay", startDay); if (QS.get("speed")) { S.speed = sp; if ([...$("#speed").options].some((o) => +o.value === sp)) $("#speed").value = String(sp); } }
else setMode("live");
if (QS.get("play") === "0") { S.playing = false; $("#play").textContent = "▶"; }
if (S.tour) setTour(true); if (S.labels) $("#labels").classList.add("on");
if (QS.get("cam")) { const [x, y, z, tx, ty, tz] = QS.get("cam").split(",").map(Number); camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); }
if (S.mode === "live" && !S.liveAt) { const b = $("#banner"); b.textContent = "Live: real ET clock. Detailed logs on this box stop Sep 16, so try ⏪ Replay (🔥 Sep 11, Sep 14)."; b.style.display = "block"; setTimeout(() => (b.style.display = "none"), 7000); }
window.__island = { ready: true, errors, stats: () => ({ day: DAY.day, mode: S.mode, simT: S.simT, t0: DAY.t0, t1: DAY.t1, cursor: S.cursor, total: DAY.evs.length, counts: Object.assign({}, S.counts), src: Object.assign({}, DAY.src), playbackOnly: S.playbackOnly, playbackFired: S.playbackFired, runs: DAY.runs.length, playing: S.playing, frames: S.frames, sunDeg: S.sunDeg, tour: S.tour, cam: camera.position.toArray(), fx: S.fx.length,
    walking: bots.filter((b) => posAt(DAY.tracks[b.id].kf, S.simT).walking).map((b) => b.name), carrying: bots.filter((b) => actors[b.id].env.visible).map((b) => b.name) }),
  setDay: (d) => { daySel.value = d; S.simT = etMidnight(d); buildDay(d); }, setTime: (min) => { S.simT = DAY.t0 + min * MIN; resetCursor(S.simT); }, play: (on, speed) => { S.playing = on; if (speed) S.speed = speed; S.lastT = S.simT; }, setMode, setTour,
  info: () => ({ buildings: Object.keys(buildingObjs).length, homes: Object.keys(homes).length, avatars: Object.keys(actors).length + 1, pickables: pickables.length, three: T.REVISION, days: days.length, fuel: fuelInfo(), fuelScale: fluid.scale.y, gl: renderer.getContext().getParameter(renderer.getContext().VERSION) }),
  tip: (kind, key) => tipHtml(kind === "building" ? { kind, key } : kind === "bot" ? { kind, bot: bots.find((b) => b.name === key).id } : { kind }), camera, controls, hoverAt: (x, y) => { mouseIn = true; mx = x; my = y; mouse.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); },
  project: (what) => { const p = what === "fuel" ? fuelPos.clone().setY(GROUND + 6) : actors[bots.find((b) => b.name === what).id].g.position.clone().setY(GROUND + 1); const v = p.project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } };
requestAnimationFrame(frame);
})();
