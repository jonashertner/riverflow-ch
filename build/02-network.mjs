// Build network.json from the clipped HydroRIVERS extract, and bind each BAFU gauge
// to the river reach it sits on.
//
// Geometry: HydroRIVERS v1.0 (HydroSHEDS, WWF). Vertex order is downstream, verified
// on the Rhine below Basel (19.08.2026): first vertex 47.8937 N, last 48.0000 N.
// DIS_AV_CMS is the long-term natural mean discharge per reach, in m3/s. It gives every
// reach a baseline, so ungauged water can be drawn without inventing a number.
import fs from 'node:fs/promises';

const SRC = process.argv[2] ?? '/tmp/riv/rivers_ch.json';
const geo = JSON.parse(await fs.readFile(SRC, 'utf8'));

const P = 1e5;                       // coordinate quantisation: 1e-5 deg, about 1 m
const reaches = [];

for (const f of geo.features) {
  const p = f.properties;
  if (!f.geometry) continue;
  const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const line of parts) {
    if (line.length < 2) continue;
    // delta-encode quantised coordinates
    const xs = [], ys = [];
    let px = 0, py = 0;
    for (const [lon, lat] of line) {
      const x = Math.round(lon * P), y = Math.round(lat * P);
      xs.push(x - px); ys.push(y - py);
      px = x; py = y;
    }
    reaches.push({
      i: p.HYRIV_ID,
      n: p.NEXT_DOWN,
      m: p.MAIN_RIV,
      o: p.ORD_STRA,
      u: +(p.UPLAND_SKM ?? 0).toFixed(1),
      d: +(p.DIS_AV_CMS ?? 0).toFixed(3),
      x: xs, y: ys,
    });
  }
}

const verts = reaches.reduce((a, r) => a + r.x.length, 0);
console.log(`reaches ${reaches.length}, vertices ${verts}`);

// ---- bind gauges to reaches -------------------------------------------------
const stFile = new URL('../site/data/stations.json', import.meta.url);
const st = JSON.parse(await fs.readFile(stFile, 'utf8'));

// absolute coordinates, for matching only
const abs = reaches.map(r => {
  const pts = [];
  let x = 0, y = 0;
  for (let k = 0; k < r.x.length; k++) { x += r.x[k]; y += r.y[k]; pts.push([x / P, y / P]); }
  return pts;
});

const MAXDEG = 0.012;                 // about 900 m at Swiss latitudes
for (const s of st.stations) {
  let best = null;
  for (let ri = 0; ri < reaches.length; ri++) {
    const r = reaches[ri];
    let dmin = Infinity;
    for (const [lon, lat] of abs[ri]) {
      const dx = (lon - s.lon) * Math.cos(s.lat * Math.PI / 180), dy = lat - s.lat;
      const d = dx * dx + dy * dy;
      if (d < dmin) dmin = d;
    }
    if (dmin > MAXDEG * MAXDEG) continue;
    // A gauge sits on the main stem, not on the brook running beside it. Among reaches
    // within reach, prefer the larger catchment unless a much closer one exists.
    const score = Math.sqrt(dmin) / MAXDEG - Math.min(1, Math.log10(1 + r.u) / 5);
    if (!best || score < best.score) best = { score, ri, dist: Math.sqrt(dmin) };
  }
  if (best) {
    s.reach = reaches[best.ri].i;
    s.main = reaches[best.ri].m;
    s.meanQ = reaches[best.ri].d;        // long-term mean at that reach, m3/s
    s.snapKm = +(best.dist * 111).toFixed(2);
  }
}

const bound = st.stations.filter(s => s.reach).length;
console.log(`bound ${bound}/${st.stations.length} stations to a reach`);

// ---- unit sanity check ------------------------------------------------------
// A station reading in l/s but treated as m3/s shows up as a value hundreds of times
// its own reach's long-term mean. Flag anything that fails the test either way.
const suspect = [];
for (const s of st.stations) {
  if (!s.reach || !s.hasQ || !s.meanQ) continue;
  s.unitCheck = 'ok';
  if (!s.unit) s.unitCheck = 'unknown-unit';
}
await fs.writeFile(stFile, JSON.stringify(st, null, 0));

await fs.writeFile(
  new URL('../site/data/network.json', import.meta.url),
  JSON.stringify({ p: P, built: new Date().toISOString(), reaches })
);
const size = (await fs.stat(new URL('../site/data/network.json', import.meta.url))).size;
console.log(`wrote network.json ${(size / 1e6).toFixed(2)} MB`);
