// Build residual.json: Q347, and the minimum the statute computes from it.
//
// The README used to say that Q347 is not published per gauge, so Art. 31 could
// only ever be a calculator you fed by hand. That was wrong. BAFU publishes
// "Grundlagen zur Bestimmung der Abflussmenge Q347" as a point layer,
// ch.bafu.hydrologie-q347, with 1,041 points and a Q347 on 1,025 of them. So the
// the calculation can be shown as a layer. The result remains an illustration,
// not a cantonal residual-flow determination.
//
// Three things have to be kept straight, and the layer is worthless if any of
// them slips.
//
// 1. WHICH Q347. The record carries three, and they are not interchangeable:
//      q_84_93  Q347 over the decade 1984-1993. Art. 4(h) defines Q347 as a
//               ten-year average, and this is the decade the cantons worked from
//               when the dataset was assembled. It is a historical federal input,
//               not automatically the binding value at a present-day site.
//      qp       Q347 over the station's own full record, whose period is in `p`.
//               A longer and better description of the river, and not the figure
//               the determination was made on.
//      qmod     A model value. BAFU's own legend calls these "grobe Schätzwerte"
//               which generally still have to be checked against a short
//               measurement. It is an estimate, and the map draws it as one.
//    Preference is q_84_93, then qp, then qmod, and which one was used is carried
//    on every point, because the answer changes with the choice.
//
// 2. WHEN THE RULE BITES. Art. 31 does not apply to every abstraction on the map.
//    BAFU's own legend states it: the residual-flow rules apply to new
//    abstractions, and to existing ones only when the concession expires and has
//    to be renewed. An existing abstraction is governed by the restoration regime
//    of Art. 80 ff instead. So a figure computed here is what the statute would
//    produce under Art. 31(1) for a new abstraction at this point. Local
//    verification, Art. 31(2), Arts. 32-33 and the cantonal decision can change
//    the legally adequate residual flow. It is not a duty owed today by whoever
//    is already taking water there.
//
// 3. HOW OLD IT IS. Datenstand 1 January 2000. That is the strangest fact in this
//    file and the most useful one. It is not simply staleness: Q347 is defined as
//    a ten-year mean and the decade in this file is the decade the determinations
//    were made on. It can document the historical basis; it cannot establish the
//    current local hydrology or replace the verification BAFU says model values
//    generally require.
import fs from 'node:fs/promises';

const API = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';
const BBOX = '2480000,1070000,2840000,1300000';

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

function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [+(lon * 100 / 36).toFixed(5), +(lat * 100 / 36).toFixed(5)];
}

// ---- Art. 31(1) GSchG -------------------------------------------------------
// The statute states a figure at the foot of each band and a rate above it, and
// the two do not close: the rate from 160 l/s reaches 279.6 where the table states
// 280, and the rate from 2 500 reaches 2 497.5 where the table states 2 500. Each
// band therefore starts from its own stated figure. The gap is the statute's own
// arithmetic and it is reproduced here, not smoothed, so that a figure on this map
// can be checked against the text and found to agree with it.
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
  if (!isFinite(q) || q <= 0) return null;       // no permanent flow: Art. 31 does not apply
  if (q >= 60000) return 10000;                  // the table stops here
  let floor = 0;
  for (const [ceil, base, per, add] of RESIDUAL) {
    if (q < ceil) return per ? base + ((q - floor) / per) * add : base;
    floor = ceil;
  }
  return 10000;
}

// Checked against the four figures the statute states at its own band feet.
for (const [q, want] of [[60, 50], [160, 130], [500, 280], [2500, 900], [60000, 10000]]) {
  const got = minResidual(q);
  const ok = Math.abs(got - want) < 0.01;
  if (!ok && q !== 500) console.log(`  Art. 31 check: Q347 ${q} -> ${got.toFixed(1)}, statute states ${want}`);
}

// ---- the points -------------------------------------------------------------
const raw = await identify('ch.bafu.hydrologie-q347');
console.log(`Q347 determination points: ${raw.length}`);

const pos = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

const points = [];
const counts = { q8493: 0, qp: 0, qmod: 0, none: 0 };
for (const f of raw) {
  const a = f.attributes;
  const q8493 = pos(a.q_84_93), qp = pos(a.qp), qmod = pos(a.qmod);
  // preference order, and the reason travels with the value
  let q = null, src = null;
  if (q8493 !== null) { q = q8493; src = 'q8493'; }
  else if (qp !== null) { q = qp; src = 'qp'; }
  else if (qmod !== null) { q = qmod; src = 'qmod'; }
  if (src) counts[src]++; else counts.none++;

  const [lon, lat] = lv95(f.geometry.x, f.geometry.y);
  const g = String(a.gewaesser ?? '');
  const dash = g.indexOf(' - ');
  points.push({
    id: a.id_q347,
    w: dash > 0 ? g.slice(0, dash) : g,           // watercourse
    pl: dash > 0 ? g.slice(dash + 3) : '',        // place
    lhg: String(a.lhg ?? '').trim() || null,      // gauge number where there is one
    ar: pos(a.flaeche),                           // catchment area at the point, km2
    q, src,                                       // the Q347 used, and which field it came from
    q8493, qp, qmod,                              // all three, so the choice can be re-made
    p: String(a.p ?? '').trim() || null,          // the record period behind qp
    // the statutory minimum, l/s, and what share of Q347 it is
    min: q === null ? null : +minResidual(q).toFixed(1),
    x: lon, y: lat,
  });
}
console.log(`  Q347 from the 1984-93 decade ${counts.q8493}, from the full record ${counts.qp}, modelled ${counts.qmod}, none ${counts.none}`);

// ---- bind to the river network ----------------------------------------------
// The record carries the catchment area at the point, and HydroRIVERS carries the
// upstream catchment of every reach. Two independent statements of the same
// quantity, so the snap is scored on both: distance, and whether the reach drains
// the area the record says drains to this point. Distance alone puts a Q347 point
// for a 6 km2 brook onto the Rhine flowing past it.
const net = JSON.parse(await fs.readFile(new URL('../site/data/network.json', import.meta.url), 'utf8'));
const P = net.p;
const abs = net.reaches.map(r => {
  const pts = [];
  let x = 0, y = 0;
  for (let k = 0; k < r.x.length; k++) { x += r.x[k]; y += r.y[k]; pts.push([x / P, y / P]); }
  return pts;
});

const MAXDEG = 0.012;                              // about 900 m
let bound = 0, areaOk = 0, areaBad = 0;
for (const pt of points) {
  let best = null;
  for (let ri = 0; ri < net.reaches.length; ri++) {
    const r = net.reaches[ri];
    let dmin = Infinity;
    for (const [lon, lat] of abs[ri]) {
      const dx = (lon - pt.x) * Math.cos(pt.y * Math.PI / 180), dy = lat - pt.y;
      const d = dx * dx + dy * dy;
      if (d < dmin) dmin = d;
    }
    if (dmin > MAXDEG * MAXDEG) continue;
    const dist = Math.sqrt(dmin);
    // agreement in catchment area, in log space, because a factor of two matters
    // the same whether it is 5 km2 against 10 or 500 against 1000
    let areaPenalty = 0;
    if (pt.ar && r.u > 0) areaPenalty = Math.abs(Math.log10(r.u / pt.ar));
    else areaPenalty = 0.5;                        // no area stated: neither reward nor punish
    const score = dist / MAXDEG + areaPenalty;
    if (!best || score < best.score) best = { score, ri, dist, area: r.u };
  }
  if (best) {
    const r = net.reaches[best.ri];
    pt.reach = r.i;
    pt.mean = r.d;                                 // long-term mean discharge of the reach, m3/s
    pt.snapKm = +(best.dist * 111).toFixed(2);
    pt.reachArea = r.u;
    bound++;
    if (pt.ar && r.u > 0) {
      const ratio = r.u / pt.ar;
      if (ratio > 0.5 && ratio < 2) areaOk++; else areaBad++;
    }
  }
}
console.log(`bound ${bound}/${points.length} points to a reach`);
console.log(`  catchment area agrees within a factor of two on ${areaOk}, disagrees on ${areaBad}`);

// ---- sanity: is Q347 really in litres per second? ---------------------------
// Q347 is a low-flow figure, so it must come out below the long-term mean of the
// same reach and not by a factor of a thousand. If the unit were m3/s the ratio
// would land around 1000x the mean and this check would scream.
const rat = points.filter(p => p.q && p.mean > 0).map(p => (p.q / 1000) / p.mean).sort((a, b) => a - b);
console.log(`Q347/mean over ${rat.length} bound points: p10 ${rat[rat.length * 0.1 | 0].toFixed(3)}, ` +
            `median ${rat[rat.length >> 1].toFixed(3)}, p90 ${rat[rat.length * 0.9 | 0].toFixed(3)}`);
console.log('  (a low-flow figure against an annual mean should sit well below 1; it confirms l/s)');

// ---- pair abstractions with the nearest determination -----------------------
// The abstraction register and the Q347 register are two different files and
// nothing in either points at the other. Pairing them is this build's own
// inference and it is labelled as such wherever it shows: the nearest Q347
// determination on the same watercourse within 2 km, which is a neighbourhood,
// not a finding that this determination governs this abstraction.
const users = JSON.parse(await fs.readFile(new URL('../site/data/users.json', import.meta.url), 'utf8'));
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9äöü]/g, '');
let paired = 0, pairedName = 0;
for (const ab of users.abstraction) {
  let best = null;
  for (const pt of points) {
    if (pt.q === null) continue;
    const dx = (pt.x - ab.x) * Math.cos(ab.y * Math.PI / 180), dy = pt.y - ab.y;
    const km = Math.sqrt(dx * dx + dy * dy) * 111;
    if (km > 2) continue;
    const same = pt.w && ab.w && norm(pt.w) === norm(ab.w);
    const score = km - (same ? 1.5 : 0);           // a name match is worth 1.5 km
    if (!best || score < best.score) best = { score, km, pt, same };
  }
  if (best) {
    ab.q347 = best.pt.id;
    ab.q347km = +best.km.toFixed(2);
    ab.q347same = best.same;
    paired++;
    if (best.same) pairedName++;
  }
}
console.log(`paired ${paired}/${users.abstraction.length} abstractions with a Q347 point inside 2 km`);
console.log(`  of those, ${pairedName} also match on the name of the watercourse`);
await fs.writeFile(new URL('../site/data/users.json', import.meta.url), JSON.stringify(users));

// ---- what the layer can say -------------------------------------------------
const withQ = points.filter(p => p.q !== null);
const shares = withQ.map(p => 100 * p.min / p.q).sort((a, b) => a - b);
console.log(`\nthe statutory minimum as a share of Q347, over ${shares.length} points:`);
console.log(`  smallest ${shares[0].toFixed(0)} %, median ${shares[shares.length >> 1].toFixed(0)} %, largest ${shares.at(-1).toFixed(0)} %`);
console.log('  (the share falls as the river grows: the table protects a brook proportionally harder than a river)');

const out = {
  built: new Date().toISOString().slice(0, 10),
  datenstand: '2000-01-01',
  points,
  counts: {
    total: points.length, withQ347: withQ.length, bound,
    bySource: counts, areaAgrees: areaOk, areaDisagrees: areaBad,
    pairedAbstractions: paired, pairedOnName: pairedName,
  },
  // the table itself, so the page can show the arithmetic it used
  table: RESIDUAL,
};
await fs.writeFile(new URL('../site/data/residual.json', import.meta.url), JSON.stringify(out));
const size = (await fs.stat(new URL('../site/data/residual.json', import.meta.url))).size;
console.log(`\nwrote residual.json ${(size / 1024).toFixed(0)} kB`);
