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
  ...(await fs.readdir(path.join(root, 'scripts'))).filter(name => /\.mjs$/.test(name)).map(name => `scripts/${name}`),
  '.github/workflows/pages.yml', 'package.json', 'package-lock.json',
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

let previous = {};
try {
  previous = JSON.parse(await fs.readFile(path.join(dataDir, 'provenance.json'), 'utf8'));
} catch { /* first publication */ }

let upstreamArchives = previous.upstreamArchives ?? [];
let archiveEvidence = upstreamArchives.length ? 'retained' : 'unavailable';
try {
  upstreamArchives = JSON.parse(await fs.readFile('/tmp/riv/source-archives.json', 'utf8')).archives ?? [];
  archiveEvidence = 'refreshed';
} catch { /* Partial rebuilds retain the last reviewed immutable archive hashes. */ }

const facts = {
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
};
const sources = vintage.sources.map(({ key, holder, datenstand, live, url, links, licence }) =>
  ({ key, holder, datenstand, live, url, links, licence }));
const publicationCore = { schema: 3, facts, sources, upstreamArchives, generators, artifacts };
const publicationDigest = `sha256:${sha256(Buffer.from(JSON.stringify(publicationCore)))}`;
const sourceRevision = process.env.PUBLICATION_REVISION ?? null;
const unchanged = previous.publicationDigest === publicationDigest && previous.sourceRevision === sourceRevision;

const manifest = {
  schema: 3,
  built: unchanged && previous.built ? previous.built : new Date().toISOString(),
  revision: publicationDigest,
  publicationDigest,
  sourceRevision,
  scope: 'The publication digest identifies the exact public artifacts and generators. sourceRevision is added by the deployment workflow. Reviewed archive hashes survive partial API refreshes; mutable API responses are identified by their published source state.',
  archiveEvidence,
  ...publicationCore,
};

await fs.writeFile(path.join(dataDir, 'provenance.json'), JSON.stringify(manifest));
console.log(`provenance: ${publicationFiles.length} publication files, ${generatorNames.length} generators, ${upstreamArchives.length} source archives`);
