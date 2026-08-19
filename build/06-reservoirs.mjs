// Build reservoirs.json: the water Switzerland holds back, and how much of it is
// there this week.
//
// Two sources, and they do not describe the same set of objects. Keeping them
// apart is the whole difficulty of this layer.
//
//   1. BFE, ch.bfe.stauanlagen-bundesaufsicht. Every dam under federal
//      supervision: 225 of them, with dam height, crest length, year, type,
//      purpose and the volume the reservoir holds when full, in million m3.
//      It is a register of STRUCTURES. It carries no fill state and never has.
//   2. BFE, "Füllungsgrad der Speicherseen", the weekly filling level.
//      One number per region per week since 3 January 2000, in GWh: not the
//      volume of water but the electricity that water could still make. It is a
//      measure of STORED ENERGY over four regions, not over the 225 dams.
//
// So the map can say "this dam holds 385 million m3 when full" and it can say
// "Valais reservoirs held 3 089 GWh on 17 August 2026, against 4 070 when full".
// It cannot say how full the Grande Dixence is today, because nobody publishes
// that, and the layer must not let the eye slide from one statement to the other.
//
// The dam register carries no canton, so each point is put to the canton polygon
// it falls in, and the canton decides which of the four BFE regions the dam
// belongs to. That is a spatial assignment and it is exact: a dam is in a canton.
// What is inexact is the step after it, and it is inexact in the source, not here:
// BFE's "UebrigCH" is every reservoir outside Valais, Grisons and Ticino, and it
// pools the Bernese Oberland with the Jura.
import fs from 'node:fs/promises';

const API = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';
const BBOX = '2480000,1070000,2840000,1300000';
const FILL = 'https://www.uvek-gis.admin.ch/BFE/ogd/17/ogd17_fuellungsgrad_speicherseen.csv';

async function identify(layer) {
  const out = [];
  for (let offset = 0; ;) {
    const q = new URLSearchParams({
      geometry: BBOX, geometryType: 'esriGeometryEnvelope', layers: 'all:' + layer,
      mapExtent: BBOX, imageDisplay: '1000,600,96', tolerance: '0', sr: '2056',
      returnGeometry: 'true', limit: '50', offset: String(offset),
    });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) throw new Error(`${layer} ${r.status}`);
    const res = (await r.json()).results ?? [];
    out.push(...res);
    offset += res.length;
    if (res.length < 50) break;
    if (offset > 20000) throw new Error(`${layer}: paging did not terminate`);
  }
  return out;
}

// swisstopo approximate formulas, LV95 to WGS84. Metre accuracy over Switzerland.
function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [+(lon * 100 / 36).toFixed(5), +(lat * 100 / 36).toFixed(5)];
}

// ---- 1. the dams ------------------------------------------------------------
const raw = await identify('ch.bfe.stauanlagen-bundesaufsicht');
console.log(`dams under federal supervision: ${raw.length}`);

// Canton by point-in-polygon, asked of the federal boundary layer one dam at a
// time. 225 calls at build time is nothing, and it beats shipping a canton
// geometry to do the same job.
const cantonCache = new Map();

// One exact point-in-polygon. tolerance stays at 0 on purpose: the identify API
// reads tolerance in SCREEN PIXELS against the mapExtent and imageDisplay given,
// so a "300" here is not 300 metres, it is 300 pixels of a 360 km wide extent.
// Asked that way for Punt dal Gall it answers TG, SG, AI, GL, GR, UR, TI, SZ, AR,
// unordered, and taking the first is how a Grisons dam ends up in Thurgau.
async function cantonHit(E, N) {
  const q = new URLSearchParams({
    geometry: `${E},${N}`, geometryType: 'esriGeometryPoint',
    layers: 'all:ch.swisstopo.swissboundaries3d-kanton-flaeche.fill',
    mapExtent: BBOX, imageDisplay: '1000,600,96', tolerance: '0', sr: '2056',
    returnGeometry: 'false',
  });
  try {
    const j = await (await fetch(`${API}?${q}`)).json();
    const res = j.results ?? [];
    return res.length === 1 ? res[0].attributes.ak : null;   // ambiguous is not an answer
  } catch { return null; }
}

// A dam on the national border has its crest outside every canton polygon. Rather
// than widen the tolerance, walk a ring of real metres outward and take the first
// canton the ground actually falls in. Punt dal Gall dams the Spöl and floods into
// Italy; 500 m back up the valley is unambiguously Graubünden.
const RING = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
async function cantonAt(E, N) {
  const key = `${Math.round(E / 200)},${Math.round(N / 200)}`;
  if (cantonCache.has(key)) return cantonCache.get(key);
  let ak = await cantonHit(E, N);
  for (const d of [250, 500, 1000, 2000]) {
    if (ak) break;
    for (const [dx, dy] of RING) {
      ak = await cantonHit(E + dx * d, N + dy * d);
      if (ak) break;
    }
  }
  cantonCache.set(key, ak);
  return ak;
}

// BFE pools the country into four reporting regions. Everything that is not
// Valais, Grisons or Ticino is "the rest", including the whole Bernese Oberland.
const REGION = ak => (ak === 'VS' ? 'vs' : ak === 'GR' ? 'gr' : ak === 'TI' ? 'ti' : 'rest');

const dams = [];
let noCanton = 0;
for (const f of raw) {
  const a = f.attributes;
  const ak = await cantonAt(f.geometry.x, f.geometry.y);
  if (!ak) noCanton++;
  const [lon, lat] = lv95(f.geometry.x, f.geometry.y);
  const v = parseFloat(a.impoundmentvolume);
  dams.push({
    n: a.damname ?? a.facilityname ?? '',
    rn: a.reservoirname ?? '',
    fn: a.facilityname ?? '',
    t: a.damtype_de ?? '',
    a: a.facaim_de ?? '',
    h: a.damheight > 0 ? +a.damheight : null,          // dam height, m
    cl: a.crestlength > 0 ? +a.crestlength : null,     // crest length, m
    ce: a.crestlevel > 0 ? +a.crestlevel : null,       // crest level, m a.s.l.
    il: a.impoundmentlevel > 0 ? +a.impoundmentlevel : null,
    v: isFinite(v) && v > 0 ? +v.toFixed(3) : null,    // million m3 when full
    b: a.baujahr > 1700 ? +a.baujahr : null,   // not y: y is the latitude, as 05-users learned
    c: ak, g: REGION(ak),
    x: lon, y: lat,
  });
}

// ---- 2. the weekly filling level -------------------------------------------
// Access-Control-Allow-Origin on this file names map.geo.admin.ch, so the browser
// cannot read it from our origin. It is baked in here instead, and the Pages
// workflow re-runs weekly so the baked copy does not drift far from the source.
const fillRes = await fetch(FILL);
if (!fillRes.ok) throw new Error(`filling level ${fillRes.status}`);
const csvText = await fillRes.text();
const [head, ...rows] = csvText.trim().replace(/^﻿/, '').split(/\r?\n/);
const cols = head.split(',');
const ix = n => {
  const i = cols.indexOf(n);
  if (i < 0) throw new Error(`filling level: column ${n} is gone. Columns are: ${cols.join(', ')}`);
  return i;
};
const C = {
  d: ix('Datum'),
  vs: ix('Wallis_speicherinhalt_gwh'), gr: ix('Graubuenden_speicherinhalt_gwh'),
  ti: ix('Tessin_speicherinhalt_gwh'), rest: ix('UebrigCH_speicherinhalt_gwh'),
  tot: ix('TotalCH_speicherinhalt_gwh'),
  vsM: ix('Wallis_max_speicherinhalt_gwh'), grM: ix('Graubuenden_max_speicherinhalt_gwh'),
  tiM: ix('Tessin_max_speicherinhalt_gwh'), restM: ix('UebrigCH_max_speicherinhalt_gwh'),
  totM: ix('TotalCH_max_speicherinhalt_gwh'),
};

const series = [];
for (const line of rows) {
  const f = line.split(',');
  const num = i => { const v = parseFloat(f[i]); return isFinite(v) ? v : null; };
  const d = f[C.d];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
  const tot = num(C.tot), totM = num(C.totM);
  if (tot === null || !totM) continue;
  series.push({
    d,
    vs: num(C.vs), gr: num(C.gr), ti: num(C.ti), rest: num(C.rest), tot,
    max: { vs: num(C.vsM), gr: num(C.grM), ti: num(C.tiM), rest: num(C.restM), tot: totM },
    pct: +(100 * tot / totM).toFixed(2),
  });
}
series.sort((a, b) => (a.d < b.d ? -1 : 1));
console.log(`filling level: ${series.length} weekly readings, ${series[0].d} to ${series.at(-1).d}`);

// The capacity is not a constant. It was 8 500 GWh in 2000 and it is 8 895 now:
// Nant de Drance and the raisings added to it. A percentage is therefore always
// against the capacity of its own week, never against today's.
const capFirst = series[0].max.tot, capLast = series.at(-1).max.tot;
console.log(`  capacity ${capFirst} GWh in ${series[0].d.slice(0, 4)} -> ${capLast} GWh in ${series.at(-1).d.slice(0, 4)}`);

// ---- 3. the envelope --------------------------------------------------------
// What is normal for a week of the year. Built from complete years only, so a
// part-year at either end cannot tilt a percentile. The comparison is in per cent
// of the capacity of the day, because the capacity grew: comparing 2026 GWh with
// 2000 GWh would read a new pumped-storage plant as a wet year.
const weekOf = d => {
  const t = new Date(d + 'T00:00:00Z');
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.min(52, Math.floor((t - jan1) / 86400000 / 7));
};
const years = [...new Set(series.map(s => +s.d.slice(0, 4)))];
const complete = years.filter(y => series.filter(s => +s.d.slice(0, 4) === y).length >= 50);
const refYears = complete.filter(y => y < +series.at(-1).d.slice(0, 4));
const buckets = Array.from({ length: 53 }, () => []);
for (const s of series) {
  if (!refYears.includes(+s.d.slice(0, 4))) continue;
  buckets[weekOf(s.d)].push(s.pct);
}
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const envelope = buckets.map((b, w) => b.length < 5 ? null : ({
  w,
  lo: +q(b, 0.0).toFixed(1), p10: +q(b, 0.10).toFixed(1), med: +q(b, 0.5).toFixed(1),
  p90: +q(b, 0.90).toFixed(1), hi: +q(b, 0.999).toFixed(1),
})).filter(Boolean);
console.log(`envelope from ${refYears.length} complete years, ${refYears[0]} to ${refYears.at(-1)}`);

// The current year against it, and the standing of the latest reading.
const thisYear = +series.at(-1).d.slice(0, 4);
const current = series.filter(s => +s.d.slice(0, 4) === thisYear).map(s => ({ d: s.d, pct: s.pct, w: weekOf(s.d) }));
const last = series.at(-1);
const band = envelope.find(e => e.w === weekOf(last.d));
const rank = band ? (last.pct < band.p10 ? 'below the tenth percentile'
  : last.pct > band.p90 ? 'above the ninetieth percentile' : 'inside the usual range') : 'unknown';
console.log(`latest ${last.d}: ${last.tot} of ${last.max.tot} GWh = ${last.pct} %, ${rank} for week ${weekOf(last.d)}`);

// ---- 4. what the register itself says ---------------------------------------
const withVol = dams.filter(d => d.v);
const totalVol = withVol.reduce((s, d) => s + d.v, 0);
const byRegion = {};
for (const d of dams) {
  const g = (byRegion[d.g] ??= { n: 0, v: 0 });
  g.n++; g.v += d.v ?? 0;
}

const out = {
  built: new Date().toISOString().slice(0, 10),
  dams,
  totals: {
    count: dams.length,
    withVolume: withVol.length,
    volumeMioM3: +totalVol.toFixed(0),
    byRegion: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [k, { n: v.n, v: +v.v.toFixed(0) }])),
    types: dams.reduce((m, d) => (m[d.t] = (m[d.t] ?? 0) + 1, m), {}),
    aims: dams.reduce((m, d) => (m[d.a] = (m[d.a] ?? 0) + 1, m), {}),
  },
  fill: {
    from: series[0].d, to: last.d,
    // the series itself, thinned to what the page draws: date, per cent, and the
    // five GWh figures. 1 380 rows at this width is about 70 kB of JSON.
    weeks: series.map(s => [s.d, s.pct, s.tot, s.vs, s.gr, s.ti, s.rest]),
    max: last.max,
    capacityFirst: capFirst,
    latest: { d: last.d, pct: last.pct, gwh: last.tot, max: last.max.tot, rank },
    envelope,
    current,
    refYears: [refYears[0], refYears.at(-1)],
  },
};

await fs.writeFile(new URL('../site/data/reservoirs.json', import.meta.url), JSON.stringify(out));

console.log(`\ndams ${dams.length}, with a stated volume ${withVol.length}, total ${totalVol.toFixed(0)} million m3`);
console.log(`  no canton found for ${noCanton}`);
console.log('  by region:', JSON.stringify(out.totals.byRegion));
console.log('  by type:', JSON.stringify(out.totals.types));
console.log('  by purpose:', JSON.stringify(out.totals.aims));
console.log('  largest:');
for (const d of withVol.sort((a, b) => b.v - a.v).slice(0, 8))
  console.log(`    ${(d.rn || d.n).padEnd(20)} ${String(d.v).padStart(8)} mio m3  ${String(d.h ?? '?').padStart(4)} m  ${d.c}  ${d.b}`);
