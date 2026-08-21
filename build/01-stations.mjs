// Build stations.json: BAFU gauging stations, coordinates, and the discharge UNIT per station.
//
// Two sources, both public, no key:
//   1. LINDAS SPARQL (lindas.admin.ch/query, graph <https://lindas.admin.ch/foen/hydro>)
//      gives station id, name, WGS84 point, and the live observation dimensions.
//   2. hydrodaten.admin.ch plot JSON gives the UNIT of the discharge series.
//      This matters: the LINDAS cube carries a predicate <http://example.com/isLiter>
//      that is set true on EVERY row, including the Rhine at Basel, so it cannot be
//      used to tell l/s from m3/s. Verified 19.08.2026: station 2492 reads in l/s,
//      station 2289 reads in m3/s, both flagged isLiter=true.
import fs from 'node:fs/promises';
import { bindStations } from './lib-stations.mjs';

const ENDPOINT = 'https://lindas.admin.ch/query';
const GRAPH = '<https://lindas.admin.ch/foen/hydro>';

async function sparql(query) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }),
  });
  if (!r.ok) throw new Error(`SPARQL ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

const rawRows = await sparql(`
PREFIX schema: <http://schema.org/>
PREFIX h: <https://environment.ld.admin.ch/foen/hydro/dimension/>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?station ?id ?name ?wkt ?time ?discharge ?level ?temp
FROM ${GRAPH}
WHERE {
  {
    SELECT ?station (MAX(?observedAt) AS ?time)
    WHERE { ?latest h:station ?station ; h:measurementTime ?observedAt . }
    GROUP BY ?station
  }
  ?obs h:station ?station ; h:measurementTime ?time .
  OPTIONAL { ?obs h:discharge ?discharge }
  OPTIONAL { ?obs h:waterLevel ?level }
  OPTIONAL { ?obs h:waterTemperature ?temp }
  ?station schema:identifier ?id ; schema:name ?name ; geo:hasGeometry ?g .
  ?g geo:asWKT ?wkt .
}`);

// During an update the cube can briefly expose more than one observation for a
// station. Keep one station record, and make the choice here instead of accepting
// the endpoint's unspecified result order.
const latestById = new Map();
for (const row of rawRows) {
  const previous = latestById.get(row.id);
  if (!previous || String(row.time) > String(previous.time)) latestById.set(row.id, row);
}
const rows = [...latestById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));

console.log(`LINDAS: ${rows.length} stations, ${rows.filter(r => r.discharge).length} with discharge`);

// The unit lives in the plot JSON's axis annotations. The "Abfluss" trace names its
// axis (y or y2); annotation[0] belongs to y, annotation[1] to y2.
async function unitOf(id) {
  for (const lang of ['de', 'fr']) {
    try {
      const r = await fetch(`https://www.hydrodaten.admin.ch/plots/p_q_7days/${id}_p_q_7days_${lang}.json`);
      if (!r.ok) continue;
      const j = await r.json();
      const ann = (j.plot?.layout?.annotations ?? []).map(a => a.text);
      const tr = (j.plot?.data ?? []).find(t => /Abfluss|D.bit|Portata|Discharge/i.test(t.name ?? ''));
      if (!tr) continue;
      const unit = ann[tr.yaxis === 'y2' ? 1 : 0];
      if (unit) return unit.trim();
    } catch { /* try next language */ }
  }
  return null;
}

const withQ = rows.filter(r => r.discharge !== undefined);
const units = new Map();
const CHUNK = 12;
for (let i = 0; i < withQ.length; i += CHUNK) {
  const batch = withQ.slice(i, i + CHUNK);
  const got = await Promise.all(batch.map(r => unitOf(r.id)));
  batch.forEach((r, k) => units.set(r.id, got[k]));
  process.stdout.write(`\r  units ${Math.min(i + CHUNK, withQ.length)}/${withQ.length}`);
}
console.log();

const tally = {};
for (const u of units.values()) tally[u ?? 'UNKNOWN'] = (tally[u ?? 'UNKNOWN'] ?? 0) + 1;
console.log('units:', tally);

function factorFor(unit) {
  if (!unit) return null;
  const clean = unit.replace(/<[^>]+>/g, '').replace(/\s+/g, '').toLowerCase();
  if (clean === 'l/s') return 0.001;
  if (clean === 'm³/s' || clean === 'm3/s') return 1;
  return null;
}

const stations = rows.map(r => {
  const m = /POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/.exec(r.wkt);
  const unit = units.get(r.id) ?? null;
  return {
    id: r.id,
    name: r.name,
    lon: m ? +(+m[1]).toFixed(5) : null,
    lat: m ? +(+m[2]).toFixed(5) : null,
    // factor converts the raw LINDAS number into m3/s
    unit: unit,
    // An unresolved unit is not silently treated as m3/s. The runtime keeps the
    // station visible but cannot use its discharge as evidence.
    factor: factorFor(unit),
    hasQ: r.discharge !== undefined,
  };
}).filter(s => s.lon !== null);

// The weekly refresh reuses the committed network. A clean full build also has
// the last committed network available; build/02 repeats the binding after it
// rebuilds that network from source.
try {
  const net = JSON.parse(await fs.readFile(new URL('../site/data/network.json', import.meta.url), 'utf8'));
  const bound = bindStations(stations, net.reaches, net.p);
  console.log(`bound ${bound}/${stations.length} stations to the committed network`);
} catch (error) {
  console.warn(`station binding skipped: ${error.message}`);
}

await fs.writeFile(
  new URL('../site/data/stations.json', import.meta.url),
  JSON.stringify({ built: new Date().toISOString(), stations }, null, 0)
);
console.log(`wrote ${stations.length} stations`);
const unknown = stations.filter(s => s.hasQ && !s.unit);
if (unknown.length) console.log('UNIT UNKNOWN for:', unknown.map(s => `${s.id} ${s.name}`).join('; '));
