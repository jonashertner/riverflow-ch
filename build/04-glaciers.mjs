// Build glaciers.json from the GLAMOS inventories and the length-change series.
//
// Two inventories are used, not one. A single outline says how much ice there is.
// Two outlines, 1850 and 2023, say how much ice there was and how much is left,
// and that difference is the reason this layer is on the map at all.
//
//   Swiss Glacier Inventory 1850  doi:10.18750/inventory.sgi1850.r1992
//   Swiss Glacier Inventory 2023  doi:10.18750/inventory.sgi2023.r2026
//   Swiss Glacier Length Change   doi:10.18750/lengthchange.2025.r2025
//
// Areas are taken from the source attributes, not measured off the simplified
// polygons. The polygons are for drawing; the numbers are GLAMOS's own.
import fs from 'node:fs/promises';

const P = 1e5;                        // 1e-5 deg, about 1 m
const G = process.argv[2] ?? '/tmp/gl';
const load = async p => JSON.parse(await fs.readFile(p, 'utf8'));

// ---- polygon encoding -------------------------------------------------------
// Same scheme as the river network: quantise to 1e-5 deg, then delta-encode.
function encode(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 4) continue;
      const xs = [], ys = [];
      let px = 0, py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * P), y = Math.round(lat * P);
        if (xs.length && x === px && y === py) continue;   // drop repeats
        xs.push(x - px); ys.push(y - py);
        px = x; py = y;
      }
      if (xs.length >= 4) rings.push([xs, ys]);
    }
  }
  return rings;
}
function centroid(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let bx = 0, by = 0, best = -1;
  for (const poly of polys) {
    const r = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f;
    }
    a /= 2;
    if (Math.abs(a) > best) { best = Math.abs(a); bx = cx / (6 * a); by = cy / (6 * a); }
  }
  return [+bx.toFixed(5), +by.toFixed(5)];
}

// ---- inventories ------------------------------------------------------------
const now = await load(`${G}/g2023.json`);
const past = await load(`${G}/g1850.json`);

const glaciers = [];
let totalNow = 0;
for (const f of now.features) {
  if (!f.geometry) continue;
  const p = f.properties;
  totalNow += p.area_km2 ?? 0;
  glaciers.push({
    id: p['sgi-id'],
    n: (p.name ?? '').trim(),
    a: +(p.area_km2 ?? 0).toFixed(4),
    l: +(p.length_km ?? 0).toFixed(3),
    mn: p.masl_min ?? null,
    mx: p.masl_max ?? null,
    y: p.year_acq ?? null,
    c: centroid(f.geometry),
    r: encode(f.geometry),
  });
}
glaciers.sort((a, b) => b.a - a.a);

// The 1850 outlines are drawn as one silhouette. They are not joined to the 2023
// bodies one to one: a glacier of 1850 has in many cases broken into several, and
// pretending otherwise would put a false precision on every tile.
const pastRings = [];
let totalPast = 0;
const pastById = new Map();
for (const f of past.features) {
  if (!f.geometry) continue;
  const km2 = (f.properties.Shape_Area ?? 0) / 1e6;
  totalPast += km2;
  const id = (f.properties.SGI ?? '').trim();
  if (id) pastById.set(id, (pastById.get(id) ?? 0) + km2);
  for (const r of encode(f.geometry)) pastRings.push(r);
}
// Where an identifier carries over unchanged, the pair is reported, and marked as
// an identifier match rather than a hydrological identity.
let matched = 0;
for (const g of glaciers) {
  const a0 = pastById.get(g.id);
  if (a0 !== undefined) { g.a0 = +a0.toFixed(4); matched++; }
}

// ---- length change ----------------------------------------------------------
// Annual tongue measurements. Each row is one interval. The series is the running
// sum, so the last value is the total advance or retreat since the first survey.
const csv = await fs.readFile(`${G}/x/lengthchange_2025_r2025/lengthchange_2025_r2025.csv`, 'latin1');
const lines = csv.split(/\r?\n/);
const head = lines.findIndex(l => l.startsWith('glacier name,'));
const series = new Map();
for (const line of lines.slice(head + 3)) {
  const c = line.split(',');
  if (c.length < 7 || !c[1]) continue;
  const id = c[1].trim(), end = c[4].trim(), dl = parseFloat(c[6]);
  if (!end || !isFinite(dl)) continue;
  const year = +end.slice(0, 4);
  if (!series.has(id)) series.set(id, { id, n: c[0].trim(), obs: [] });
  series.get(id).obs.push([year, dl]);
}
const length = [];
for (const s of series.values()) {
  s.obs.sort((a, b) => a[0] - b[0]);
  let cum = 0;
  const out = [];
  for (const [y, d] of s.obs) { cum += d; out.push([y, Math.round(cum)]); }
  length.push({ id: s.id, n: s.n, first: s.obs[0][0], last: s.obs.at(-1)[0], total: Math.round(cum), obs: out });
}
length.sort((a, b) => a.total - b.total);
const lengthById = new Map(length.map(l => [l.id, l]));
for (const g of glaciers) if (lengthById.has(g.id)) g.dl = lengthById.get(g.id).total;

// ---- where the meltwater goes ----------------------------------------------
// The nearest mapped reach to the ice, then the first BAFU gauge downstream of it.
// This is a spatial assignment on the HydroRIVERS network, not a routing model. It
// answers "which gauge would see this water", and nothing finer.
const net = await load(new URL('../site/data/network.json', import.meta.url));
const st = await load(new URL('../site/data/stations.json', import.meta.url));
const NP = net.p;
const byId = new Map(net.reaches.map((r, i) => [r.i, i]));
const gauge = new Map();
for (const s of st.stations) if (s.reach !== undefined) gauge.set(s.reach, s);

const absPts = net.reaches.map(r => {
  const pts = [];
  let x = 0, y = 0;
  for (let k = 0; k < r.x.length; k++) { x += r.x[k]; y += r.y[k]; pts.push([x / NP, y / NP]); }
  return pts;
});
const bbox = absPts.map(pts => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
});

const MAX = 0.05;                     // about 4 km; ice sits above the mapped network
let routed = 0;
for (const g of glaciers) {
  const [lon, lat] = g.c;
  const kx = Math.cos(lat * Math.PI / 180);
  let bi = -1, bd = MAX * MAX;
  for (let i = 0; i < absPts.length; i++) {
    const b = bbox[i];
    if (lon < b[0] - MAX || lon > b[2] + MAX || lat < b[1] - MAX || lat > b[3] + MAX) continue;
    for (const [x, y] of absPts[i]) {
      const dx = (x - lon) * kx, dy = y - lat;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
  }
  if (bi < 0) continue;
  let cur = net.reaches[bi], guard = 0;
  while (cur && guard++ < 800) {
    const s = gauge.get(cur.i);
    if (s) { g.g = s.id; g.gn = s.name; routed++; break; }
    const k = byId.get(cur.n);
    cur = k === undefined ? null : net.reaches[k];
  }
}

// ---- write ------------------------------------------------------------------
const out = {
  p: P,
  built: new Date().toISOString(),
  now: { year: 2023, acquired: '2021-2024', release: 2026, doi: '10.18750/inventory.sgi2023.r2026', count: glaciers.length, km2: +totalNow.toFixed(1) },
  past: { year: 1850, release: 1992, doi: '10.18750/inventory.sgi1850.r1992', count: past.features.length, km2: +totalPast.toFixed(1) },
  lengthDoi: '10.18750/lengthchange.2025.r2025',
  matched,
  glaciers,
  pastRings,
  length,
};
const file = new URL('../site/data/glaciers.json', import.meta.url);
await fs.writeFile(file, JSON.stringify(out));
const size = (await fs.stat(file)).size;

console.log(`1850: ${past.features.length} bodies, ${totalPast.toFixed(1)} km2`);
console.log(`2023: ${glaciers.length} bodies, ${totalNow.toFixed(1)} km2  (${(100 * (1 - totalNow / totalPast)).toFixed(1)}% less area)`);
console.log(`identifier match 1850<->2023: ${matched}/${glaciers.length}`);
console.log(`length series: ${length.length} glaciers, ${length.reduce((a, l) => a + l.obs.length, 0)} observations`);
console.log(`gauge downstream found for ${routed}/${glaciers.length}`);
console.log(`wrote glaciers.json ${(size / 1e6).toFixed(2)} MB`);
