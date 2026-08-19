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
    return { id: r.i, next: r.n, main: r.m, ord: r.o, upland: r.u, mean: r.d, px, py, live: r.d, est: true, basis: 'none' };
  });
  byId = new Map(reaches.map((r, i) => [r.id, i]));
  stations = st.stations;
  for (const s of stations) if (s.reach !== undefined) gaugeByReach.set(s.reach, s);
  fit();
  applyHash();
  requestAnimationFrame(draw);
  await refresh();
}

function applyHash() {
  const m = /^#(-?[\d.]+),(-?[\d.]+),([\d.]+)$/.exec(location.hash);
  if (!m) return false;
  resize();
  view.k = +m[3];
  view.x = W / 2 - view.k * mercX(+m[1]);
  view.y = H / 2 - view.k * mercY(+m[2]);
  return true;
}
function writeHash() {
  const lon = ((W / 2 - view.x) / view.k) * 360 - 180;
  const wy = (H / 2 - view.y) / view.k;
  const lat = (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * wy))) - Math.PI / 2) * 180 / Math.PI;
  history.replaceState(null, '', `#${lon.toFixed(4)},${lat.toFixed(4)},${Math.round(view.k)}`);
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
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

let __frames = 0, __t0 = 0;
function draw(ts) {
  if (!__t0) __t0 = ts || 0; __frames++;
  if (motion) phase = (ts || 0) / 1000;
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

  // pass 1: the body of the water
  for (const r of reaches) {
    if (r.upland < minU) continue;
    if (!onScreen(r, margin)) continue;
    path(r);
    if (r.basis === 'none') { ctx.strokeStyle = '#3a4450'; ctx.globalAlpha = 0.34; }
    else { ctx.strokeStyle = rampColor(r.live); ctx.globalAlpha = r.est ? 0.72 : 1; }
    ctx.lineWidth = lineWidth(r.live);
    ctx.stroke();
  }

  // pass 2: motion downstream. Vertex order is downstream, so a shrinking dash
  // offset carries the glint with the current. Short glint, long gap: the river
  // must keep its colour, so this pass stays thin and faint.
  if (motion) {
    ctx.lineCap = 'butt';
    for (const r of reaches) {
      if (r.basis === 'none') continue;
      if (r.upland < Math.max(minU, 20)) continue;
      if (!onScreen(r, margin)) continue;
      const w = lineWidth(r.live);
      if (w < 1.6) continue;
      const glint = Math.max(9, w * 2.2);
      const speed = 14 + 30 * Math.min(1, Math.log10(1 + r.live) / 3);
      path(r);
      ctx.strokeStyle = '#e8f2ff';
      ctx.globalAlpha = r.est ? 0.07 : 0.20;
      ctx.lineWidth = Math.min(w * 0.34, 2.4);
      ctx.setLineDash([glint, glint * 5]);
      ctx.lineDashOffset = -phase * speed * Math.max(0.5, Math.min(4, zoom()));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  // pass 3: the hovered reach
  if (hovered?.kind === 'reach') {
    const r = hovered.ref;
    path(r);
    ctx.strokeStyle = '#fab219';
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = lineWidth(r.live) + 1.6;
    ctx.stroke();
  }

  // pass 4: gauges
  if (showStations) {
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
  requestAnimationFrame(draw);
}

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
  clearTimeout(window.__hashT);
  window.__hashT = setTimeout(writeHash, 350);
}, { passive: false });

function pick(mx, my) {
  const R2 = 100;
  let bestS = null, bd = R2;
  for (const s of stations) {
    if (s.lon === null) continue;
    const dx = sx(mercX(s.lon)) - mx, dy = sy(mercY(s.lat)) - my;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bestS = s; }
  }
  if (bestS) { hovered = { kind: 'station', ref: bestS }; tip(mx, my); return; }

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
  hovered = bestR ? { kind: 'reach', ref: bestR } : null;
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
  if (hovered.kind === 'station') {
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
document.getElementById('panelClose').onclick = () => { panel.hidden = true; selected = null; };
document.getElementById('refresh').onclick = refresh;
document.getElementById('toggleStations').onchange = e => showStations = e.target.checked;
document.getElementById('toggleMotion').onchange = e => motion = e.target.checked;
window.addEventListener('resize', () => { resize(); });

window.__fps = () => (__frames / Math.max(0.001, (performance.now() - __t0) / 1000)).toFixed(1);
window.__diag = () => {
  const t = { measured: 0, downstream: 0, upstream: 0, none: 0 };
  for (const r of reaches) t[r.basis]++;
  return { reaches: reaches.length, ...t, gauges: stations.filter(s => s.q !== null && s.q !== undefined).length };
};

load();
