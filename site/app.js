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
const DIV = ['#7a3f19', '#a85f28', '#c8813c', '#dda86d', '#7f7d78', '#8fb6de', '#4d90cc', '#2a6cb0', '#184f95'];
// Water temperature, 0 to 25 C. ONE hue, dark to light: a rising quantity, not a
// set of categories. The old ramp ran blue-green-yellow-red, which reads as four
// things. The 25 C ceiling of GSchV Annex 2 No. 12(4) is a status, not a value, so
// it is drawn as a rim on the gauge and stated in words in the legend. It is never
// carried by the ramp alone.
const TEMP = ['#9a5518', '#c4731f', '#dd9436', '#eeb96a', '#f8d79c'];

let mode = 'flow';
let wantMode = null;          // asked for in the hash, applied once its layer is ready
let glaciers = null;          // {glaciers[], pastRings[], length[], now, past}
let users = null;             // {hydro[], abstraction[], npp[], ara[]}, each point in world coords
let reservoirs = null;        // {dams[], totals, fill{weeks[], envelope[], max, latest}}
let residual = null;          // {points[], counts, datenstand}
let iceFrames = null;         // five dated states, each with a Path2D in world coords
let vintage = null;           // what every source is and how old it is
const useOn = { hydro: true, abstraction: true, npp: true, ara: true };

const LG = { flow: 'lgFlow', normal: 'lgNormal', temp: 'lgTemp', res: 'lgRes', ice: 'lgIce',
             residual: 'lgResidual', use: 'lgUse' };
const LGTITLE = { flow: 'Discharge', normal: 'Against the long-term mean', temp: 'Water temperature',
                  res: 'Reservoirs', ice: 'Ice, five surveys', residual: 'Minimum residual flow',
                  use: 'Who takes the water' };
const MODES = Object.keys(LG);

// Bone, not blue. A quantity the law states is not a quantity an instrument read,
// and the two must not be able to be confused at a glance. Every statutory figure
// on this map wears this colour and a serif; no measurement ever does.
const LAWINK = '#d9cbb0', LAWDIM = '#9c9282';
// The layers where the water is context and not the reading. The current is
// dimmed under them, never stopped: a river that froze the moment you asked a
// question about a dam would be a worse lie than a river drawn faintly.
const DIMWATER = new Set(['use', 'res', 'residual', 'ice']);
// The reservoir regions of the BFE filling statistic, in the column order of the
// weekly file. The statistic is published for these four and for nothing smaller.
const RESREG = ['vs', 'gr', 'ti', 'rest'];
const RESNAME = { vs: 'Valais', gr: 'Grisons', ti: 'Ticino', rest: 'the rest of Switzerland' };

// The use layer. A filled disc carries a quantity; an open ring carries a place and
// nothing more. That is the whole grammar, and it is forced by the sources: of the
// four federal registers only the hydropower statistic yields a discharge, and even
// that one yields it by arithmetic rather than by measurement.
// Two hues, not four. The axis that carries meaning is the direction of the
// transaction, because that is what the law turns on: Art. 31 GSchG governs taking
// water out, GSchV Annex 2 No. 12(4) governs putting heat in. Three or more hues
// cannot clear the all-pairs colour-vision floors on this surface; two clear them
// with room to spare (CVD dE 9.4, normal-vision dE 26.5). The register is therefore
// carried by the form of the mark and by the label, never by colour alone.
const USE_OUT = '#d95926';   // takes water out of the river
const USE_IN  = '#199e70';   // puts water into the river
const USE = {
  hydro:       { c: USE_OUT, label: 'Hydropower plant' },
  abstraction: { c: USE_OUT, label: 'Abstraction, residual-flow register' },
  npp:         { c: USE_OUT, label: 'Nuclear power station' },
  ara:         { c: USE_IN,  label: 'Wastewater treatment plant' },
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
  // Under the three register layers the water is context, not the reading. It is
  // dimmed and not removed: a dam, an abstraction or a minimum flow means nothing
  // without the river it is a fact about.
  if (mode === 'ice' || mode === 'temp' || mode === 'res' || mode === 'residual') {
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
  updateEvidence();          // true from the first frame: before the live read every
                             // reach carries its long-term mean and nothing more
  applyHash();
  requestAnimationFrame(frame);
  if (wantMode && setMode(wantMode)) wantMode = null;
  // None of these is needed to read a gauge, so none of them holds up the water.
  loadIce().then(loadIceHistory);
  loadUsers();
  loadReservoirs();
  loadResidual();
  loadVintage();
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
    if (wantMode === 'ice' && setMode('ice')) wantMode = null;
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
    if (wantMode === 'use' && setMode('use')) wantMode = null;
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
  const only = new RegExp('^#(' + MODES.join('|') + ')$').exec(location.hash);
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
    updateEvidence();
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
  updateEvidence();
}

// ---- the evidence bar -------------------------------------------------------
// The page's one claim about itself: most of what is drawn is inference. The bar is
// the drawing's own composition by class of evidence, counted, not asserted. It adds
// no fact; it counts the facts already on the map.
function updateEvidence() {
  let measured = 0, estimated = 0, none = 0;
  for (const r of reaches) {
    if (r.basis === 'measured') measured++;
    else if (r.basis === 'none') none++;
    else estimated++;
  }
  const total = measured + estimated + none;
  if (!total) return;
  const bar = document.getElementById('evBar');
  if (!bar) return;
  const seg = bar.children;
  seg[0].style.flex = measured;
  seg[1].style.flex = estimated;
  seg[2].style.flex = none;
  const n = v => v.toLocaleString('de-CH');
  document.getElementById('evNumMeasured').textContent = n(measured);
  document.getElementById('evNumEstimated').textContent = n(estimated);
  document.getElementById('evNumNone').textContent = n(none);
  bar.setAttribute('aria-label',
    `Of ${n(total)} reaches drawn, ${n(measured)} are measured at a gauge, ` +
    `${n(estimated)} are estimated for the reach, and ${n(none)} have no basis today.`);
  for (const [id, v] of [['evTdMeasured', measured], ['evTdEstimated', estimated],
                         ['evTdNone', none], ['evTdTotal', total]]) {
    const el = document.getElementById(id);
    if (el) el.textContent = n(v);
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
  // On a phone the header and the sheet own real estate at the top and the bottom,
  // and a country fitted to the whole viewport lands as a band in the middle with
  // black above and below it. Fit to the strip that is actually visible instead,
  // and let the width run nearly edge to edge: Switzerland is about 2.2 to 1, so on
  // a portrait screen the width is always the binding constraint.
  const box = fitBox();
  const availH = Math.max(80, H - box.t - box.b);
  const padX = isPhone() ? 0.99 : 0.94, padY = 0.94;
  view.k = Math.min(W / (x1 - x0) * padX, availH / (y1 - y0) * padY);
  K0 = view.k;
  view.x = W / 2 - view.k * (x0 + x1) / 2;
  // Held a little above centre on a phone, so the room that a 2.2-to-1 country
  // cannot fill on a portrait screen collects at the bottom, which is exactly where
  // the sheet opens into. Opening the legend then costs no map.
  view.y = box.t + availH * (isPhone() ? 0.4 : 0.5) - view.k * (y0 + y1) / 2;
}
// Everything here is looked up rather than closed over, because fit() runs during
// load and the furniture it measures is declared further down the file.
function fitBox() {
  // Only a portrait screen has this problem. In landscape the country and the
  // window are about the same shape and the furniture sits in the corners.
  if (!isPhone() && H <= W * 1.05) return { t: 0, b: 0 };
  const nav = document.getElementById('modes').getBoundingClientRect();
  const rb = document.getElementById('ribbon');
  const ribH = rb.hidden ? 0 : rb.offsetHeight + 10;
  const sheet = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 0;
  const navLow = nav.top > H / 2;              // narrow layouts put the switch at the foot
  const title = document.getElementById('titlebar').getBoundingClientRect();
  return {
    t: Math.max(0, navLow ? title.bottom : nav.bottom) + 6,
    b: (navLow ? Math.max(0, H - nav.top) : 0) + sheet + ribH + 8,
  };
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
    const col = reachColor(r);
    ctx.strokeStyle = col.c;
    ctx.globalAlpha = col.a * (mode === 'use' ? 0.5 : 1);
    ctx.lineWidth = lineWidth(r.live);
    ctx.stroke();
  }

  if (hovered?.kind === 'reach') {
    const r = hovered.ref;
    path(r);
    ctx.strokeStyle = '#cde2fb';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = lineWidth(r.live) + 1.6;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  if (mode === 'ice' && glaciers) drawIce();
  if (mode === 'res' && reservoirs) drawDams();
  if (mode === 'residual' && residual) drawResidual();
  if (mode === 'use') drawUsers();

  // The gauges belong to the layers the gauges answer. On a layer about dams, or
  // minimum flows, or ice, a hundred and ninety white rings are noise over the
  // subject, and one of them saying nothing about it is worse than noise.
  if (showStations && !DIMWATER.has(mode)) {
    ctx.globalAlpha = 1;
    for (const s of stations) {
      if (s.lon === null) continue;
      const x = sx(mercX(s.lon)), y = sy(mercY(s.lat));
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const live = s.q !== null && s.q !== undefined;
      const d = s.obs?.danger ?? null;
      const on = hovered?.kind === 'station' && hovered.ref === s;

      // Under the temperature layer the gauge carries the reading, so it is filled
      // from the temperature ramp. A gauge with no temperature series is left hollow
      // rather than coloured, because an absent reading is not a cold one. At or
      // above 25 C the statutory ceiling applies, and that is a status: it gets its
      // own rim, it is named in the legend, and it is never left to the ramp alone.
      if (mode === 'temp') {
        const t = s.obs?.temp;
        const has = t !== null && t !== undefined;
        ctx.beginPath();
        ctx.arc(x, y, on ? 6.4 : (has ? 4.2 : 2.2), 0, 6.2832);
        ctx.globalAlpha = 1;
        if (has) {
          ctx.fillStyle = tempColor(t);
          ctx.fill();
          ctx.lineWidth = t >= 25 ? 2 : 1;
          ctx.strokeStyle = t >= 25 ? '#d03b3b' : 'rgba(13,13,13,0.8)';
        } else {
          ctx.fillStyle = '#0d0d0d';
          ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#898781';
        }
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.arc(x, y, on ? 6 : (live ? 3.4 : 2.4), 0, 6.2832);
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
    fctx.globalAlpha = (r.est ? 0.34 : 0.7) * Math.min(1, p.age * 3) * (DIMWATER.has(mode) ? 0.2 : 1);
    // Under the against-normal layer the current itself carries the anomaly: a
    // reach running below its mean sends brown water down, a reach in spate blue.
    fctx.strokeStyle = mode === 'normal' && r.mean ? divColor(r.live / r.mean) : '#eaf4ff';
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
// One pointer pans, two pinch, a pointer that never moved is a tap. The canvas
// takes its own gestures through touch-action:none, so the page around it can
// still be pinched by anyone who needs the text bigger; only the map is captured.
let drag = null;
const ptrs = new Map();
let pinch = null;
const clampK = k => Math.max(K0 * 0.5, Math.min(K0 * 24, k));

// Anchor the zoom on a point in the world and keep that point under the cursor or
// under the midpoint of the two fingers, whichever is driving.
function zoomAbout(k2, cx, cy, from) {
  const k = clampK(k2), s = k / from.k;
  view.k = k;
  view.x = cx - (from.cx - from.vx) * s;
  view.y = cy - (from.cy - from.vy) * s;
  invalidate(); dirtyAlloc = true;
}
function twoFingers() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const t = twoFingers();
    pinch = { d: t.d, cx: t.cx, cy: t.cy, k: view.k, vx: view.x, vy: view.y };
    drag = null; cv.classList.remove('dragging');
  } else if (ptrs.size === 1) {
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, touch: e.pointerType !== 'mouse' };
    cv.classList.add('dragging');
  }
});
cv.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const t = twoFingers();
    zoomAbout(pinch.k * (t.d / pinch.d), t.cx, t.cy, pinch);
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.x = drag.vx + dx; view.y = drag.vy + dy;
    invalidate(); dirtyAlloc = true;
    return;
  }
  if (e.pointerType === 'mouse') pick(e.clientX, e.clientY);
});
function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size > 0) return;
  const was = drag;
  drag = null; cv.classList.remove('dragging');
  if (!was || was.moved) { writeHash(); return; }
  pick(e.clientX, e.clientY);
  select(hovered);
  // A finger leaves no cursor behind, so the highlight it lit has to go out with
  // it, or the map keeps showing a hover that nobody is making.
  if (was.touch) { hovered = null; tt.hidden = true; dirty = true; }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAbout(view.k * Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY,
            { k: view.k, cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y });
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
  if (mode === 'res' && reservoirs) {
    const d = pickDam(mx, my);
    if (hovered?.ref !== d) dirty = true;
    hovered = d ? { kind: 'dam', ref: d } : null;
    tip(mx, my); return;
  }
  if (mode === 'residual' && residual) {
    const p = pickResidual(mx, my);
    if (hovered?.ref !== p) dirty = true;
    hovered = p ? { kind: 'residual', ref: p } : null;
    tip(mx, my); return;
  }
  if (mode === 'ice') {
    const g = pickGlacier(mx, my);
    if (hovered?.ref !== g) dirty = true;
    if (g) { hovered = { kind: 'glacier', ref: g }; tip(mx, my); return; }
    hovered = null;
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
  if (hovered.kind === 'dam') {
    const d = hovered.ref;
    const lv = resLevels(resWeekIndex());
    const fl = isPowerDam(d) ? lv[d.g] : null;
    tt.innerHTML = `<div class="tName">${esc(d.n)}</div>` +
      `<div class="tVal">${d.v.toLocaleString('de-CH')} mio m&#179; when full</div>` +
      `<div class="tEst">${fl === null ? esc(d.a)
        : RESNAME[d.g] + ' ' + (100 * fl).toFixed(0) + ' % on ' + fmtDate(lv.d)}</div>`;
  } else if (hovered.kind === 'residual') {
    const p = hovered.ref;
    tt.innerHTML = `<div class="tName">${esc(p.w || 'unnamed watercourse')}${p.pl ? ', ' + esc(p.pl) : ''}</div>` +
      `<div class="tVal">Q<sub>347</sub> ${p.q === null ? '—' : esc(lps(p.q))}</div>` +
      `<div class="tLaw">Art. 31(1) minimum ${esc(lps(p.min))}</div>`;
  } else if (hovered.kind === 'glacier') {
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
    tt.innerHTML = `<div class="tName num">${fmtQ(r.live)} m³/s</div>` +
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

  if (h.kind === 'dam') { panelDam(h.ref, T, B, N, X); panel.hidden = false; return; }
  if (h.kind === 'residual') { panelResidual(h.ref, T, B, N, X); panel.hidden = false; return; }

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
      // The register carries no quantity at all, so on its own it can never reach
      // Art. 31. The nearest published Q347 is the only bridge there is, and it is
      // worth building as long as the panel keeps saying that it is a bridge.
      if (p.q347) {
        const mr = minResidual(p.q347);
        X.innerHTML = `<p class="statute">The nearest point where BAFU publishes Q<sub>347</sub> lies
          ${p.q347km.toFixed(2)} km away${p.q347same
            ? ' and the two records name the same watercourse'
            : ', and the two records do not name the same watercourse'}.
          There Q<sub>347</sub> is ${esc(lps(p.q347))}, so Art.&nbsp;31(1) would put the minimum at
          <b>${esc(lps(mr))}</b>. That figure belongs to that point and not to this abstraction, and it
          would bind only a new or renewed licence.</p>`;
      }
    } else if (p.kind === 'npp') {
      T.textContent = p.n;
      html += row('Operator', esc(p.o || '\u2014'), '');
      html += row('Status', esc(p.st ?? 'as the register has it'), '');
      if (p.since) html += row('Since', fmtDate(p.since), '');
      html += row('Cooling water', 'not published as open data', '');
      // The register still lists Muehleberg as a power station and its data state is
      // the day Muehleberg shut down. Correcting it openly, with the source, is the
      // only way to use the register without repeating its mistake.
      if (p.fix) {
        X.innerHTML = `<p class="aside"><b>The federal register is out of date here, and this page
          corrects it.</b> ${esc(p.fix)}` +
          (p.fixSrc ? ` <a href="${esc(p.fixSrc)}" target="_blank" rel="noopener">Operator's statement</a>.` : '') +
          ` The register's own data state is ${vintageOf('npp')} &mdash; which is to say the register was
          last refreshed on the day this station was switched off, and has carried it as operating ever
          since.</p>`;
      }
      note = `The federal dataset gives the site and the operator. It gives no cooling-water volume and
        no thermal load, and neither figure is published in any open federal series. They sit in the
        cantonal concession and in the operator's own environmental reporting.` +
        `<span class="statute">Cooling is where a heat question meets a water question, and the ordinance
        answers it with an exemption. GSchV Annex&nbsp;3.3 No.&nbsp;21(4)(b) holds once-through cooling to
        3&nbsp;°C of warming, 1.5&nbsp;°C in the trout region, and a 25&nbsp;°C ceiling &mdash; then adds
        that above 25&nbsp;°C the authority may allow an exception where the warming is at most
        0.01&nbsp;°C per discharge <b>or the discharge comes from an existing nuclear power station</b>.
        The general rule for thermally altered rivers is Annex&nbsp;2 No.&nbsp;12(4). This site sits under
        both.</span>`;
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
          alteration, so this reading raises the question and does not settle it.</p>` +
          `<p class="statute">If the heat here comes from once-through cooling, the ceiling is not the end
          of the analysis: GSchV Annex&nbsp;3.3 No.&nbsp;21(4)(b) lets the authority allow an exception
          above 25&nbsp;&deg;C where the warming is at most 0.01&nbsp;&deg;C per discharge, or where the
          discharge comes from an existing nuclear power station.</p>`;
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
// Motion is one switch. The current and the replays are both motion, and a reader
// who turned motion off did not mean only the particles.
document.getElementById('toggleMotion').onchange = e => {
  motion = e.target.checked;
  if (!motion) { clearFlow(); stopPlay(); }
  playBtn.disabled = !motion;
};
for (const el of document.querySelectorAll('#lgUse input[data-use]')) {
  el.onchange = () => { useOn[el.dataset.use] = el.checked; dirty = true; };
}
// A phone fires resize on every address-bar nudge, so the layout is done at once
// for the canvas, which must never be stretched, and again on a short trailing
// timer for the sheet, whose height is only settled after the reflow.
function relayout() {
  const wasFitted = K0 > 0 && Math.abs(view.k - K0) < K0 * 0.02;
  resize(); dirtyAlloc = true;
  // A view the reader has not zoomed is still the default view, so it should keep
  // following the furniture as the furniture moves. A view they have zoomed is
  // theirs, and re-fitting it out from under them would be rude.
  if (wasFitted) fit();
  // A tab that loads in the background, or a canvas that has no box yet when the
  // network comes back, fits the country into a scale of zero and draws nothing.
  // The moment there is a real box, fit again.
  if (!(view.k > 0)) fit();
  layoutSheet(); ribbonResize();
}
if (window.ResizeObserver) new ResizeObserver(() => relayout()).observe(cv);
let __relayoutT = 0;
window.addEventListener('resize', () => {
  relayout();
  clearTimeout(__relayoutT); __relayoutT = setTimeout(relayout, 120);
});
window.addEventListener('orientationchange', () => setTimeout(relayout, 280));

window.__fps = () => (__frames / Math.max(0.001, (performance.now() - __t0) / 1000)).toFixed(1);
window.__diag = () => {
  const t = { measured: 0, downstream: 0, upstream: 0, none: 0 };
  for (const r of reaches) t[r.basis]++;
  return { reaches: reaches.length, ...t, gauges: stations.filter(s => s.q !== null && s.q !== undefined).length };
};

// ---- layers -----------------------------------------------------------------
// One control, four readings of the same country. Switching a layer must never
// change a number; it changes which number the colour carries.
// One control, seven readings of the same country. Switching a layer must never
// change a number; it changes which number the colour carries.
const OWNS = { glacier: 'ice', use: 'use', dam: 'res', residual: 'residual' };
function setMode(m) {
  // Returns whether the layer was actually shown. A layer whose data is still on
  // the wire is not a layer that is empty, and the caller has to be able to tell
  // the difference so it can ask again when the data lands.
  const btn = document.querySelector('#modes button[data-mode="' + m + '"]');
  if (!btn || btn.disabled) return false;
  mode = m;
  // The sheets take their accent from the layer, so a checkbox or a focus ring in
  // the legend is in the colour of the thing the legend is about.
  document.body.dataset.layer = m;
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === m);
  for (const [k, id] of Object.entries(LG)) document.getElementById(id).hidden = k !== m;
  document.getElementById('legendTitle').textContent = LGTITLE[m];
  document.getElementById('sheetTitle').textContent = LGTITLE[m];
  // A selection made on one layer is a fact about that layer. Carrying a glacier
  // panel into the reservoir layer would leave a reading on screen that the map
  // beneath it no longer supports.
  for (const [kind, owner] of Object.entries(OWNS)) {
    if (selected?.kind === kind && m !== owner) { panel.hidden = true; selected = null; }
    if (hovered?.kind === kind && m !== owner) hovered = null;
  }
  const nav = document.getElementById('modes');
  if (nav.scrollWidth > nav.clientWidth + 4) {
    nav.scrollTo({ left: btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }
  setRibbon(m);
  clearFlow();
  dirty = true;
  return true;
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

const MODALS = ['law', 'sources'].map(id => document.getElementById(id));
const openModal = id => { document.getElementById(id).hidden = false; };
const closeModals = () => { let any = false; for (const m of MODALS) { if (!m.hidden) any = true; m.hidden = true; } return any; };
document.getElementById('openLaw').onclick = () => openModal('law');
document.getElementById('openSources').onclick = () => openModal('sources');
for (const b of document.querySelectorAll('.modalClose[data-close]')) b.onclick = () => closeModals();
for (const m of MODALS) m.addEventListener('click', e => { if (e.target === m) closeModals(); });
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (closeModals()) return;
  if (!panel.hidden) { panel.hidden = true; selected = null; dirty = true; }
});

/* ===========================================================================
   RESERVOIRS
   Two registers that do not describe the same objects, and the map has to hold
   both without letting either borrow the other's authority.

   The dams are structures: 225 of them under federal supervision, each with the
   volume its reservoir holds when full. That is a fixed property and it is drawn
   as one, by area.

   The filling level is a weekly figure in gigawatt hours, published for four
   regions and for nothing smaller, since 3 January 2000. So the tint on a disc
   is its REGION's level that week, applied identically to every dam in the
   region. Fifty-four Valais dams therefore move as one body, which is the point:
   the eye should read a region changing, not a reservoir being measured. Nobody
   publishes how full the Grande Dixence is today, and this layer does not
   pretend to.
   =========================================================================== */
const RESRAMP = ['#22333d', '#2b5560', '#377f81', '#4da8a2', '#7fd4d0', '#aeeae5'];
const resColor = f => stepColor(RESRAMP, f);

async function loadReservoirs() {
  try {
    const j = await fetch('data/reservoirs.json').then(r => r.json());
    for (const d of j.dams) { d.wx = mercX(d.x); d.wy = mercY(d.y); d.kind = 'dam'; }
    // biggest last, so a 385 mio m3 disc is never hidden under a farm pond
    j.dams.sort((a, b) => a.v - b.v);
    reservoirs = j;
    document.getElementById('modeRes').disabled = false;
    if (wantMode === 'res' && setMode('res')) wantMode = null;
    resLegend();
  } catch (e) {
    document.getElementById('resTotals').textContent = 'Reservoir layer failed to load: ' + e.message;
  }
}

function resLegend() {
  const t = reservoirs.totals, f = reservoirs.fill, L = f.latest;
  document.getElementById('resTotals').innerHTML =
    `${t.count} dams under federal supervision hold ${t.volumeMioM3.toLocaleString('de-CH')}&nbsp;million m&#179; ` +
    `when full. Valais ${t.byRegion.vs.v.toLocaleString('de-CH')}, Grisons ${t.byRegion.gr.v.toLocaleString('de-CH')}, ` +
    `Ticino ${t.byRegion.ti.v.toLocaleString('de-CH')}, the rest ${t.byRegion.rest.v.toLocaleString('de-CH')}.`;
  document.getElementById('resRank').innerHTML =
    `<b>${fmtDate(L.d)}: ${L.pct.toFixed(1)}&#8201;% full, ${L.gwh.toLocaleString('de-CH')} of ` +
    `${L.max.toLocaleString('de-CH')}&nbsp;GWh.</b> Against the same calendar week in every year since 2000, ` +
    `that is ${esc(L.rank)}.`;
}

// area with the volume, so a reservoir ten times the size looks ten times the
// size rather than ten times as wide
const damRadius = d => 2 + 9 * Math.sqrt(Math.max(0.05, d.v) / 385);
const isPowerDam = d => d.a === 'Hydroelektrizität';

function resWeekIndex() {
  const n = reservoirs.fill.weeks.length;
  const pos = ribbon.mode === 'res' ? ribbon.pos : ribbon.by.res;
  return Math.max(0, Math.min(n - 1, Math.round(pos * (n - 1))));
}
function resLevels(i) {
  const w = reservoirs.fill.weeks[i], mx = reservoirs.fill.max;
  const out = { d: w[0], pct: w[1], gwh: w[2] };
  RESREG.forEach((g, k) => { out[g] = mx[g] ? w[3 + k] / mx[g] : null; out[g + 'Gwh'] = w[3 + k]; });
  return out;
}

function drawDams() {
  const z = Math.min(2.4, Math.max(0.8, Math.sqrt(zoom())));
  const lv = resLevels(resWeekIndex());
  for (const d of reservoirs.dams) {
    const x = sx(d.wx), y = sy(d.wy);
    if (x < -24 || y < -24 || x > W + 24 || y > H + 24) continue;
    const on = hovered?.kind === 'dam' && hovered.ref === d;
    const r = damRadius(d) * z * (on ? 1.4 : 1);
    const f = isPowerDam(d) ? lv[d.g] : null;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = '#0d0d0d';
    ctx.fill();
    if (f !== null && isFinite(f)) {
      ctx.globalAlpha = on ? 1 : 0.88;
      ctx.fillStyle = resColor(f);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = on ? 2 : Math.min(1.4, 0.4 + r * 0.14);
    // A dam built to hold a flood back is not a store of energy and is not in the
    // weekly statistic. It gets no tint, because it has no level to show.
    ctx.strokeStyle = f === null ? 'rgba(143,155,179,0.85)' : (on ? '#f2fffe' : 'rgba(174,234,229,0.7)');
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function pickDam(mx, my) {
  const z = Math.min(2.4, Math.max(0.8, Math.sqrt(zoom())));
  let best = null, bd = Infinity;
  for (const d of reservoirs.dams) {
    const dx = sx(d.wx) - mx, dy = sy(d.wy) - my;
    const dist = Math.hypot(dx, dy) - damRadius(d) * z;
    if (dist < 6 && dist < bd) { bd = dist; best = d; }
  }
  return best;
}

function panelDam(d, T, B, N, X) {
  const lv = resLevels(resWeekIndex());
  const f = isPowerDam(d) ? lv[d.g] : null;
  const share = 100 * d.v / reservoirs.totals.volumeMioM3;
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  T.textContent = d.n;
  let html = '';
  if (d.rn && d.rn !== d.n) html += row('Reservoir', esc(d.rn), '');
  html += row('Type', esc(d.t), '');
  html += row('Purpose', esc(d.a), '');
  html += row('Volume when full', d.v.toLocaleString('de-CH'), 'mio m³');
  html += row('Share of all Swiss storage', share < 0.1 ? '<0.1' : share.toFixed(1), '%');
  if (d.h) html += row('Height', d.h.toLocaleString('de-CH'), 'm');
  if (d.cl) html += row('Crest length', d.cl.toLocaleString('de-CH'), 'm');
  if (d.ce) html += row('Crest level', d.ce.toLocaleString('de-CH'), 'm');
  if (d.il) html += row('Lowest outlet', d.il.toLocaleString('de-CH'), 'm');
  if (d.b) html += row('In service since', d.b, '');
  html += row('Canton', esc(d.c ?? '—'), '');
  B.innerHTML = html;

  X.innerHTML = f === null
    ? `<p class="aside">This structure is not in the weekly filling statistic. That statistic counts the
       energy stored in the reservoirs of the power industry, and a dam built to hold back a flood, to
       raise a river for a run-of-river plant or to supply drinking water stores no energy to count.</p>`
    : `<p class="aside"><b>${RESNAME[d.g][0].toUpperCase() + RESNAME[d.g].slice(1)} stood at
       ${(100 * f).toFixed(1)}&#8201;% on ${fmtDate(lv.d)}</b>, ${Math.round(lv[d.g + 'Gwh']).toLocaleString('de-CH')}
       of ${reservoirs.fill.max[d.g].toLocaleString('de-CH')}&nbsp;GWh. That is the region's figure and it is
       the smallest unit anyone publishes. It is shown on this dam because this dam is in that region, not
       because anyone measured this reservoir.</p>`;

  N.innerHTML = `Structure and volume from the BFE register of dams under federal supervision,
    data state ${vintageOf('dams')}. Filling level from the BFE weekly series, ${fmtDate(reservoirs.fill.from)}
    to ${fmtDate(reservoirs.fill.to)}, in gigawatt hours &mdash; <b>stored electricity, not stored
    water</b>. The two figures on this panel come from two files that share no key: the volume is this
    dam's, the percentage is its region's. Reservoir operation is governed by the concession and, where
    the reservoir feeds an abstraction, by the residual-flow regime; neither is in either file.`;
}

/* ===========================================================================
   MINIMUM RESIDUAL FLOW, GSchG Art. 31(1)
   The statute is normally met as a calculator: type a Q347, read a minimum. But
   BAFU publishes Q347 at 1 041 points, so the minimum can be computed at every
   one of them and the statute can be drawn instead of typed.

   These points wear bone and not blue. A minimum residual flow is a quantity a
   text requires, not a quantity an instrument read, and on a map full of
   readings that difference has to survive a glance.
   =========================================================================== */
const RESIDUAL_SRC = {
  q8493: 'the 1984–1993 decade',
  qp: 'the full record period',
  qmod: 'modelled, a rough estimate',
};
const residualRadius = p => 1.7 + 2.1 * Math.log10(1 + (p.min ?? 0) / 10);
const residualMeasured = p => p.src === 'q8493' || p.src === 'qp';

async function loadResidual() {
  try {
    const j = await fetch('data/residual.json').then(r => r.json());
    for (const p of j.points) { p.wx = mercX(p.x); p.wy = mercY(p.y); p.kind = 'residual'; }
    j.points.sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
    residual = j;
    document.getElementById('modeResidual').disabled = false;
    if (wantMode === 'residual' && setMode('residual')) wantMode = null;
    const c = j.counts;
    document.getElementById('residualCount').innerHTML =
      `${c.total.toLocaleString('de-CH')} points where BAFU publishes Q<sub>347</sub>. ` +
      `${(c.bySource.q8493 + c.bySource.qp).toLocaleString('de-CH')} come from gauge records ` +
      `(${c.bySource.q8493} from the 1984&#8211;1993 decade), ${c.bySource.qmod} are modelled and ` +
      `${c.bySource.none} carry no value at all. The minimum is computed from Art.&nbsp;31(1) at ` +
      `${c.withQ347.toLocaleString('de-CH')} of them.`;
  } catch (e) {
    document.getElementById('residualCount').textContent = 'Residual-flow layer failed to load: ' + e.message;
  }
}

function drawResidual() {
  const z = Math.min(2.2, Math.max(0.8, Math.sqrt(zoom())));
  for (const p of residual.points) {
    if (p.min === null) continue;      // no Q347 here, and an absence is not a zero
    const x = sx(p.wx), y = sy(p.wy);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const on = hovered?.kind === 'residual' && hovered.ref === p;
    const r = residualRadius(p) * z * (on ? 1.5 : 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    if (residualMeasured(p)) {
      ctx.globalAlpha = on ? 1 : 0.82;
      ctx.fillStyle = LAWINK; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(13,13,13,0.8)'; ctx.stroke();
    } else {
      ctx.fillStyle = '#0d0d0d'; ctx.fill();
      ctx.lineWidth = on ? 2 : 1.2;
      ctx.strokeStyle = on ? LAWINK : LAWDIM; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function pickResidual(mx, my) {
  const z = Math.min(2.2, Math.max(0.8, Math.sqrt(zoom())));
  let best = null, bd = Infinity;
  for (const p of residual.points) {
    if (p.min === null) continue;
    const dx = sx(p.wx) - mx, dy = sy(p.wy) - my;
    const d = Math.hypot(dx, dy) - residualRadius(p) * z;
    if (d < 6 && d < bd) { bd = d; best = p; }
  }
  return best;
}

const lps = v => v >= 1000 ? (v / 1000).toLocaleString('de-CH', { maximumFractionDigits: 2 }) + ' m³/s'
                           : v.toLocaleString('de-CH', { maximumFractionDigits: 1 }) + ' l/s';

function panelResidual(p, T, B, N, X) {
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  // the statutory rows wear the serif and the bone, so that the one quantity on
  // this panel that no instrument produced cannot be mistaken for one that was
  const law = (k, v, u) => `<dt class="statutory">${k}</dt><dd class="statutory">${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  T.textContent = (p.w || 'Watercourse without a name') + (p.pl ? ', ' + p.pl : '');
  let html = '';
  html += row('Q<sub>347</sub>', p.q === null ? '—' : lps(p.q), '');
  html += row('Basis', esc(RESIDUAL_SRC[p.src] ?? 'none published'), '');
  if (p.p) html += row('Record period', esc(p.p), '');
  if (p.lhg) html += row('BAFU gauge', esc(p.lhg), '');
  if (p.ar) html += row('Catchment, register', p.ar.toLocaleString('de-CH'), 'km²');
  if (p.reachArea) html += row('Catchment, river network', p.reachArea.toLocaleString('de-CH'), 'km²');
  if (p.mean !== null && p.mean !== undefined) html += row('Long-term mean of the reach', fmtQ(p.mean), 'm³/s');
  if (p.min !== null) {
    html += law('Minimum under Art. 31(1)', lps(p.min), '');
    if (p.q) html += law('As a share of Q<sub>347</sub>', (100 * p.min / p.q).toFixed(0), '%');
  }
  B.innerHTML = html;

  let extra = '';
  if (p.min !== null) {
    extra += `<p class="statute">Art.&nbsp;31(1) GSchG would require <b>${lps(p.min)}</b> to remain in
      this bed below an abstraction. That is the floor. Art.&nbsp;31(2) requires it to be <b>raised</b>
      where water quality, groundwater recharge, rare habitats, fish passage or the spawning function of
      a small stream are not otherwise secured, and Art.&nbsp;33 raises it further on a weighing of
      interests. It may be set lower only in the closed list of cases in Art.&nbsp;32.</p>`;
  }
  // The register's catchment and the network's catchment are two independent
  // statements about the same place. Where they disagree by more than a factor of
  // two the snap is probably on the wrong watercourse, and saying so is cheaper
  // than a silent wrong answer.
  if (p.ar && p.reachArea) {
    const f = p.reachArea / p.ar;
    if (f > 2 || f < 0.5) {
      extra += `<p class="flag">The catchment BAFU records for this point and the catchment of the river
        reach it was snapped to differ by a factor of ${(f > 1 ? f : 1 / f).toFixed(1)}. The point is
        probably matched to the wrong watercourse, so treat the reach figures on this panel as unverified.</p>`;
    }
  }
  X.innerHTML = extra;

  N.innerHTML = `Q<sub>347</sub> from the BAFU basis for determining residual flows, federal data state
    ${vintageOf('q347')}; the minimum is computed here from the table in Art.&nbsp;31(1) GSchG.
    <b>This is what the statute would require of a new abstraction at this point. It is not a duty owed
    today by anyone already taking water here.</b> Arts.&nbsp;29&#8211;36 attach to an abstraction that
    needs a new permit or concession. An abstraction running under a concession already granted is
    governed by the restoration regime of Arts.&nbsp;80&#8211;83, which reaches only as far as it can
    without compensable interference in existing water rights &mdash; and which is why the operative
    moment for most Swiss plants is the day their concession expires, not today.`;
}

/* ===========================================================================
   ICE, FIVE SURVEYS
   1850, 1931, 1973, 2010, 2023. The intervals are 81, 42, 37 and 13 years, and
   the ribbon holds each frame for its own interval, so the acceleration is in
   the motion and not only in the caption. Between two surveys the outline is
   interpolated by dissolve, which is honest about there being no measurement in
   between: what you are watching there is arithmetic, not a survey.
   =========================================================================== */
const ICE_Y0 = 1850, ICE_Y1 = 2023;

async function loadIceHistory() {
  if (!glaciers) return;
  try {
    const j = await fetch('data/icehistory.json').then(r => r.json());
    const P = j.p;
    for (const f of j.frames) {
      if (f.from === 'glaciers.pastRings') { f.path = glaciers.pathPast; continue; }
      if (f.from === 'glaciers.bodies') { f.path = glaciers.pathNow; continue; }
      const path = new Path2D();
      for (const [xs, ys] of f.rings) {
        let x = 0, y = 0;
        for (let i = 0; i < xs.length; i++) {
          x += xs[i]; y += ys[i];
          const px = mercX(x / P), py = mercY(y / P);
          if (i) path.lineTo(px, py); else path.moveTo(px, py);
        }
        path.closePath();
      }
      f.path = path;
      f.rings = null;                 // 480 kB of deltas, no longer needed
    }
    iceFrames = j.frames;
    if (mode === 'ice') setRibbon('ice');
    const F = iceFrames;
    const worst = F.slice(1).map((b, i) => ({ a: F[i], b, rate: (F[i].km2 - b.km2) / (b.y - F[i].y) }))
                            .reduce((x, y) => (y.rate > x.rate ? y : x));
    document.getElementById('iceTotals').innerHTML =
      `${F[0].km2.toLocaleString('de-CH')}&nbsp;km&#178; in ${F[0].y}, ` +
      `${F.at(-1).km2.toLocaleString('de-CH')}&nbsp;km&#178; in ${F.at(-1).y}. ` +
      `<b>${(100 * (1 - F.at(-1).km2 / F[0].km2)).toFixed(0)}&#8201;% of the area is gone.</b> ` +
      `The fastest interval on record is ${worst.a.y}&#8211;${worst.b.y}, at ` +
      `${worst.rate.toFixed(1)}&nbsp;km&#178; a year.`;
  } catch (e) { /* the two-state layer still works without the sequence */ }
}

function iceYear() { return ICE_Y0 + (ribbon.mode === 'ice' ? ribbon.pos : ribbon.by.ice) * (ICE_Y1 - ICE_Y0); }
function iceAt(y) {
  const F = iceFrames;
  if (!F) return null;
  if (y <= F[0].y) return { a: F[0], b: null, t: 0, km2: F[0].km2, exact: true };
  for (let i = 1; i < F.length; i++) {
    if (y <= F[i].y) {
      const a = F[i - 1], b = F[i], t = (y - a.y) / (b.y - a.y);
      return { a, b, t, km2: a.km2 + (b.km2 - a.km2) * t, exact: t === 0 || t === 1 };
    }
  }
  const l = F.at(-1);
  return { a: l, b: null, t: 0, km2: l.km2, exact: true };
}

function drawIce() {
  const st = iceAt(iceYear());
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(view.x, view.y);
  ctx.scale(view.k, view.k);
  ctx.lineWidth = 1 / view.k;
  ctx.lineJoin = 'round';

  // what there was, always: the 1850 outline, under everything
  ctx.fillStyle = 'rgba(200,129,60,0.17)';
  ctx.fill(glaciers.pathPast, 'evenodd');
  ctx.strokeStyle = 'rgba(200,129,60,0.5)';
  ctx.stroke(glaciers.pathPast);

  // what there is at the playhead
  ctx.fillStyle = '#dce9f8';
  if (!st) { ctx.globalAlpha = 0.92; ctx.fill(glaciers.pathNow, 'evenodd'); }
  else {
    if (st.t < 1 && st.a.path) { ctx.globalAlpha = 0.92 * (1 - st.t); ctx.fill(st.a.path, 'evenodd'); }
    if (st.t > 0 && st.b?.path) { ctx.globalAlpha = 0.92 * st.t; ctx.fill(st.b.path, 'evenodd'); }
  }
  if (hovered?.kind === 'glacier' && hovered.ref.path) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fab219';
    ctx.lineWidth = 1.8 / view.k;
    ctx.stroke(hovered.ref.path);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ===========================================================================
   THE TIME RIBBON
   Empty on the layers that describe only now. On the layers that describe a
   change it carries the record itself: twenty-six years of weekly filling, or
   five glacier surveys on a real time axis. It is a chart and a control at once,
   and the map is bound to its playhead.
   =========================================================================== */
const RESNOTE = `Weekly since 3 January 2000, in gigawatt hours: <b>stored electricity, not stored
  water.</b> Published for four regions and for nothing smaller, so the tint on every dam of a region is
  the same figure. The line is the national level; the band behind it is the tenth to the ninetieth
  percentile of the same calendar week across the record.`;
const ICENOTE = `Five dated inventories, held in their real intervals: 81, 42, 37 and 13 years. Between
  two surveys the outline is interpolated, so what moves there is arithmetic and not a measurement.
  <b>This is area.</b> The ice thinned faster than it shrank in plan, so these rates are not the rate of
  ice loss.`;

const ribbon = { mode: null, pos: 1, by: { res: 1, ice: 1 }, playing: false };
const RIBDUR = { res: 34000, ice: 17000 };      // ms for one full pass
const ribbonEl = document.getElementById('ribbon');
const rcv = document.getElementById('ribbonCv');
const rctx = rcv.getContext('2d');
const scrub = document.getElementById('scrub');
const playBtn = document.getElementById('play');
const playIcon = playBtn.querySelector('path');
const playLabel = document.getElementById('playLabel');

function setRibbon(m) {
  const kind = (m === 'res' && reservoirs) ? 'res' : (m === 'ice' && iceFrames) ? 'ice' : null;
  stopPlay();
  ribbon.mode = kind;
  ribbonEl.hidden = !kind;
  // The ribbon and the credits want the same corner. The record wins while it is
  // on screen; the attribution is in Sources and their age either way.
  document.body.classList.toggle('hasRibbon', !!kind);
  if (isPhone() && K0 > 0 && Math.abs(view.k - K0) < K0 * 0.02) fit();
  if (kind) {
    ribbon.pos = ribbon.by[kind];
    scrub.value = Math.round(ribbon.pos * 1000);
    document.getElementById('ribbonTitle').textContent =
      kind === 'res' ? 'Filling level, weekly since 2000' : 'Glacier area, five surveys';
    document.getElementById('ribbonNote').innerHTML = kind === 'res' ? RESNOTE : ICENOTE;
    ribbonResize();
    readRibbon();
  }
  layoutSheet();
}

function ribbonResize() {
  if (ribbonEl.hidden) return;
  const w = rcv.clientWidth, h = rcv.clientHeight;
  if (!w || !h) return;
  rcv.width = Math.round(w * dpr); rcv.height = Math.round(h * dpr);
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRibbon();
}

function drawRibbon() {
  if (!ribbon.mode || ribbonEl.hidden) return;
  const w = rcv.clientWidth, h = rcv.clientHeight;
  if (!w || !h) return;
  rctx.clearRect(0, 0, w, h);
  const pl = 2, pr = 2, pt = 5, pb = 13;
  const px = t => pl + (w - pl - pr) * t;
  const py = v => pt + (h - pt - pb) * (1 - v);

  rctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  rctx.textBaseline = 'top';

  if (ribbon.mode === 'res') {
    const ws = reservoirs.fill.weeks, env = reservoirs.fill.envelope;
    const n = ws.length;
    // the envelope of the record, laid under the series week by week, so the line
    // is always read against what that same week has been before
    rctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const e = env[isoWeekIndex(ws[i][0])];
      if (!e) continue;
      const X = px(i / (n - 1)), Y = py(e.p90 / 100);
      started ? rctx.lineTo(X, Y) : (rctx.moveTo(X, Y), started = true);
    }
    for (let i = n - 1; i >= 0; i--) {
      const e = env[isoWeekIndex(ws[i][0])];
      if (!e) continue;
      rctx.lineTo(px(i / (n - 1)), py(e.p10 / 100));
    }
    rctx.closePath();
    rctx.fillStyle = 'rgba(127,212,208,0.13)';
    rctx.fill();

    const grad = rctx.createLinearGradient(0, pt, 0, h - pb);
    grad.addColorStop(0, 'rgba(127,212,208,0.30)');
    grad.addColorStop(1, 'rgba(127,212,208,0.02)');
    rctx.beginPath();
    rctx.moveTo(px(0), py(0));
    for (let i = 0; i < n; i++) rctx.lineTo(px(i / (n - 1)), py(ws[i][1] / 100));
    rctx.lineTo(px(1), py(0));
    rctx.closePath();
    rctx.fillStyle = grad; rctx.fill();

    rctx.beginPath();
    for (let i = 0; i < n; i++) {
      const X = px(i / (n - 1)), Y = py(ws[i][1] / 100);
      i ? rctx.lineTo(X, Y) : rctx.moveTo(X, Y);
    }
    rctx.strokeStyle = '#7fd4d0'; rctx.lineWidth = 1; rctx.stroke();

    rctx.fillStyle = '#898781';
    const y0 = +ws[0][0].slice(0, 4), y1 = +ws[n - 1][0].slice(0, 4);
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) {
      const i = ws.findIndex(r => r[0].slice(0, 4) === String(y));
      if (i < 0) continue;
      const X = px(i / (n - 1));
      rctx.fillRect(X, h - pb + 1, 1, 3);
      const t = String(y), tw = rctx.measureText(t).width;
      if (X + 3 + tw <= w) rctx.fillText(t, X + 3, h - pb + 2);   // measure, do not guess
    }
    ribbonHead(px(resWeekIndex() / (n - 1)), py(ws[resWeekIndex()][1] / 100), h, pt, pb, '#eafffe');
  } else {
    const F = iceFrames;
    const X = y => px((y - ICE_Y0) / (ICE_Y1 - ICE_Y0));
    const top = F[0].km2 * 1.06;
    const Y = a => py(a / top);
    rctx.beginPath();
    rctx.moveTo(X(F[0].y), py(0));
    for (const f of F) rctx.lineTo(X(f.y), Y(f.km2));
    rctx.lineTo(X(F.at(-1).y), py(0));
    rctx.closePath();
    rctx.fillStyle = 'rgba(220,233,248,0.10)'; rctx.fill();

    rctx.beginPath();
    for (const [i, f] of F.entries()) i ? rctx.lineTo(X(f.y), Y(f.km2)) : rctx.moveTo(X(f.y), Y(f.km2));
    rctx.strokeStyle = '#dce9f8'; rctx.lineWidth = 1.3; rctx.stroke();

    for (const f of F) {
      rctx.beginPath(); rctx.arc(X(f.y), Y(f.km2), 2.6, 0, 6.2832);
      rctx.fillStyle = '#0d0d0d'; rctx.fill();
      rctx.lineWidth = 1.3; rctx.strokeStyle = '#dce9f8'; rctx.stroke();
    }
    rctx.fillStyle = '#898781';
    for (const [i, f] of F.entries()) {
      const lx = Math.max(0, Math.min(w - 20, X(f.y) - (i === 0 ? 0 : i === F.length - 1 ? 20 : 10)));
      rctx.fillText(String(f.y), lx, h - pb + 2);
    }
    const st = iceAt(iceYear());
    ribbonHead(X(iceYear()), Y(st.km2), h, pt, pb, '#ffffff');
  }
}

function ribbonHead(x, y, h, pt, pb, col) {
  rctx.strokeStyle = 'rgba(255,255,255,0.4)';
  rctx.lineWidth = 1;
  rctx.beginPath(); rctx.moveTo(x, pt - 3); rctx.lineTo(x, h - pb); rctx.stroke();
  rctx.beginPath(); rctx.arc(x, y, 3.4, 0, 6.2832);
  rctx.fillStyle = col; rctx.fill();
  rctx.strokeStyle = '#0d0d0d'; rctx.lineWidth = 1.2; rctx.stroke();
}

// The envelope is indexed by week of the year, so a date has to be turned back
// into one. The series is weekly from a Monday, which makes this a count of whole
// weeks since 1 January and not an ISO week number; the envelope was built the
// same way, so the two agree.
function isoWeekIndex(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.min(52, Math.floor((d.getTime() - start) / 604800000));
}
const fmtDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

function readRibbon() {
  const out = document.getElementById('ribbonRead');
  if (ribbon.mode === 'res') {
    const i = resWeekIndex(), lv = resLevels(i);
    const e = reservoirs.fill.envelope[isoWeekIndex(lv.d)];
    const band = !e ? '' : lv.pct < e.p10 ? ' · below the tenth percentile for this week'
                        : lv.pct > e.p90 ? ' · above the ninetieth' : '';
    out.textContent = `${fmtDate(lv.d)} · ${lv.pct.toFixed(1)} % · ${lv.gwh.toLocaleString('de-CH')} GWh${band}`;
  } else if (ribbon.mode === 'ice') {
    const y = iceYear(), st = iceAt(y);
    out.textContent = st.exact
      ? `${Math.round(y)} survey · ${st.km2.toLocaleString('de-CH')} km²`
      : `${Math.round(y)} · about ${Math.round(st.km2).toLocaleString('de-CH')} km², between the ${st.a.y} and ${st.b.y} surveys`;
  }
}

let playRAF = 0, playLast = 0, mapAt = 0;
function stepPlay(ts) {
  if (!ribbon.playing) return;
  const dt = playLast ? Math.min(80, ts - playLast) : 16;
  playLast = ts;
  ribbon.pos = Math.min(1, ribbon.pos + dt / RIBDUR[ribbon.mode]);
  ribbon.by[ribbon.mode] = ribbon.pos;
  scrub.value = Math.round(ribbon.pos * 1000);
  readRibbon(); drawRibbon();
  // The ribbon runs at the display's rate; the map follows at about twenty frames
  // a second. Redrawing eight thousand reaches sixty times a second to move a
  // dam's tint by a percent is work nobody can see.
  if (ts - mapAt > 48) { dirty = true; mapAt = ts; }
  if (ribbon.pos >= 1) { dirty = true; stopPlay(); return; }
  playRAF = requestAnimationFrame(stepPlay);
}
function startPlay() {
  if (!ribbon.mode) return;
  if (ribbon.pos >= 1) ribbon.pos = 0;      // at the end, play means play again
  ribbon.playing = true; playLast = 0;
  playIcon.setAttribute('d', 'M1 1h3.5v12H1z M7.5 1H11v12H7.5z');
  playLabel.textContent = 'Pause';
  playBtn.setAttribute('aria-label', 'Pause');
  playRAF = requestAnimationFrame(stepPlay);
}
function stopPlay() {
  ribbon.playing = false;
  cancelAnimationFrame(playRAF);
  playIcon.setAttribute('d', 'M1 1l10 6-10 6z');
  playLabel.textContent = 'Play';
  playBtn.setAttribute('aria-label', 'Play');
}
playBtn.onclick = () => (ribbon.playing ? stopPlay() : startPlay());
scrub.addEventListener('input', () => {
  stopPlay();
  ribbon.pos = +scrub.value / 1000;
  if (ribbon.mode) ribbon.by[ribbon.mode] = ribbon.pos;
  readRibbon(); drawRibbon(); dirty = true;
});

/* ===========================================================================
   SOURCES AND THEIR AGE
   A geoportal draws a register from 2004 and a reading from ten minutes ago in
   the same crisp style, and nothing in the picture says which is which. So the
   page states the age of every source it uses, and the dates are fetched from
   the federal legend endpoints at build time rather than remembered here.
   =========================================================================== */
async function loadVintage() {
  try {
    vintage = await fetch('data/vintage.json').then(r => r.json());
    renderVintage();
  } catch (e) {
    document.getElementById('vintageTable').textContent = 'The source list failed to load: ' + e.message;
  }
}
const vintageOf = key => {
  const s = vintage?.sources.find(x => x.key === key);
  return s?.datenstand ? fmtDate(s.datenstand) : 'unstated';
};
function ageText(days) {
  if (days === null || days === undefined) return 'live';
  if (days < 45) return days + (days === 1 ? ' day' : ' days');
  if (days < 400) return Math.round(days / 30.4) + ' months';
  return (days / 365.25).toFixed(1) + ' years';
}
function renderVintage() {
  const rows = vintage.sources.slice().sort((a, b) => (a.ageDays ?? -1) < (b.ageDays ?? -1) ? 1 : -1);
  const worst = Math.max(...rows.map(r => r.ageDays ?? 0)) || 1;
  const stale = new Set(vintage.staleKeys);
  document.getElementById('vintageTable').innerHTML = rows.map(s => {
    const cls = s.live ? 'isLive' : stale.has(s.key) ? 'isStale' : '';
    const w = Math.max(1, Math.round(100 * (s.ageDays ?? 0) / worst));
    return `<div class="vRow ${cls}">
      <div>
        <div class="vName">${esc(s.name)}<span class="vCls">${esc(s.cls)}</span></div>
        <div class="vHolder">${esc(s.holder)} · ${esc(s.cadence)}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">source</a>` : ''}</div>
      </div>
      <div class="vAge">${ageText(s.ageDays)}<b>${s.datenstand ? 'state ' + fmtDate(s.datenstand) : 'read live'}</b></div>
      <div class="vBar"><i style="width:${w}%"></i></div>
      <div class="vNote">${esc(s.note)}</div>
    </div>`;
  }).join('');
  const n = rows.filter(s => (s.ageDays ?? 0) > 1826).length;
  document.getElementById('vintageBuilt').innerHTML =
    `Data states read from the federal legend endpoints on ${fmtDate(vintage.built)}. ` +
    `<b>${n} of ${rows.length} sources are more than five years old.</b> Licences: each source above, ` +
    `on its own terms. Nothing here is a forecast and nothing here is a finding of breach.`;
}

/* ===========================================================================
   THE SHEET
   On a phone the legend stops being a floating card and becomes a bottom sheet.
   It opens to the layer it is describing and closes to a handle, and the ribbon
   rides above whichever of the two it is.
   =========================================================================== */
function isPhone() { return window.matchMedia('(max-width: 700px)').matches; }
let sheetOpen = false;
const legendEl = document.getElementById('legend');
const handleEl = document.getElementById('sheetHandle');

function layoutSheet() {
  const root = document.documentElement;
  // The title block grows and shrinks with the screen: the subtitle appears at
  // 1500 px and the evidence bar only where there is room for it. So its height is
  // measured rather than assumed, and the legend below is given what is left.
  const tb = document.getElementById('titlebar').getBoundingClientRect();
  root.style.setProperty('--title-h', Math.round(tb.bottom) + 'px');
  if (!isPhone()) {
    legendEl.style.transform = '';
    legendEl.classList.remove('collapsed');
    root.style.setProperty('--sheet-h', '0px');
    return;
  }
  const hh = handleEl.offsetHeight || 46;
  legendEl.classList.toggle('collapsed', !sheetOpen);
  legendEl.style.transform = sheetOpen ? '' : `translateY(${Math.max(0, legendEl.offsetHeight - hh)}px)`;
  root.style.setProperty('--sheet-h', (sheetOpen ? Math.min(legendEl.offsetHeight, innerHeight * 0.76) : hh) + 'px');
}
handleEl.onclick = () => {
  sheetOpen = !sheetOpen;
  handleEl.setAttribute('aria-expanded', String(sheetOpen));
  layoutSheet();
};


// ---- go ---------------------------------------------------------------------
layoutSheet();
load();
