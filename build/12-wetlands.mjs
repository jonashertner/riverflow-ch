// Build wetlands.json: the federal inventories of protected wetland, and where
// each one meets the river network.
//
// Five inventories, drawn from map.geo.admin.ch, each an ordinance under the
// Federal Act on the Protection of Nature and Cultural Heritage (NHG):
//
//   Auengebiete            SR 451.31  ch.bafu.bundesinventare-auen
//   Hoch- und Uebergangsmoore SR 451.32  ch.bafu.bundesinventare-hochmoore
//   Flachmoore             SR 451.33  ch.bafu.bundesinventare-flachmoore
//   Amphibienlaichgebiete  SR 451.34  ch.bafu.bundesinventare-amphibien
//   Moorlandschaften       SR 451.35  ch.bafu.bundesinventare-moorlandschaften
//
// WHY THESE ARE ON A WATER MAP, and it is not that they are damp. Each ordinance
// states a protection aim in terms of water. The Auenverordnung requires that the
// natural dynamics of the water and sediment regime be preserved (Art. 4(1)(b)),
// which is a duty about how much water passes and when, on the same reaches that
// the residual-flow layer already puts a statutory minimum on. Mires die if the
// water table drops. So these are not a nature overlay next to the water; they are
// places where a quantity of water is already the subject of a federal duty.
//
// Mires and mire landscapes carry more than an ordinance. Art. 78(5) of the
// Federal Constitution, the article the Rothenthurm initiative wrote in 1987,
// protects them absolutely: no installations may be built and the ground may not
// be altered, and unlike almost every other protection in Swiss environmental law
// there is no balancing test to lose. Rothenthurm itself is object number 1 of the
// mire-landscape inventory and it is on this map under that number.
//
// WHAT IS DRAWN AND WHAT IS COUNTED. The polygons are simplified for drawing. The
// areas are the federal shape_area attribute where the source carries one, so a
// figure on this map is the inventory's own and not something measured off a
// smoothed outline. Where a legal object is filed as several parcels they are
// grouped here under the object number, because the object number is the unit the
// ordinance, the object sheet and any decision about it use.
import fs from 'node:fs/promises';

const API = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';
const BBOX = '2480000,1070000,2840000,1300000';
const OUT = new URL('../site/data/wetlands.json', import.meta.url);
const P = 1e5;                        // 1e-5 deg, about 1 m

// Simplification tolerance in metres, and the smallest ring worth keeping, in m2.
// Chosen against the file: below 45 m the file grows past a megabyte for outlines
// no one can see, above it the Rhone delta and the Grimsel fens start to lose the
// shape that makes them recognisable at valley zoom.
const TOL = 45;
const MIN_RING = 15000;               // 1.5 ha

const INVENTORIES = [
  { key: 'auen',  layer: 'ch.bafu.bundesinventare-auen',
    name: 'Alluvial zones', sr: 'SR 451.31', ord: 'Auenverordnung' },
  { key: 'hoch',  layer: 'ch.bafu.bundesinventare-hochmoore',
    name: 'Raised and transitional bogs', sr: 'SR 451.32', ord: 'Hochmoorverordnung' },
  { key: 'flach', layer: 'ch.bafu.bundesinventare-flachmoore',
    name: 'Fens', sr: 'SR 451.33', ord: 'Flachmoorverordnung' },
  { key: 'amphi', layer: 'ch.bafu.bundesinventare-amphibien',
    name: 'Amphibian spawning sites', sr: 'SR 451.34', ord: 'Amphibienlaichgebiete-Verordnung' },
  { key: 'moorl', layer: 'ch.bafu.bundesinventare-moorlandschaften',
    name: 'Mire landscapes', sr: 'SR 451.35', ord: 'Moorlandschaftsverordnung' },
];

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
    if (offset > 30000) throw new Error(`${layer}: paging did not terminate`);
  }
  return out;
}

// swisstopo approximate formulas, LV95 to WGS84. Metre accuracy over Switzerland.
function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [lon * 100 / 36, lat * 100 / 36];
}

// Douglas-Peucker, run on the LV95 coordinates while they are still metres, so the
// tolerance above is a distance on the ground and not a number of degrees that
// means something different at each latitude.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const den = Math.hypot(dx, dy);
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = den < 1e-9
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / den;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

const ringArea = pts => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) / 2;
};

// Same encoding as the glaciers and the river network: quantise to 1e-5 deg, then
// delta-encode, so a ring costs a few bytes a point instead of thirty.
function encode(ring) {
  const xs = [], ys = [];
  let px = 0, py = 0;
  for (const [E, N] of ring) {
    const [lon, lat] = lv95(E, N);
    const x = Math.round(lon * P), y = Math.round(lat * P);
    if (xs.length && x === px && y === py) continue;
    xs.push(x - px); ys.push(y - py);
    px = x; py = y;
  }
  return xs.length >= 4 ? [xs, ys] : null;
}

const str = v => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

// ---- read the inventories ---------------------------------------------------
const groups = [];                    // one entry per legal object
let rawObjects = 0, rawVerts = 0, keptVerts = 0, droppedRings = 0;

for (const inv of INVENTORIES) {
  const rows = await identify(inv.layer);
  rawObjects += rows.length;
  // Parcels of one legal object share an object number. They are grouped, because
  // the ordinance, the object sheet and any decision are about the object.
  const byObj = new Map();
  for (const f of rows) {
    const at = f.attributes ?? {};
    const num = str(at.objnummer);
    const key = num || `id${f.featureId}`;
    let g = byObj.get(key);
    if (!g) {
      g = {
        k: inv.key,
        num,
        n: str(at.name || at.label) || null,
        // The federal object sheet: a PDF per object, which is where the protection
        // aim and the boundary description actually live. Carried so that a reader
        // who needs the legal text is one click from it and not one search. Only
        // the part that varies is stored — the revision and the sheet name — since
        // the rest is the same 90 characters on all 2,767 objects and the browser
        // can put it back from the template on the inventory.
        pdf: (str(at.refobjblat).match(/objectsheets\/(.+)$/) || [, null])[1],
        // The type an inventory carries about itself, where it carries one. For the
        // alluvial zones this is the distinction that matters most on a water map:
        // a Fliessgewaesser zone is a living river floodplain.
        t: str(at.auen_type_de || at.hochmoore_type_de || at.site_de) || null,
        m2: 0, rings: [],
      };
      byObj.set(key, g);
    }
    if (Number.isFinite(+at.shape_area)) g.m2 += +at.shape_area;
    const geom = f.geometry;
    if (!geom || !geom.rings) continue;
    for (const ring of geom.rings) {
      rawVerts += ring.length;
      if (ringArea(ring) < MIN_RING) { droppedRings++; continue; }
      const s = simplify(ring, TOL);
      if (s.length < 4) { droppedRings++; continue; }
      const enc = encode(s);
      if (!enc) { droppedRings++; continue; }
      keptVerts += enc[0].length;
      g.rings.push(enc);
    }
    // Where every ring of an object is too small to draw, the object still exists
    // in law and is still worth finding, so it keeps a point. A third of the bogs
    // are like this: the raised-bog inventory protects patches of a few hundred
    // square metres, and a map that dropped them would be saying they are not
    // there. They are drawn as a mark rather than an outline and the panel says so.
    if (!g.rings.length && geom && geom.rings && geom.rings.length) {
      let bx = 0, by = 0, n = 0;
      for (const ring of geom.rings) for (const [E, N] of ring) { bx += E; by += N; n++; }
      if (n) {
        const [lon, lat] = lv95(bx / n, by / n);
        g.c = [+lon.toFixed(5), +lat.toFixed(5)];
      }
    }
  }
  for (const g of byObj.values()) if (g.rings.length || g.c) groups.push(g);
  console.log(`${inv.layer.padEnd(46)} ${String(rows.length).padStart(5)} parcels, ` +
              `${String(byObj.size).padStart(4)} objects`);
}

// ---- where the protection meets the network ---------------------------------
// An alluvial zone is the one inventory whose protection aim is stated as a duty
// about flowing water, so it is the one joined to the reaches. A reach is counted
// as running through a zone when a vertex of its line falls inside a ring of it.
// That is a coarse test and it is the right coarseness: the network is generalised
// to about a hundred metres, so a finer test would be answering a question the
// geometry cannot support.
const net = JSON.parse(await fs.readFile(new URL('../site/data/network.json', import.meta.url), 'utf8'));

function decode(rings) {
  return rings.map(([xs, ys]) => {
    const pts = [];
    let x = 0, y = 0;
    for (let i = 0; i < xs.length; i++) { x += xs[i]; y += ys[i]; pts.push([x / P, y / P]); }
    return pts;
  });
}
const inRing = (pts, x, y) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

// Reach vertices, decoded the same way the browser decodes them.
const reachPts = [];
for (const r of net.reaches) {
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < r.x.length; i++) { x += r.x[i]; y += r.y[i]; pts.push([x / P, y / P]); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of pts) {
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  reachPts.push({ id: r.i, pts, box: [x0, y0, x1, y1] });
}

let joined = 0;
for (const g of groups) {
  if (g.k !== 'auen') continue;
  const rings = decode(g.rings);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) for (const [px, py] of ring) {
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  const hits = [];
  for (const r of reachPts) {
    if (r.box[2] < x0 || r.box[0] > x1 || r.box[3] < y0 || r.box[1] > y1) continue;
    let inside = false;
    for (const [px, py] of r.pts) {
      for (const ring of rings) if (inRing(ring, px, py)) { inside = true; break; }
      if (inside) break;
    }
    if (inside) hits.push(r.id);
  }
  if (hits.length) { g.h = hits; joined += hits.length; }
}

// ---- write ------------------------------------------------------------------
for (const g of groups) {
  g.a = +(g.m2 / 1e6).toFixed(4);     // km2, from the federal attribute
  delete g.m2;
  if (g.rings.length) g.r = g.rings;
  delete g.rings;
}
groups.sort((a, b) => b.a - a.a);

const counts = {};
for (const inv of INVENTORIES) {
  const gs = groups.filter(g => g.k === inv.key);
  counts[inv.key] = {
    name: inv.name, sr: inv.sr, ord: inv.ord, layer: inv.layer,
    // The template the stored sheet reference goes back into.
    sheet: `https://api3.geo.admin.ch/featureattachments/${inv.layer}/objectsheets/`,
    count: gs.length, drawn: gs.filter(g => g.r).length,
    km2: +gs.reduce((s, g) => s + g.a, 0).toFixed(1),
  };
}

const out = {
  p: P,
  built: new Date().toISOString(),
  tolerance_m: TOL, minRing_m2: MIN_RING,
  inventories: counts,
  reachesInAlluvial: joined,
  objects: groups,
};
await fs.writeFile(OUT, JSON.stringify(out));
const size = (await fs.stat(OUT)).size;

for (const k of Object.keys(counts)) {
  const c = counts[k];
  console.log(`${c.name.padEnd(30)} ${String(c.count).padStart(4)} objects ` +
              `(${c.drawn} as outlines, ${c.count - c.drawn} too small to draw), ` +
              `${String(c.km2).padStart(7)} km2  ${c.sr}`);
}
console.log(`${rawObjects} parcels in, ${groups.length} legal objects out`);
console.log(`${rawVerts} vertices simplified to ${keptVerts} at ${TOL} m, ` +
            `${droppedRings} rings dropped below ${MIN_RING / 1e4} ha`);
console.log(`${joined} reaches run through an alluvial zone of national importance`);
console.log(`wrote wetlands.json, ${(size / 1e3).toFixed(0)} kB`);
