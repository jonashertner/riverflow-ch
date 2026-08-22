// Build the water-quality index used by the map.
//
// Source: BAFU NAWA TREND, the national long-term monitoring programme for
// Swiss surface-water quality. The prepared annual CSV files carry every
// published result. This build keeps all years (2011 onward) but reduces each
// station/analyte/year to a transparent summary for the country view. The exact
// observations are read on demand from BAFU's public GraphQL API when a station
// is opened, so the map stays small without discarding the laboratory record.
//
// A result below its determination limit is censored data, not zero. It is never
// imputed into a median. The source also publishes calculated zeroes whose own
// remark says that every constituent sample was below its determination limit;
// those are counted as censored too. Missing values remain missing.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ROOT = 'https://data.bafu.admin.ch';
const PREFIX = 'water/nawa-trend/';
const OUT = new URL('../site/data/quality.json', import.meta.url);
const FORCE = process.argv.includes('--force');
const SCHEMA = 1;

const listingResponse = await fetch(`${ROOT}/download?list-type=2&prefix=${PREFIX}`);
if (!listingResponse.ok) throw new Error(`NAWA listing ${listingResponse.status}`);
const listing = await listingResponse.text();

const entities = s => s.replaceAll('&quot;', '"').replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const objects = [...listing.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m => {
  const part = m[1];
  const get = tag => entities((new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(part) ?? [,''])[1]);
  return { key: get('Key'), modified: get('LastModified'), bytes: +(get('Size') || 0) };
});
const versions = [...new Set(objects.map(o => /\/v(\d{4}-\d{2}-\d{2})\//.exec(o.key)?.[1]).filter(Boolean))].sort();
const version = versions.at(-1);
if (!version) throw new Error('NAWA listing contains no version');
const versionObjects = objects
  .filter(o => o.key.startsWith(`${PREFIX}v${version}/`))
  .sort((a, b) => a.key.localeCompare(b.key));
const sourceFingerprint = createHash('sha256')
  .update(JSON.stringify(versionObjects.map(({ key, modified, bytes }) => [key, modified, bytes])))
  .digest('hex');

if (!FORCE) {
  try {
    const old = JSON.parse(await fs.readFile(OUT, 'utf8'));
    if (old.meta?.schema === SCHEMA && old.meta?.sourceVersion === `v${version}` &&
        old.meta?.sourceFingerprint === sourceFingerprint) {
      console.log(`NAWA TREND v${version}: quality.json matches the current object listing`);
      process.exit(0);
    }
  } catch { /* first build */ }
}

const base = `${ROOT}/download/${PREFIX}v${version}`;
async function textFile(path) {
  const r = await fetch(`${base}/${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.text();
}

// Quote-aware semicolon CSV reader. It calls back once per row and does not keep
// the source table in memory after the callback has consumed it.
function csv(text, visit) {
  let row = [], field = '', quoted = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') visit(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') pushField();
    else if (c === '\n') pushRow();
    else if (c !== '\r') field += c;
  }
  if (field || row.length) pushRow();
}

function table(text, visit) {
  let header = null, at = null;
  csv(text, row => {
    if (!header) {
      header = row.map((x, i) => i === 0 ? x.replace(/^\uFEFF/, '') : x);
      at = Object.fromEntries(header.map((x, i) => [x, i]));
    } else visit(row, at);
  });
}

function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [+(lon * 100 / 36).toFixed(5), +(lat * 100 / 36).toFixed(5)];
}

const stations = new Map();
table(await textFile('stations/water_nawa-trend_stations.csv'), (r, h) => {
  const id = r[h['Messstelle ID']];
  const [x, y] = lv95(+r[h['X-Koordinate (LV95)']], +r[h['Y-Koordinate (LV95)']]);
  stations.set(id, {
    id, name: r[h['Messstelle Name']], water: r[h['Gewässername']], canton: r[h['Kanton']],
    x, y, predecessor: r[h['Vorgänger']] || null, successor: r[h['Nachfolger']] || null,
    cells: new Map(),
  });
});

const parameterMeta = new Map();
table(await textFile('parameters/water_nawa-trend_parameters.csv'), (r, h) => {
  const de = r[h['Deutsche Bezeichnung / Désignation en allemand']];
  if (!de) return;
  parameterMeta.set(de, {
    de, fr: r[h['Französische Bezeichnung / Désignation en français']] || null,
    cas1: r[h['CAS (I)']] || null, cas2: r[h['CAS (II)']] || null,
    inchikey: r[h['InChIKey']] || null,
    molarMass: number(r[h['Molare Masse / Masse molaire (g/mol)']]),
  });
});

function number(s) {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  const v = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
function day(s) {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const sig = v => v === null ? null : +Number(v).toPrecision(8);
const median = xs => {
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  const i = xs.length >> 1;
  return xs.length % 2 ? xs[i] : (xs[i - 1] + xs[i]) / 2;
};
const quantile = (sorted, p) => {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * p, i = Math.floor(x), f = x - i;
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * f;
};

const typeNames = ['Stichprobe', 'Sammelprobe zeitproportional', 'Sammelprobe abflussproportional'];
const typeIndex = new Map(typeNames.map((x, i) => [x, i]));
const series = [], seriesByKey = new Map();
function getSeries(name, unit) {
  const key = `${name}\u0000${unit}`;
  let i = seriesByKey.get(key);
  if (i !== undefined) return i;
  i = series.length;
  const m = parameterMeta.get(name) ?? { de: name, fr: null, cas1: null, cas2: null, inchikey: null, molarMass: null };
  series.push({ ...m, unit, firstYear: Infinity, lastYear: -Infinity, samples: 0,
    quantified: 0, below: 0, missing: 0, stationYears: 0, domainValues: [] });
  seriesByKey.set(key, i);
  return i;
}

const dataObjects = objects.filter(o => o.key.startsWith(`${PREFIX}v${version}/data/`));
const years = dataObjects.map(o => +(o.key.match(/_(\d{4})\.csv$/)?.[1] ?? 0)).filter(Boolean).sort((a, b) => a - b);
if (!years.length) throw new Error(`NAWA v${version} contains no annual data files`);
const yearIndex = new Map(years.map((y, i) => [y, i]));
let totalRows = 0, sourceFirst = null, sourceLast = null;

for (const year of years) {
  const file = `data/water_nawa-trend_data_${year}.csv`;
  console.log(`NAWA TREND ${year}`);
  const body = await textFile(file);
  table(body, (r, h) => {
    totalRows++;
    const id = r[h['Messstelle ID']], name = r[h['Parameter']]?.trim(), unit = r[h['Einheit']]?.trim();
    if (!id || !name || unit === undefined) return;
    let station = stations.get(id);
    if (!station) {
      // A result is evidence even if a station-list revision omitted its site. It
      // remains in the totals but has no point until coordinates are published.
      station = { id, name: r[h['Messstelle Name']] || id, water: '', canton: '',
        x: null, y: null, predecessor: null, successor: null, cells: new Map() };
      stations.set(id, station);
    }
    const p = getSeries(name, unit), yi = yearIndex.get(year), cellKey = `${p}:${yi}`;
    let a = station.cells.get(cellKey);
    if (!a) {
      a = { p, y: yi, n: 0, q: 0, b: 0, m: 0, values: [], limits: [], first: null, last: null, types: 0 };
      station.cells.set(cellKey, a);
    }
    a.n++; series[p].samples++;
    const raw = (r[h['Messwert']] ?? '').trim();
    const remark = r[h['Bemerkung Messwert']] ?? '';
    const numeric = number(raw.replace(/^[<>≤≥]\s*/, ''));
    const calculatedBelow = numeric === 0 && remark.startsWith('Messwert berechnet aus kürzeren Teilproben');
    if (!raw || numeric === null) { a.m++; series[p].missing++; }
    else if (/^[<≤]/.test(raw) || calculatedBelow) {
      a.b++; series[p].below++;
      const limit = number(r[h['Bestimmungsgrenze']]) ?? (/^[<≤]/.test(raw) ? numeric : null);
      if (limit !== null) a.limits.push(limit);
    } else {
      a.q++; series[p].quantified++;
      a.values.push(numeric);
    }
    const d = day(r[h['NAWA Probenahme Ende (Datum und Uhrzeit)']])
           ?? day(r[h['NAWA Probenahme Beginn (Datum und Uhrzeit)']])
           ?? day(r[h['NAQUA Probenahme Datum']]);
    if (d) {
      a.first = a.first === null || d < a.first ? d : a.first;
      a.last = a.last === null || d > a.last ? d : a.last;
      sourceFirst = sourceFirst === null || d < sourceFirst ? d : sourceFirst;
      sourceLast = sourceLast === null || d > sourceLast ? d : sourceLast;
    }
    const ti = typeIndex.get(r[h['Probenahme Art']]);
    if (ti !== undefined) a.types |= 1 << ti;
  });
}

for (const s of stations.values()) {
  for (const a of s.cells.values()) {
    const p = series[a.p], year = years[a.y];
    const med = median(a.values), loq = median(a.limits);
    a.summary = [a.p, a.y, a.n, a.q, a.b, a.m, sig(med),
      a.values.length ? sig(a.values[0]) : null,
      a.values.length ? sig(a.values.at(-1)) : null,
      sig(loq), a.first, a.last, a.types];
    p.firstYear = Math.min(p.firstYear, year); p.lastYear = Math.max(p.lastYear, year);
    p.stationYears++;
    if (med !== null) p.domainValues.push(med);
  }
}

const featured = [
  'ortho-Phosphat-Phosphor (filtriert)\u0000mg/l',
  'Nitrat-Stickstoff\u0000mg/l',
  'Ammonium-Stickstoff\u0000mg/l',
  'Sauerstoff\u0000mg/l',
  'pH-Wert\u0000---',
  'Elektrische Leitfähigkeit\u0000µS/cm',
  'Chlorid\u0000mg/l',
  'DOC\u0000mg/l',
  'Gesamtphosphor (unfiltriert)\u0000mg/l',
  'Diclofenac\u0000µg/l',
  'Clarithromycin\u0000µg/l',
  'Cypermethrin\u0000µg/l',
  'Kupfer (gelöst)\u0000µg/l',
].map(k => seriesByKey.get(k)).filter(i => i !== undefined);

const params = series.map((p, i) => {
  p.domainValues.sort((a, b) => a - b);
  const lo = quantile(p.domainValues, 0.05), mid = quantile(p.domainValues, 0.5), hi = quantile(p.domainValues, 0.95);
  const positive = p.domainValues.filter(v => v > 0);
  const positiveLo = quantile(positive, 0.05);
  const log = positiveLo > 0 && hi / positiveLo >= 20;
  return {
    i, de: p.de, fr: p.fr, unit: p.unit, cas1: p.cas1, cas2: p.cas2,
    inchikey: p.inchikey, molarMass: p.molarMass,
    firstYear: p.firstYear, lastYear: p.lastYear, samples: p.samples,
    stationYears: p.stationYears, quantified: p.quantified, below: p.below, missing: p.missing,
    domain: [sig(log ? positiveLo : lo), sig(mid), sig(hi), log ? 'log' : 'linear'],
  };
});

const modified = dataObjects.map(o => o.modified).filter(Boolean).sort().at(-1) ?? null;
const out = {
  meta: {
    schema: SCHEMA, source: 'BAFU NAWA TREND', sourceVersion: `v${version}`, sourceModified: modified,
    sourceFingerprint,
    sourceFirst, sourceLast, years, rows: totalRows, stations: stations.size,
    locatedStations: [...stations.values()].filter(s => s.x !== null).length,
    parameters: params.length, featured,
    api: `${ROOT}/api`,
    dataset: 'https://api.data-platform-stg.cloud.bafu.admin.ch/en/dataproduct-water-nawa-trend',
    programme: 'https://www.bafu.admin.ch/de/nawa',
    licence: 'Open use. Must provide the source.',
    summary: 'Annual station medians use quantified values only. Results below the determination limit are counted, never imputed. No interpolation between stations and no composite quality score.',
  },
  sampleTypes: typeNames,
  parameters: params,
  stations: [...stations.values()].map(s => ({
    id: s.id, name: s.name, water: s.water, canton: s.canton, x: s.x, y: s.y,
    predecessor: s.predecessor, successor: s.successor,
    values: [...s.cells.values()].map(a => a.summary).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  })).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true })),
};

await fs.writeFile(OUT, JSON.stringify(out));
const stat = await fs.stat(OUT);
console.log(`quality: ${totalRows.toLocaleString('en')} results, ${stations.size} stations, ${params.length} parameter/unit series, ${years[0]}–${years.at(-1)}`);
console.log(`quality.json: ${(stat.size / 1024 / 1024).toFixed(2)} MiB, source v${version}, modified ${modified}`);
