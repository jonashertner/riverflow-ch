// Build a release manifest for the committed publication artifact.
//
// This does not turn a mutable upstream API into an archive. It records exactly
// what was published: source states, downloaded archive hashes when available,
// generator hashes, artifact hashes, sizes and the counts used by validation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'site', 'data');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

async function describe(file) {
  const bytes = await fs.readFile(file);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

const publicationFiles = (await walk(path.join(root, 'site')))
  .filter(file => file !== path.join(dataDir, 'provenance.json'))
  .sort();
const artifacts = {};
for (const file of publicationFiles) artifacts[path.relative(path.join(root, 'site'), file)] = await describe(file);

const generatorNames = [
  ...(await fs.readdir(path.join(root, 'build'))).filter(name => /\.(?:mjs|py|sh)$/.test(name)).map(name => `build/${name}`),
  ...(await fs.readdir(path.join(root, 'build', 'pages'))).filter(name => /\.(?:html|json)$/.test(name)).map(name => `build/pages/${name}`),
  'scripts/verify-site.mjs', '.github/workflows/pages.yml',
].sort();
const generators = {};
for (const name of generatorNames) generators[name] = await describe(path.join(root, name));

const stations = JSON.parse(await fs.readFile(path.join(dataDir, 'stations.json'))).stations;
const reaches = JSON.parse(await fs.readFile(path.join(dataDir, 'network.json'))).reaches;
const residual = JSON.parse(await fs.readFile(path.join(dataDir, 'residual.json')));
const reservoirs = JSON.parse(await fs.readFile(path.join(dataDir, 'reservoirs.json')));
const vintage = JSON.parse(await fs.readFile(path.join(dataDir, 'vintage.json')));
const quality = JSON.parse(await fs.readFile(path.join(dataDir, 'quality.json')));
const monitoring = JSON.parse(await fs.readFile(path.join(dataDir, 'canton-monitoring.json')));

let upstreamArchives = [];
try {
  upstreamArchives = JSON.parse(await fs.readFile('/tmp/riv/source-archives.json', 'utf8')).archives ?? [];
} catch { /* A partial or CI rebuild may have no downloaded source archives. */ }

const manifest = {
  schema: 2,
  built: new Date().toISOString(),
  revision: process.env.GITHUB_SHA ?? null,
  scope: 'Hashes describe the committed publication artifact. Upstream archives are listed only when present during the build; API responses are identified by source state, not archived here.',
  facts: {
    stations: stations.length,
    uniqueStationIds: new Set(stations.map(s => String(s.id))).size,
    boundStations: stations.filter(s => s.reach).length,
    dischargeStations: stations.filter(s => s.hasQ).length,
    unresolvedDischargeUnits: stations.filter(s => s.hasQ && !Number.isFinite(s.factor)).length,
    dischargeReaches: new Set(stations.filter(s => s.hasQ && s.reach).map(s => s.reach)).size,
    eligibleDischargeReaches: new Set(stations.filter(s => s.hasQ && s.reach && Number.isFinite(s.factor)).map(s => s.reach)).size,
    reaches: reaches.length,
    uniqueReachIds: new Set(reaches.map(r => r.i)).size,
    q347Points: residual.points.length,
    reservoirWeeks: reservoirs.fill.weeks.length,
    qualityRows: quality.meta.rows,
    qualityStations: quality.meta.stations,
    qualityParameters: quality.meta.parameters,
    monitoringCantons: monitoring.cantons.length,
    monitoringCantonsWithNawa: monitoring.meta.cantonsWithNationalStations,
  },
  sources: vintage.sources.map(({ key, holder, datenstand, live, url, links, licence }) =>
    ({ key, holder, datenstand, live, url, links, licence })),
  upstreamArchives,
  generators,
  artifacts,
};

await fs.writeFile(path.join(dataDir, 'provenance.json'), JSON.stringify(manifest));
console.log(`provenance: ${publicationFiles.length} publication files, ${generatorNames.length} generators, ${upstreamArchives.length} source archives`);
