'use strict';
/* Abfluss Schweiz — live streamflow map.
 *
 * Geometry  HydroRIVERS v1.0 (HydroSHEDS). Vertex order is downstream.
 * Discharge BAFU gauges, read live from LINDAS (CORS is open, so the browser
 *           queries the federal endpoint directly; there is no backend).
 * Estimate  Every reach carries DIS_AV_CMS, its long-term mean discharge. A reach
 *           without a gauge takes that mean scaled by the anomaly ratio of the
 *           nearest gauge downstream. A layer selects and weights; it adds no fact.
 */

const ENDPOINT = 'https://lindas.admin.ch/query';

const SEQ = ['#0d366b', '#184f95', '#256abf', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
const STATUS = { 1: '#0ca30c', 2: '#fab219', 3: '#ec835a', 4: '#d03b3b', 5: '#d03b3b' };

// Against normal. One hue below the mean, one above, neutral at the mean. The
// middle is grey on purpose: a river at its long-term mean is not news.
const DIV = ['#7a3f19', '#a85f28', '#c8813c', '#dda86d', '#7f7d78', '#8fb6de', '#4d90cc', '#2a6cb0', '#123f77'];
// Water temperature, 0 to 25 C. The last step is the status red, because 25 C is
// where GSchV Annex 2 No. 12(4) puts the ceiling for a thermally altered river.
const TEMP = ['#1d4f86', '#3d7fbc', '#79aad8', '#b9c8bb', '#e0c477', '#dd8f47', '#d03b3b'];

let mode = 'flow';
let wantMode = null;          // asked for in the hash, applied once its layer is ready
let glaciers = null;          // {glaciers[], pastRings[], length[], now, past}
let users = null;             // {hydro[], abstraction[], npp[], ara[]}, each point in world coords
const useOn = { hydro: true, abstraction: true, npp: true, ara: true };

const LG = { flow: 'lgFlow', normal: 'lgNormal', temp: 'lgTemp', ice: 'lgIce', use: 'lgUse' };
const LGTITLE = { flow: 'Discharge', normal: 'Against the long-term mean', temp: 'Water temperature',
                  ice: 'Ice, 1850 and 2023', use: 'Who takes the water' };

// The use layer. A filled disc carries a quantity; an open ring carries a place and
// nothing more. That is the whole grammar, and it is forced by the sources: of the
// four federal registers only the hydropower statistic yields a discharge, and even
// that one yields it by arithmetic rather than by measurement.
const USE = {
  hydro:       { c: '#f0b429', label: 'Hydropower plant' },
  abstraction: { c: '#e07a5f', label: 'Abstraction, residual-flow register' },
  npp:         { c: '#d03b3b', label: 'Nuclear power station' },
  ara:         { c: '#6fae7f', label: 'Wastewater treatment plant' },
};

function stepColor(pal, t) {
  const u = Math.max(0, Math.min(1, t)) * (pal.length - 1);
  const a = pal[Math.floor(u)], b = pal[Math.min(pal.length - 1, Math.ceil(u))];
  return mix(a, b, u - Math.floor(u));
}
// ratio 1 sits in the middle; the scale is symmetric in log2 out to a quarter and
// four times the mean, because water is multiplicative and the eye is not.
const divColor = ratio => stepColor(DIV, 0.5 + Math.log2(Math.max(ratio, 1e-3)) / 4);
const tempColor = c => stepColor(TEMP, c / 25);

function reachColor(r) {
  if (mode === 'ice' || mode === 'temp') {
    if (r.basis === 'none') return { c: '#2b3138', a: 0.26 };
    return { c: rampColor(r.live), a: r.est ? 0.30 : 0.46 };
  }
  if (mode === 'normal') {
    if (r.basis === 'none' || !r.mean) return { c: '#3a4450', a: 0.30 };
    return { c: divColor(r.live / r.mean), a: r.est ? 0.72 : 1 };
  }
  if (r.basis === 'none') return { c: '#3a4450', a: 0.34 };
  return { c: rampColor(r.live), a: r.est ? 0.72 : 1 };
}


// discharge in m3/s -> position on the ramp, log scale from 0.05 to 2000
const QMIN = Math.log10(0.05), QMAX = Math.log10(2000);
function rampColor(q) {
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(q, 0.05)) - QMIN) / (QMAX - QMIN)));
  const i = t * (SEQ.length - 1);
  const a = SEQ[Math.floor(i)], b = SEQ[Math.min(SEQ.length - 1, Math.ceil(i))];
  return mix(a, b, i - Math.floor(i));
}
function mix(a, b, t) {
  const pa = [1, 3, 5].map(k => parseInt(a.substr(k, 2), 16));
  const pb = [1, 3, 5].map(k => parseInt(b.substr(k, 2), 16));
  return `rgb(${pa.map((v, k) => Math.round(v + (pb[k] - v) * t)).join(',')})`;
}

// ---- projection -------------------------------------------------------------
const mercY = lat => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const mercX = lon => (lon + 180) / 360;

// ---- state ------------------------------------------------------------------
const cv = document.getElementById('map');
const ctx = cv.getContext('2d');
const fcv = document.getElementById('flow');
const fctx = fcv.getContext('2d');
let dirty = true;                     // base map needs a redraw
const invalidate = () => { dirty = true; clearFlow(); };
const view = { k: 1, x: 0, y: 0 };          // k = pixels per world unit
let dpr = 1, W = 0, H = 0, K0 = 0;   // K0 = the scale at which the whole country fits

let reaches = [];          // {id,next,main,ord,upland,mean,px[],py[], live, est, basis}
let lakes = [], border = [];
let byId = new Map();
let stations = [];         // {id,name,lon,lat,factor,reach,meanQ,...}
let gaugeByReach = new Map();
let liveStamp = null;
let hovered = null;        // {kind:'reach'|'station', ref}
let selected = null;
let motion = true, showStations = true;
let particles = [], pool = [], poolWeight = 0, allocAt = 0;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let phase = 0;

// ---- load -------------------------------------------------------------------
async function load() {
  const [net, st, cx] = await Promise.all([
    fetch('data/network.json').then(r => r.json()),
    fetch('data/stations.json').then(r => r.json()),
    fetch('data/context.json').then(r => r.json()),
  ]);
  lakes = cx.lakes.map(l => ({ n: l.n, r: l.r.map(([lon, lat]) => [mercX(lon), mercY(lat)]) }));
  border = cx.border.map(p => p.map(([lon, lat]) => [mercX(lon), mercY(lat)]));
  const P = net.p;
  reaches = net.reaches.map(r => {
    const n = r.x.length;
    const px = new Float64Array(n), py = new Float64Array(n);
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      x += r.x[i]; y += r.y[i];
      px[i] = mercX(x / P); py[i] = mercY(y / P);
    }
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const dx = px[i] - px[i - 1], dy = py[i] - py[i - 1];
      cum[i] = cum[i - 1] + Math.hypot(dx, dy);
    }
    return { id: r.i, next: r.n, main: r.m, ord: r.o, upland: r.u, mean: r.d,
             px, py, cum, len: cum[n - 1], live: r.d, est: true, basis: 'none' };
  });
  byId = new Map(reaches.map((r, i) => [r.id, i]));
  stations = st.stations;
  for (const s of stations) if (s.reach !== undefined) gaugeByReach.set(s.reach, s);
  fit();
  applyHash();
  requestAnimationFrame(frame);
  if (wantMode && wantMode !== 'ice') { setMode(wantMode); wantMode = null; }
  loadIce();                 // 1.1 MB, so it must not hold up the first frame
  loadUsers();
  await refresh();
}

// The ice arrives after the water. Until it does the Ice button stays disabled,
// because a layer that is not loaded must not look like a layer that is empty.
async function loadIce() {
  try {
    const g = await fetch('data/glaciers.json').then(r => r.json());
    const P = g.p;
    const decode = rings => rings.map(([xs, ys]) => {
      const n = xs.length;
      const px = new Float64Array(n), py = new Float64Array(n);
      let x = 0, y = 0, x0 = 1, x1 = 0, y0 = 1, y1 = 0;
      for (let i = 0; i < n; i++) {
        x += xs[i]; y += ys[i];
        px[i] = mercX(x / P); py[i] = mercY(y / P);
        if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i];
        if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i];
      }
      return { px, py, b: [x0, y0, x1, y1] };
    });
    for (const gl of g.glaciers) {
      gl.rings = decode(gl.r); gl.r = null;
      gl.b = gl.rings.reduce((a, r) => [Math.min(a[0], r.b[0]), Math.min(a[1], r.b[1]),
                                        Math.max(a[2], r.b[2]), Math.max(a[3], r.b[3])],
                             [1, 1, 0, 0]);
      gl.w = [mercX(gl.c[0]), mercY(gl.c[1])];
    }
    g.pastRings = decode(g.pastRings);
    // The ice does not move between frames, so its geometry is built once, in world
    // coordinates, and the canvas transform carries it to the screen. Rebuilding
    // 3,700 polygons sixty times a second would be work for nothing.
    const toPath = rings => {
      const path = new Path2D();
      for (const r of rings) {
        path.moveTo(r.px[0], r.py[0]);
        for (let i = 1; i < r.px.length; i++) path.lineTo(r.px[i], r.py[i]);
        path.closePath();
      }
      return path;
    };
    g.pathPast = toPath(g.pastRings);
    g.pathNow = toPath(g.glaciers.flatMap(x => x.rings));
    for (const x of g.glaciers) x.path = toPath(x.rings);
    g.byId = new Map(g.length.map(l => [l.id, l]));
    glaciers = g;
    document.getElementById('modeIce').disabled = false;
    if (wantMode === 'ice') { setMode('ice'); wantMode = null; }
    document.getElementById('iceTotals').innerHTML =
      `${g.past.count} bodies covered ${g.past.km2.toLocaleString('de-CH')} km&#178; in ${g.past.year}. ` +
      `${g.now.count} cover ${g.now.km2.toLocaleString('de-CH')} km&#178; in ${g.now.year}. ` +
      `<b>${(100 * (1 - g.now.km2 / g.past.km2)).toFixed(0)}&#8201;% of the area is gone.</b>`;
  } catch (e) {
    document.getElementById('iceTotals').textContent = 'Glacier layer failed to load: ' + e.message;
  }
}

// Who takes the water. Four registers, loaded after the rivers because none of them
// is needed to read a gauge. Every point is projected once, here, and the canvas
// transform carries it to the screen.
async function loadUsers() {
  try {
    const u = await fetch('data/users.json').then(r => r.json());
    for (const k of Object.keys(USE)) {
      for (const p of u[k]) { p.kind = k; p.wx = mercX(p.x); p.wy = mercY(p.y); }
    }
    users = u;
    document.getElementById('modeUse').disabled = false;
    if (wantMode === 'use') { setMode('use'); wantMode = null; }
    const withQ = u.hydro.filter(h => h.q !== null).length;
    document.getElementById('useCount').innerHTML =
      `${u.abstraction.length.toLocaleString('de-CH')} abstractions, ${u.hydro.length} hydropower plants ` +
      `(${withQ} with a derivable design discharge), ${u.npp.length} nuclear stations, ` +
      `${u.ara.length} treatment plants.`;
  } catch (e) {
    document.getElementById('useCount').textContent = 'Use layer failed to load: ' + e.message;
  }
}

// Radius in pixels. Hydropower goes by derived design discharge and treatment plants
// by size in population equivalents, both on a log scale because water is
// multiplicative. The two registers with no quantity get one fixed size, so that
// nothing on the map can be read as a volume that is not one.
function useRadius(p) {
  if (p.kind === 'hydro') return p.q === null ? 2.2 : 2 + 2.6 * Math.log10(1 + p.q);
  if (p.kind === 'ara') return p.e ? 1.6 + 1.5 * Math.log10(1 + p.e / 100) : 2.2;
  if (p.kind === 'npp') return 7;
  return 2.6;
}
const useHasQuantity = p => (p.kind === 'hydro' && p.q !== null) || (p.kind === 'ara' && !!p.e);

function drawUsers() {
  if (!users) return;
  const z = Math.min(2.2, Math.max(0.85, Math.sqrt(zoom())));
  for (const k of ['ara', 'abstraction', 'hydro', 'npp']) {
    if (!useOn[k]) continue;
    const col = USE[k].c;
    for (const p of users[k]) {
      const x = sx(p.wx), y = sy(p.wy);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const on = hovered?.kind === 'use' && hovered.ref === p;
      const r = useRadius(p) * z * (on ? 1.5 : 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      if (useHasQuantity(p)) {
        ctx.globalAlpha = on ? 1 : 0.82;
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(13,13,13,0.85)';
        ctx.stroke();
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0d0d0d';
        ctx.fill();
        ctx.lineWidth = on ? 2.2 : 1.4;
        ctx.strokeStyle = col;
        ctx.stroke();
        // Four nuclear sites among three thousand points. A second ring, so that
        // the eye finds them without the colour having to carry the whole load.
        if (k === 'npp') {
          ctx.beginPath();
          ctx.arc(x, y, r * 0.5, 0, 6.2832);
          ctx.stroke();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function pickUser(mx, my) {
  if (!users) return null;
  let best = null, bd = Infinity;
  const z = Math.min(2.2, Math.max(0.85, Math.sqrt(zoom())));
  for (const k of ['npp', 'hydro', 'abstraction', 'ara']) {
    if (!useOn[k]) continue;
    for (const p of users[k]) {
      const dx = sx(p.wx) - mx, dy = sy(p.wy) - my;
      const d = Math.hypot(dx, dy) - useRadius(p) * z;
      if (d < 5 && d < bd) { bd = d; best = p; }
    }
  }
  return best;
}

// The hash carries the view and the layer, so a link is a citation: this place,
// this reading, this scale. #lon,lat,scale,layer
function applyHash() {
  const only = /^#(flow|normal|temp|ice|use)$/.exec(location.hash);
  if (only) { wantMode = only[1]; return false; }
  const m = /^#(-?[\d.]+),(-?[\d.]+),([\d.]+)(?:,(\w+))?$/.exec(location.hash);
  if (!m) return false;
  resize();
  view.k = +m[3];
  view.x = W / 2 - view.k * mercX(+m[1]);
  view.y = H / 2 - view.k * mercY(+m[2]);
  if (m[4] && LG[m[4]]) wantMode = m[4];
  return true;
}
function writeHash() {
  const lon = ((W / 2 - view.x) / view.k) * 360 - 180;
  const wy = (H / 2 - view.y) / view.k;
  const lat = (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * wy))) - Math.PI / 2) * 180 / Math.PI;
  history.replaceState(null, '', `#${lon.toFixed(4)},${lat.toFixed(4)},${Math.round(view.k)},${mode}`);
}

// ---- live data --------------------------------------------------------------
const QUERY = `
PREFIX schema: <http://schema.org/>
PREFIX h: <https://environment.ld.admin.ch/foen/hydro/dimension/>
SELECT ?id ?time ?discharge ?level ?temp ?danger
FROM <https://lindas.admin.ch/foen/hydro>
WHERE {
  ?obs h:station ?st ; h:measurementTime ?time .
  OPTIONAL { ?obs h:discharge ?discharge }
  OPTIONAL { ?obs h:waterLevel ?level }
  OPTIONAL { ?obs h:waterTemperature ?temp }
  OPTIONAL { ?obs h:dangerLevel ?danger }
  ?st schema:identifier ?id .
}`;

async function refresh() {
  const btn = document.getElementById('refresh');
  btn.disabled = true; btn.textContent = 'Reading gauges…';
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: QUERY }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = (await r.json()).results.bindings;

    const obs = new Map();
    for (const b of rows) {
      const id = b.id.value;
      obs.set(id, {
        time: b.time?.value ?? null,
        q: b.discharge ? +b.discharge.value : null,
        level: b.level ? +b.level.value : null,
        temp: b.temp ? +b.temp.value : null,
        danger: b.danger && /\/(\d)$/.test(b.danger.value) ? +RegExp.$1 : null,
      });
    }
    let newest = null;
    for (const s of stations) {
      const o = obs.get(s.id);
      s.obs = o ?? null;
      // The LINDAS cube gives no usable unit, so the factor comes from the
      // station's own plot axis, resolved at build time. Nine gauges read in l/s.
      s.q = o && o.q !== null ? o.q * s.factor : null;
      if (o?.time && (!newest || o.time > newest)) newest = o.time;
    }
    liveStamp = newest;
    applyLive();
    stampText();
    invalidate(); dirtyAlloc = true;
  } catch (e) {
    document.getElementById('stamp').textContent = 'Live read failed: ' + e.message + '. Showing long-term mean.';
  } finally {
    btn.disabled = false; btn.textContent = 'Refresh live data';
  }
}

/* Anomaly propagation. ratio = measured / long-term mean at the gauge's own reach.
 * A reach inherits the ratio of the first gauge found walking downstream. Where the
 * walk leaves the country before it meets a gauge, the national median stands in. */
function applyLive() {
  const ratio = new Map();
  const ratios = [];
  for (const s of stations) {
    if (s.reach === undefined || s.q === null || !s.meanQ) continue;
    const rr = s.q / s.meanQ;
    if (!isFinite(rr) || rr <= 0) continue;
    ratio.set(s.reach, rr);
    ratios.push(rr);
  }
  ratios.sort((a, b) => a - b);

  // children of each reach, biggest tributary first
  const kids = new Map();
  for (const r of reaches) {
    if (!byId.has(r.next)) continue;
    const a = kids.get(r.next);
    if (a) a.push(r); else kids.set(r.next, [r]);
  }
  for (const a of kids.values()) a.sort((x, y) => y.upland - x.upland);

  const seek = (start, step) => {
    let cur = start, guard = 0;
    while (cur && guard++ < 600) {
      if (ratio.has(cur.id)) return ratio.get(cur.id);
      cur = step(cur);
    }
    return null;
  };
  const down = r => { const i = byId.get(r.next); return i === undefined ? null : reaches[i]; };
  const up = r => (kids.get(r.id) ?? [null])[0];

  for (const r of reaches) {
    const g = gaugeByReach.get(r.id);
    if (g && g.q !== null && g.q !== undefined) { r.live = g.q; r.est = false; r.basis = 'measured'; continue; }
    r.est = true;
    // A reach takes the anomaly of the first gauge downstream, because that is the
    // water it will become. Failing that, of the largest gauged river above it.
    // Failing both, it has no basis: it is drawn as unknown, not guessed.
    let rr = seek(r, down);
    let basis = rr === null ? null : 'downstream';
    if (rr === null) { rr = seek(r, up); basis = rr === null ? null : 'upstream'; }
    if (rr === null) { r.live = r.mean; r.basis = 'none'; }
    else { r.live = r.mean * rr; r.basis = basis; }
  }
}

function stampText() {
  const el = document.getElementById('stamp');
  if (!liveStamp) { el.textContent = 'Long-term mean discharge (no live read).'; return; }
  const d = new Date(liveStamp);
  const t = d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const n = stations.filter(s => s.q !== null && s.q !== undefined).length;
  el.textContent = `${n} gauges, last reading ${t}`;

  const withT = stations.filter(s => s.obs?.temp !== null && s.obs?.temp !== undefined);
  const c = document.getElementById('tempCount');
  if (!withT.length) { c.textContent = 'No temperature series in this read.'; return; }
  const temps = withT.map(s => s.obs.temp).sort((a, b) => a - b);
  const med = temps[temps.length >> 1];
  const over = temps.filter(v => v >= 25).length;
  const warm = temps.filter(v => v >= 20).length;
  const top = withT.reduce((a, b) => (b.obs.temp > a.obs.temp ? b : a));
  c.innerHTML = `${withT.length} gauges report temperature. Median ${med.toFixed(1)}&nbsp;&deg;C, ` +
    `${warm} at or above 20&nbsp;&deg;C, <b>${over} at or above 25&nbsp;&deg;C</b>. ` +
    `Warmest ${top.obs.temp.toFixed(1)}&nbsp;&deg;C at ${esc(top.name)}.`;
}

// ---- view -------------------------------------------------------------------
function fit() {
  resize();
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const r of reaches) for (let i = 0; i < r.px.length; i++) {
    if (r.px[i] < x0) x0 = r.px[i]; if (r.px[i] > x1) x1 = r.px[i];
    if (r.py[i] < y0) y0 = r.py[i]; if (r.py[i] > y1) y1 = r.py[i];
  }
  const pad = 0.94;
  view.k = Math.min(W / (x1 - x0), H / (y1 - y0)) * pad;
  K0 = view.k;
  view.x = W / 2 - view.k * (x0 + x1) / 2;
  view.y = H / 2 - view.k * (y0 + y1) / 2;
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  for (const [c, x] of [[cv, ctx], [fcv, fctx]]) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  invalidate();
}
const sx = wx => wx * view.k + view.x;
const sy = wy => wy * view.k + view.y;

// ---- draw -------------------------------------------------------------------
// The scale decides how much of the brook network is worth drawing: at country view
// a 5 km2 headwater is a pixel of noise, at valley view it is the subject.
const zoom = () => view.k / (K0 || 1);
function minUpland() {
  const z = zoom();
  if (z < 1.15) return 12;
  if (z < 2.5) return 6;
  return 0;
}
function lineWidth(q) {
  const w = 0.45 + 1.35 * Math.log10(1 + Math.max(q, 0));
  // 2.2 at country view, growing with the zoom, so a brook stays a hairline
  // and the Rhine stays the Rhine at every scale.
  const s = Math.min(4.6, 2.2 + 0.6 * Math.log2(Math.max(1, zoom()))) * (W / 1600);
  return Math.max(0.5, w * s);
}

let __frames = 0, __t0 = 0, __last = 0;

// The base map and the current live on separate canvases. The base redraws only
// when the view or the data changes; the current runs every frame over the top.
function frame(ts) {
  if (!__t0) __t0 = ts || 0;
  __frames++;
  const dt = Math.min(0.05, ((ts || 0) - __last) / 1000 || 0.016);
  __last = ts || 0;
  if (dirty) { drawBase(); dirty = false; }
  if (motion && !REDUCED) flowStep(dt, ts || 0);
  requestAnimationFrame(frame);
}

function drawBase() {
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // context: the border first, then the lakes. Neither carries data.
  ctx.beginPath();
  for (const ring of border) {
    ctx.moveTo(sx(ring[0][0]), sy(ring[0][1]));
    for (let i = 1; i < ring.length; i++) ctx.lineTo(sx(ring[i][0]), sy(ring[i][1]));
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  for (const l of lakes) {
    ctx.moveTo(sx(l.r[0][0]), sy(l.r[0][1]));
    for (let i = 1; i < l.r.length; i++) ctx.lineTo(sx(l.r[i][0]), sy(l.r[i][1]));
    ctx.closePath();
  }
  ctx.fillStyle = '#16294a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(157,197,244,0.20)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const minU = minUpland();
  const margin = 60;

  for (const r of reaches) {
    if (r.upland < minU) continue;
    if (!onScreen(r, margin)) continue;
    path(r);
    if (r.basis === 'none') { ctx.strokeStyle = '#3a4450'; ctx.globalAlpha = 0.34; }
    else { ctx.strokeStyle = rampColor(r.live); ctx.globalAlpha = r.est ? 0.72 : 1; }
    // Under the use layer the water is context, not the reading, so it is dimmed.
    // It is dimmed, not removed: a plant means nothing without the river it stands on.
    if (mode === 'use') ctx.globalAlpha *= 0.5;
    ctx.lineWidth = lineWidth(r.live);
    ctx.stroke();
  }

  if (hovered?.kind === 'reach') {
    const r = hovered.ref;
    path(r);
    ctx.strokeStyle = '#fab219';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = lineWidth(r.live) + 1.6;
    ctx.stroke();
  }

  if (mode === 'use') drawUsers();

  if (showStations && mode !== 'use') {
    ctx.globalAlpha = 1;
    for (const s of stations) {
      if (s.lon === null) continue;
      const x = sx(mercX(s.lon)), y = sy(mercY(s.lat));
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const live = s.q !== null && s.q !== undefined;
      const d = s.obs?.danger ?? null;
      const rad = hovered?.kind === 'station' && hovered.ref === s ? 6 : (live ? 3.4 : 2.4);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 6.2832);
      ctx.fillStyle = '#0d0d0d';
      ctx.globalAlpha = live ? 1 : 0.55;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = d && d >= 2 ? STATUS[d] : (live ? '#cde2fb' : '#898781');
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ---- the current ------------------------------------------------------------
// Particles ride the reaches in vertex order, which is downstream, and cross into
// NEXT_DOWN at the end of a reach. So a drop entering the Lonza leaves down the
// Rhone. Speed follows discharge; the network does the routing.
const PARTICLE_BUDGET = 3200;

function clearFlow() { fctx.clearRect(0, 0, W, H); }

function allocate() {
  pool = []; poolWeight = 0;
  const minU = minUpland();
  for (let i = 0; i < reaches.length; i++) {
    const r = reaches[i];
    if (r.basis === 'none') continue;
    if (r.upland < Math.max(minU, 8)) continue;
    if (!onScreen(r, 40)) continue;
    if (r.len <= 0) continue;
    // weight by how much water and how much of it is on screen
    const w = Math.pow(Math.max(r.live, 0.02), 0.32) * r.len * view.k;
    pool.push({ i, w: poolWeight += w });
  }
  const n = pool.length ? PARTICLE_BUDGET : 0;
  particles = new Array(n);
  for (let k = 0; k < n; k++) particles[k] = spawn({}, true);
}

function pickReach() {
  const t = Math.random() * poolWeight;
  let lo = 0, hi = pool.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pool[m].w < t) lo = m + 1; else hi = m; }
  return pool[lo].i;
}

function spawn(p, anywhere) {
  p.r = pickReach();
  p.t = anywhere ? Math.random() * reaches[p.r].len : 0;
  p.age = 0;
  return p;
}

// speed in world units per second: a log of discharge, so the Rhine outruns a brook
// without the brook standing still
function speedOf(r) { return (2.4e-5 + 5.2e-5 * Math.log10(1 + r.live)) * Math.min(3, Math.max(0.35, zoom())); }

function posOn(r, t) {
  const c = r.cum;
  let lo = 0, hi = c.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < t) lo = m + 1; else hi = m; }
  const i = Math.max(1, lo);
  const seg = c[i] - c[i - 1] || 1;
  const f = (t - c[i - 1]) / seg;
  return [r.px[i - 1] + (r.px[i] - r.px[i - 1]) * f, r.py[i - 1] + (r.py[i] - r.py[i - 1]) * f];
}

function flowStep(dt, ts) {
  if (ts - allocAt > 400 && dirtyAlloc) { allocate(); allocAt = ts; dirtyAlloc = false; }
  if (!particles.length) return;

  // fade the previous frame instead of clearing it: that is the trail
  fctx.globalCompositeOperation = 'destination-out';
  fctx.fillStyle = 'rgba(0,0,0,0.14)';
  fctx.fillRect(0, 0, W, H);
  fctx.globalCompositeOperation = 'source-over';

  fctx.lineCap = 'round';
  for (const p of particles) {
    let r = reaches[p.r];
    p.t += speedOf(r) * dt;
    p.age += dt;
    let guard = 0;
    while (p.t > r.len && guard++ < 4) {
      const ni = byId.get(r.next);
      if (ni === undefined || reaches[ni].basis === 'none') { spawn(p, true); r = reaches[p.r]; break; }
      p.t -= r.len; p.r = ni; r = reaches[ni];
    }
    if (p.age > 26) { spawn(p, true); r = reaches[p.r]; }

    const [wx, wy] = posOn(r, Math.min(p.t, r.len));
    const x = sx(wx), y = sy(wy);
    if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
    const w = lineWidth(r.live);
    fctx.globalAlpha = (r.est ? 0.34 : 0.7) * Math.min(1, p.age * 3) * (mode === 'use' ? 0.22 : 1);
    fctx.strokeStyle = '#eaf4ff';
    fctx.lineWidth = Math.max(0.7, Math.min(2.6, w * 0.42));
    const [bx, by] = posOn(r, Math.max(0, Math.min(p.t, r.len) - speedOf(r) * dt * 9));
    fctx.beginPath();
    fctx.moveTo(sx(bx), sy(by));
    fctx.lineTo(x, y);
    fctx.stroke();
  }
  fctx.globalAlpha = 1;
}
let dirtyAlloc = true;

// HydroRIVERS is traced from a 15 arc-second grid, so its polylines carry the
// staircase of the raster. Rounding the interior corners with a quadratic through
// the segment midpoints removes the staircase without moving the line off course.
function path(r) {
  const n = r.px.length;
  ctx.beginPath();
  ctx.moveTo(sx(r.px[0]), sy(r.py[0]));
  if (n === 2) { ctx.lineTo(sx(r.px[1]), sy(r.py[1])); return; }
  for (let i = 1; i < n - 1; i++) {
    const cx = sx(r.px[i]), cy = sy(r.py[i]);
    ctx.quadraticCurveTo(cx, cy, (cx + sx(r.px[i + 1])) / 2, (cy + sy(r.py[i + 1])) / 2);
  }
  ctx.lineTo(sx(r.px[n - 1]), sy(r.py[n - 1]));
}

function onScreen(r, m) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < r.px.length; i++) {
    const x = sx(r.px[i]), y = sy(r.py[i]);
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return maxx > -m && minx < W + m && maxy > -m && miny < H + m;
}

// ---- interaction ------------------------------------------------------------
let drag = null;
cv.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  cv.setPointerCapture(e.pointerId); cv.classList.add('dragging');
});
cv.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view.x = drag.vx + dx; view.y = drag.vy + dy;
    invalidate(); dirtyAlloc = true;
    return;
  }
  pick(e.clientX, e.clientY);
});
cv.addEventListener('pointerup', e => {
  const wasDrag = drag?.moved;
  drag = null; cv.classList.remove('dragging');
  if (wasDrag) writeHash();
  else { pick(e.clientX, e.clientY); select(hovered); }
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0016);
  const k2 = Math.max(K0 * 0.5, Math.min(K0 * 10, view.k * f));
  const s = k2 / view.k;
  view.x = e.clientX - (e.clientX - view.x) * s;
  view.y = e.clientY - (e.clientY - view.y) * s;
  view.k = k2;
  invalidate(); dirtyAlloc = true;
  clearTimeout(window.__hashT);
  window.__hashT = setTimeout(writeHash, 350);
}, { passive: false });

// Even-odd crossing over every ring of the body, so a nunatak counts as a hole
// and a hole is not the glacier.
function inGlacier(g, wx, wy) {
  if (wx < g.b[0] || wx > g.b[2] || wy < g.b[1] || wy > g.b[3]) return false;
  let inside = false;
  for (const r of g.rings) {
    const n = r.px.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if ((r.py[i] > wy) !== (r.py[j] > wy) &&
          wx < (r.px[j] - r.px[i]) * (wy - r.py[i]) / (r.py[j] - r.py[i]) + r.px[i]) inside = !inside;
    }
  }
  return inside;
}
function pickGlacier(mx, my) {
  if (!glaciers) return null;
  const wx = (mx - view.x) / view.k, wy = (my - view.y) / view.k;
  for (const g of glaciers.glaciers) if (inGlacier(g, wx, wy)) return g;
  // Below a few square kilometres a body is smaller than the cursor at country
  // view, so the nearest centre inside 9 px stands in for a hit.
  let best = null, bd = 81;
  for (const g of glaciers.glaciers) {
    const dx = sx(g.w[0]) - mx, dy = sy(g.w[1]) - my;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function pick(mx, my) {
  if (mode === 'ice') {
    const g = pickGlacier(mx, my);
    if (g) { hovered = { kind: 'glacier', ref: g }; tip(mx, my); return; }
  }
  if (mode === 'use') {
    const u = pickUser(mx, my);
    if (u) {
      if (hovered?.ref !== u) dirty = true;
      hovered = { kind: 'use', ref: u }; tip(mx, my); return;
    }
    if (hovered?.kind === 'use') { hovered = null; dirty = true; }
  }

  const R2 = 100;
  let bestS = null, bd = R2;
  for (const s of stations) {
    if (mode === 'use') break;        // the gauges are not drawn under this layer
    if (s.lon === null) continue;
    const dx = sx(mercX(s.lon)) - mx, dy = sy(mercY(s.lat)) - my;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bestS = s; }
  }
  if (bestS) {
    if (hovered?.ref !== bestS) dirty = true;
    hovered = { kind: 'station', ref: bestS }; tip(mx, my); return;
  }

  let bestR = null, brd = 64;
  const minU = minUpland();
  for (const r of reaches) {
    if (r.upland < minU) continue;
    for (let i = 0; i < r.px.length; i++) {
      const dx = sx(r.px[i]) - mx, dy = sy(r.py[i]) - my;
      const d = dx * dx + dy * dy;
      if (d < brd) { brd = d; bestR = r; }
    }
  }
  const was = hovered?.ref;
  hovered = bestR ? { kind: 'reach', ref: bestR } : null;
  if (hovered?.ref !== was) dirty = true;
  tip(mx, my);
}

const tt = document.getElementById('tooltip');
function fmtQ(q) {
  if (q === null || q === undefined) return '—';
  if (q >= 100) return q.toFixed(0);
  if (q >= 10) return q.toFixed(1);
  if (q >= 1) return q.toFixed(2);
  return q.toFixed(3);
}
function tip(mx, my) {
  if (!hovered) { tt.hidden = true; return; }
  if (hovered.kind === 'glacier') {
    const g = hovered.ref;
    tt.innerHTML = `<div class="tName">${esc(g.n || 'unnamed glacier ' + g.id)}</div>` +
      `<div class="tVal">${g.a.toFixed(2)} km&#178; in ${g.y ?? glaciers.now.year}</div>` +
      `<div class="tEst">${g.a0 !== undefined ? g.a0.toFixed(2) + ' km\u00b2 in 1850' : 'no 1850 body under this identifier'}</div>`;
  } else if (hovered.kind === 'use') {
    const p = hovered.ref;
    const line =
      p.kind === 'hydro' ? (p.q !== null ? fmtQ(p.q) + ' m³/s at full load, derived' : 'no head in the register')
      : p.kind === 'ara' ? (p.e ? p.e.toLocaleString('de-CH') + ' population equivalents' : 'size not stated')
      : p.kind === 'npp' ? 'cooling water not in any federal dataset'
      : 'no quantity in the register';
    tt.innerHTML = `<div class="tName">${esc(p.n ?? ('Abstraction ' + (p.r ?? 'without a number')))}</div>` +
      `<div class="tVal">${esc(line)}</div>` +
      `<div class="tEst">${esc(USE[p.kind].label)}${p.w ? ' &#183; ' + esc(p.w) : ''}${p.v ? ' &#183; ' + esc(p.v) : ''}</div>`;
  } else if (hovered.kind === 'station') {
    const s = hovered.ref;
    tt.innerHTML = `<div class="tName">${esc(s.name)}</div>` +
      `<div class="tVal">${s.q !== null && s.q !== undefined ? fmtQ(s.q) + ' m³/s' : 'no discharge series'}</div>` +
      `<div class="tEst">BAFU gauge ${esc(s.id)}</div>`;
  } else {
    const r = hovered.ref;
    tt.innerHTML = `<div class="tName">${fmtQ(r.live)} m³/s</div>` +
      `<div class="tVal">catchment ${r.upland.toFixed(0)} km²</div>` +
      `<div class="tEst">${r.basis === 'measured' ? 'measured at a gauge'
        : r.basis === 'none' ? 'outside the gauged network, long-term mean only'
        : 'estimated from the ' + r.basis + ' gauge'}</div>`;
  }
  tt.hidden = false;
  tt.style.left = Math.min(mx + 14, window.innerWidth - 250) + 'px';
  tt.style.top = Math.min(my + 14, window.innerHeight - 90) + 'px';
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const panel = document.getElementById('panel');
function select(h) {
  selected = h;
  if (!h) { panel.hidden = true; return; }
  const T = document.getElementById('panelTitle');
  const B = document.getElementById('panelBody');
  const N = document.getElementById('panelNote');
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;

  const X = document.getElementById('panelExtra');
  X.innerHTML = '';

  if (h.kind === 'glacier') {
    const g = h.ref;
    T.textContent = g.n || 'Unnamed glacier ' + g.id;
    let html = row(`Area ${g.y ?? glaciers.now.year}`, g.a.toFixed(3), 'km\u00b2');
    if (g.a0 !== undefined) {
      html += row('Area 1850', g.a0.toFixed(3), 'km\u00b2');
      html += row('Area lost', (100 * (1 - g.a / g.a0)).toFixed(0), '%');
    }
    html += row('Length', g.l.toFixed(2), 'km');
    if (g.mn) html += row('Lowest ice', g.mn, 'm');
    if (g.mx) html += row('Highest ice', g.mx, 'm');
    if (g.dl !== undefined) html += row('Tongue since first survey', g.dl.toLocaleString('de-CH'), 'm');
    if (g.gn) html += row('First gauge downstream', esc(g.gn), '');
    html += row('SGI identifier', esc(g.id), '');
    B.innerHTML = html;

    const ser = glaciers.byId.get(g.id);
    if (ser) X.innerHTML = spark(ser);

    N.innerHTML = `Outlines and areas from the Swiss Glacier Inventory, GLAMOS. ` +
      (g.a0 !== undefined
        ? `The 1850 figure is the body that carries the same identifier. Glaciers split as they shrink, so an identifier is a label, not a proof of one body.`
        : `No 1850 body carries this identifier, so no pair is shown. That is a gap in the join, not a glacier that did not exist.`) +
      (g.gn ? ` The gauge named is the first BAFU station downstream of the mapped reach nearest the ice. It is a spatial assignment, not a routing model.` : '');
    panel.hidden = false;
    return;
  }

  if (h.kind === 'use') {
    const p = h.ref;
    let html = '', note = '';
    if (p.kind === 'hydro') {
      T.textContent = p.n;
      html += row('Place', esc(p.l || '\u2014') + (p.c ? ', ' + esc(p.c) : ''), '');
      html += row('Type', esc(p.t), '');
      if (p.s) html += row('Status', esc(p.s), '');
      if (p.b) html += row('In service since', p.b, '');
      if (p.h) html += row('Head', p.h.toLocaleString('de-CH'), 'm');
      if (p.p) html += row('Turbine capacity', p.p.toLocaleString('de-CH'), 'MW');
      if (p.e) html += row('Expected production', p.e.toLocaleString('de-CH'), 'GWh/a');
      html += row('Design discharge, derived', p.q === null ? '\u2014' : fmtQ(p.q), 'm³/s');
      note = p.q === null
        ? `The register gives no head for this plant, so no discharge can be derived from it.`
        : `<b>Derived, not measured.</b> WASTA gives capacity and head but no water quantity, so the
           figure is P divided by \u03c1gH\u03b7, with \u03b7 taken at 0.85 for the whole machine. One check:
           at Rheinfelden the arithmetic gives 1&#8201;621&nbsp;m³/s where the plant states it can take
           1&#8201;500 at the same 100&nbsp;MW, so the method runs about eight per cent high there and 0.85
           is a little generous for a low head. Treat every figure here as an order of magnitude with a
           plausible first digit, and take the design discharge from the concession before you rely on it.` +
          (p.t === 'Laufkraftwerk'
            ? ` A run-of-river plant passes the water on: it uses the river without consuming it, and the
               question it raises is the regime, not the volume.`
            : ` This is a storage or pumped-storage plant. The water it turbines is released from a
               reservoir and often comes from another catchment, so the figure does not describe an
               abstraction from the reach beside it.`);
    } else if (p.kind === 'abstraction') {
      T.textContent = 'Abstraction ' + (p.r ?? 'without a number');
      html += row('Watercourse', esc(p.w || '\u2014'), '');
      html += row('Canton', esc(p.c || '\u2014'), '');
      html += row('Quantity', 'not in the register', '');
      if (p.r) html += row('Cantonal report',
        `<a href="https://www.bafu-daten.ch/wasser/restwasser/data/data/er/de/${encodeURIComponent(p.r.replace(/-/g, ''))}.pdf" target="_blank" rel="noopener">${esc(p.r)} (PDF)</a>`, '');
      note = `From the federal residual-flow map, the cantonal inventory of existing abstractions under
        GSchG Art. 80 ff. It carries the place, the watercourse and, where the canton filed one, the
        report. It carries no volume and no Q<sub>347</sub>, so the Art. 31 calculator cannot be run
        off this point. <b>The federal data state stands at 1 January 2004.</b> A licence granted, changed
        or restored since then is not in it.` +
        (p.r ? ' The report is the cantonal assessment, and it is where the figures are.'
             : ' This entry carries no report number, so no federal report is linked. That is a gap in the filing, not a finding that the abstraction is unlicensed.');
    } else if (p.kind === 'npp') {
      T.textContent = p.n;
      html += row('Operator', esc(p.o || '\u2014'), '');
      html += row('Cooling water', 'not published as open data', '');
      note = `The federal dataset gives the site and the operator. It gives no cooling-water volume and
        no thermal load, and neither figure is published in any open federal series. They sit in the
        cantonal concession and in the operator's own environmental reporting. Cooling is where a heat
        question meets a water question: GSchV Annex 2 No. 12(4) governs the alteration, and the
        temperature layer of this map shows only what the gauges read.`;
    } else {
      T.textContent = p.n;
      html += row('Place', esc(p.o || '\u2014') + (p.c ? ', ' + esc(p.c) : ''), '');
      html += row('Receiving water', esc(p.v || '\u2014'), '');
      if (p.e) html += row('Size', p.e.toLocaleString('de-CH'), 'population equivalents');
      html += row('Effluent against the receiving water at Q<sub>347</sub>',
                  p.q === null ? 'not stated' : p.q.toFixed(1), '%');
      note = `The other direction: treated wastewater going back in. The figure is the plant's discharge
        against the receiving water at Q<sub>347</sub>, its low-flow reference, so it is a ratio and not
        a share of a whole: it passes 100 % where the plant puts in more than the brook carries at low
        flow. <b>From a survey of 2011, federal data state 1 January 2014</b>, taken before the fourth
        treatment stage was built out. A high ratio is not a breach of anything. It is the measure of how
        little clean water is left to dilute with, and it is the condition under which every limit value
        in Annex 2 of the Waters Protection Ordinance has to hold.`;
      if (p.k === 'See') note += ` This plant discharges to a lake, so no low-flow ratio is given for it:
        the reference is a flowing water and a lake is not one.`;
      if (p.k === 'Versickern') note += ` This plant infiltrates to ground rather than to a watercourse,
        so there is no receiving water to compare against. The question it raises is a groundwater
        question.`;
      if (p.q !== null && p.q > 100) note = `<span class="flag">At its low-flow reference this
        watercourse carries less water than the plant discharges into it.</span> ` + note;
      else if (p.q !== null && p.q >= 50) note = `<span class="flag">At low flow more than half of what
        runs in this watercourse is treated wastewater.</span> ` + note;
    }
    B.innerHTML = html;
    N.innerHTML = note;
    panel.hidden = false;
    return;
  }

  if (h.kind === 'station') {
    const s = h.ref, o = s.obs ?? {};
    T.textContent = s.name;
    let html = row('Discharge', fmtQ(s.q), 'm³/s');
    if (s.meanQ) html += row('Long-term mean', fmtQ(s.meanQ), 'm³/s');
    if (s.q !== null && s.q !== undefined && s.meanQ) html += row('Share of mean', (100 * s.q / s.meanQ).toFixed(0), '%');
    if (o.level !== null && o.level !== undefined) html += row('Water level', o.level.toFixed(2), 'm');
    if (o.temp !== null && o.temp !== undefined) html += row('Temperature', o.temp.toFixed(1), '°C');
    if (o.danger) html += row('Flood level', `<span class="pill d${o.danger}">${o.danger}</span>`, '');
    html += row('Station', s.id, '');
    B.innerHTML = html;
    if (o.temp !== null && o.temp !== undefined) {
      // A reading is one sensor. The nearest gauges that also report temperature are
      // the cheapest check there is. A whole basin is too coarse for this: the Rhine
      // system holds an Alpine headwater and a lowland reach in one number. Five
      // neighbours inside 40 km are close enough to share the weather.
      const near = stations
        .filter(x => x !== s && x.lon !== null && x.obs?.temp !== null && x.obs?.temp !== undefined)
        .map(x => {
          const dx = (x.lon - s.lon) * Math.cos(s.lat * Math.PI / 180), dy = x.lat - s.lat;
          return { t: x.obs.temp, km: Math.sqrt(dx * dx + dy * dy) * 111 };
        })
        .filter(x => x.km <= 40)
        .sort((a, b) => a.km - b.km)
        .slice(0, 5);
      let extra = '';
      if (near.length >= 3) {
        const kin = near.map(x => x.t).sort((a, b) => a - b);
        const m = kin[kin.length >> 1];
        const d = o.temp - m;
        extra = `<p class="${Math.abs(d) >= 4 ? 'flag' : 'aside'}">The ${kin.length} nearest gauges that also
          report temperature, all inside ${near.at(-1).km.toFixed(0)} km, read ${kin[0].toFixed(1)} to
          ${kin.at(-1).toFixed(1)}&nbsp;&deg;C, median ${m.toFixed(1)}. This gauge is
          ${d >= 0 ? '+' : ''}${d.toFixed(1)}&nbsp;&deg;C against them.` +
          (Math.abs(d) >= 4 ? ' A gap that size is a question about the instrument before it is a question about the river.' : '') + '</p>';
      }
      if (o.temp >= 25) {
        extra += `<p class="flag">At or above the 25&nbsp;&deg;C ceiling that GSchV Annex&nbsp;2 No.&nbsp;12(4)
          sets for a watercourse whose temperature is altered by heat. The ceiling is tied to that
          alteration, so this reading raises the question and does not settle it.</p>`;
      }
      document.getElementById('panelExtra').innerHTML = extra;
    }
    N.innerHTML = `Measured by the Federal Office for the Environment. Reported in ${esc(s.unit ?? 'an unstated unit')}` +
      `${s.factor !== 1 ? ', converted to m³/s' : ''}. Snapped ${s.snapKm ?? '?'} km to the nearest river reach. ` +
      `The reading proves what the gauge measured, nothing further downstream.`;
  } else {
    const r = h.ref;
    T.textContent = r.est ? 'River reach (estimated)' : 'River reach (gauged)';
    let html = row('Discharge now', fmtQ(r.live), 'm³/s');
    html += row('Long-term mean', fmtQ(r.mean), 'm³/s');
    html += row('Share of mean', r.mean ? (100 * r.live / r.mean).toFixed(0) : '—', '%');
    html += row('Upstream catchment', r.upland.toFixed(0), 'km²');
    html += row('Strahler order', r.ord, '');
    B.innerHTML = html;
    N.textContent =
      r.basis === 'measured' ? 'A gauge sits on this reach, so the figure is measured.'
      : r.basis === 'none' ? 'This reach drains away from the Swiss gauging network and no gauge stands above it either. The figure is the long-term mean of the reach and nothing more. It says nothing about today.'
      : `No gauge on this reach. The figure is the long-term mean of the reach, scaled by how far the nearest gauge ${r.basis} stands from its own mean. It is a modelled number, not a measurement.`;
  }
  panel.hidden = false;
}
// A tongue measured every autumn since the 1880s. Cumulative metres, so the line
// is where the ice front stands against where it stood at the first survey.
function spark(ser) {
  const w = 268, h = 62, pad = 3;
  const xs = ser.obs.map(o => o[0]), ys = ser.obs.map(o => o[1]);
  const x0 = xs[0], x1 = xs.at(-1);
  const y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  const X = v => pad + (w - 2 * pad) * (v - x0) / Math.max(1, x1 - x0);
  const Y = v => pad + (h - 2 * pad) * (1 - (v - y0) / Math.max(1, y1 - y0));
  const d = ser.obs.map((o, i) => `${i ? 'L' : 'M'}${X(o[0]).toFixed(1)},${Y(o[1]).toFixed(1)}`).join('');
  const zero = Y(0).toFixed(1);
  return `<figure class="spark">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumulative length change ${x0} to ${x1}">
      <line x1="0" y1="${zero}" x2="${w}" y2="${zero}" class="sparkZero"/>
      <path d="${d}" class="sparkLine"/>
    </svg>
    <figcaption>Tongue position, ${x0} to ${x1}, ${ser.obs.length} surveys. GLAMOS length change.</figcaption>
  </figure>`;
}

document.getElementById('panelClose').onclick = () => { panel.hidden = true; selected = null; };
document.getElementById('refresh').onclick = refresh;
document.getElementById('toggleStations').onchange = e => { showStations = e.target.checked; dirty = true; };
document.getElementById('toggleMotion').onchange = e => { motion = e.target.checked; if (!motion) clearFlow(); };
for (const el of document.querySelectorAll('#lgUse input[data-use]')) {
  el.onchange = () => { useOn[el.dataset.use] = el.checked; dirty = true; };
}
window.addEventListener('resize', () => { resize(); dirtyAlloc = true; });

window.__fps = () => (__frames / Math.max(0.001, (performance.now() - __t0) / 1000)).toFixed(1);
window.__diag = () => {
  const t = { measured: 0, downstream: 0, upstream: 0, none: 0 };
  for (const r of reaches) t[r.basis]++;
  return { reaches: reaches.length, ...t, gauges: stations.filter(s => s.q !== null && s.q !== undefined).length };
};

// ---- layers -----------------------------------------------------------------
// One control, four readings of the same country. Switching a layer must never
// change a number; it changes which number the colour carries.
function setMode(m) {
  if (m === 'ice' && !glaciers) return;
  mode = m;
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === m);
  for (const [k, id] of Object.entries(LG)) document.getElementById(id).hidden = k !== m;
  document.getElementById('legendTitle').textContent = LGTITLE[m];
  if (selected && selected.kind === 'glacier' && m !== 'ice') { panel.hidden = true; selected = null; }
  if (selected && selected.kind === 'use' && m !== 'use') { panel.hidden = true; selected = null; }
  if (hovered && ((hovered.kind === 'use') !== (m === 'use'))) hovered = null;
  clearFlow();
  dirty = true;
}
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

// ---- Art. 31(1) GSchG -------------------------------------------------------
// The statute states a base figure at the foot of each band and a rate above it.
// The rates are applied as written, not interpolated between the bases, because the
// two do not always agree: the rate from 2500 l/s reaches 2497.5 at 10 000 l/s where
// the statute states 2500. Each band therefore starts from its own stated base.
//        [ceiling of band, base l/s, per this many l/s of Q347, add this many l/s]
const RESIDUAL = [
  [60, 50, 0, 0],
  [160, 50, 10, 8],
  [500, 130, 10, 4.4],
  [2500, 280, 100, 31],
  [10000, 900, 100, 21.3],
  [60000, 2500, 1000, 150],
];
function minResidual(q) {
  if (!isFinite(q) || q <= 0) return null;         // no permanent flow, Art. 4(i)
  if (q >= 60000) return 10000;                    // the table stops here
  let floor = 0;
  for (const [ceil, base, per, add] of RESIDUAL) {
    if (q <= ceil) return per ? base + ((q - floor) / per) * add : base;
    floor = ceil;
  }
  return 10000;
}
const q347 = document.getElementById('q347');
const q347out = document.getElementById('q347out');
function calc() {
  const q = parseFloat(q347.value);
  const r = minResidual(q);
  if (r === null) { q347out.innerHTML = 'Enter a Q<sub>347</sub> above zero. At zero there is no permanent flow and Art. 31 does not apply.'; return; }
  const pct = (100 * r / q).toFixed(0);
  q347out.innerHTML = `Minimum residual flow <b>${r.toLocaleString('de-CH', { maximumFractionDigits: 1 })} l/s</b>` +
    ` (${(r / 1000).toFixed(3)} m&#179;/s), which is ${pct}&#8201;% of Q<sub>347</sub>.` +
    (q > 60000 ? ' Q<sub>347</sub> is above 60 000 l/s, so the table is at its ceiling.' : '');
}
q347.addEventListener('input', calc);
calc();

const lawBox = document.getElementById('law');
document.getElementById('openLaw').onclick = () => { lawBox.hidden = false; };
document.getElementById('lawClose').onclick = () => { lawBox.hidden = true; };
lawBox.addEventListener('click', e => { if (e.target === lawBox) lawBox.hidden = true; });
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!lawBox.hidden) lawBox.hidden = true;
  else if (!panel.hidden) { panel.hidden = true; selected = null; }
});

load();
