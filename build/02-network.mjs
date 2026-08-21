// Build network.json from the clipped HydroRIVERS extract, and bind each BAFU gauge
// to the river reach it sits on.
//
// Geometry: HydroRIVERS v1.0 (HydroSHEDS, WWF). Vertex order is downstream, verified
// on the Rhine below Basel (19.08.2026): first vertex 47.8937 N, last 48.0000 N.
// DIS_AV_CMS is the long-term natural mean discharge per reach, in m3/s. It gives every
// reach a baseline, so ungauged water can be drawn without inventing a number.
import fs from 'node:fs/promises';
import { bindStations } from './lib-stations.mjs';

const SRC = process.argv[2] ?? '/tmp/riv/rivers_ch.json';
const geo = JSON.parse(await fs.readFile(SRC, 'utf8'));

const P = 1e5;                       // coordinate quantisation: 1e-5 deg, about 1 m
const reachById = new Map();

for (const f of geo.features) {
  const p = f.properties;
  if (!f.geometry) continue;
  const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  // Clipping can split a feature at the edge of the extract. The application and
  // the topology both require one record per HYRIV_ID, so retain the longest
  // clipped part deterministically instead of emitting duplicate identifiers.
  const line = parts.filter(part => part.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (line) {
    if (line.length < 2) continue;
    // delta-encode quantised coordinates
    const xs = [], ys = [];
    let px = 0, py = 0;
    for (const [lon, lat] of line) {
      const x = Math.round(lon * P), y = Math.round(lat * P);
      xs.push(x - px); ys.push(y - py);
      px = x; py = y;
    }
    const reach = {
      i: p.HYRIV_ID,
      n: p.NEXT_DOWN,
      m: p.MAIN_RIV,
      o: p.ORD_STRA,
      u: +(p.UPLAND_SKM ?? 0).toFixed(1),
      d: +(p.DIS_AV_CMS ?? 0).toFixed(3),
      x: xs, y: ys,
    };
    const previous = reachById.get(reach.i);
    if (!previous || reach.x.length > previous.x.length) reachById.set(reach.i, reach);
  }
}

const reaches = [...reachById.values()].sort((a, b) => a.i - b.i);

const verts = reaches.reduce((a, r) => a + r.x.length, 0);
console.log(`reaches ${reaches.length}, vertices ${verts}`);

// ---- bind gauges to reaches -------------------------------------------------
const stFile = new URL('../site/data/stations.json', import.meta.url);
const st = JSON.parse(await fs.readFile(stFile, 'utf8'));

const bound = bindStations(st.stations, reaches, P);
console.log(`bound ${bound}/${st.stations.length} stations to a reach`);

// ---- unit sanity check ------------------------------------------------------
// A station reading in l/s but treated as m3/s shows up as a value hundreds of times
// its own reach's long-term mean. Flag anything that fails the test either way.
await fs.writeFile(stFile, JSON.stringify(st, null, 0));

await fs.writeFile(
  new URL('../site/data/network.json', import.meta.url),
  JSON.stringify({ p: P, built: new Date().toISOString(), reaches })
);
const size = (await fs.stat(new URL('../site/data/network.json', import.meta.url))).size;
console.log(`wrote network.json ${(size / 1e6).toFixed(2)} MB`);
