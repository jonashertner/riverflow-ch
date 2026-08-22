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

// The publication is one instrument with two persistent surfaces: evidence and
// map. The evidence side has a permanent project header and one continuous scroll
// surface. A reader can therefore start a wheel or touch gesture anywhere in the
// evidence itself instead of discovering that only the legend's last few pixels
// move. Detail sheets still sit above that surface; geography is never furniture.
const workspace = document.createElement('aside');
workspace.id = 'workspace';
workspace.setAttribute('aria-labelledby', 'workspaceTitle');
document.getElementById('main').before(workspace);

const workspaceHead = document.createElement('header');
workspaceHead.id = 'workspaceHead';
const workspaceUtility = document.createElement('div');
workspaceUtility.className = 'workspaceUtility';
const workspaceBrand = document.createElement('span');
workspaceBrand.className = 'workspaceBrand';
workspaceBrand.innerHTML = '<svg class="mark" width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"><rect x="0" y="0" width="1.4" height="10" rx="0.7" class="mA"/><rect x="2.6" y="0" width="11.6" height="10" rx="1.2" class="mB"/><rect x="15.4" y="0" width="6.6" height="10" rx="1.2" class="mC"/></svg><b>Riverflow</b>';
const siteNav = document.getElementById('siteNav');
const languageSwitch = siteNav?.querySelector('.langs');
const themeControl = siteNav?.querySelector('.themeBtn');
workspaceUtility.append(workspaceBrand);
if (languageSwitch) workspaceUtility.append(languageSwitch);
if (themeControl) workspaceUtility.append(themeControl);
workspaceHead.append(workspaceUtility);
if (siteNav) workspaceHead.append(siteNav);

const workspaceScroll = document.createElement('div');
workspaceScroll.id = 'workspaceScroll';
workspaceScroll.tabIndex = 0;
workspaceScroll.setAttribute('aria-labelledby', 'workspaceTitle');
workspace.append(workspaceHead, workspaceScroll);
for (const id of ['titlebar', 'modes', 'mapControls', 'liveAlerts', 'tooltip', 'legend']) {
  const el = document.getElementById(id);
  if (el) workspaceScroll.append(el);
}
for (const id of ['ribbon', 'panel', 'intro']) {
  const el = document.getElementById(id);
  if (el) workspace.append(el);
}
const publicationCredits = document.getElementById('credits');
if (publicationCredits) document.getElementById('legendBody')?.append(publicationCredits);

// A vertical wheel over the permanent project header belongs to the evidence
// column. Horizontal input remains native navigation scrolling.
workspaceHead.addEventListener('wheel', event => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  workspaceScroll.scrollBy({ top: event.deltaY });
  event.preventDefault();
}, { passive: false });

// On narrow screens the layers form a real horizontal rail. Give that rail a
// stable shell so its two quiet edge cues can stay fixed while the buttons move
// beneath them. The cues are visual only: touch, trackpad, wheel and keyboard
// navigation keep operating on the native scroll container.
const layerModes = document.getElementById('modes');
const modeRail = document.createElement('div');
modeRail.id = 'modeRail';
layerModes.before(modeRail);
modeRail.append(layerModes);
for (const [side, arrow] of [['start', '\u2039'], ['end', '\u203a']]) {
  const cue = document.createElement('span');
  cue.className = `modeRailCue modeRailCue-${side}`;
  cue.setAttribute('aria-hidden', 'true');
  cue.textContent = arrow;
  modeRail.append(cue);
}

const ENDPOINT = 'https://lindas.admin.ch/query';

/* ---- the palette -----------------------------------------------------------
 * Every colour this canvas paints with is read from tokens.css and none of them is
 * written here. Two reasons. The map and the furniture floating over it then
 * cannot disagree about what "measured" looks like; and the second surface — day,
 * on chart paper instead of the near-black plane — becomes a change to one
 * stylesheet rather than to sixty literals scattered through a drawing routine.
 *
 * Every ordered ramp is held least-ink first. On night that is darkest first,
 * because more water is more light. On day it is lightest first, because on paper
 * more water is more ink. Nothing below this block needs to know which surface it
 * is on: it asks for step 0 and gets the quiet end either way.
 */
const PAL = {};
const CAMEL = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const SCALARS = ['plane', 'ink', 'ink-2', 'ink-muted', 'halo', 'trail', 'hi', 'flow',
                 'law', 'law-dim', 'law-hi', 'ev-measured', 'ev-estimated', 'ev-none',
                 'ev-none-dim', 'lake', 'lake-line', 'ice', 'res-full', 'res-mid',
                 'res-hi', 'res-head', 'res-flood', 'use-out', 'use-in',
                 'good', 'warning', 'serious', 'critical', 'quality-hi'];
const TRIPLETS = ['plane-rgb', 'ink-rgb', 'halo-rgb', 'law-rgb', 'wet-water-rgb',
                  'ice-past-rgb', 'label-water', 'label-ice', 'label-res'];
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue('--' + n).trim();
  // Discharge: one hue stepped by lightness, quiet end first.
  PAL.seq  = [700, 600, 500, 450, 400, 300, 200, 100].map(k => v('seq-' + k));
  // Relative to the mean: one hue below, one above, neutral at the mean. The
  // middle is quiet on purpose, because a river at its long-term mean is not news.
  PAL.div  = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => v('div-' + k));
  // Water temperature, 0 to 25 C. ONE hue. The old ramp ran blue-green-yellow-red,
  // which reads as four categories rather than one rising quantity. The 25 C
  // ceiling of GSchV Annex 2 No. 12(4) is a status and not a value, so it is drawn
  // as a rim on the gauge and stated in words in the legend, never by the ramp.
  PAL.temp = [1, 2, 3, 4, 5].map(k => v('temp-' + k));
  PAL.quality = [1, 2, 3, 4, 5, 6].map(k => v('quality-' + k));
  PAL.res  = [1, 2, 3, 4, 5, 6].map(k => v('res-' + k));
  for (const k of SCALARS)  PAL[CAMEL(k)] = v(k);
  for (const k of TRIPLETS) PAL[CAMEL(k)] = v(k);
  // The danger levels BAFU publishes. Level 5 is not a fifth colour but level 4's,
  // because past that point the difference stops being one of degree.
  PAL.status = { 1: PAL.good, 2: PAL.warning, 3: PAL.serious, 4: PAL.critical, 5: PAL.critical };
}
readPalette();

// Alpha over one of the palette's own hexes, for a mark that has to sit on what is
// behind it rather than knock it out.
function alpha(hex, a) {
  const p = [1, 3, 5].map(k => parseInt(hex.substr(k, 2), 16));
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}
const halo = a => `rgba(${PAL.haloRgb},${a})`;   // the knockout under a bright mark
const ink  = a => `rgba(${PAL.inkRgb},${a})`;

let mode = 'flow';
let wantMode = null;          // asked for in the hash, applied once its layer is ready
let glaciers = null;          // {glaciers[], pastRings[], length[], now, past}
let users = null;             // {hydro[], abstraction[], npp[], ara[]}, each point in world coords
let reservoirs = null;        // {dams[], totals, fill{weeks[], envelope[], max, latest}}
let residual = null;          // {points[], counts, datenstand}
let quality = null;           // NAWA TREND annual station summaries, exact samples stay at BAFU
let qualityParam = null;
let qualityYear = null;
let qualityLoadPromise = null;
const qualitySampleCache = new Map();
let iceFrames = null;         // six dated states, each with a Path2D in world coords
let vintage = null;           // what every source is and how old it is
const useOn = { hydro: true, abstraction: true, npp: true, ara: true };

const LG = { flow: 'lgFlow', normal: 'lgNormal', temp: 'lgTemp', quality: 'lgQuality', res: 'lgRes', ice: 'lgIce',
             residual: 'lgResidual', use: 'lgUse', wet: 'lgWet', source: 'lgSource' };
// Read once, at load, from the catalogue in i18n-map.js. The language of a page
// does not change without a reload, so neither does this table.
const LGTITLE = Object.fromEntries(Object.keys(LG).map(k =>
  [k, T('m.lg' + k[0].toUpperCase() + k.slice(1))]));
const MODES = Object.keys(LG);

// Bone on the night plane, sepia on the day one. Either way a warm earth against a
// cool ground, because a quantity the law states is not a quantity an instrument
// read and the two must not be confusable at a glance. Every statutory figure on
// this map wears --law and a serif; no measurement ever does.
// The layers where the water is context and not the reading. The current is
// dimmed under them, never stopped: a river that froze the moment you asked a
// question about a dam would be a worse lie than a river drawn faintly.
const DIMWATER = new Set(['quality', 'use', 'res', 'residual', 'ice', 'wet', 'source']);
// The reservoir regions of the BFE filling statistic, in the column order of the
// weekly file. The statistic is published for these four and for nothing smaller.
const RESREG = ['vs', 'gr', 'ti', 'rest'];
const RESNAME = { vs: T('m.regVs'), gr: T('m.regGr'), ti: T('m.regTi'), rest: T('m.regRest') };

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
const USE = {
  hydro:       { reg: 'out', label: T('m.useHydro') },
  abstraction: { reg: 'out', label: T('m.useAbs') },
  npp:         { reg: 'out', label: T('m.useNpp') },
  ara:         { reg: 'in',  label: T('m.useAra') },
};
const usePaint = k => (USE[k].reg === 'out' ? PAL.useOut : PAL.useIn);

function stepColor(pal, t) {
  const u = Math.max(0, Math.min(1, t)) * (pal.length - 1);
  const a = pal[Math.floor(u)], b = pal[Math.min(pal.length - 1, Math.ceil(u))];
  return mix(a, b, u - Math.floor(u));
}
// ratio 1 sits in the middle; the scale is symmetric in log2 out to a quarter and
// four times the mean, because water is multiplicative and the eye is not.
const divColor = ratio => stepColor(PAL.div, 0.5 + Math.log2(Math.max(ratio, 1e-3)) / 4);
const tempColor = c => stepColor(PAL.temp, c / 25);

function reachColor(r) {
  // Under the three register layers the water is context, not the reading. It is
  // dimmed and not removed: a dam, an abstraction or a minimum flow means nothing
  // without the river it is a fact about.
  if (mode === 'ice' || mode === 'temp' || mode === 'quality' || mode === 'res' || mode === 'residual') {
    if (r.basis === 'none') return { c: PAL.evNoneDim, a: 0.26 };
    return { c: rampColor(r.live), a: r.est ? 0.30 : 0.46 };
  }
  if (mode === 'normal') {
    if (r.basis === 'none' || !r.mean) return { c: PAL.evNone, a: 0.30 };
    return { c: divColor(r.live / r.mean), a: r.est ? 0.72 : 1 };
  }
  if (r.basis === 'none') return { c: PAL.evNone, a: 0.34 };
  return { c: rampColor(r.live), a: r.est ? 0.72 : 1 };
}


// discharge in m3/s -> position on the ramp, log scale from 0.05 to 2000
const QMIN = Math.log10(0.05), QMAX = Math.log10(2000);
function rampColor(q) {
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(q, 0.05)) - QMIN) / (QMAX - QMIN)));
  const i = t * (PAL.seq.length - 1);
  const a = PAL.seq[Math.floor(i)], b = PAL.seq[Math.min(PAL.seq.length - 1, Math.ceil(i))];
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
document.getElementById('mapHelp').textContent = T('m.mapHelp');
cv.setAttribute('aria-label', T('m.mapAria', { layer: LGTITLE[mode] }));
let dirty = true;                     // base map needs a redraw
const invalidate = () => { dirty = true; clearFlow(); };
const view = { k: 1, x: 0, y: 0 };          // k = pixels per world unit
let dpr = 1, W = 0, H = 0, K0 = 0;   // K0 = the scale at which the whole country fits
let mapBounds = null;

let reaches = [];          // {id,next,main,ord,upland,mean,px[],py[], live, est, basis}
let lakes = [], border = [];
let byId = new Map();
let stations = [];         // {id,name,lon,lat,factor,reach,meanQ,...}
let gaugeByReach = new Map();        // reach id -> every station snapped there
let liveStamp = null;
let liveSummary = { current: 0, stale: 0, invalid: 0, unit: 0 };
let liveTimer = null, liveBackoff = 0, lastTry = 0;
let hovered = null;        // {kind:'reach'|'station', ref}
let selected = null;
let motion = true, showStations = true;
let particles = [], pool = [], poolWeight = 0, allocAt = 0;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let phase = 0;

// ---- load -------------------------------------------------------------------
async function load() {
  const [net, st, cx] = await Promise.all([
    readJSON(ROOT + 'data/network.json'),
    readJSON(ROOT + 'data/stations.json'),
    readJSON(ROOT + 'data/context.json'),
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
  for (const s of stations) {
    if (s.reach === undefined) continue;
    const list = gaugeByReach.get(s.reach);
    if (list) list.push(s); else gaugeByReach.set(s.reach, [s]);
  }
  for (const list of gaugeByReach.values()) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  }
  fit();
  updateEvidence();          // true from the first frame: before the live read every
                             // reach carries its long-term mean and nothing more
  applyHash();
  requestAnimationFrame(frame);
  if (wantMode && setMode(wantMode)) wantMode = null;
  await refresh();
  // Names and source ages improve every layer but do not carry its primary
  // quantity. Fill them only after the live reading has had the main thread.
  const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 250));
  idle(() => { loadVintage(); loadNames(); });
}

// The ice arrives after the water. Until it does the Ice button stays disabled,
// because a layer that is not loaded must not look like a layer that is empty.
async function loadIce() {
  try {
    const g = await readJSON(ROOT + 'data/glaciers.json');
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
    document.getElementById('iceTotals').innerHTML = T('m.iceTotals', {
      pc: g.past.count, pk: nf(g.past.km2), py: g.past.year,
      nc: g.now.count, nk: nf(g.now.km2), ny: g.now.year,
      lost: nf(100 * (1 - g.now.km2 / g.past.km2)),
    });
  } catch (e) {
    document.getElementById('iceTotals').textContent = T('m.failIce', { e: e.message });
  }
}

// Who takes the water. Four registers, loaded after the rivers because none of them
// is needed to read a gauge. Every point is projected once, here, and the canvas
// transform carries it to the screen.
async function loadUsers() {
  try {
    const u = await readJSON(ROOT + 'data/users.json');
    for (const k of Object.keys(USE)) {
      for (const p of u[k]) { p.kind = k; p.wx = mercX(p.x); p.wy = mercY(p.y); }
    }
    // The words a register puts next to a plant — its type, its operating state —
    // are translated once here rather than at each of the four places that print
    // them. A word with no translation on file survives as the register wrote it.
    for (const p of u.hydro) { p.t = D(p.t); p.s = D(p.s); }
    for (const p of u.npp) { p.st = D(p.st); p.fix = D(p.fix); }
    users = u;
    const withQ = u.hydro.filter(h => h.q !== null).length;
    document.getElementById('useCount').innerHTML = T('m.useCount', {
      ab: nf(u.abstraction.length), hy: u.hydro.length, q: withQ,
      np: u.npp.length, ar: u.ara.length,
    });
  } catch (e) {
    document.getElementById('useCount').textContent = T('m.failUse', { e: e.message });
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
    const col = usePaint(k);
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
        ctx.strokeStyle = halo(0.85);
        ctx.stroke();
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = PAL.plane;
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
  view.k = clampK(+m[3]);
  view.x = W / 2 - view.k * mercX(+m[1]);
  view.y = H / 2 - view.k * mercY(+m[2]);
  clampView();
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
  {
    SELECT ?st (MAX(?observedAt) AS ?time)
    WHERE { ?latest h:station ?st ; h:measurementTime ?observedAt . }
    GROUP BY ?st
  }
  ?obs h:station ?st ; h:measurementTime ?time .
  OPTIONAL { ?obs h:discharge ?discharge }
  OPTIONAL { ?obs h:waterLevel ?level }
  OPTIONAL { ?obs h:waterTemperature ?temp }
  OPTIONAL { ?obs h:dangerLevel ?danger }
  ?st schema:identifier ?id .
}`;

// "Live" is a data contract, not a description of the endpoint. BAFU publishes
// these observations as raw and unvalidated, on a roughly ten-minute cadence.
// Three cadences allow for ordinary telemetry delay without letting an old value
// inherit the timestamp of a different station.
const LIVE_MAX_AGE = 30 * 60 * 1000;
const LIVE_FUTURE_TOLERANCE = 5 * 60 * 1000;
const valueOf = binding => binding ? Number(binding.value) : null;

function validateLive(now = Date.now()) {
  const summary = { current: 0, stale: 0, invalid: 0, unit: 0 };
  let newest = null;
  for (const s of stations) {
    const raw = s.rawObs;
    s.q = null;
    s.obs = null;
    s.dischargeState = raw ? 'missing' : 'absent';
    if (!raw) continue;

    const at = Date.parse(raw.time ?? '');
    const timed = Number.isFinite(at);
    const fresh = timed && at <= now + LIVE_FUTURE_TOLERANCE && now - at <= LIVE_MAX_AGE;
    // Level and temperature share the station timestamp. Stale values are not
    // allowed to remain current merely because only discharge is being mapped.
    s.obs = {
      time: raw.time,
      level: fresh && Number.isFinite(raw.level) ? raw.level : null,
      temp: fresh && Number.isFinite(raw.temp) ? raw.temp : null,
      danger: fresh && Number.isFinite(raw.danger) ? raw.danger : null,
    };

    if (raw.q === null) continue;
    if (!fresh) {
      s.dischargeState = timed && at <= now + LIVE_FUTURE_TOLERANCE ? 'stale' : 'invalid-time';
      summary[s.dischargeState === 'stale' ? 'stale' : 'invalid']++;
      continue;
    }
    if (!Number.isFinite(raw.q) || raw.q < 0) {
      s.dischargeState = 'invalid-value';
      summary.invalid++;
      continue;
    }
    if (!Number.isFinite(s.factor)) {
      s.dischargeState = 'unknown-unit';
      summary.unit++;
      continue;
    }
    s.q = raw.q * s.factor;
    s.dischargeState = 'current';
    summary.current++;
    if (!newest || raw.time > newest) newest = raw.time;
  }
  liveStamp = newest;
  liveSummary = summary;
}

// The cube publishes every ten minutes; a map left open used to show whatever it
// read on load until somebody pressed the button, so a reading could be hours old
// with nothing on the screen saying so. `auto` marks a re-read the page decided on
// by itself: it runs without touching the button, because a control that flickers
// on a timer reads as something the reader did.
async function refresh(auto = false) {
  const btn = document.getElementById('refresh');
  if (!auto) { btn.disabled = true; btn.textContent = T('m.reading'); }
  lastTry = Date.now();
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
      const next = {
        time: b.time?.value ?? null,
        q: valueOf(b.discharge),
        level: valueOf(b.level),
        temp: valueOf(b.temp),
        danger: b.danger && /\/(\d)$/.test(b.danger.value) ? +RegExp.$1 : null,
      };
      const previous = obs.get(id);
      if (!previous || String(next.time) > String(previous.time)) obs.set(id, next);
    }
    for (const s of stations) {
      s.rawObs = obs.get(s.id) ?? null;
    }
    validateLive();
    liveBackoff = 0;
    applyLive();
    stampText();
    invalidate(); dirtyAlloc = true;
  } catch (e) {
    // A failed automatic re-read must not wipe a good reading off the screen. The
    // last one that arrived is still the best the page has; what changes is that it
    // is now ageing, and stampText says so once it outlives its own cadence.
    validateLive();
    applyLive();
    invalidate(); dirtyAlloc = true;
    if (auto) stampText();
    else document.getElementById('stamp').textContent = T('m.liveFail', { e: e.message });
    liveBackoff = Math.min(liveBackoff ? liveBackoff * 2 : 60000, LIVE_CADENCE);
  } finally {
    if (!auto) { btn.disabled = false; btn.textContent = T('m.refresh'); }
    scheduleLive();
  }
}

// ---- keeping the live read live ---------------------------------------------
// Re-read on the publication cadence, but only while the tab is being looked at:
// a hidden tab polling a federal endpoint every ten minutes spends someone else's
// bandwidth on a page nobody is reading. Coming back to a tab reads at once if the
// reading on the screen has already outlived the cadence, and otherwise waits out
// the remainder of it.
const LIVE_CADENCE = 600000;

// The wait runs from the last attempt rather than the last success, and returning to
// a tab serves out whatever is left of it instead of starting it again. Both matter
// for the same reason: a read that failed still cost the endpoint a request, and
// backing off is the whole point of having failed. Measured from the last success,
// an endpoint that is down would leave the interval permanently elapsed, and every
// alt-tab back to the page would fire another unthrottled request at it — the
// opposite of the restraint the hidden-tab rule above is for.
function scheduleLive() {
  clearTimeout(liveTimer);
  if (document.hidden) return;
  const wait = Math.max(0, lastTry + (liveBackoff || LIVE_CADENCE) - Date.now());
  liveTimer = setTimeout(() => refresh(true), wait);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(liveTimer); return; }
  scheduleLive();
});

/* Anomaly propagation. ratio = measured / long-term mean at the gauge's own reach.
 * A reach inherits the first downstream gauge, or the closest connected gauge on
 * any upstream branch. This is an indicative spatial scaling, not a mass balance. */
function applyLive() {
  const ratio = new Map();
  const currentGauge = new Map();
  for (const [reach, list] of gaugeByReach) {
    const valid = list.filter(s => s.dischargeState === 'current' && s.q !== null)
      .sort((a, b) => String(b.rawObs?.time).localeCompare(String(a.rawObs?.time)) ||
        (a.snapKm ?? Infinity) - (b.snapKm ?? Infinity) ||
        String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
    if (valid.length) currentGauge.set(reach, valid[0]);
  }
  for (const [reach, s] of currentGauge) {
    if (!s.meanQ) continue;
    const rr = s.q / s.meanQ;
    if (!isFinite(rr) || rr <= 0) continue;
    ratio.set(reach, rr);
  }

  const seek = (start, step) => {
    let cur = start, guard = 0;
    while (cur && guard++ < 600) {
      if (ratio.has(cur.id)) return ratio.get(cur.id);
      cur = step(cur);
    }
    return null;
  };
  const down = r => { const i = byId.get(r.next); return i === undefined ? null : reaches[i]; };
  // For reaches with no gauge below, consider every upstream branch. Propagating
  // each gauge downstream once finds the closest connected upstream gauge without
  // silently ignoring a second-largest tributary at a confluence.
  const upstream = new Map();
  for (const [id, rr] of ratio) {
    let cur = reaches[byId.get(id)], dist = 0, guard = 0;
    while (cur && guard++ < 600) {
      const old = upstream.get(cur.id);
      if (!old || dist < old.dist || (dist === old.dist && id < old.id)) upstream.set(cur.id, { rr, dist, id });
      dist += cur.len;
      cur = down(cur);
    }
  }

  for (const r of reaches) {
    const g = currentGauge.get(r.id);
    r.gauge = g ?? null;
    if (g) { r.live = g.q; r.est = false; r.basis = 'measured'; continue; }
    r.est = true;
    // Prefer the first gauge downstream. Failing that, use the closest connected
    // upstream gauge across all tributaries. With neither, show no current basis.
    let rr = seek(r, down);
    let basis = rr === null ? null : 'downstream';
    if (rr === null) { rr = upstream.get(r.id)?.rr ?? null; basis = rr === null ? null : 'upstream'; }
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
  document.getElementById('evNumMeasured').textContent = nf(measured);
  document.getElementById('evNumEstimated').textContent = nf(estimated);
  document.getElementById('evNumNone').textContent = nf(none);
  bar.setAttribute('aria-label', T('m.evLabel', {
    total: nf(total), measured: nf(measured), estimated: nf(estimated), none: nf(none),
  }));
}

function stampText() {
  const el = document.getElementById('stamp');
  if (!liveStamp) {
    const rejected = liveSummary.stale + liveSummary.invalid + liveSummary.unit;
    el.textContent = rejected ? T('m.noValidLive', { n: rejected }) : T('m.noLive');
    updateLiveLegalScreen();
    return;
  }
  const d = new Date(liveStamp);
  const t = fmtStamp(d);
  const excluded = liveSummary.stale + liveSummary.invalid + liveSummary.unit;
  el.textContent = excluded
    ? T('m.stampExcluded', { n: liveSummary.current, t, x: excluded })
    : T('m.stamp', { n: liveSummary.current, t });

  const withT = stations.filter(s => s.obs?.temp !== null && s.obs?.temp !== undefined);
  const c = document.getElementById('tempCount');
  if (!withT.length) {
    c.textContent = T('m.noTemp');
    updateLiveLegalScreen();
    return;
  }
  const temps = withT.map(s => s.obs.temp).sort((a, b) => a - b);
  const med = temps[temps.length >> 1];
  const above = temps.filter(v => v > 25).length;
  const at = temps.filter(v => v === 25).length;
  const warm = temps.filter(v => v >= 20).length;
  const top = withT.reduce((a, b) => (b.obs.temp > a.obs.temp ? b : a));
  c.innerHTML = T('m.tempCount', {
    n: withT.length, med: nfd(med, 1), warm, above, at,
    top: nfd(top.obs.temp, 1), where: esc(top.name),
  });
  updateLiveLegalScreen();
}

/* ---- live legal screen -----------------------------------------------------
 * This is intentionally not a compliance engine. It compares only fresh,
 * reported river temperatures with the one national numeric requirement the
 * live feed can meaningfully screen. The result says where review should start;
 * attribution, reference state, mixing, permits and exceptions remain outside
 * the feed and therefore outside the finding.
 */
const legalAlertRoot = document.getElementById('liveAlerts');
const legalAlertToggle = document.getElementById('liveAlertsToggle');
const legalAlertBody = document.getElementById('liveAlertsBody');
const legalAlertSummary = document.getElementById('liveAlertsSummary');
const legalAlertList = document.getElementById('liveAlertsList');

function updateLiveLegalScreen() {
  if (!legalAlertRoot || !window.RiverflowLegalScreen) return;
  const result = window.RiverflowLegalScreen.evaluateTemperature(
    stations.map(station => ({
      id: station.id,
      name: station.name,
      temperature: station.rawObs?.temp,
      observedAt: station.rawObs?.time,
    })),
    { maxAgeMs: LIVE_MAX_AGE, futureToleranceMs: LIVE_FUTURE_TOLERANCE },
  );

  let summary;
  if (result.above.length) {
    summary = T(result.above.length === 1 ? 'm.alertAbove.one' : 'm.alertAbove.other', {
      n: result.above.length,
    });
  } else if (result.at.length) {
    summary = T(result.at.length === 1 ? 'm.alertAt.one' : 'm.alertAt.other', {
      n: result.at.length,
    });
  } else {
    summary = T(result.eligible.length ? 'm.alertNone' : 'm.alertUnavailable');
  }
  if (legalAlertSummary.textContent !== summary) legalAlertSummary.textContent = summary;
  legalAlertRoot.dataset.state = result.above.length ? 'alert' : (result.eligible.length ? 'clear' : 'unavailable');

  legalAlertList.replaceChildren();
  for (const alert of result.above) {
    const station = stations.find(candidate => String(candidate.id) === alert.id);
    if (!station) continue;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', T('m.alertOpenStation', {
      station: alert.name, v: nfd(alert.temperature, 1),
    }));
    const name = document.createElement('strong');
    name.textContent = alert.name;
    const value = document.createElement('span');
    value.className = 'liveAlertValue';
    value.textContent = T('m.alertItem', {
      v: nfd(alert.temperature, 1), t: fmtStamp(new Date(alert.observedAt)),
    });
    const reason = document.createElement('span');
    reason.className = 'liveAlertReason';
    reason.textContent = T('m.alertReview');
    button.append(name, value, reason);
    button.onclick = () => {
      setMode('temp');
      select({ kind: 'station', ref: station }, true);
    };
    item.append(button);
    legalAlertList.append(item);
  }
}

legalAlertToggle?.addEventListener('click', () => {
  const open = legalAlertToggle.getAttribute('aria-expanded') === 'true';
  legalAlertToggle.setAttribute('aria-expanded', String(!open));
  legalAlertBody.hidden = open;
});

/* ===========================================================================
   WATER QUALITY — NAWA TREND

   The country view is a summary, never an interpolation. A diamond sits at the
   station that produced the samples. Its fill is the annual median of quantified
   results for one parameter and one unit. Censored observations are counted but
   are not assigned a made-up concentration; a year with only censored results is
   therefore hollow. Opening a station asks BAFU for the exact rows, including the
   sampling interval, determination limit, method, uncertainty and remark.
   =========================================================================== */
const QUALITY_NAMES = {
  'ortho-Phosphat-Phosphor (filtriert)': 'm.qPhosphate',
  'Nitrat-Stickstoff': 'm.qNitrate',
  'Ammonium-Stickstoff': 'm.qAmmonium',
  'Sauerstoff': 'm.qOxygen',
  'pH-Wert': 'm.qPh',
  'Elektrische Leitfähigkeit': 'm.qConductivity',
  'Chlorid': 'm.qChloride',
  'DOC': 'm.qDoc',
  'Gesamtphosphor (unfiltriert)': 'm.qTotalP',
  'Diclofenac': 'm.qDiclofenac',
  'Clarithromycin': 'm.qClarithromycin',
  'Cypermethrin': 'm.qCypermethrin',
  'Kupfer (gelöst)': 'm.qCopper',
};

function qualityParameterName(p) {
  const key = QUALITY_NAMES[p.de];
  if (key) return T(key);
  if (LANG === 'fr' && p.fr) return p.fr;
  return p.de; // The federal parameter register publishes official DE and FR labels only.
}
const qualityUnit = p => p.unit === '---' ? '' : p.unit;
function qualityNumber(v, p = quality?.parameters[qualityParam]) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  const a = Math.abs(+v);
  const d = a === 0 ? 0 : Math.max(0, Math.min(8, 2 - Math.floor(Math.log10(a))));
  return nf(+v, d);
}

async function loadQuality() {
  if (quality) return quality;
  if (qualityLoadPromise) return qualityLoadPromise;
  const count = document.getElementById('qualityCount');
  const button = document.getElementById('modeQuality');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  qualityLoadPromise = (async () => {
    const j = await readJSON(ROOT + 'data/quality.json');
    for (const s of j.stations) {
      s.kind = 'quality'; s.wx = mercX(s.x); s.wy = mercY(s.y);
      s.by = new Map(s.values.map(a => [`${a[0]}:${a[1]}`, a]));
      s.values = null;
    }
    quality = j;
    qualityParam = j.meta.featured[0] ?? 0;
    qualityYear = j.meta.years.at(-1);

    const select = document.getElementById('qualityParameter');
    select.replaceChildren();
    const featured = new Set(j.meta.featured);
    const appendGroup = (label, indices) => {
      const group = document.createElement('optgroup'); group.label = label;
      for (const i of indices) {
        const p = j.parameters[i], o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${qualityParameterName(p)}${qualityUnit(p) ? ` · ${qualityUnit(p)}` : ''}`;
        group.appendChild(o);
      }
      select.appendChild(group);
    };
    appendGroup(T('m.qFeatured'), j.meta.featured);
    appendGroup(T('m.qAllParameters'), j.parameters.map((_, i) => i).filter(i => !featured.has(i))
      .sort((a, b) => qualityParameterName(j.parameters[a]).localeCompare(qualityParameterName(j.parameters[b]), LANG)));
    select.value = String(qualityParam);
    select.onchange = () => setQualityParameter(+select.value);

    const year = document.getElementById('qualityYear');
    year.min = String(j.meta.years[0]); year.max = String(j.meta.years.at(-1)); year.value = String(qualityYear);
    year.oninput = () => setQualityYear(+year.value);

    for (const b of document.querySelectorAll('.qualityPresets button[data-quality]')) {
      const [name, unit] = b.dataset.quality.split('\\u0000');
      const i = j.parameters.findIndex(p => p.de === name && p.unit === unit);
      if (i < 0) { b.hidden = true; continue; }
      b.dataset.parameterIndex = String(i);
      b.onclick = () => setQualityParameter(i);
    }

    button.disabled = false;
    button.removeAttribute('aria-busy');
    qualityLegend();
    if (wantMode === 'quality' && setMode('quality')) wantMode = null;
    return quality;
  })();
  try {
    return await qualityLoadPromise;
  } catch (e) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (count) count.textContent = T('m.failQuality', { e: e.message });
    return null;
  } finally {
    qualityLoadPromise = null;
  }
}

function qualityCell(s, p = qualityParam, year = qualityYear) {
  if (!quality || !s?.by) return null;
  const yi = quality.meta.years.indexOf(year);
  return yi < 0 ? null : s.by.get(`${p}:${yi}`) ?? null;
}

function setQualityParameter(i) {
  if (!quality || !quality.parameters[i]) return;
  qualityParam = i;
  document.getElementById('qualityParameter').value = String(i);
  qualityLegend();
  if (dataView.open) renderDataView();
  if (selected?.kind === 'quality') select(selected, false);
  invalidate();
}
function setQualityYear(y) {
  if (!quality || !quality.meta.years.includes(y)) return;
  qualityYear = y;
  document.getElementById('qualityYear').value = String(y);
  qualityLegend();
  if (dataView.open) renderDataView();
  if (selected?.kind === 'quality') select(selected, false);
  invalidate();
}

function qualityLegend() {
  if (!quality) return;
  const p = quality.parameters[qualityParam], cells = quality.stations.map(s => qualityCell(s)).filter(Boolean);
  const withMedian = cells.filter(a => a[6] !== null).length;
  const below = cells.filter(a => a[6] === null && a[4] > 0).length;
  const samples = cells.reduce((n, a) => n + a[2], 0);
  document.getElementById('qualityYearRead').textContent = String(qualityYear);
  const unit = qualityUnit(p), [lo, mid, hi] = p.domain;
  const noScale = !(Number.isFinite(lo) && Number.isFinite(mid) && Number.isFinite(hi));
  document.getElementById('qualityScaleLow').textContent = noScale ? '—' : `${qualityNumber(lo, p)}${unit ? ' ' + unit : ''}`;
  document.getElementById('qualityScaleMid').textContent = noScale ? T('m.qNoMedian') : qualityNumber(mid, p);
  document.getElementById('qualityScaleHigh').textContent = noScale ? '—' : qualityNumber(hi, p);
  document.getElementById('qualityCount').innerHTML = T('m.qCount', {
    year: qualityYear, stations: cells.length, medians: withMedian, below,
    absent: quality.stations.length - cells.length, samples: nf(samples),
    parameter: esc(qualityParameterName(p)), unit: unit ? ` · ${esc(unit)}` : '',
  });
  const release = document.getElementById('qualityRelease');
  if (release) release.innerHTML = T('m.qRelease', {
    rows: nf(quality.meta.rows), stations: nf(quality.meta.stations),
    from: quality.meta.years[0], to: quality.meta.years.at(-1),
    version: esc(quality.meta.sourceVersion), modified: fmtDate(quality.meta.sourceModified),
    newest: fmtDate(quality.meta.sourceLast),
  });
  for (const b of document.querySelectorAll('.qualityPresets button[data-parameter-index]')) {
    b.classList.toggle('on', +b.dataset.parameterIndex === qualityParam);
    b.setAttribute('aria-pressed', String(+b.dataset.parameterIndex === qualityParam));
  }
}

function qualityPosition(v, p) {
  const [lo, , hi, scale] = p.domain;
  if (!(Number.isFinite(lo) && Number.isFinite(hi)) || hi === lo) return 0.5;
  if (scale === 'log' && v > 0 && lo > 0) return (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return (v - lo) / (hi - lo);
}
const qualityColor = (v, p) => stepColor(PAL.quality, qualityPosition(v, p));
function diamond(x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
}
function drawQuality() {
  const p = quality.parameters[qualityParam];
  const z = Math.min(2, Math.max(0.9, Math.sqrt(zoom())));
  for (const s of quality.stations) {
    const x = sx(s.wx), y = sy(s.wy);
    if (x < -18 || y < -18 || x > W + 18 || y > H + 18) continue;
    const a = qualityCell(s), on = hovered?.kind === 'quality' && hovered.ref === s;
    const r = (a ? 4 : 2.6) * z * (on ? 1.45 : 1);
    diamond(x, y, r);
    if (a?.[6] !== null && a?.[6] !== undefined) {
      ctx.globalAlpha = on ? 1 : 0.9;
      ctx.fillStyle = qualityColor(a[6], p); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = on ? 2 : 1;
      ctx.strokeStyle = on ? PAL.qualityHi : halo(0.8); ctx.stroke();
    } else {
      ctx.globalAlpha = a?.[4] > 0 ? 0.95 : 0.35;
      ctx.fillStyle = PAL.plane; ctx.fill();
      ctx.lineWidth = on ? 2 : (a?.[4] > 0 ? 1.5 : 1);
      ctx.strokeStyle = a?.[4] > 0 ? PAL.qualityHi : PAL.inkMuted; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function pickQuality(mx, my) {
  let best = null, bd = Infinity;
  for (const s of quality.stations) {
    const d = Math.hypot(sx(s.wx) - mx, sy(s.wy) - my);
    if (d < 10 && d < bd) { bd = d; best = s; }
  }
  return best;
}

function qualitySampleYear(r) {
  const iso = r.nawaSamplingEndTs || r.nawaSamplingStartTs;
  if (iso) return +iso.slice(0, 4);
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(r.naquaSamplingDate || '');
  return m ? +m[3] : null;
}
async function qualitySamples(s, p) {
  const key = `${s.id}\u0000${p.de}\u0000${p.unit}`;
  if (qualitySampleCache.has(key)) return qualitySampleCache.get(key);
  const promise = (async () => {
    const query = 'query QualitySamples($station:String!,$parameter:String!,$unit:String!,$offset:Int!,$limit:Int!){water{nawa_trend{data(where:{stationId:{_eq:$station} measuredParameter:{_eq:$parameter} unit:{_eq:$unit}},offset:$offset,limit:$limit){stationId stationName samplingLocation samplingType naquaSamplingDate naquaSamplingTime nawaSamplingStartTs nawaSamplingEndTs nawaSamplingDurationHours measuredParameter measuredValue determinationLimit nawaDetectionLimit unit measurementUncertaintyAbsoluteRelative measurementUncertainty deviceMethod measuredValueRemark}}}}';
    const rows = [], limit = 1000;
    for (let offset = 0; offset < 50_000; offset += limit) {
      const r = await fetch(quality.meta.api, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { station: s.id, parameter: p.de, unit: p.unit, offset, limit } }) });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      const j = await r.json();
      if (j.errors?.length) throw new Error(j.errors.map(x => x.message).join('; '));
      const page = j.data?.water?.nawa_trend?.data ?? [];
      rows.push(...page);
      if (page.length < limit) return rows;
    }
    throw new Error(T('m.qExactTooMany'));
  })();
  qualitySampleCache.set(key, promise);
  try { return await promise; } catch (e) { qualitySampleCache.delete(key); throw e; }
}

function qualityDateRange(r) {
  const a = r.nawaSamplingStartTs?.slice(0, 10), b = r.nawaSamplingEndTs?.slice(0, 10);
  if (a && b) return a === b ? fmtDate(a) : `${fmtDate(a)}–${fmtDate(b)}`;
  if (b || a) return fmtDate(b || a);
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(r.naquaSamplingDate || '');
  return m ? fmtDate(`${m[3]}-${m[2]}-${m[1]}`) : '—';
}
function renderQualitySamples(rows, p) {
  const unit = qualityUnit(p);
  const items = rows.map(r => {
    const raw = r.measuredValue ?? '—', below = /^[<≤]/.test(raw) || (raw === '0' && r.measuredValueRemark?.startsWith('Messwert berechnet'));
    const meta = [D(r.samplingType), r.nawaSamplingDurationHours ? T('m.qHours', { n: esc(r.nawaSamplingDurationHours) }) : '',
      r.determinationLimit ? T('m.qLoq', { v: esc(r.determinationLimit), unit: esc(unit) }) : '',
      r.nawaDetectionLimit ? T('m.qLod', { v: esc(r.nawaDetectionLimit), unit: esc(unit) }) : '',
      r.deviceMethod && r.deviceMethod !== '---' ? r.deviceMethod : '',
      r.measurementUncertainty ? T('m.qUncertainty', { v: esc(r.measurementUncertainty), kind: esc(r.measurementUncertaintyAbsoluteRelative || '') }) : '',
    ].filter(Boolean).join(' · ');
    const remark = r.measuredValueRemark ? `<small>${esc(r.measuredValueRemark)}</small>` : '';
    return `<li><time>${qualityDateRange(r)}</time><strong class="${below ? 'below' : ''}">${esc(raw)}${unit ? ' ' + esc(unit) : ''}</strong>` +
      (meta ? `<small>${meta}</small>` : '') + remark + `</li>`;
  }).join('');
  return `<section class="qualityExact"><h3>${T('m.qExactTitle', { n: rows.length })}</h3><ol class="qualitySamples">${items}</ol>` +
    `<p class="qualityApi">${T('m.qExactSource')} <a href="${esc(quality.meta.dataset)}" target="_blank" rel="noopener">BAFU NAWA TREND</a>.</p></section>`;
}

function panelQuality(s, titleEl, B, N, X) {
  const p = quality.parameters[qualityParam], a = qualityCell(s), unit = qualityUnit(p);
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  titleEl.textContent = s.name;
  let html = row(T('m.qParameter'), esc(qualityParameterName(p)), unit ? esc(unit) : '');
  html += row(T('m.qYear'), qualityYear, '');
  if (s.water) html += row(T('m.qWater'), esc(s.water), '');
  if (s.canton) html += row(T('m.uCanton'), esc(s.canton), '');
  html += row(T('m.qStation'), esc(s.id), '');
  if (!a) {
    html += row(T('m.qResult'), T('m.qNotSampled', { y: qualityYear }), '');
    B.innerHTML = html; X.innerHTML = '';
    N.innerHTML = T('m.qPanelNoData');
    return;
  }
  html += row(T('m.qSamples'), nf(a[2]), '');
  html += row(T('m.qQuantified'), nf(a[3]), '');
  html += row(T('m.qBelowLimit'), nf(a[4]), '');
  if (a[5]) html += row(T('m.qMissing'), nf(a[5]), '');
  html += row(T('m.qMedian'), a[6] === null ? T('m.qNoMedian') : qualityNumber(a[6]), a[6] === null ? '' : esc(unit));
  if (a[10] || a[11]) html += row(T('m.qPeriod'), `${a[10] ? fmtDate(a[10]) : '—'}–${a[11] ? fmtDate(a[11]) : '—'}`, '');
  B.innerHTML = html;
  N.innerHTML = T('m.qPanelNote');
  X.innerHTML = `<p class="aside">${T('m.qLoadingExact')}</p>`;
  const signature = `${s.id}:${qualityParam}:${qualityYear}`;
  qualitySamples(s, p).then(all => {
    if (selected?.kind !== 'quality' || `${selected.ref.id}:${qualityParam}:${qualityYear}` !== signature) return;
    const rows = all.filter(r => qualitySampleYear(r) === qualityYear)
      .sort((a, b) => String(b.nawaSamplingEndTs || b.nawaSamplingStartTs || b.naquaSamplingDate || '')
        .localeCompare(String(a.nawaSamplingEndTs || a.nawaSamplingStartTs || a.naquaSamplingDate || '')));
    X.innerHTML = rows.length ? renderQualitySamples(rows, p) : `<p class="aside">${T('m.qExactEmpty')}</p>`;
  }).catch(e => {
    if (selected?.kind === 'quality' && `${selected.ref.id}:${qualityParam}:${qualityYear}` === signature)
      X.innerHTML = `<p class="aside">${T('m.qExactFail', { e: esc(e.message) })}</p>`;
  });
}

// ---- view -------------------------------------------------------------------
function fit() {
  resize();
  // ResizeObserver and the mobile visual viewport can fire before the network
  // has decoded. There is nothing to fit yet; load() will call this again once
  // reaches exist.
  if (!reaches.length) return;
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const r of reaches) for (let i = 0; i < r.px.length; i++) {
    if (r.px[i] < x0) x0 = r.px[i]; if (r.px[i] > x1) x1 = r.px[i];
    if (r.py[i] < y0) y0 = r.py[i]; if (r.py[i] > y1) y1 = r.py[i];
  }
  mapBounds = { x0, x1, y0, y1 };
  // The map owns its entire canvas at every breakpoint. Switzerland is about 2.2
  // to 1, so width is normally the binding constraint in a portrait map surface.
  const box = fitBox();
  const availH = Math.max(80, H - box.t - box.b);
  const padX = 0.95, padY = 0.94;
  view.k = Math.min(W / (x1 - x0) * padX, availH / (y1 - y0) * padY);
  K0 = view.k;
  view.x = W / 2 - view.k * (x0 + x1) / 2;
  view.y = box.t + availH * 0.5 - view.k * (y0 + y1) / 2;
  updateZoomControls();
}
function fitBox() {
  // Permanent controls live outside the canvas. Every pixel in this box belongs
  // to the geography, at every breakpoint.
  return { t: 0, b: 0 };
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
  ctx.fillStyle = PAL.plane;
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Somebody else's rendering, if it was asked for, under everything this page
  // draws itself. Requested here and drawn from cache: the request is what keeps
  // the picture up with the view, the draw is what puts it on the plane.
  if (ground && GROUND[ground]) { GROUND[ground].request(); GROUND[ground].draw(); }
  if (mode === 'source') {
    for (const k of ['catch', 'gw', 'zone']) {
      if (!sourceOn[k]) continue;
      SOURCE[k].request(); SOURCE[k].draw();
    }
  }

  // context: the border first, then the lakes. Neither carries data.
  ctx.beginPath();
  for (const ring of border) {
    ctx.moveTo(sx(ring[0][0]), sy(ring[0][1]));
    for (let i = 1; i < ring.length; i++) ctx.lineTo(sx(ring[i][0]), sy(ring[i][1]));
    ctx.closePath();
  }
  ctx.fillStyle = ink(0.022);
  ctx.fill();
  ctx.strokeStyle = ink(0.13);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  for (const l of lakes) {
    ctx.moveTo(sx(l.r[0][0]), sy(l.r[0][1]));
    for (let i = 1; i < l.r.length; i++) ctx.lineTo(sx(l.r[i][0]), sy(l.r[i][1]));
    ctx.closePath();
  }
  ctx.fillStyle = PAL.lake;
  ctx.fill();
  ctx.strokeStyle = PAL.lakeLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  const minU = minUpland();
  const margin = 60;

  for (const r of reaches) {
    if (liveOnly && r.basis !== 'measured') continue;
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
    ctx.strokeStyle = PAL.hi;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = lineWidth(r.live) + 1.6;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  if (mode === 'ice' && glaciers) drawIce();
  if (mode === 'res' && reservoirs) drawDams();
  if (mode === 'residual' && residual) drawResidual();
  if (mode === 'quality' && quality && showStations) drawQuality();
  if (mode === 'wet' && wetlands) drawWetlands();
  if (mode === 'use') drawUsers();
  if (mode === 'source') drawSources();

  // The gauges belong to the layers the gauges answer. On a layer about dams, or
  // minimum flows, or ice, a hundred and ninety white rings are noise over the
  // subject, and one of them saying nothing about it is worse than noise.
  if (showStations && !DIMWATER.has(mode)) {
    ctx.globalAlpha = 1;
    for (const s of stations) {
      if (s.lon === null) continue;
      if (liveOnly && !isLive(s)) continue;
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
          ctx.strokeStyle = t >= 25 ? PAL.critical : halo(0.8);
        } else {
          ctx.fillStyle = PAL.plane;
          ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.strokeStyle = PAL.inkMuted;
        }
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.arc(x, y, on ? 6 : (live ? 3.4 : 2.4), 0, 6.2832);
      ctx.fillStyle = PAL.plane;
      ctx.globalAlpha = live ? 1 : 0.55;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = d && d >= 2 ? PAL.status[d] : (live ? PAL.hi : PAL.inkMuted);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  drawPlaces();
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
    if (liveOnly ? r.basis !== 'measured' : r.basis === 'none') continue;
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
  fctx.fillStyle = PAL.trail;
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
    fctx.strokeStyle = mode === 'normal' && r.mean ? divColor(r.live / r.mean) : PAL.flow;
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
const clampK = k => K0 > 0 ? Math.max(K0, Math.min(K0 * 24, k)) : Math.max(1, k);

// Keep the country in the usable part of the screen at every scale. If its
// bounding box is smaller than that space it stays centred; once it is larger,
// each axis is limited so dragging can never reveal empty space beyond it.
function clampView() {
  if (!mapBounds || !(view.k > 0) || !(W > 0) || !(H > 0)) return;
  view.k = clampK(view.k);
  const box = fitBox();
  const top = Math.max(0, box.t), bottom = Math.max(top + 1, H - box.b);
  const axis = (pos, a, b, lo, hi, bias) => {
    const span = Math.max(1, hi - lo), size = (b - a) * view.k;
    const pad = Math.min(36, span * 0.06);
    if (size <= span - 2 * pad) return lo + span * bias - view.k * (a + b) / 2;
    const minPos = hi - pad - view.k * b;
    const maxPos = lo + pad - view.k * a;
    return Math.max(minPos, Math.min(maxPos, pos));
  };
  view.x = axis(view.x, mapBounds.x0, mapBounds.x1, 0, W, 0.5);
  view.y = axis(view.y, mapBounds.y0, mapBounds.y1, top, bottom, 0.5);
  updateZoomControls();
}

function updateZoomControls() {
  const zin = document.getElementById('zoomIn');
  const zout = document.getElementById('zoomOut');
  const level = document.getElementById('zoomLevel');
  if (!zin || !zout || !level || !(K0 > 0)) return;
  const z = zoom();
  zin.disabled = z >= 23.99;
  zout.disabled = z <= 1.001;
  level.textContent = `${nf(z, z < 2 ? 1 : 0)}×`;
}

// Anchor the zoom on a point in the world and keep that point under the cursor or
// under the midpoint of the two fingers, whichever is driving.
function zoomAbout(k2, cx, cy, from) {
  const k = clampK(k2), s = k / from.k;
  view.k = k;
  view.x = cx - (from.cx - from.vx) * s;
  view.y = cy - (from.cy - from.vy) * s;
  clampView();
  invalidate(); dirtyAlloc = true;
}
function canvasPoint(e) {
  const box = cv.getBoundingClientRect();
  return { x: e.clientX - box.left, y: e.clientY - box.top };
}
function twoFingers() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

cv.addEventListener('pointerdown', e => {
  const p = canvasPoint(e);
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) {
    const t = twoFingers();
    pinch = { d: t.d, cx: t.cx, cy: t.cy, k: view.k, vx: view.x, vy: view.y };
    drag = null; cv.classList.remove('dragging');
  } else if (ptrs.size === 1) {
    drag = { x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false, touch: e.pointerType !== 'mouse' };
    cv.classList.add('dragging');
  }
});
cv.addEventListener('pointermove', e => {
  const p = canvasPoint(e);
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size >= 2) {
    const t = twoFingers();
    zoomAbout(pinch.k * (t.d / pinch.d), t.cx, t.cy, pinch);
    return;
  }
  if (drag) {
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.x = drag.vx + dx; view.y = drag.vy + dy;
    clampView();
    invalidate(); dirtyAlloc = true;
    return;
  }
  if (e.pointerType === 'mouse') pick(p.x, p.y);
});
function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size > 0) return;
  const was = drag;
  drag = null; cv.classList.remove('dragging');
  if (!was || was.moved) { writeHash(); return; }
  const p = canvasPoint(e);
  pick(p.x, p.y);
  select(hovered);
  // A finger leaves no cursor behind, so the highlight it lit has to go out with
  // it, or the map keeps showing a hover that nobody is making.
  if (was.touch) { hovered = null; tt.hidden = true; dirty = true; }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const p = canvasPoint(e);
  zoomAbout(view.k * Math.exp(-e.deltaY * 0.0016), p.x, p.y,
            { k: view.k, cx: p.x, cy: p.y, vx: view.x, vy: view.y });
  clearTimeout(window.__hashT);
  window.__hashT = setTimeout(writeHash, 350);
}, { passive: false });
cv.addEventListener('dblclick', e => {
  e.preventDefault();
  const p = canvasPoint(e);
  zoomAbout(view.k * 1.7, p.x, p.y,
            { k: view.k, cx: p.x, cy: p.y, vx: view.x, vy: view.y });
  writeHash();
});

function controlZoom(factor) {
  zoomAbout(view.k * factor, W / 2, H / 2,
            { k: view.k, cx: W / 2, cy: H / 2, vx: view.x, vy: view.y });
  cv.focus({ preventScroll: true });
  writeHash();
}
document.getElementById('zoomIn').onclick = () => controlZoom(1.6);
document.getElementById('zoomOut').onclick = () => controlZoom(1 / 1.6);
document.getElementById('zoomFit').onclick = () => {
  fit(); invalidate(); dirtyAlloc = true;
  cv.focus({ preventScroll: true });
  writeHash();
};

// The canvas is not a mouse-only instrument. Keyboard movement follows the same
// transform as dragging and zooming; the live status at the centre is then written
// through the existing tooltip, whose status role reads it aloud. Enter opens that
// feature and moves focus into the same evidence panel a pointer opens.
cv.addEventListener('keydown', e => {
  const step = Math.max(44, Math.min(W, H) * 0.09);
  let moved = true;
  if (e.key === 'ArrowLeft')       view.x += step;
  else if (e.key === 'ArrowRight') view.x -= step;
  else if (e.key === 'ArrowUp')    view.y += step;
  else if (e.key === 'ArrowDown')  view.y -= step;
  else if (e.key === '+' || e.key === '=') {
    zoomAbout(view.k * 1.35, W / 2, H / 2,
      { k: view.k, cx: W / 2, cy: H / 2, vx: view.x, vy: view.y });
  } else if (e.key === '-' || e.key === '_') {
    zoomAbout(view.k / 1.35, W / 2, H / 2,
      { k: view.k, cx: W / 2, cy: H / 2, vx: view.x, vy: view.y });
  } else if (e.key === 'Home' || e.key === '0') {
    fit(); invalidate(); dirtyAlloc = true;
  } else if (e.key === 'Enter' || e.key === ' ') {
    pick(W / 2, H / 2);
    select(hovered, true);
    moved = false;
  } else {
    moved = false;
  }
  if (!moved && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  if (moved) {
    clampView();
    invalidate(); dirtyAlloc = true;
    pick(W / 2, H / 2);
    writeHash();
  }
});

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
  if (mode === 'quality' && quality) {
    const q = showStations ? pickQuality(mx, my) : null;
    if (hovered?.ref !== q) dirty = true;
    hovered = q ? { kind: 'quality', ref: q } : null;
    tip(mx, my); return;
  }
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
  if (mode === 'wet' && wetlands) {
    const o = pickWetland(mx, my);
    if (hovered?.ref !== o) dirty = true;
    if (o) { hovered = { kind: 'wetland', ref: o }; tip(mx, my); return; }
    if (hovered?.kind === 'wetland') hovered = null;
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
  // Significant digits fall as the figure rises, and the separators are the
  // reader's: 1'042.5 in German, 1 042,5 in French, 1042.5 in Italian.
  return nfd(q, q >= 100 ? 0 : q >= 10 ? 1 : q >= 1 ? 2 : 3);
}
function tip(mx, my) {
  if (!hovered || !document.getElementById('panel').hidden) { tt.hidden = true; return; }
  if (hovered.kind === 'dam') {
    const d = hovered.ref;
    const lv = resLevels(resWeekIndex());
    const fl = isPowerDam(d) ? lv[d.g] : null;
    tt.innerHTML = `<div class="tName">${esc(d.n)}</div>` +
      `<div class="tVal">${T('m.tipDamFull', { v: nf(d.v) })}</div>` +
      `<div class="tEst">${fl === null ? esc(d.a)
        : T('m.tipDamLevel', { region: RESNAME[d.g], pct: nf(100 * fl), d: fmtDate(lv.d) })}</div>`;
  } else if (hovered.kind === 'residual') {
    const p = hovered.ref;
    tt.innerHTML = `<div class="tName">${esc(p.w || T('m.unnamedWater'))}${p.pl ? ', ' + esc(p.pl) : ''}</div>` +
      `<div class="tVal">Q<sub>347</sub> ${p.q === null ? '—' : esc(lps(p.q))}</div>` +
      `<div class="tLaw">${T('m.tipMin', { v: esc(lps(p.min)) })}</div>`;
  } else if (hovered.kind === 'glacier') {
    const g = hovered.ref;
    tt.innerHTML = `<div class="tName">${g.n ? esc(g.n) : T('m.unnamedGlacier', { id: esc(g.id) })}</div>` +
      `<div class="tVal">${T('m.tipIceNow', { a: nfd(g.a, 2), y: g.y ?? glaciers.now.year })}</div>` +
      `<div class="tEst">${g.a0 !== undefined ? T('m.tipIcePast', { a: nfd(g.a0, 2) }) : T('m.noPastBody')}</div>`;
  } else if (hovered.kind === 'use') {
    const p = hovered.ref;
    const line =
      p.kind === 'hydro' ? (p.q !== null ? T('m.atFullLoad', { q: fmtQ(p.q) }) : T('m.noHead'))
      : p.kind === 'ara' ? (p.e ? T('m.pe', { n: nf(p.e) }) : T('m.sizeNotStated'))
      : p.kind === 'npp' ? T('m.nppCooling')
      : T('m.noQuantity');
    tt.innerHTML = `<div class="tName">${p.n ? esc(p.n) : T('m.abstraction', { r: esc(p.r ?? T('m.withoutNumber')) })}</div>` +
      `<div class="tVal">${esc(line)}</div>` +
      `<div class="tEst">${esc(USE[p.kind].label)}${p.w ? ' &#183; ' + esc(p.w) : ''}${p.v ? ' &#183; ' + esc(p.v) : ''}</div>`;
  } else if (hovered.kind === 'wetland') {
    const o = hovered.ref;
    const c = WETCLASS[o.k], inv = wetlands.inventories[o.k];
    tt.innerHTML = `<div class="tName">${esc(o.n || c.label + ' ' + o.num)}</div>` +
      `<div class="tVal">${o.a >= 0.01 ? nfd(o.a, 2) + ' km²' : nf(Math.round(o.a * 1e6 / 1e4) / 100, 2) + ' ha'}` +
      `<i>·</i>${T('m.no', { n: esc(o.num) })}</div>` +
      `<div class="tLaw">${esc(c.label)}, ${esc(inv.sr)}</div>` +
      (o.t ? `<div class="tAlt">${esc(o.t)}</div>` : '');
  } else if (hovered.kind === 'station') {
    const s = hovered.ref;
    tt.innerHTML = `<div class="tName">${esc(s.name)}</div>` +
      `<div class="tVal">${s.q !== null && s.q !== undefined ? fmtQ(s.q) + ' m³/s' : T('m.sUnavailable')}</div>` +
      `<div class="tEst">${s.dischargeState === 'current'
        ? T('m.bafuGauge', { id: esc(s.id) })
        : T(`m.state.${s.dischargeState}`)}</div>`;
  } else if (hovered.kind === 'quality') {
    const s = hovered.ref, a = qualityCell(s), p = quality.parameters[qualityParam];
    const label = qualityParameterName(p), unit = qualityUnit(p);
    const status = !a ? T('m.qNotSampled', { y: qualityYear })
      : a[6] === null ? T('m.qAllBelow', { n: a[4], total: a[2] - a[5] })
      : T('m.qTipMedian', { v: qualityNumber(a[6]), unit, q: a[3], total: a[2] - a[5] });
    tt.innerHTML = `<div class="tName">${esc(s.name)}${s.water ? ' · ' + esc(s.water) : ''}</div>` +
      `<div class="tVal">${esc(label)}</div><div class="tEst">${status}</div>`;
  } else {
    const r = hovered.ref;
    const nm = nameOf(r);
    tt.innerHTML =
      `<div class="tName">${nm ? esc(nm.n) : T('m.riverReach')}</div>` +
      `<div class="tVal">${T('m.tipReach', { q: fmtQ(r.live), km: nf(Math.round(r.upland)) })}</div>` +
      `<div class="tEst">${r.basis === 'measured' ? T('m.basisMeasured')
        : r.basis === 'none' ? T('m.basisNone')
        : T('m.basisFrom', { g: esc(r.basis) })}</div>` +
      (nm && nm.alt.length ? `<div class="tAlt">${esc(nm.alt.join(' · '))}</div>` : '') +
      (alluvialByReach.has(r.id)
        ? `<div class="tLaw">${T('m.runsThrough', { z: esc(alluvialByReach.get(r.id).n) ||
            T('m.no', { n: esc(alluvialByReach.get(r.id).num) }) })}</div>` : '');
  }
  tt.hidden = false;
}

const panel = document.getElementById('panel');
let panelReturnFocus = null;
function revealPanel(moveFocus) {
  panel.hidden = false;
  if (moveFocus) requestAnimationFrame(() => panel.focus({ preventScroll: true }));
}
function closePanel(returnFocus = true) {
  panel.hidden = true;
  selected = null;
  dirty = true;
  const target = panelReturnFocus;
  panelReturnFocus = null;
  if (returnFocus && target?.isConnected) target.focus({ preventScroll: true });
}
function select(h, moveFocus = false) {
  selected = h;
  if (!h) { closePanel(false); return; }
  tt.hidden = true;
  if (!panel.contains(document.activeElement)) panelReturnFocus = document.activeElement;
  const titleEl = document.getElementById('panelTitle');
  const B = document.getElementById('panelBody');
  const N = document.getElementById('panelNote');
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;

  const X = document.getElementById('panelExtra');
  X.innerHTML = '';

  if (h.kind === 'dam') { panelDam(h.ref, titleEl, B, N, X); revealPanel(moveFocus); return; }
  if (h.kind === 'residual') { panelResidual(h.ref, titleEl, B, N, X); revealPanel(moveFocus); return; }
  if (h.kind === 'wetland') { panelWetland(h.ref, titleEl, B, N, X); revealPanel(moveFocus); return; }
  if (h.kind === 'quality') { panelQuality(h.ref, titleEl, B, N, X); revealPanel(moveFocus); return; }

  if (h.kind === 'glacier') {
    const g = h.ref;
    titleEl.textContent = g.n || T('m.UnnamedGlacier', { id: g.id });
    let html = row(T('m.gArea', { y: g.y ?? glaciers.now.year }), nfd(g.a, 3), 'km\u00b2');
    if (g.a0 !== undefined) {
      html += row(T('m.gArea1850'), nfd(g.a0, 3), 'km\u00b2');
      html += row(T('m.gLost'), nf(100 * (1 - g.a / g.a0)), '%');
    }
    html += row(T('m.gLength'), nfd(g.l, 2), 'km');
    if (g.mn) html += row(T('m.gLow'), nf(g.mn), 'm');
    if (g.mx) html += row(T('m.gHigh'), nf(g.mx), 'm');
    if (g.dl !== undefined) html += row(T('m.gTongue'), nf(g.dl), 'm');
    if (g.gn) html += row(T('m.gGauge'), esc(g.gn), '');
    html += row(T('m.gId'), esc(g.id), '');
    B.innerHTML = html;

    const ser = glaciers.byId.get(g.id);
    if (ser) X.innerHTML = spark(ser);

    N.innerHTML = T('m.gNote') + T(g.a0 !== undefined ? 'm.gNotePair' : 'm.gNoteGap') +
      (g.gn ? T('m.gNoteGauge') : '');
    revealPanel(moveFocus);
    return;
  }

  if (h.kind === 'use') {
    const p = h.ref;
    let html = '', note = '';
    if (p.kind === 'hydro') {
      titleEl.textContent = p.n;
      html += row(T('m.uPlace'), esc(p.l || '\u2014') + (p.c ? ', ' + esc(p.c) : ''), '');
      html += row(T('m.uType'), esc(p.t), '');
      if (p.s) html += row(T('m.uStatus'), esc(p.s), '');
      if (p.b) html += row(T('m.uSince'), p.b, '');
      if (p.h) html += row(T('m.uHead'), nf(p.h), 'm');
      if (p.p) html += row(T('m.uPower'), nf(p.p), 'MW');
      if (p.e) html += row(T('m.uProd'), nf(p.e), 'GWh/a');
      html += row(T('m.uDesignQ'), p.q === null ? '\u2014' : fmtQ(p.q), 'm³/s');
      note = p.q === null ? T('m.uHydroNoHead')
        : T('m.uHydroDerived') + T(p.t === 'Laufkraftwerk' ? 'm.uRunOfRiver' : 'm.uStorage');
    } else if (p.kind === 'abstraction') {
      titleEl.textContent = T('m.abstraction', { r: p.r ?? T('m.withoutNumber') });
      html += row(T('m.uWater'), esc(p.w || '\u2014'), '');
      html += row(T('m.uCanton'), esc(p.c || '\u2014'), '');
      html += row(T('m.uQuantity'), T('m.uNotInReg'), '');
      if (p.r) html += row(T('m.uReport'),
        `<a href="https://www.bafu-daten.ch/wasser/restwasser/data/data/er/de/${encodeURIComponent(p.r.replace(/-/g, ''))}.pdf" target="_blank" rel="noopener">${T('m.uPdf', { r: esc(p.r) })}</a>`, '');
      note = T('m.uAbsNote') + T(p.r ? 'm.uAbsHasReport' : 'm.uAbsNoReport');
      // The register carries no quantity at all, so on its own it can never reach
      // Art. 31. The nearest published Q347 is the only bridge there is, and it is
      // worth building as long as the panel keeps saying that it is a bridge.
      if (p.q347) {
        const mr = minResidual(p.q347);
        X.innerHTML = `<p class="statute">${T('m.uAbsBridge', {
          km: nfd(p.q347km, 2),
          same: T(p.q347same ? 'm.uAbsSame' : 'm.uAbsDiff'),
          q: esc(lps(p.q347)), min: esc(lps(mr)),
        })}</p>`;
      }
    } else if (p.kind === 'npp') {
      titleEl.textContent = p.n;
      html += row(T('m.uOperator'), esc(p.o || '\u2014'), '');
      html += row(T('m.uStatus'), esc(p.st ?? T('m.uAsRegister')), '');
      if (p.since) html += row(T('m.uSince2'), fmtDate(p.since), '');
      html += row(T('m.uCooling'), T('m.uNotOpen'), '');
      // The register still lists Muehleberg as a power station and its data state is
      // the day Muehleberg shut down. Correcting it openly, with the source, is the
      // only way to use the register without repeating its mistake.
      if (p.fix) {
        X.innerHTML = `<p class="aside">${T('m.uNppFix', { fix: esc(p.fix) })}` +
          (p.fixSrc ? ` <a href="${esc(p.fixSrc)}" target="_blank" rel="noopener">${T('m.uNppStatement')}</a>.` : '') +
          T('m.uNppVintage', { v: vintageOf('npp') }) + `</p>`;
      }
      note = T('m.uNppNote') + `<span class="statute">${T('m.uNppStatute')}</span>`;
    } else {
      titleEl.textContent = p.n;
      html += row(T('m.uPlace'), esc(p.o || '\u2014') + (p.c ? ', ' + esc(p.c) : ''), '');
      html += row(T('m.uReceiving'), esc(p.v || '\u2014'), '');
      if (p.e) html += row(T('m.uSize'), nf(p.e), T('m.uPeUnit'));
      html += row(T('m.uEffluent'), p.q === null ? T('m.uNotStated') : nfd(p.q, 1), '%');
      note = T('m.uAraNote');
      if (p.k === 'See') note += T('m.uAraLake');
      if (p.k === 'Versickern') note += T('m.uAraGround');
      if (p.q !== null && p.q > 100) note = `<span class="flag">${T('m.uAraOver100')}</span> ` + note;
      else if (p.q !== null && p.q >= 50) note = `<span class="flag">${T('m.uAraOver50')}</span> ` + note;
    }
    B.innerHTML = html;
    N.innerHTML = note;
    revealPanel(moveFocus);
    return;
  }

  if (h.kind === 'station') {
    const s = h.ref, o = s.obs ?? {}, raw = s.rawObs ?? {};
    titleEl.textContent = s.name;
    let html = row(T('m.sDischarge'), s.q === null ? T('m.sUnavailable') : fmtQ(s.q), s.q === null ? '' : 'm³/s');
    if (raw.time) html += row(T('m.sObserved'), fmtStamp(new Date(raw.time)), '');
    if (s.meanQ) html += row(T('m.sMean'), fmtQ(s.meanQ), 'm³/s');
    if (s.q !== null && s.q !== undefined && s.meanQ) html += row(T('m.sShare'), nf(100 * s.q / s.meanQ), '%');
    if (o.level !== null && o.level !== undefined) html += row(T('m.sLevel'), nfd(o.level, 2), 'm');
    if (o.temp !== null && o.temp !== undefined) html += row(T('m.sTemp'), nfd(o.temp, 1), '°C');
    if (o.danger) html += row(T('m.sDanger'), `<span class="pill d${o.danger}">${o.danger}</span>`, '');
    html += row(T('m.sStation'), s.id, '');
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
        extra = `<p class="${Math.abs(d) >= 4 ? 'flag' : 'aside'}">${T('m.sNeighbours', {
          k: kin.length, km: nf(near.at(-1).km), lo: nfd(kin[0], 1), hi: nfd(kin.at(-1), 1),
          med: nfd(m, 1), d: (d >= 0 ? '+' : '\u2212') + nfd(Math.abs(d), 1),
        })}${Math.abs(d) >= 4 ? T('m.sInstrument') : ''}</p>`;
      }
      if (o.temp >= 25) {
        extra += `<p class="${o.temp > 25 ? 'flag' : 'aside'}">${T(o.temp > 25 ? 'm.sAboveCeiling' : 'm.sAtCeiling')}</p>` +
          `<p class="statute">${T('m.sCoolingException')}</p>`;
      }
      document.getElementById('panelExtra').innerHTML = extra;
    }
    N.innerHTML = s.dischargeState === 'current'
      ? T('m.sNote', {
        unit: esc(s.unit), conv: s.factor !== 1 ? T('m.sConverted') : '',
        km: s.snapKm === undefined || s.snapKm === null ? '?' : nfd(s.snapKm, 2),
      })
      : T('m.sRejected', { reason: T(`m.state.${s.dischargeState}`) });
  } else {
    const r = h.ref;
    const nm = nameOf(r);
    titleEl.textContent = nm ? nm.n : T(r.est ? 'm.rEstimated' : 'm.rGauged');
    let html = nm && nm.alt.length
      ? `<dt>${T('m.rAlsoCalled')}</dt><dd class="plain">${esc(nm.alt.join(', '))}</dd>` : '';
    html += row(T('m.rNow'), fmtQ(r.live), 'm³/s');
    html += row(T('m.sMean'), fmtQ(r.mean), 'm³/s');
    html += row(T('m.sShare'), r.mean ? nf(100 * r.live / r.mean) : '—', '%');
    html += row(T('m.rUpland'), nf(Math.round(r.upland)), 'km²');
    html += row(T('m.rOrder'), r.ord, '');
    // Where the reach runs through an alluvial zone, that is a second duty on the
    // same water, and it belongs next to the discharge and not in another layer.
    const az = alluvialByReach.get(r.id);
    if (az) html += `<dt>${T('m.rAlluvial')}</dt><dd class="plain">${esc(az.n) || T('m.no', { n: esc(az.num) })}</dd>`;
    B.innerHTML = html;
    const basis =
      r.basis === 'measured' ? T('m.rBasisMeasured')
      : r.basis === 'none' ? T('m.rBasisNone')
      : T('m.rBasisFrom', { g: esc(r.basis) });
    if (az) {
      X.innerHTML = `<p class="statute">${T('m.rAlluvialNote', {
        z: esc(az.n) || T('m.no', { n: esc(az.num) }),
        sr: esc(wetlands.inventories.auen.sr),
      })}</p>`;
    }
    // Where the name came from, when there is one. The gazetteer places a label
    // and not a river, so a name carried along the channel from the nearest
    // placement is a different kind of claim from a name written on this reach,
    // and the panel says which it is rather than letting both look the same.
    N.innerHTML = basis + (nm
      ? T('m.rNamed', { y: names?.published?.slice(0, 4) ?? '2026' }) +
        T(nm.carried ? 'm.rCarried' : 'm.rPlaced')
      : T('m.rUnnamed'));
  }
  revealPanel(moveFocus);
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
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(T('m.sparkAria', { a: x0, b: x1 }))}">
      <line x1="0" y1="${zero}" x2="${w}" y2="${zero}" class="sparkZero"/>
      <path d="${d}" class="sparkLine"/>
    </svg>
    <figcaption>${T('m.sparkCap', { a: x0, b: x1, n: nf(ser.obs.length) })}</figcaption>
  </figure>`;
}

document.getElementById('panelClose').onclick = () => closePanel();
// Bound through a wrapper: onclick hands the listener a MouseEvent, and refresh's
// first parameter is the flag that decides whether the read is a silent one.
document.getElementById('refresh').onclick = () => refresh();
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
for (const el of document.querySelectorAll('#lgSource input[data-src]')) {
  el.onchange = () => { sourceOn[el.dataset.src] = el.checked; dirty = true; };
}
document.getElementById('togglePlaces').onchange = e => { showPlaces = e.target.checked; dirty = true; };
// The ground is exclusive: a hillshade and a topographic sheet under each other
// are two grounds, and the map ends up standing on neither.
for (const el of document.querySelectorAll('input[name="ground"]')) {
  el.onchange = () => {
    if (!el.checked) return;
    ground = el.value || null;
    for (const g of Object.values(GROUND)) g.clear();
    dirty = true;
  };
}
document.getElementById('toggleLive').onchange = e => setLiveOnly(e.target.checked);
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
  clampView();
  layoutSheet(); ribbonResize();
}
if (window.ResizeObserver) new ResizeObserver(() => relayout()).observe(cv);
let __relayoutT = 0;
window.addEventListener('resize', () => {
  relayout();
  clearTimeout(__relayoutT); __relayoutT = setTimeout(relayout, 120);
});
window.addEventListener('orientationchange', () => setTimeout(relayout, 280));
// Mobile browser chrome changes the visual viewport without always changing the
// layout viewport. Keep the map, sheet and bounded camera aligned with the part
// of the screen the reader can actually see.
window.visualViewport?.addEventListener('resize', () => {
  clearTimeout(__relayoutT); __relayoutT = setTimeout(relayout, 80);
});

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
const OWNS = { glacier: 'ice', use: 'use', dam: 'res', residual: 'residual', quality: 'quality' };
const layerLoads = new Map();
const LAYER_READY = {
  quality: () => !!quality,
  res: () => !!reservoirs,
  ice: () => !!glaciers && !!iceFrames,
  residual: () => !!residual,
  use: () => !!users,
  wet: () => !!wetlands,
};
const LAYER_LOAD = {
  quality: loadQuality,
  res: loadReservoirs,
  ice: async () => { await loadIce(); if (glaciers) await loadIceHistory(); },
  residual: loadResidual,
  use: loadUsers,
  wet: loadWetlands,
};
function requestLayerData(m, btn) {
  if (!LAYER_LOAD[m] || LAYER_READY[m]()) return false;
  wantMode = m;
  if (!layerLoads.has(m)) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    const task = Promise.resolve(LAYER_LOAD[m]()).finally(() => {
      layerLoads.delete(m);
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (LAYER_READY[m]()) {
        if (wantMode === m && setMode(m)) wantMode = null;
      } else if (wantMode === m) wantMode = null;
    });
    layerLoads.set(m, task);
  }
  return true;
}
function setMode(m) {
  // Returns whether the layer was actually shown. A layer whose data is still on
  // the wire is not a layer that is empty, and the caller has to be able to tell
  // the difference so it can ask again when the data lands.
  const btn = document.querySelector('#modes button[data-mode="' + m + '"]');
  if (!btn || btn.disabled) return false;
  // Live only means live only. Rather than silently doing nothing, the switch that
  // caused the refusal says which register the layer rests on and how old it is.
  if (liveOnly && ARCHIVAL[m]) {
    const note = document.getElementById('liveNote');
    if (note) {
      note.innerHTML = T('m.liveOnlyHidden', { layer: btn.textContent.toLowerCase(), src: ARCHIVAL[m] });
      note.classList.add('flash');
      setTimeout(() => note.classList.remove('flash'), 900);
    }
    return false;
  }
  // Optional evidence is loaded only when its question is asked. This keeps the
  // initial map small without making an unavailable layer look empty.
  if (requestLayerData(m, btn)) return false;
  if (m === 'source') loadCantons();
  mode = m;
  // The sheets take their accent from the layer, so a checkbox or a focus ring in
  // the legend is in the colour of the thing the legend is about.
  document.body.dataset.layer = m;
  for (const b of document.querySelectorAll('#modes button')) {
    const active = b.dataset.mode === m;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', String(active));
  }
  for (const [k, id] of Object.entries(LG)) document.getElementById(id).hidden = k !== m;
  document.getElementById('legendTitle').textContent = LGTITLE[m];
  document.getElementById('sheetTitle').textContent = LGTITLE[m];
  cv.setAttribute('aria-label', T('m.mapAria', { layer: LGTITLE[m] }));
  // A selection made on one layer is a fact about that layer. Carrying a glacier
  // panel into the reservoir layer would leave a reading on screen that the map
  // beneath it no longer supports.
  for (const [kind, owner] of Object.entries(OWNS)) {
    if (selected?.kind === kind && m !== owner) closePanel(false);
    if (hovered?.kind === kind && m !== owner) hovered = null;
  }
  const nav = document.getElementById('modes');
  if (nav.scrollWidth > nav.clientWidth + 4) {
    nav.scrollTo({ left: btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }
  setRibbon(m);
  if (dataView.open) renderDataView();
  clearFlow();
  dirty = true;
  return true;
}
for (const b of document.querySelectorAll('#modes button')) {
  b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  b.onclick = () => setMode(b.dataset.mode);
}

/* Between phone and wide desktop the translated layer names form a horizontal
   rail. Touch and trackpads scroll it natively; a vertical mouse wheel should be
   just as useful because the map page itself has no vertical scroll. */
(function practicalModeRail() {
  const modeNav = document.getElementById('modes');
  if (!modeNav) return;
  const rail = document.getElementById('modeRail');
  const syncCues = () => {
    const max = Math.max(0, modeNav.scrollWidth - modeNav.clientWidth);
    rail?.classList.toggle('canScrollBack', max > 4 && modeNav.scrollLeft > 6);
    rail?.classList.toggle('canScrollForward', max > 4 && modeNav.scrollLeft < max - 6);
  };
  modeNav.addEventListener('wheel', event => {
    const max = modeNav.scrollWidth - modeNav.clientWidth;
    if (max <= 2 || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const before = modeNav.scrollLeft;
    modeNav.scrollLeft = Math.max(0, Math.min(max, before + event.deltaY));
    if (modeNav.scrollLeft !== before) event.preventDefault();
  }, { passive: false });
  modeNav.addEventListener('scroll', syncCues, { passive: true });
  window.addEventListener('resize', syncCues, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(syncCues).observe(modeNav);
  requestAnimationFrame(syncCues);
})();

// ---- accessible data view --------------------------------------------------
// Canvas is the visual instrument, not the only route to its evidence. This
// dialog exposes the complete active layer as ordinary table semantics with the
// same values, evidence classes and sources.
const dataView = document.getElementById('dataView');
const dataSearch = document.getElementById('dataSearch');
const dataBody = document.getElementById('dataRows');
const dataPrev = document.getElementById('dataPrev');
const dataNext = document.getElementById('dataNext');
const DATA_PAGE = 50;
let dataPage = 0;
let dataReturnFocus = null;

function reachEvidence(r) {
  if (r.basis === 'measured') return T('m.basisMeasured');
  if (r.basis === 'none') return T('m.basisNone');
  return T('m.dataEstimated');
}
function dataRowsForMode() {
  const missing = T('m.dataNoValue');
  if (mode === 'flow' || mode === 'normal') return reaches.map(r => {
    const nm = nameOf(r);
    const current = r.basis !== 'none' && Number.isFinite(r.live);
    const value = !current ? T('m.dataNoCurrent')
      : mode === 'normal' && r.mean > 0 ? nfd(100 * r.live / r.mean, 0) + ' %'
      : fmtQ(r.live) + ' m³/s';
    return [nm?.n || T('m.dataReach', { id: r.id }), value, reachEvidence(r),
      r.basis === 'measured' ? 'BAFU · LINDAS' : 'HydroRIVERS · BAFU'];
  });
  if (mode === 'temp') return stations.map(s => [
    s.name + ' · ' + s.id,
    Number.isFinite(s.obs?.temp) ? nfd(s.obs.temp, 1) + ' °C' : missing,
    Number.isFinite(s.obs?.temp) ? T('m.dataMeasured') : T('m.dataNoCurrent'),
    'BAFU · LINDAS',
  ]);
  if (mode === 'quality' && quality) {
    const p = quality.parameters[qualityParam], unit = qualityUnit(p);
    return quality.stations.map(s => {
      const a = qualityCell(s);
      const value = !a ? T('m.qNotSampled', { y: qualityYear })
        : a[6] === null ? T('m.qAllBelow', { n: a[4], total: a[2] - a[5] })
        : qualityNumber(a[6]) + (unit ? ' ' + unit : '') + ' · ' + T('m.qMedian');
      return [s.name + (s.water ? ' · ' + s.water : '') + ' · ' + s.id, value,
        a ? T('m.dataMeasured') : T('m.dataNoValue'), 'BAFU · NAWA TREND · ' + qualityYear];
    });
  }
  if (mode === 'res' && reservoirs) {
    const levels = resLevels(resWeekIndex());
    return reservoirs.dams.map(d => {
      const fill = isPowerDam(d) ? levels[d.g] : null;
      return [d.n, nf(d.v) + ' mio m³' + (fill === null ? '' : ' · ' + nfd(100 * fill, 1) + ' % ' + RESNAME[d.g]),
        T('m.dataRegister'), 'BFE · ' + (fill === null ? T('m.dataCapacity') : fmtDate(levels.d))];
    });
  }
  if (mode === 'ice' && glaciers) return glaciers.glaciers.map(g => [
    g.n || T('m.unnamedGlacier', { id: g.id }),
    nfd(g.a, 2) + ' km² · ' + (g.y ?? glaciers.now.year),
    T('m.dataSurvey'), 'GLAMOS · SGI2023',
  ]);
  if (mode === 'residual' && residual) return residual.points.map(p => [
    (p.w || T('m.unnamedWater')) + (p.pl ? ' · ' + p.pl : '') + ' · ' + p.id,
    'Q347 ' + (p.q === null ? missing : lps(p.q)) + ' · Art. 31(1) ' + (p.min === null ? missing : lps(p.min)),
    residualMeasured(p) ? T('m.dataMeasuredModelled') : T('m.dataModelled'),
    'BAFU · ' + (RESIDUAL_SRC[p.src] ?? T('m.srcNone')),
  ]);
  if (mode === 'use' && users) return ['hydro', 'abstraction', 'npp', 'ara'].flatMap(kind =>
    users[kind].map(p => {
      const value = kind === 'hydro' && p.q !== null ? fmtQ(p.q) + ' m³/s ' + T('m.dataDerived')
        : kind === 'ara' && p.e ? T('m.pe', { n: nf(p.e) }) : missing;
      return [p.n || p.w || USE[kind].label + ' · ' + (p.r ?? ''), value,
        T('m.dataRegister'), USE[kind].label + ' · BAFU/BFE'];
    }));
  if (mode === 'wet' && wetlands) return wetlands.objects.map(o => [
    o.n || WETCLASS[o.k].label + ' · ' + o.num,
    o.a >= 0.01 ? nfd(o.a, 2) + ' km²' : nfd(o.a * 100, 2) + ' ha',
    T('m.dataRegister'), 'BAFU · ' + wetlands.inventories[o.k].sr,
  ]);
  if (mode === 'source' && vintage) {
    const keys = new Set(['groundwater', 'catchments', 'zones', 'names']);
    return vintage.sources.filter(s => keys.has(s.key)).map(s => [
      D(s.name), s.datenstand ? fmtDate(s.datenstand) : missing, D(s.cls), s.holder,
    ]);
  }
  return [];
}

function renderDataView() {
  if (!dataView.open) return;
  document.getElementById('dataViewTitle').textContent = T('m.dataTitle', { layer: LGTITLE[mode] });
  document.getElementById('dataViewLead').textContent = T('m.dataLead');
  const query = dataSearch.value.trim().toLocaleLowerCase(LANG);
  const rows = dataRowsForMode()
    .filter(row => !query || row.join(' ').toLocaleLowerCase(LANG).includes(query))
    .sort((a, b) => a[0].localeCompare(b[0], LANG, { numeric: true, sensitivity: 'base' }));
  const pages = Math.max(1, Math.ceil(rows.length / DATA_PAGE));
  dataPage = Math.min(dataPage, pages - 1);
  const from = dataPage * DATA_PAGE, shown = rows.slice(from, from + DATA_PAGE);
  dataBody.replaceChildren();
  if (!shown.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 4; td.textContent = T('m.dataEmpty'); tr.appendChild(td); dataBody.appendChild(tr);
  } else for (const row of shown) {
    const tr = document.createElement('tr');
    for (const value of row) {
      const td = document.createElement('td');
      td.textContent = value || '—';
      tr.appendChild(td);
    }
    dataBody.appendChild(tr);
  }
  document.getElementById('dataCaption').textContent = T('m.dataCaption', { layer: LGTITLE[mode], n: nf(rows.length) });
  document.getElementById('dataStatus').textContent = rows.length
    ? T('m.dataStatus', { from: nf(from + 1), to: nf(from + shown.length), n: nf(rows.length) })
    : T('m.dataStatusEmpty');
  dataPrev.disabled = dataPage === 0;
  dataNext.disabled = dataPage >= pages - 1;
}

document.getElementById('dataViewOpen').onclick = async event => {
  dataReturnFocus = event.currentTarget;
  dataPage = 0;
  dataSearch.value = '';
  dataView.showModal();
  if (mode === 'source' && !vintage) await loadVintage();
  renderDataView();
  dataSearch.focus();
};
document.getElementById('dataViewClose').onclick = () => dataView.close();
dataView.addEventListener('close', () => dataReturnFocus?.focus());
dataSearch.addEventListener('input', () => { dataPage = 0; renderDataView(); });
dataPrev.onclick = () => { dataPage--; renderDataView(); };
dataNext.onclick = () => { dataPage++; renderDataView(); };

// ---- Art. 31(1) GSchG -------------------------------------------------------
// The statute states a base figure at the foot of each band and a rate above it.
// The Art. 31(1) table itself lives in gschg31.js, loaded before this file and
// shared with the law page, so the statute is transcribed once and not twice.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!panel.hidden) closePanel();
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
const resColor = f => stepColor(PAL.res, f);

async function loadReservoirs() {
  try {
    const j = await readJSON(ROOT + 'data/reservoirs.json');
    for (const d of j.dams) {
      d.wx = mercX(d.x); d.wy = mercY(d.y); d.kind = 'dam';
      d.t = D(d.t); d.a = D(d.a);
    }
    if (j.fill?.latest) j.fill.latest.rank = D(j.fill.latest.rank);
    // biggest last, so a 385 mio m3 disc is never hidden under a farm pond
    j.dams.sort((a, b) => a.v - b.v);
    reservoirs = j;
    resLegend();
  } catch (e) {
    document.getElementById('resTotals').textContent = T('m.failRes', { e: e.message });
  }
}

function resLegend() {
  const t = reservoirs.totals, f = reservoirs.fill, L = f.latest;
  document.getElementById('resTotals').innerHTML = T('m.resTotals', {
    n: t.count, v: nf(t.volumeMioM3),
    vs: nf(t.byRegion.vs.v), gr: nf(t.byRegion.gr.v),
    ti: nf(t.byRegion.ti.v), rest: nf(t.byRegion.rest.v),
  });
  document.getElementById('resRank').innerHTML = T('m.resRank', {
    d: fmtDate(L.d), pct: nfd(L.pct, 1), gwh: nf(L.gwh), max: nf(L.max), rank: esc(L.rank),
  });
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
    ctx.fillStyle = PAL.plane;
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
    ctx.strokeStyle = f === null ? alpha(PAL.resFlood, 0.85) : (on ? PAL.resHead : alpha(PAL.resHi, 0.7));
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

function panelDam(d, titleEl, B, N, X) {
  const lv = resLevels(resWeekIndex());
  const f = isPowerDam(d) ? lv[d.g] : null;
  const share = 100 * d.v / reservoirs.totals.volumeMioM3;
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  titleEl.textContent = d.n;
  let html = '';
  if (d.rn && d.rn !== d.n) html += row(T('m.dRes'), esc(d.rn), '');
  html += row(T('m.uType'), esc(d.t), '');
  html += row(T('m.dPurpose'), esc(d.a), '');
  html += row(T('m.dVolume'), nf(d.v), 'mio m³');
  html += row(T('m.dShare'), share < 0.1 ? '&lt;' + nfd(0.1, 1) : nfd(share, 1), '%');
  if (d.h) html += row(T('m.dHeight'), nf(d.h), 'm');
  if (d.cl) html += row(T('m.dCrestLen'), nf(d.cl), 'm');
  if (d.ce) html += row(T('m.dCrestLvl'), nf(d.ce), 'm');
  if (d.il) html += row(T('m.dOutlet'), nf(d.il), 'm');
  if (d.b) html += row(T('m.uSince'), d.b, '');
  html += row(T('m.uCanton'), esc(d.c ?? '—'), '');
  B.innerHTML = html;

  X.innerHTML = f === null
    ? `<p class="aside">${T('m.dNoStat')}</p>`
    : `<p class="aside">${T('m.dRegionLevel', {
        region: RESNAME[d.g][0].toUpperCase() + RESNAME[d.g].slice(1),
        pct: nfd(100 * f, 1), d: fmtDate(lv.d),
        gwh: nf(Math.round(lv[d.g + 'Gwh'])), max: nf(reservoirs.fill.max[d.g]),
      })}</p>`;

  N.innerHTML = T('m.dNote', {
    v: vintageOf('dams'), from: fmtDate(reservoirs.fill.from), to: fmtDate(reservoirs.fill.to),
  });
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
  q8493: T('m.srcQ8493'),
  qp: T('m.srcQp'),
  qmod: T('m.srcQmod'),
};
const residualRadius = p => 1.7 + 2.1 * Math.log10(1 + (p.min ?? 0) / 10);
const residualMeasured = p => p.src === 'q8493' || p.src === 'qp';

async function loadResidual() {
  try {
    const j = await readJSON(ROOT + 'data/residual.json');
    for (const p of j.points) { p.wx = mercX(p.x); p.wy = mercY(p.y); p.kind = 'residual'; }
    j.points.sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
    residual = j;
    const c = j.counts;
    document.getElementById('residualCount').innerHTML = T('m.residualCount', {
      total: nf(c.total), gauged: nf(c.bySource.q8493 + c.bySource.qp), dec: nf(c.bySource.q8493),
      mod: nf(c.bySource.qmod), none: nf(c.bySource.none), with: nf(c.withQ347),
    });
  } catch (e) {
    document.getElementById('residualCount').textContent = T('m.failResid', { e: e.message });
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
      ctx.fillStyle = PAL.law; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.7; ctx.strokeStyle = halo(0.8); ctx.stroke();
    } else {
      ctx.fillStyle = PAL.plane; ctx.fill();
      ctx.lineWidth = on ? 2 : 1.2;
      ctx.strokeStyle = on ? PAL.law : PAL.lawDim; ctx.stroke();
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

const lps = v => v >= 1000 ? nf(v / 1000, 2) + ' m³/s'
                           : nf(v, 1) + ' l/s';

function panelResidual(p, titleEl, B, N, X) {
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  // the statutory rows wear the serif and the bone, so that the one quantity on
  // this panel that no instrument produced cannot be mistaken for one that was
  const law = (k, v, u) => `<dt class="statutory">${k}</dt><dd class="statutory">${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  titleEl.textContent = (p.w || T('m.rsNoName')) + (p.pl ? ', ' + p.pl : '');
  let html = '';
  html += row('Q<sub>347</sub>', p.q === null ? '—' : lps(p.q), '');
  html += row(T('m.rsBasis'), esc(RESIDUAL_SRC[p.src] ?? T('m.srcNone')), '');
  if (p.p) html += row(T('m.rsPeriod'), esc(p.p), '');
  if (p.lhg) html += row(T('m.rsGauge'), esc(p.lhg), '');
  if (p.ar) html += row(T('m.rsAreaReg'), nf(p.ar), 'km²');
  if (p.reachArea) html += row(T('m.rsAreaNet'), nf(p.reachArea), 'km²');
  if (p.mean !== null && p.mean !== undefined) html += row(T('m.rsReachMean'), fmtQ(p.mean), 'm³/s');
  if (p.min !== null) {
    html += law(T('m.rsMin'), lps(p.min), '');
    if (p.q) html += law(T('m.rsAsShare'), nf(100 * p.min / p.q), '%');
  }
  B.innerHTML = html;

  let extra = '';
  if (p.min !== null) {
    extra += `<p class="statute">${T('m.rsStatute', { v: lps(p.min) })}</p>`;
  }
  // The register's catchment and the network's catchment are two independent
  // statements about the same place. Where they disagree by more than a factor of
  // two the snap is probably on the wrong watercourse, and saying so is cheaper
  // than a silent wrong answer.
  if (p.ar && p.reachArea) {
    const f = p.reachArea / p.ar;
    if (f > 2 || f < 0.5) {
      extra += `<p class="flag">${T('m.rsMismatch', { f: nfd(f > 1 ? f : 1 / f, 1) })}</p>`;
    }
  }
  X.innerHTML = extra;

  N.innerHTML = T('m.rsNote', { v: vintageOf('q347') });
}

/* ===========================================================================
   PROTECTED WETLAND, five federal inventories
   The reason these are on a water map is not that they are damp. Each ordinance
   states its protection aim in terms of water: the Auenverordnung requires that
   the natural dynamics of the water and sediment regime be preserved, which is a
   duty about how much water passes and when, on the very reaches the residual-flow
   layer already puts a statutory floor under. A mire dies if the water table drops.
   These are places where a quantity of water is already the subject of a duty.

   TWO REGISTERS, because there are two protections and they are not the same
   strength. Alluvial zones and amphibian spawning sites are protected by ordinance
   and the aim is stated as water: they wear the water's own hue, being the river's
   own ground. Bogs, fens and mire landscapes are protected by Art. 78(5) of the
   Federal Constitution — the article the Rothenthurm initiative wrote in 1987 —
   which forbids installations and alteration of the ground save for the mires’
   own protection and their existing agricultural use, with no balancing test to
   lose: they wear the bone every statutory quantity on this map wears. A reader
   who learns only that difference has learnt the useful thing.

   Mire landscapes are drawn as an outline and never filled. They are containers,
   875 km2 of them, and a fill would bury the bogs they are drawn around.
   =========================================================================== */
// fill and line are alphas; wide is the stroke in device pixels. The alluvial zones
// are given the strongest hand of the five because they are the reason this layer
// is here: they are drawn as a boundary first and a wash second, since a boundary
// is what a legal object is and an outline does not compete with the blue lines the
// way a wash does.
const WETCLASS = {
  auen:  { label: T('m.wetAuen'),  reg: 'water', fill: 0.20, line: 0.95, wide: 1.5 },
  amphi: { label: T('m.wetAmphi'), reg: 'water', fill: 0.09, line: 0.42, wide: 0.8 },
  hoch:  { label: T('m.wetHoch'),  reg: 'law',   fill: 0.24, line: 0.70, wide: 0.9 },
  flach: { label: T('m.wetFlach'), reg: 'law',   fill: 0.14, line: 0.46, wide: 0.8 },
  moorl: { label: T('m.wetMoorl'), reg: 'law',   fill: 0,    line: 0.32, wide: 1.1 },
};
// The water register is a pale wash rather than the ramp's own middle. An alluvial
// zone is the river's ground, so it belongs to the water's hue — but drawn in the
// ramp's blue it vanished into the rivers running through it, which is the one
// thing this layer must not do.
const wetRgb = reg => (reg === 'water' ? PAL.wetWaterRgb : PAL.lawRgb);
const wetPaint = (k, a) => `rgba(${wetRgb(WETCLASS[k].reg)},${a})`;
// Drawn largest container first so the small objects sit on top of it.
const WETORDER = ['moorl', 'flach', 'amphi', 'auen', 'hoch'];

let wetlands = null;                  // {objects[], inventories, ...}
let alluvialByReach = new Map();      // reach id -> the zone it runs through

async function loadWetlands() {
  try {
    const w = await readJSON(ROOT + 'data/wetlands.json');
    const P = w.p;
    for (const i of Object.values(w.inventories)) { i.name = D(i.name); i.ord = D(i.ord); }
    for (const o of w.objects) if (o.t) o.t = D(o.t);
    for (const o of w.objects) {
      if (o.r) {
        // One Path2D per object, in world coordinates, built once. The canvas
        // transform carries it to the screen; 3,211 outlines rebuilt on every
        // frame would be work for nothing. Ring order and winding are the source's
        // own, so a fill with the nonzero rule punches the holes by itself.
        const path = new Path2D();
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        o.rings = o.r.map(([xs, ys]) => {
          const n = xs.length;
          const px = new Float64Array(n), py = new Float64Array(n);
          let x = 0, y = 0;
          for (let i = 0; i < n; i++) {
            x += xs[i]; y += ys[i];
            px[i] = mercX(x / P); py[i] = mercY(y / P);
            if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i];
            if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i];
          }
          path.moveTo(px[0], py[0]);
          for (let i = 1; i < n; i++) path.lineTo(px[i], py[i]);
          path.closePath();
          return { px, py };
        });
        o.path = path;
        o.b = [x0, y0, x1, y1];
        o.w = [(x0 + x1) / 2, (y0 + y1) / 2];
        o.r = null;
      } else if (o.c) {
        // Too small for an outline at any zoom this map reaches, and still an
        // object of the inventory. It keeps a mark and says so in the panel.
        o.w = [mercX(o.c[0]), mercY(o.c[1])];
        o.b = [o.w[0], o.w[1], o.w[0], o.w[1]];
      }
      o.kind = 'wetland';
    }
    alluvialByReach = new Map();
    for (const o of w.objects) {
      if (!o.h) continue;
      for (const id of o.h) if (!alluvialByReach.has(id)) alluvialByReach.set(id, o);
    }
    wetlands = w;
    wetlandNote();
  } catch (e) {
    const el = document.getElementById('wetCount');
    if (el) el.textContent = T('m.failWet', { e: e.message });
  }
}

function wetlandNote() {
  const el = document.getElementById('wetCount');
  if (!el || !wetlands) return;
  const inv = wetlands.inventories;
  const n = wetlands.reachesInAlluvial;
  el.innerHTML = T('m.wetNote', { n: nf(n), total: nf(reaches.length) });
  const t = document.getElementById('wetTotals');
  if (t) {
    t.innerHTML = Object.keys(WETCLASS).map(k => {
      const c = inv[k];
      return `<li><span class="swatch wet_${k}"></span>${esc(c.name)}<i>${nf(c.count)}` +
             `<span class="wetKm">${nf(c.km2)} km&#178;</span></i></li>`;
    }).join('');
  }
}

// The panel for one object of one inventory. The object number is given the same
// weight as the name because the number is what an ordinance, an object sheet and a
// decision all use, and a reader who has to cite this is citing the number.
function panelWetland(o, titleEl, B, N, X) {
  const row = (k, v, u) => `<dt>${k}</dt><dd>${v}${u ? `<span class="unit">${u}</span>` : ''}</dd>`;
  const c = WETCLASS[o.k], inv = wetlands.inventories[o.k];
  titleEl.textContent = o.n || T('m.wTitle', { label: c.label, num: o.num });

  let html = row(T('m.wInventory'), esc(inv.name), '');
  html += `<dt>${T('m.wNumber')}</dt><dd class="plain">${esc(o.num)}</dd>`;
  html += o.a >= 0.01 ? row(T('m.wArea'), nfd(o.a, 2), 'km²')
                      : row(T('m.wArea'), nfd(o.a * 100, 2), 'ha');
  if (o.t) html += `<dt>${T('m.uType')}</dt><dd class="plain">${esc(o.t)}</dd>`;
  html += `<dt>${T('m.rsBasis')}</dt><dd class="plain">${esc(inv.ord)}, ${esc(inv.sr)}</dd>`;
  if (o.h) html += row(T('m.wReaches'), o.h.length, '');
  B.innerHTML = html;

  // An alluvial zone is where this map's two legal layers land on the same water,
  // and that is the whole reason the inventory is drawn here rather than admired.
  let extra = '';
  if (o.k === 'auen') {
    extra += `<p class="statute">${T('m.wAuen', {
      n: o.h ? Tn('m.wReach', o.h.length) : T('m.wReachSome'),
    })}</p>`;
  } else if (o.k === 'moorl' || o.k === 'hoch' || o.k === 'flach') {
    extra += `<p class="statute">${T('m.wMire', {
      what: T(o.k === 'moorl' ? 'm.wLandscape' : 'm.wMireWord'),
    })}</p>`;
  }
  if (!o.path) {
    extra += `<p class="aside">${T('m.wTooSmall')}</p>`;
  }
  const sheet = wetSheet(o);
  if (sheet) {
    extra += `<p class="aside">${T('m.wSheet', { url: esc(sheet) })}</p>`;
  }
  X.innerHTML = extra;

  N.innerHTML = T('m.wNote', {
    name: esc(inv.name), ord: esc(inv.ord), sr: esc(inv.sr),
    v: vintageOf('wet_' + o.k), tol: wetlands.tolerance_m,
  });
}

function drawWetlands() {
  // The visible world rectangle, so that 3,211 outlines are not all handed to the
  // rasteriser when a dozen are on the screen.
  const wx0 = -view.x / view.k, wy0 = -view.y / view.k;
  const wx1 = (W - view.x) / view.k, wy1 = (H - view.y) / view.k;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(view.x, view.y);
  ctx.scale(view.k, view.k);
  ctx.lineJoin = 'round';
  // Below this area an object is smaller than a few pixels and adds speckle rather
  // than information, so it waits for the zoom that can draw it. It is never
  // dropped for good: at valley zoom every object of every inventory is on screen.
  const z = zoom();
  const minA = 0.5 / Math.pow(z, 1.7);
  const pts = [];
  for (const k of WETORDER) {
    const c = WETCLASS[k];
    ctx.lineWidth = c.wide / view.k;
    for (const o of wetlands.objects) {
      if (o.k !== k) continue;
      if (!o.path) { pts.push(o); continue; }
      if (o.a < minA) continue;
      if (o.b[2] < wx0 || o.b[0] > wx1 || o.b[3] < wy0 || o.b[1] > wy1) continue;
      const on = hovered?.kind === 'wetland' && hovered.ref === o;
      if (c.fill) {
        ctx.fillStyle = wetPaint(k, on ? Math.min(0.5, c.fill * 2.4) : c.fill);
        ctx.fill(o.path, 'evenodd');
      }
      ctx.strokeStyle = wetPaint(k, on ? 0.95 : c.line);
      ctx.stroke(o.path);
    }
  }
  ctx.restore();
  // The objects too small to draw as ground. A ring, not a disc: it carries a place
  // and not a quantity, which is the same grammar the use layer runs on. They wait
  // for the zoom that can tell them apart; four hundred and forty-four rings over the country at
  // country view is a texture and not a fact.
  if (z < 2.4) return;
  for (const o of pts) {
    const x = sx(o.w[0]), y = sy(o.w[1]);
    if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
    const on = hovered?.kind === 'wetland' && hovered.ref === o;
    ctx.beginPath();
    ctx.arc(x, y, on ? 4.5 : 2.4, 0, 6.2832);
    ctx.lineWidth = on ? 1.8 : 1;
    ctx.strokeStyle = wetPaint(o.k, on ? 0.95 : 0.5);
    ctx.stroke();
  }
}

// Point in polygon against the object's own rings, in world coordinates. The rings
// keep the source's winding, so counting crossings over all of them at once treats
// a hole as a hole.
function inWetland(o, wx, wy) {
  if (!o.rings) return false;
  if (wx < o.b[0] || wx > o.b[2] || wy < o.b[1] || wy > o.b[3]) return false;
  let hit = false;
  for (const r of o.rings) {
    const { px, py } = r;
    for (let i = 0, j = px.length - 1; i < px.length; j = i++) {
      if ((py[i] > wy) !== (py[j] > wy) &&
          wx < (px[j] - px[i]) * (wy - py[i]) / (py[j] - py[i]) + px[i]) hit = !hit;
    }
  }
  return hit;
}

function pickWetland(mx, my) {
  const wx = (mx - view.x) / view.k, wy = (my - view.y) / view.k;
  // Smallest first, so that a bog inside a mire landscape answers for itself rather
  // than being swallowed by the container drawn around it.
  let best = null;
  for (const o of wetlands.objects) {
    if (!inWetland(o, wx, wy)) continue;
    if (!best || o.a < best.a) best = o;
  }
  if (best) return best;
  let near = null, bd = 81;
  for (const o of wetlands.objects) {
    if (o.path) continue;
    const dx = sx(o.w[0]) - mx, dy = sy(o.w[1]) - my;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; near = o; }
  }
  return near;
}

// The object sheet: the federal PDF that carries the protection aim and the
// boundary description for this object, rebuilt from the template on its inventory.
const wetSheet = o => (o.pdf && wetlands ? wetlands.inventories[o.k].sheet + o.pdf : null);

/* ===========================================================================
   ICE, SIX SURVEYS
   1850, 1931, 1973, 2010, 2016, 2023. The intervals are 81, 42, 37, 6 and 7 years, and
   the ribbon holds each frame for its own interval, so the acceleration is in
   the motion and not only in the caption. Between two surveys the outline is
   interpolated by dissolve, which is honest about there being no measurement in
   between: what you are watching there is arithmetic, not a survey.
   =========================================================================== */
const ICE_Y0 = 1850, ICE_Y1 = 2023;

async function loadIceHistory() {
  if (!glaciers) return;
  try {
    const j = await readJSON(ROOT + 'data/icehistory.json');
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
    document.getElementById('iceTotals').innerHTML = T('m.iceSeq', {
      k0: nf(F[0].km2), y0: F[0].y, k1: nf(F.at(-1).km2), y1: F.at(-1).y,
      lost: nf(100 * (1 - F.at(-1).km2 / F[0].km2)),
      a: worst.a.y, b: worst.b.y, rate: nfd(worst.rate, 1),
    });
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
  ctx.fillStyle = `rgba(${PAL.icePastRgb},0.17)`;
  ctx.fill(glaciers.pathPast, 'evenodd');
  ctx.strokeStyle = `rgba(${PAL.icePastRgb},0.5)`;
  ctx.stroke(glaciers.pathPast);

  // what there is at the playhead
  ctx.fillStyle = PAL.ice;
  if (!st) { ctx.globalAlpha = 0.92; ctx.fill(glaciers.pathNow, 'evenodd'); }
  else {
    if (st.t < 1 && st.a.path) { ctx.globalAlpha = 0.92 * (1 - st.t); ctx.fill(st.a.path, 'evenodd'); }
    if (st.t > 0 && st.b?.path) { ctx.globalAlpha = 0.92 * st.t; ctx.fill(st.b.path, 'evenodd'); }
  }
  if (hovered?.kind === 'glacier' && hovered.ref.path) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PAL.warning;
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
   six glacier surveys on a real time axis. It is a chart and a control at once,
   and the map is bound to its playhead.
   =========================================================================== */
const RESNOTE = T('m.resNote');
const ICENOTE = T('m.iceNote');

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
      kind === 'res' ? T('m.ribTitleRes') : T('m.ribTitleIce');
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
    rctx.fillStyle = alpha(PAL.resFull, 0.13);
    rctx.fill();

    const grad = rctx.createLinearGradient(0, pt, 0, h - pb);
    grad.addColorStop(0, alpha(PAL.resFull, 0.30));
    grad.addColorStop(1, alpha(PAL.resFull, 0.02));
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
    rctx.strokeStyle = PAL.resFull; rctx.lineWidth = 1; rctx.stroke();

    rctx.fillStyle = PAL.inkMuted;
    const y0 = +ws[0][0].slice(0, 4), y1 = +ws[n - 1][0].slice(0, 4);
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) {
      const i = ws.findIndex(r => r[0].slice(0, 4) === String(y));
      if (i < 0) continue;
      const X = px(i / (n - 1));
      rctx.fillRect(X, h - pb + 1, 1, 3);
      const t = String(y), tw = rctx.measureText(t).width;
      if (X + 3 + tw <= w) rctx.fillText(t, X + 3, h - pb + 2);   // measure, do not guess
    }
    ribbonHead(px(resWeekIndex() / (n - 1)), py(ws[resWeekIndex()][1] / 100), h, pt, pb, PAL.resHead);
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
    rctx.fillStyle = alpha(PAL.ice, 0.10); rctx.fill();

    rctx.beginPath();
    for (const [i, f] of F.entries()) i ? rctx.lineTo(X(f.y), Y(f.km2)) : rctx.moveTo(X(f.y), Y(f.km2));
    rctx.strokeStyle = PAL.ice; rctx.lineWidth = 1.3; rctx.stroke();

    for (const f of F) {
      rctx.beginPath(); rctx.arc(X(f.y), Y(f.km2), 2.6, 0, 6.2832);
      rctx.fillStyle = PAL.plane; rctx.fill();
      rctx.lineWidth = 1.3; rctx.strokeStyle = PAL.ice; rctx.stroke();
    }
    rctx.fillStyle = PAL.inkMuted;
    for (const [i, f] of F.entries()) {
      const lx = Math.max(0, Math.min(w - 20, X(f.y) - (i === 0 ? 0 : i === F.length - 1 ? 20 : 10)));
      rctx.fillText(String(f.y), lx, h - pb + 2);
    }
    const st = iceAt(iceYear());
    ribbonHead(X(iceYear()), Y(st.km2), h, pt, pb, PAL.ink);
  }
}

function ribbonHead(x, y, h, pt, pb, col) {
  rctx.strokeStyle = ink(0.4);
  rctx.lineWidth = 1;
  rctx.beginPath(); rctx.moveTo(x, pt - 3); rctx.lineTo(x, h - pb); rctx.stroke();
  rctx.beginPath(); rctx.arc(x, y, 3.4, 0, 6.2832);
  rctx.fillStyle = col; rctx.fill();
  rctx.strokeStyle = PAL.plane; rctx.lineWidth = 1.2; rctx.stroke();
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
function readRibbon() {
  const out = document.getElementById('ribbonRead');
  if (ribbon.mode === 'res') {
    const i = resWeekIndex(), lv = resLevels(i);
    const e = reservoirs.fill.envelope[isoWeekIndex(lv.d)];
    const band = !e ? '' : lv.pct < e.p10 ? T('m.ribP10')
                        : lv.pct > e.p90 ? T('m.ribP90') : '';
    out.textContent = T('m.ribRes', { d: fmtDate(lv.d), pct: nfd(lv.pct, 1), gwh: nf(lv.gwh), band });
  } else if (ribbon.mode === 'ice') {
    const y = iceYear(), st = iceAt(y);
    out.textContent = st.exact
      ? T('m.ribSurvey', { y: Math.round(y), km2: nf(st.km2) })
      : T('m.ribBetween', { y: Math.round(y), km2: nf(Math.round(st.km2)), a: st.a.y, b: st.b.y });
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
  playLabel.textContent = T('m.pause');
  playBtn.setAttribute('aria-label', T('m.pause'));
  playRAF = requestAnimationFrame(stepPlay);
}
function stopPlay() {
  ribbon.playing = false;
  cancelAnimationFrame(playRAF);
  playIcon.setAttribute('d', 'M1 1l10 6-10 6z');
  playLabel.textContent = T('m.play');
  playBtn.setAttribute('aria-label', T('m.play'));
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
    vintage = await readJSON(ROOT + 'data/vintage.json');
    // The file was written on build day and is read on some later day. sources.html
    // ages every source to the reader's own clock; this legend names two of the same
    // registers, so it ages them the same way — otherwise the two pages disagree by
    // up to a week about the age of the same file.
    const day = 86400000, now = Date.now();
    for (const s of vintage.sources) {
      s.ageDays = s.datenstand ? Math.floor((now - Date.parse(s.datenstand)) / day) : null;
    }
    renderVintage();
  } catch (e) {
    // Nothing on the map depends on this beyond two notes, so a failure here is
    // reported where it is read: in the note itself, not in the console.
    const ages = document.getElementById('srcAges');
    if (ages) ages.textContent = T('src.loadFail', { e: e.message });
  }
}
const vintageOf = key => {
  const s = vintage?.sources.find(x => x.key === key);
  return s?.datenstand ? fmtDate(s.datenstand) : T('m.unstated');
};
// The water-sources legend prints its own layers' ages, because the whole point of
// that layer is where the water comes from and one of its three pictures is most of
// a decade old. Making the reader open another page to find that out would be
// exactly the defect this project exists to correct. The full table of every source
// and its age is on sources.html, drawn from this same file.
function renderVintage() {
  const ages = document.getElementById('srcAges');
  if (!ages) return;
  const gw = vintage.sources.find(x => x.key === 'groundwater');
  const ca = vintage.sources.find(x => x.key === 'catchments');
  ages.innerHTML = T('m.srcAges', {
    gw: vintageOf('groundwater'),
    gwAge: gw?.ageDays ? T('m.srcAgeOld', { a: ageText(gw.ageDays) }) : '',
    ca: vintageOf('catchments'),
    caAge: ca?.ageDays ? T('m.srcAgeBare', { a: ageText(ca.ageDays) }) : '',
  });
}

/* ===========================================================================
   THE EVIDENCE WORKSPACE
   Earlier releases turned the legend into a bottom sheet on phones. The map and
   evidence now occupy separate boxes, so relayout only clears any transform left
   by an older cached stylesheet.
   =========================================================================== */
function isPhone() { return window.matchMedia('(max-width: 700px)').matches; }
let sheetOpen = false;
const legendEl = document.getElementById('legend');
const handleEl = document.getElementById('sheetHandle');

function layoutSheet() {
  const root = document.documentElement;
  legendEl.style.transform = '';
  legendEl.classList.remove('collapsed');
  root.style.setProperty('--sheet-h', '0px');
}
handleEl.onclick = () => {
  // Backward-compatible fallback for an older cached stylesheet. The current
  // layout hides this handle and scrolls the evidence workspace instead.
  sheetOpen = true;
  handleEl.setAttribute('aria-expanded', 'true');
};


/* ===========================================================================
   THE GROUND, AND THE THINGS UNDER IT
   Everything above this point is drawn from data the page holds. Everything in
   this section is drawn by a federal server and arrives as a picture.

   That is a real difference and the page keeps it visible. A WMS image is not
   queryable, not dated in the picture, and not something this map can check: it
   is somebody else's rendering, requested for the rectangle on screen. So none
   of it is on by default, each layer says whose it is, and the water this map
   computes is never drawn from one of these.

   Mechanics. The map's own projection is Web Mercator, and both services answer
   in EPSG:3857, so a GetMap for the current view needs no reprojection: the
   image comes back in the frame the canvas is already in and is drawn into the
   rectangle it was asked for. One request per layer covers the whole viewport
   with a margin, and is renewed only when the view leaves that margin or the
   scale moves far enough to matter.

   Terms of use. swisstopo and the federal offices publish under the FSDI general
   terms of use, free use with source attribution. geodienste.ch serves the
   cantons' own data on the cantons' terms; the twenty-six that matter here are
   all marked freely available. Both are named on the page.
   =========================================================================== */

const FSDI = 'https://wms.geo.admin.ch/';
const GEODIENSTE = 'https://geodienste.ch/db/planerischer_gewaesserschutz_v1_2_0/deu';
const HALF = 20037508.342789244;          // half the width of the Mercator world, in metres

// world (0..1 Mercator) to EPSG:3857 metres
const eastOf  = wx => (wx * 2 - 1) * HALF;
const northOf = wy => (1 - wy * 2) * HALF;

// A picture requested for a rectangle, redrawn from cache while the next one is
// on the wire.
//
// Every one of these sheets is rendered on a federal server that has never heard of
// this page, for white paper: dark ink on light ground. That is the right way round
// for the day surface and exactly the wrong way round for the night one, so each
// layer carries two treatments and picks by surface. `look()` is read at request
// time and the cache is dropped when the surface changes, because a tile that was
// inverted for the dark plane is not a tile for paper.
const wmsLayers = [];
function wmsLayer(spec) {
  const layer = {
    spec,
    look() { return spec[document.documentElement.dataset.theme === 'day' ? 'day' : 'night'] ?? {}; },
    img: null, box: null,          // what is currently drawable
    want: null, loading: false,    // what has been asked for
    fail: 0,
    clear() { this.img = null; this.box = null; this.want = null; },
    // the rectangle to ask for: the viewport with a margin, quantised so a small
    // pan does not start a new request
    need() {
      const pad = 0.22;
      const w = W / view.k, h = H / view.k;
      const x0 = (0 - view.x) / view.k - w * pad, y0 = (0 - view.y) / view.k - h * pad;
      const q = (w + h) / 40;
      const snap = v => Math.round(v / q) * q;
      return { x0: snap(x0), y0: snap(y0), x1: snap(x0 + w * (1 + 2 * pad)), y1: snap(y0 + h * (1 + 2 * pad)) };
    },
    covers() {
      const b = this.box;
      if (!b) return false;
      const w = W / view.k, h = H / view.k;
      const x0 = (0 - view.x) / view.k, y0 = (0 - view.y) / view.k;
      // held only while the scale is close: a picture stretched much beyond the
      // resolution it was drawn at stops being terrain and becomes mud
      if (b.k > view.k * 1.9 || b.k < view.k / 1.9) return false;
      return b.x0 <= x0 && b.y0 <= y0 && b.x1 >= x0 + w && b.y1 >= y0 + h;
    },
    request() {
      if (this.loading || this.fail > 3) return;
      const n = this.need();
      if (this.want && this.want.x0 === n.x0 && this.want.y0 === n.y0 &&
          this.want.x1 === n.x1 && this.want.y1 === n.y1 && this.box) return;
      const px = Math.max(320, Math.min(2200, Math.round((n.x1 - n.x0) * view.k)));
      const py = Math.max(200, Math.min(2200, Math.round((n.y1 - n.y0) * view.k)));
      const u = new URL(this.spec.service);
      u.search = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
        LAYERS: this.spec.layers, STYLES: '', CRS: 'EPSG:3857',
        // WMS 1.3.0 in a projected CRS takes the bbox as minx,miny,maxx,maxy, and
        // Mercator north grows the opposite way from the canvas y axis, so the
        // bottom of the screen is the minimum northing.
        BBOX: [eastOf(n.x0), northOf(n.y1), eastOf(n.x1), northOf(n.y0)].join(','),
        WIDTH: String(px), HEIGHT: String(py),
        FORMAT: 'image/png', TRANSPARENT: 'true',
      }).toString();
      this.want = n;
      this.loading = true;
      const im = new Image();
      im.onload = () => {
        this.loading = false; this.fail = 0;
        const f = this.look().filter;
        this.img = f ? treat(im, f) : im;
        this.box = { ...n, k: view.k };
        dirty = true;
      };
      im.onerror = () => { this.loading = false; this.fail++; this.want = null; };
      im.src = u.toString();
    },
    draw() {
      if (!this.img || !this.box) return;
      const b = this.box;
      ctx.save();
      ctx.globalAlpha = this.look().alpha ?? this.spec.alpha;
      const bl = this.look().blend;
      if (bl) ctx.globalCompositeOperation = bl;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.img, sx(b.x0), sy(b.y0), (b.x1 - b.x0) * view.k, (b.y1 - b.y0) * view.k);
      ctx.restore();
    },
  };
  wmsLayers.push(layer);
  return layer;
}

// Nothing is ever read back off a canvas in this file, so a picture from another
// origin can be composited freely.
function treat(im, filter) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  if (!('filter' in g)) return im;
  g.filter = filter;
  g.drawImage(im, 0, 0);
  return c;
}

// The two basemaps, both off unless asked for, and each drawn twice over.
//
// Relief is a hillshade: mid grey where the ground is flat, dark in shadow, light
// on a lit slope. The whole problem is the flat ground, which is most of the
// picture and wants to become a slab of grey over the country, taking the discharge
// ramp's contrast with it. Each surface solves it with the blend mode that can only
// move pixels one way. On night the sheet is inverted and composited with `lighten`,
// so it can only add light: shadows fall to the plane's own black and only the lit
// faces come up out of it. On day the sheet is left the way it was drawn and
// composited with `multiply`, so it can only take light away: the flat mid grey is
// lifted until it barely marks the paper and only the shadows bite.
const GROUND = {
  relief: wmsLayer({ service: FSDI, layers: 'ch.swisstopo.swissalti3d-reliefschattierung',
                     night: { alpha: 0.42, blend: 'lighten', filter: 'invert(1) contrast(1.35)' },
                     day:   { alpha: 0.5,  blend: 'multiply', filter: 'brightness(1.28) contrast(1.3)' } }),
  topo:   wmsLayer({ service: FSDI, layers: 'ch.swisstopo.pixelkarte-grau',
                     night: { alpha: 0.46, blend: 'lighten', filter: 'invert(1) saturate(0.3)' },
                     day:   { alpha: 0.5,  blend: 'multiply', filter: 'saturate(0.25) brightness(1.06)' } }),
};
let ground = null;

/* ---------------------------------------------------------------------------
   WHERE THE WATER COMES FROM
   Four senses of the word source, from four different federal or cantonal
   registers, each of which answers a different question:

     groundwater   the bodies themselves, and the aquifers they sit in
     headwaters    the top of the drawn network: every first-order reach
     catchments    which ground drains to which water
     drinking      the protection zones around a public abstraction

   The first, third and fourth are pictures from a server. The second is this
   map's own data and is drawn in this map's own ink, which is why it looks
   different from the other three: it is the only one this page can vouch for.
   --------------------------------------------------------------------------- */
const SOURCE = {
  // A ground tint and nothing louder. The federal rendering of the groundwater
  // bodies covers the whole country in two strong flat colours, which at full
  // strength turns the map into that picture with rivers on it. Held at a third it
  // does what it is here to do: show where the water under the ground is, behind
  // the water on top of it.
  gw:    wmsLayer({ service: FSDI, layers: 'ch.bafu.grundwasserkoerper',
                   night: { alpha: 0.26, filter: 'saturate(0.4) brightness(0.85)' },
                   day:   { alpha: 0.34, blend: 'multiply', filter: 'saturate(0.45)' } }),
  catch: wmsLayer({ service: FSDI, layers: 'ch.bafu.wasser-teileinzugsgebiete_2',
                    night: { alpha: 0.34, filter: 'saturate(0.4)' },
                    day:   { alpha: 0.4,  blend: 'multiply', filter: 'saturate(0.45)' } }),
  // S1 is the fenced ground at the wellhead, S2 the close protection zone, S3 the
  // outer one. Only the zones IN FORCE are drawn. geodienste.ch also serves the
  // planned ones, and a planned zone is not a legal constraint: drawing the two in
  // one colour would put a restriction on the map that does not yet exist.
  // Turned violet on purpose. geodienste.ch renders the three zones in three blues,
  // which on a map whose whole subject is water in blue would read as more water.
  // The rotation is uniform, so S1, S2 and S3 keep their distinctions from each
  // other and lose only their resemblance to the rivers. Violet because it is the
  // one part of the wheel this map has not spent: blue is discharge, teal is stored
  // water, orange is a taking, bone is a figure from the statute, amber is heat. A
  // protection zone is none of those and must not borrow any of their meanings. The
  // legend swatch is the rotated colour, not the source's, so the key matches.
  // The violet rotation holds on both surfaces: the reason for it is what the hue
  // would be confused with, and the rivers are blue on paper too.
  zone:  wmsLayer({ service: GEODIENSTE,
                    layers: 'grundwasserschutzzone_s3_in_kraft,grundwasserschutzzone_s2_in_kraft,grundwasserschutzzone_s1_in_kraft',
                    night: { alpha: 0.8, filter: 'hue-rotate(95deg) saturate(1.35)' },
                    day:   { alpha: 0.7, blend: 'multiply', filter: 'hue-rotate(95deg) saturate(1.2)' } }),
};
// Two on, two off. The groundwater bodies and the sub-catchments both cover the
// whole country in flat colour, and two national washes under each other is a
// picture of nothing. They are one click away and the legend lists them first.
const sourceOn = { gw: false, head: true, catch: false, zone: true };

// Headwaters. ORD_STRA 1 in HydroRIVERS is a reach with nothing above it: the top
// of the drawn network, where the water enters the surface. It is not the same as
// a spring, and the legend says so. What it is, is the part of the network with no
// gauge above it anywhere, which is the part no measurement can reach.
function drawHeadwaters() {
  const z = zoom();
  const minU = minUpland();
  ctx.save();
  ctx.strokeStyle = PAL.resMid;
  ctx.lineCap = 'round';
  // The head of each reach is a point, and there are several thousand of them. At
  // country view a point for every one is a texture rather than a fact, so the
  // points wait until the scale can separate them and only the lines are drawn.
  const heads = z > 2.6;
  for (const r of reaches) {
    if (r.ord !== 1 || r.upland < minU) continue;
    if (!onScreen(r, 40)) continue;
    path(r);
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(0.7, lineWidth(r.live));
    ctx.stroke();
    if (!heads) continue;
    // vertex order is downstream, so the first vertex is the top of the reach
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(sx(r.px[0]), sy(r.py[0]), Math.min(3, 1 + 0.35 * z), 0, 6.2832);
    ctx.fillStyle = PAL.resHi;
    ctx.fill();
  }
  ctx.restore();
}

function drawSprings() {
  if (!names || zoom() < 1.6) return;
  ctx.save();
  for (const s of names.springs) {
    const x = sx(mercX(s.x)), y = sy(mercY(s.y));
    if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
    ctx.beginPath();
    if (s.k === 'q') {                       // a spring: a filled point
      ctx.arc(x, y, 3.4, 0, 6.2832);
      ctx.fillStyle = PAL.resHi; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = halo(0.8); ctx.stroke();
    } else {                                 // a waterfall: an open chevron
      ctx.moveTo(x - 4, y - 3); ctx.lineTo(x, y + 3.5); ctx.lineTo(x + 4, y - 3);
      ctx.lineWidth = 1.6; ctx.strokeStyle = PAL.resHi; ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSources() {
  if (sourceOn.head) drawHeadwaters();
  drawSprings();
}

/* ===========================================================================
   THE NAMES
   HydroRIVERS is anonymous; swissNAMES3D is a gazetteer. build/10-names.mjs
   joins them and hands over, for every placement the gazetteer makes, a name, a
   rank, and the reach the placement snapped to.

   The names used to be painted on the plane. They no longer are, and the reason
   is that a label on a map has to be somewhere, and everywhere it can be is
   already spoken for: over the water it hides the water, beside the water it is
   in the next canton, and off to the side it lands under the legend. Every fix
   for that is a compromise with the drawing, and the drawing is the point.

   So the names moved into the readout. Point at a river and the map tells you
   what it is called, next to what it is carrying, in the same breath. Nothing
   moves, nothing collides, nothing has to be hidden at one zoom to fit at
   another, and the name is attached to the reach the reader actually asked
   about instead of floating near it and hoping to be connected. On a touch
   screen the same tap that opens a reach carries the same name.

   What stays painted is standing water and ice: a lake name sits inside a shape
   that is its own and competes with nothing, and on the ice layer a glacier is
   the subject rather than a passing feature. Those are places. A river is a
   reading, and a reading belongs in the readout.
   =========================================================================== */
let names = null;
let showPlaces = true;
let nameByReach = new Map();     // reach id -> { n, alt[], carried }

// Who has delivered the protection zones, and when. A national picture assembled
// from twenty-six cantonal deliveries is as current as its oldest contributor, and
// the picture itself does not say who that is, so the page does.
async function loadCantons() {
  try {
    const c = await readJSON(ROOT + 'data/cantons.json');
    const el = document.getElementById('srcCoverage');
    if (!el) return;
    const old = new Date(c.oldest), now = new Date();
    const yrs = nfd((now - old) / 31557600000, 1);
    el.innerHTML = T('m.srcCoverage', {
      covered: c.covered, free: c.free, oldest: fmtDate(c.oldest), newest: fmtDate(c.newest),
      ct: c.oldestCt, yrs,
    });
  } catch (e) { /* the layer still draws; only the note about it is missing */ }
}

async function loadNames() {
  try {
    names = await readJSON(ROOT + 'data/names.json');
    indexNames();
    dirty = true;
  } catch (e) { names = null; }
}

/* Which reach carries which name.
   Two steps, and the second is the one that matters.

   swissNAMES3D places a label, not a river. The Aare is written sixteen times
   across a map of Switzerland and the water between the writings is anonymous,
   so an index built from the anchors alone names 1,691 of 8,711 reaches and a
   reader pointing between two labels is told nothing about a river they can see
   is the Aare.

   So each name is carried along its own channel, on the rule rivers are actually
   named by: the majority partner keeps the name. Downstream it runs while the
   reach it came from still supplies at least half of what flows below, and stops
   at the confluence where it no longer does, because there the river has become
   something else. Upstream it follows the stem carrying most of the water and
   stops when the only choice left is a tributary less than half the size, because
   going up a river you follow the water and not the map.

   Anchors are processed largest first, and a claim already made is never
   overwritten, so where a brook's name and a trunk river's name compete for the
   same water the trunk holds it. That is also what contains the join's known
   failure: build/10-names.mjs cannot tell a canal running 200 m from the Aare
   from the Aare, but the Aare, being larger, gets there first. */
function indexNames() {
  if (!names || !reaches.length) return;
  nameByReach = new Map();
  const at = new Map();                 // reach -> the placement that claimed it

  // Several names land on one reach. Within 500 m of the Aare's line the gazetteer
  // has also written the Rothkanal, the Erzbach and a Dorfbach, and the snap cannot
  // tell a canal from the river it runs beside — the network is not drawn finely
  // enough for that. So the reach is awarded, on two things the build measured.
  //
  // Corroboration first: a name the gazetteer wrote along a course a dozen times
  // is a river, a name written twice beside one is a canal. Then distance: between
  // two equally corroborated names, the one written on the line beats the one
  // written next to it. Neither test alone is enough — the Rhone's side canals are
  // written repeatedly, and a river's own label is often set off its line to fit —
  // but a canal has to beat the trunk on both to take it, and none does.
  const claim = a => (a.c || 1) * 1e6 - (a.d || 0);

  // But corroboration is thin everywhere: the gazetteer writes the Rhine six times
  // and the Toess once, so a side channel written four times can out-vote a trunk
  // river. What separates them is not how often the register repeats a name but
  // what the name says. A Bach is a brook, a Riale is a mountain brook, a Kanal is
  // a cut channel, an Aalte Rii and a Vieux Rhone are courses the river has left,
  // and a Rheinfall is a waterfall. None of them drains four figures of country.
  //
  // So the register's own vocabulary is read as a size class, and a name that
  // declares itself small is refused a reach that is not. The refusal is not a
  // rename: it leaves the reach empty for the trunk's own name to be carried onto
  // by the propagation below, which is how the Aare reaches the water the Erzbach
  // was holding. The cost is the two canals that genuinely carry a trunk — the
  // Nidau-Bueren-Kanal and the Hagneck-Kanal, both cut for the Jura correction —
  // which now read as the Aare. That is the water's own name and not a falsehood,
  // only less local than the register could have been.
  // Tested as whole words, not as a prefix, because the register writes "Grand
  // Canal" and "La Vieille Thielle" as readily as "Canal des Iles".
  const SMALL = /(bach|bächli|bachli|bächlein|giessen|giesse|graben|wuhr|teich|kanal|canale|fall|fälle)$/i;
  const SMALL_WORD = /\b(riale|rio|ruisseau|torrent|ual|rigole|canal|canaux|aalte|alte|alter|alti|alt|vieux|vieil|vieille|vecchio|vecchia)\b/i;
  // Above this the claim is refused. Switzerland has no brook and no side cut that
  // drains 500 km2; the largest so labelled here sits on 10,706, which is the Aare.
  const SMALL_MAX = 500;

  for (const a of names.rivers) {
    if (!a.h) continue;
    const on = reaches[byId.get(a.h)];
    if (on && on.upland > SMALL_MAX && (SMALL.test(a.n) || SMALL_WORD.test(a.n))) continue;
    const where = a.x + '|' + a.y;
    const cur = nameByReach.get(a.h);
    if (!cur) { nameByReach.set(a.h, { n: a.n, alt: [], w: claim(a) }); at.set(a.h, where); continue; }
    // Rhein, Le Rhin, Rein and Reno are one river written four times at one point.
    // Same placement, different name: that is a language, not a competitor.
    if (at.get(a.h) === where) {
      if (cur.n !== a.n && !cur.alt.includes(a.n) && cur.alt.length < 4) cur.alt.push(a.n);
      continue;
    }
    // A different placement is a different watercourse, and it takes the reach
    // only by being better attested than the name already holding it.
    if (claim(a) > cur.w) {
      nameByReach.set(a.h, { n: a.n, alt: [], w: claim(a) });
      at.set(a.h, where);
    }
  }

  const kids = new Map();
  for (const r of reaches) {
    if (!byId.has(r.next)) continue;
    const a = kids.get(r.next);
    if (a) a.push(r.id); else kids.set(r.next, [r.id]);
  }

  // Largest first, so that where a brook and a trunk river compete for the same
  // water the trunk claims it and the brook finds it taken.
  const seeds = [...nameByReach.keys()]
    .map(id => reaches[byId.get(id)])
    .filter(Boolean)
    .sort((a, b) => b.upland - a.upland);

  for (const start of seeds) {
    const rec = nameByReach.get(start.id);

    let here = start;
    for (let step = 0; step < 600; step++) {
      const j = byId.get(here.next);
      if (j === undefined) break;
      const nx = reaches[j];
      if (nameByReach.has(nx.id) || nx.upland > here.upland * 2) break;
      nameByReach.set(nx.id, { n: rec.n, alt: rec.alt, carried: true });
      here = nx;
    }

    here = start;
    for (let step = 0; step < 600; step++) {
      const cs = kids.get(here.id);
      if (!cs) break;
      let big = null;
      for (const cid of cs) {
        const c = reaches[byId.get(cid)];
        if (c && (!big || c.upland > big.upland)) big = c;
      }
      if (!big || nameByReach.has(big.id) || big.upland < here.upland * 0.5) break;
      nameByReach.set(big.id, { n: rec.n, alt: rec.alt, carried: true });
      here = big;
    }
  }
}

const nameOf = r => (r && nameByReach.get(r.id)) || null;

// Sorted once, the first time the ice layer wants a label.
let __iceSorted = null;
function iceByArea() {
  if (!__iceSorted && glaciers) {
    __iceSorted = glaciers.glaciers.filter(g => g.n).slice().sort((a, b) => b.a - a.a);
  }
  return __iceSorted ?? [];
}

/* The places that keep their names on the plane: lakes everywhere, glaciers on
   the layer that is about them, named springs and falls on the layer that asked
   for them. All three are set in italic, which is not decoration but the
   convention on every topographic map printed in the last two centuries, and is
   what lets a reader tell a name on the water from a name on the land.

   No label is ever moved off its anchor to make it fit. A name that does not fit
   is not drawn, because a name nudged 40 px is a name in the wrong place. */
function drawPlaces() {
  if (!names || !showPlaces) return;
  const z = zoom();
  const boxes = [];
  // Type is set in CSS pixels and the map is not: on a phone the country is 375 px
  // wide and a 13 px name is a banner across a canton. The whole scale is tied to
  // the width of the plane, with a floor so it never becomes unreadable.
  const ts = Math.max(0.68, Math.min(1, W / 1100));
  const fits = (x, y, w, h) => {
    const a = x - w / 2 - 3, b = y - h / 2 - 2, c = x + w / 2 + 3, d = y + h / 2 + 2;
    for (const q of boxes) if (a < q[2] && c > q[0] && b < q[3] && d > q[1]) return false;
    boxes.push([a, b, c, d]);
    return true;
  };
  // Interface and evidence occupy their own surface, outside this coordinate
  // system. Labels therefore compete only with other labels.

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo(0.92);

  const label = (text, x, y, size, fill) => {
    ctx.font = `italic ${size}px Archivo, system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    if (!fits(x, y, w, size)) return false;
    ctx.lineWidth = Math.max(2.4, size * 0.34);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    return true;
  };

  const lakeMin = 700 / Math.pow(z, 2.4);
  let n = 0;
  const lakeCap = W > 700 ? 26 : 7;
  for (const l of names.lakes) {
    if (n > lakeCap) break;
    if (l.r < lakeMin && !(l.r === 0 && z > 7)) continue;
    const x = sx(mercX(l.x)), y = sy(mercY(l.y));
    if (x < 30 || y < 20 || x > W - 30 || y > H - 20) continue;
    const size = ts * Math.max(10, Math.min(17, 9 + Math.log10(1 + l.r) * 2.4));
    if (label(l.n, x, y, size, `rgba(${PAL.labelWater},0.92)`)) n++;
  }

  // Named from the ice file rather than from the gazetteer: GLAMOS attaches the
  // name to the body itself, along with the body's area, so the name is on the
  // right ice and the biggest ice gets the name first. There is no join here and
  // so nothing for a join to get wrong.
  if (mode === 'ice' && glaciers) {
    const iceMin = 22 / Math.pow(z, 2.2);
    for (const g of iceByArea()) {
      if (n > 44 || g.a < iceMin) break;
      const x = sx(g.w[0]), y = sy(g.w[1]);
      if (x < 30 || y < 20 || x > W - 30 || y > H - 20) continue;
      if (label(g.n, x, y, ts * Math.max(10, Math.min(14, 8 + Math.log10(1 + g.a) * 3)),
                `rgba(${PAL.labelIce},0.92)`)) n++;
    }
  }

  if (mode === 'source' && z > 1.6) {
    for (const s of names.springs) {
      if (n > 60) break;
      const x = sx(mercX(s.x)), y = sy(mercY(s.y));
      if (x < 40 || y < 16 || x > W - 40 || y > H - 16) continue;
      if (label(s.n, x, y + 11, ts * 10.5, `rgba(${PAL.labelRes},0.9)`)) n++;
    }
  }
  ctx.restore();
}

/* ===========================================================================
   LIVE ONLY
   The page has always said, in the evidence bar and in the source table, that
   most of what it draws is inference over registers that are years old. Saying
   it is not the same as showing it. This switch strips the map back to what is
   actually current: the reaches with a gauge on them, read minutes ago, and
   nothing else. The rest of the network goes, the four archival layers go, and
   what is left is the country as it is measured rather than as it is modelled.

   It is meant to be uncomfortable. At most 168 of 8,711 reaches survive it,
   and only while their observations pass the live-data contract.
   =========================================================================== */
const ARCHIVAL = {
  quality:  T('m.archQuality'),
  res:      T('m.archRes'),
  ice:      T('m.archIce'),
  residual: T('m.archResidual'),
  use:      T('m.archUse'),
  wet:      T('m.archWet'),
};
let liveOnly = false;
const isLive = s => (s.q !== null && s.q !== undefined) ||
                    (s.obs?.temp !== null && s.obs?.temp !== undefined);

function setLiveOnly(v) {
  liveOnly = v;
  document.body.classList.toggle('liveOnly', v);
  for (const k of Object.keys(ARCHIVAL)) {
    const b = document.querySelector('#modes button[data-mode="' + k + '"]');
    if (!b) continue;
    b.classList.toggle('archival', v);
    b.title = v ? T('m.liveOnlyTitle', { src: ARCHIVAL[k] }) : '';
  }
  // A layer built on a 2004 register cannot stay on the screen under a switch that
  // says only live data is on the screen.
  if (v && ARCHIVAL[mode]) setMode('flow');
  const note = document.getElementById('liveNote');
  if (note) {
    let measured = 0;
    for (const r of reaches) if (r.basis === 'measured') measured++;
    const live = stations.filter(s => s.q !== null && s.q !== undefined).length;
    note.innerHTML = v
      ? T('m.liveOnlyNote', { measured: nf(measured), live: nf(live), hidden: nf(reaches.length - measured) })
      : '';
  }
  dirtyAlloc = true;
  invalidate();
}

/* ===========================================================================
   THE PROMPT, ONCE
   A still map does not announce that it answers when it is pointed at, and the
   names now live in the readout rather than on the plane, so the one thing a
   first-time reader has to be told is where to put the cursor. They are told once,
   it is remembered, and it goes the moment they do it.
   =========================================================================== */
(function prompt() {
  const el = document.getElementById('hint');
  if (!el) return;
  try { if (localStorage.getItem('riverflow.seen') === '1') return; } catch (e) { /* private mode */ }
  el.hidden = false;
  const done = () => {
    cv.removeEventListener('pointerdown', done);
    cv.removeEventListener('pointermove', done);
    try { localStorage.setItem('riverflow.seen', '1'); } catch (e) { /* private mode */ }
    el.classList.add('gone');
    // The masthead is shorter without it, and on a phone the layer switch sits
    // directly under the masthead, so the measurement has to be taken again.
    setTimeout(() => { el.hidden = true; layoutSheet(); }, 520);
  };
  cv.addEventListener('pointerdown', done);
  cv.addEventListener('pointermove', done);
})();

/* ===========================================================================
   THE PROJECT BRIEF, ONCE
   The first visit explains the instrument before asking the reader to operate
   it. Citation links with a map hash go straight to their cited view; the brief
   remains available from the masthead on every visit.
   =========================================================================== */
(function projectBrief() {
  const dialog = document.getElementById('intro');
  const open = document.getElementById('introOpen');
  if (!dialog || !open) return;
  // A new key is intentional: returning readers should see the language choice
  // and the first complete cycle view once, even if they saw the older brief.
  const KEY = 'riverflow.intro.v2';
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  const show = () => {
    if (!dialog.open) dialog.show();
    dialog.scrollTop = 0;
    document.getElementById('introClose').focus({ preventScroll: true });
  };
  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
    if (dialog.open) dialog.close();
    cv.focus({ preventScroll: true });
  };
  open.onclick = show;
  document.getElementById('introEnter').onclick = close;
  document.getElementById('introClose').onclick = close;
  for (const button of dialog.querySelectorAll('[data-cycle-mode]')) {
    button.onclick = () => {
      const target = button.dataset.cycleMode;
      if (!setMode(target)) wantMode = target;
      close();
    };
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  if (!seen && !location.hash) show();
})();

/* A change of surface is a change of every colour on both canvases. The base map
   only repaints when something asks it to, and the particle pool caches a colour
   per reach, so both have to be told. */
window.addEventListener('themechange', () => {
  readPalette();
  // A federal sheet treated for the dark plane is not a sheet for paper, so the
  // cached pictures go and are asked for again under the other treatment.
  for (const l of wmsLayers) l.clear();
  dirtyAlloc = true;
  invalidate();
});

// ---- go ---------------------------------------------------------------------
layoutSheet();
load().catch(e => {
  const message = T('m.failBase', { e: e.message });
  document.getElementById('stamp').textContent = message;
  cv.setAttribute('aria-label', message);
});
