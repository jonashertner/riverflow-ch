// Lakes and the national border, for legibility. Natural Earth 10m: the base lake
// set plus the European supplement, which is where the Swiss lakes live.
// Neither layer carries data; both are there so the map reads as Switzerland.
import fs from 'node:fs/promises';

const load = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const a = await load('/tmp/riv/lakes.json');
const b = await load('/tmp/riv/lakes_eu.json');
const border = await load('/tmp/riv/border.json');

const rings = [];
for (const f of [...a.features, ...b.features]) {
  if (!f.geometry) continue;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) rings.push({ n: f.properties.name ?? '', r: poly[0].map(c => [+c[0].toFixed(4), +c[1].toFixed(4)]) });
}
// keep the ones big enough to matter at country view
const area = r => Math.abs(r.reduce((s, p, i, A) => { const q = A[(i + 1) % A.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2);
const lakes = rings.filter(l => area(l.r) > 0.0008).sort((x, y) => area(y.r) - area(x.r));

const bpolys = [];
{
  const g = border.features[0].geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const p of polys) bpolys.push(p[0].map(c => [+c[0].toFixed(4), +c[1].toFixed(4)]));
}

await fs.writeFile(new URL('../site/data/context.json', import.meta.url), JSON.stringify({ lakes, border: bpolys }));
console.log(`lakes ${lakes.length}: ${lakes.map(l => l.n || '(unnamed)').join(', ')}`);
console.log(`border rings ${bpolys.length}, vertices ${bpolys.reduce((s, p) => s + p.length, 0)}`);
