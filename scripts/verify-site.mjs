#!/usr/bin/env node
/* Dependency-free release gate for the static site.
 *
 * The publication surface is 26 HTML documents with 25 canonical URLs, fourteen
 * JSON datasets and three shared string catalogues. A broken relative link or one
 * missing translation can therefore hide in a page nobody happened to open. This
 * check treats the site as one artifact and verifies the contracts that make those
 * copies trustworthy. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const site = join(root, 'site');
const languages = ['en', 'de', 'fr', 'it', 'rm'];
const hreflangs = [...languages, 'x-default'];
const base = 'https://opengovclimate.ch/riverflow/';
const errors = [];
const fail = (file, message) => errors.push(`${relative(root, file)}: ${message}`);

function walk(dir, accept = () => true) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) out.push(...walk(file, accept));
    else if (accept(file)) out.push(file);
  }
  return out;
}

function one(raw, pattern) {
  const matches = [...raw.matchAll(pattern)];
  return matches.length === 1 ? matches[0][1] : null;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function localTarget(from, value) {
  if (!value || /^(?:[a-z]+:|\/\/)/i.test(value)) return null;
  const [pathPart, fragment = ''] = value.split('#', 2);
  const clean = pathPart.split('?', 1)[0];
  let target = clean ? resolve(dirname(from), clean) : from;
  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
  } catch { /* reported by the caller */ }
  return { target, fragment };
}

const htmlFiles = walk(site, file => extname(file) === '.html').sort();
const htmlByFile = new Map(htmlFiles.map(file => [file, readFileSync(file, 'utf8')]));
const canonicalUrls = new Set();

for (const file of htmlFiles) {
  const raw = htmlByFile.get(file);
  const htmlTag = raw.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const lang = attribute(htmlTag, 'lang');
  const rootAttr = attribute(htmlTag, 'data-root');
  if (!languages.includes(lang)) fail(file, `unsupported or missing lang=${lang}`);
  const translated = dirname(file) !== site;
  if (rootAttr !== (translated ? '../' : './')) fail(file, `data-root should be ${translated ? '../' : './'}`);

  const titleCount = (raw.match(/<title\b/gi) ?? []).length;
  const h1Count = (raw.match(/<h1\b/gi) ?? []).length;
  const mainCount = (raw.match(/<main\b/gi) ?? []).length;
  if (titleCount !== 1) fail(file, `expected one title, found ${titleCount}`);
  if (h1Count !== 1) fail(file, `expected one h1, found ${h1Count}`);
  if (mainCount !== 1) fail(file, `expected one main landmark, found ${mainCount}`);

  for (const name of ['description', 'robots', 'twitter:card']) {
    const count = [...raw.matchAll(new RegExp(`<meta\\s+[^>]*name=["']${name.replace(':', '\\:')}["'][^>]*>`, 'gi'))].length;
    if (count !== 1) fail(file, `expected one ${name} meta tag, found ${count}`);
  }
  for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:url', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt']) {
    const count = [...raw.matchAll(new RegExp(`<meta\\s+[^>]*property=["']${property.replace(':', '\\:')}["'][^>]*>`, 'gi'))].length;
    if (count !== 1) fail(file, `expected one ${property} meta tag, found ${count}`);
  }

  const canonical = one(raw, /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
  const ogUrl = one(raw, /<meta\s+[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/gi);
  if (!canonical?.startsWith(base)) fail(file, 'canonical URL is missing or outside the publication root');
  else canonicalUrls.add(canonical);
  if (ogUrl !== canonical) fail(file, 'og:url does not match the canonical URL');

  const alternates = [...raw.matchAll(/<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const wanted of hreflangs) if (alternates.filter(x => x === wanted).length !== 1) fail(file, `hreflang ${wanted} is missing or duplicated`);
  if (alternates.some(x => !hreflangs.includes(x))) fail(file, 'unexpected hreflang value');

  const ids = [...raw.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const id of new Set(ids)) if (ids.filter(x => x === id).length > 1) fail(file, `duplicate id #${id}`);

  for (const tag of raw.match(/<(?:a|link|script)\b[^>]*>/gi) ?? []) {
    const value = attribute(tag, tag.startsWith('<script') ? 'src' : 'href');
    const found = localTarget(file, value);
    if (!found) continue;
    if (!found.target.startsWith(site + sep) && found.target !== site) {
      fail(file, `local reference escapes site/: ${value}`);
      continue;
    }
    let targetRaw;
    try { targetRaw = readFileSync(found.target, 'utf8'); }
    catch { fail(file, `missing local reference: ${value}`); continue; }
    if (found.fragment) {
      const fragment = decodeURIComponent(found.fragment);
      if (!new RegExp(`\\bid=["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(targetRaw)) {
        fail(file, `missing fragment target: ${value}`);
      }
    }
  }

  for (const tag of raw.match(/<a\b[^>]*>/gi) ?? []) {
    if (attribute(tag, 'target') === '_blank' && !/\bnoopener\b/.test(attribute(tag, 'rel') ?? '')) {
      fail(file, 'target="_blank" link is missing rel="noopener"');
    }
  }
  for (const tag of raw.match(/<button\b[^>]*>/gi) ?? []) {
    if (!attribute(tag, 'type')) fail(file, 'button is missing an explicit type');
  }
  for (const tag of raw.match(/<canvas\b[^>]*>/gi) ?? []) {
    if (attribute(tag, 'aria-hidden') !== 'true' && !attribute(tag, 'aria-label') && !attribute(tag, 'aria-labelledby')) {
      fail(file, 'canvas is neither named nor hidden from assistive technology');
    }
  }
}

// The publication root is deliberately German. The English map has its own /en/
// URL, and every landing variant exposes the language switch before the map opens.
const landingFiles = ['index.html', 'en/index.html', 'de/index.html', 'fr/index.html', 'it/index.html', 'rm/index.html']
  .map(name => join(site, name));
const rootLanding = htmlByFile.get(join(site, 'index.html')) ?? '';
const englishLanding = htmlByFile.get(join(site, 'en', 'index.html')) ?? '';
if (!/<html\b[^>]*\blang=["']de["']/i.test(rootLanding)) fail(join(site, 'index.html'), 'publication root must be German');
if (!/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/opengovclimate\.ch\/riverflow\/["']/i.test(rootLanding)) {
  fail(join(site, 'index.html'), 'German landing canonical must own the publication root');
}
if (!/<html\b[^>]*\blang=["']en["']/i.test(englishLanding)) fail(join(site, 'en', 'index.html'), 'English landing page is missing');
for (const file of landingFiles) {
  const raw = htmlByFile.get(file) ?? '';
  const switches = (raw.match(/\bdata-langswitch\b/g) ?? []).length;
  if (switches < 2) fail(file, 'language switch must be present in both the masthead and landing brief');
  const cycleModes = [...raw.matchAll(/\bdata-cycle-mode=["']([^"']+)["']/g)].map(match => match[1]);
  const expectedModes = ['ice', 'source', 'flow', 'quality', 'wet', 'res', 'use'];
  if (cycleModes.join(',') !== expectedModes.join(',')) fail(file, 'water-cycle stages are missing or out of order');
  if (!/precipitation|Niederschlag|précipitations|precipitazioni|precipitaziun/i.test(raw) ||
      !/groundwater recharge|Grundwasserneubildung|recharge des nappes|ricarica delle falde|regeneraziun da l’aua sutterrana/i.test(raw)) {
    fail(file, 'water-cycle data gaps are not disclosed');
  }
}
const responsiveCssFile = join(site, 'style.css');
const responsiveCss = readFileSync(join(site, 'tokens.css'), 'utf8') + '\n' + readFileSync(responsiveCssFile, 'utf8');
for (const [label, pattern] of [
  ['safe-area top inset', /--safe-t:\s*env\(safe-area-inset-top/],
  ['44 px mobile layer controls', /#modes button\s*\{[^}]*min-height:\s*44px/s],
  ['44 px mobile legend controls', /\.controls label\s*\{\s*min-height:\s*44px/],
  ['dynamic mobile sheet height', /max-height:\s*76dvh/],
  ['dynamic mobile dialog height', /max-height:\s*calc\(100dvh - 12px\)/],
  ['large landing language targets', /#intro \.introLangs \[lang\][^{]*\{[^}]*min-width:\s*40px;[^}]*min-height:\s*44px/s],
]) if (!pattern.test(responsiveCss)) fail(responsiveCssFile, `missing responsive contract: ${label}`);
if (!/window\.visualViewport\?\.addEventListener\(['"]resize['"]/.test(readFileSync(join(site, 'app.js'), 'utf8'))) {
  fail(join(site, 'app.js'), 'map does not relayout with the mobile visual viewport');
}

// The sitemap must describe exactly the canonical publication surface.
const sitemapFile = join(site, 'sitemap.xml');
const sitemap = readFileSync(sitemapFile, 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
for (const url of canonicalUrls) if (!sitemapUrls.has(url)) fail(sitemapFile, `missing canonical URL ${url}`);
for (const url of sitemapUrls) if (!canonicalUrls.has(url)) fail(sitemapFile, `URL has no HTML canonical ${url}`);
if (sitemapUrls.size !== 25) fail(sitemapFile, `expected 25 URLs, found ${sitemapUrls.size}`);

// Parse every committed JSON artifact and syntax-check every JavaScript source.
for (const file of [...walk(join(site, 'data'), f => extname(f) === '.json'), ...walk(join(root, 'build', 'pages'), f => extname(f) === '.json')]) {
  try { JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { fail(file, `invalid JSON: ${error.message}`); }
}

// An unmatched closing brace is legal enough for a browser to skip, but it can
// silently discard the responsive rules that follow it. Check the shared CSS as
// one more publication artifact rather than relying on visual spot checks.
for (const file of walk(site, f => extname(f) === '.css')) {
  const css = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  let depth = 0, earlyClose = false;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}' && --depth < 0) { earlyClose = true; break; }
  }
  if (earlyClose) fail(file, 'unmatched closing brace');
  else if (depth !== 0) fail(file, `${depth} unclosed CSS block${depth === 1 ? '' : 's'}`);
}

// Domain contracts. Syntax alone can publish a plausible-looking falsehood; these
// checks bind the prose and the runtime assumptions to the committed evidence.
try {
  const data = name => JSON.parse(readFileSync(join(site, 'data', name), 'utf8'));
  const stationFile = join(site, 'data', 'stations.json');
  const networkFile = join(site, 'data', 'network.json');
  const residualFile = join(site, 'data', 'residual.json');
  const reservoirFile = join(site, 'data', 'reservoirs.json');
  const iceFile = join(site, 'data', 'icehistory.json');
  const qualityFile = join(site, 'data', 'quality.json');
  const monitoringFile = join(site, 'data', 'canton-monitoring.json');
  const provenanceFile = join(site, 'data', 'provenance.json');
  const stations = data('stations.json').stations;
  const reaches = data('network.json').reaches;
  const residual = data('residual.json');
  const reservoirs = data('reservoirs.json');
  const ice = data('icehistory.json');
  const quality = data('quality.json');
  const monitoring = data('canton-monitoring.json');
  const unique = values => new Set(values).size;

  if (data('vintage.json').sources.length !== 22) fail(join(site, 'data', 'vintage.json'), 'published source count is no longer 22');

  // NAWA TREND is deliberately reduced for the country view, but no category is
  // allowed to disappear in that reduction. Every source row is either quantified,
  // below the determination limit, or missing; censored values never acquire a
  // median. Parameter and unit together remain the identity of a series.
  if (quality.meta.schema !== 1) fail(qualityFile, `unsupported NAWA schema ${quality.meta.schema}`);
  if (quality.meta.rows < 1_000_000) fail(qualityFile, `implausibly small NAWA release (${quality.meta.rows} rows)`);
  if (quality.meta.stations !== quality.stations.length || quality.meta.locatedStations !== quality.stations.length) fail(qualityFile, 'station counts or coordinates disagree with metadata');
  if (quality.meta.parameters !== quality.parameters.length) fail(qualityFile, 'parameter count disagrees with metadata');
  if (quality.stations.length !== unique(quality.stations.map(s => String(s.id)))) fail(qualityFile, 'NAWA station identifiers are not unique');
  if (quality.parameters.length !== unique(quality.parameters.map(p => `${p.de}\u0000${p.unit}`))) fail(qualityFile, 'NAWA parameter/unit series are not unique');
  if (!quality.meta.years.length || quality.meta.years.some((y, i, a) => i && y !== a[i - 1] + 1)) fail(qualityFile, 'NAWA years are not a continuous series');
  if (quality.meta.featured.some(i => !Number.isInteger(i) || !quality.parameters[i])) fail(qualityFile, 'featured parameter index is invalid');
  let qualityRows = 0;
  for (const station of quality.stations) {
    if (!Number.isFinite(station.x) || !Number.isFinite(station.y)) fail(qualityFile, `station ${station.id} has no usable coordinate`);
    for (const a of station.values) {
      if (a.length !== 13 || !quality.parameters[a[0]] || !quality.meta.years[a[1]]) { fail(qualityFile, `station ${station.id} has an invalid annual cell`); continue; }
      const [pi, yi, total, quantified, below, missing, median, min, max] = a;
      qualityRows += total;
      if (total !== quantified + below + missing) fail(qualityFile, `station ${station.id}, parameter ${pi}, year ${yi}: result classes do not sum`);
      if ((quantified === 0) !== (median === null)) fail(qualityFile, `station ${station.id}, parameter ${pi}, year ${yi}: median contradicts quantified count`);
      if (quantified && (!(Number.isFinite(median) && Number.isFinite(min) && Number.isFinite(max)) || median < min || median > max)) fail(qualityFile, `station ${station.id}, parameter ${pi}, year ${yi}: invalid quantified summary`);
    }
  }
  if (qualityRows !== quality.meta.rows) fail(qualityFile, `annual cells contain ${qualityRows} rows, metadata says ${quality.meta.rows}`);
  for (const p of quality.parameters) {
    const blank = p.domain?.slice(0, 3).every(v => v === null);
    const numeric = p.domain?.slice(0, 3).every(Number.isFinite);
    if (!Array.isArray(p.domain) || p.domain.length !== 4 || !['linear', 'log'].includes(p.domain[3]) ||
        (p.quantified === 0 ? !blank : !numeric) ||
        (numeric && (p.domain[0] > p.domain[1] || p.domain[1] > p.domain[2]))) {
      fail(qualityFile, `parameter ${p.i} has an invalid fixed scale`);
    }
  }

  // Art. 58 GSchG is not a one-size-fits-all measurement checklist, so this
  // artifact validates public evidence rather than inventing compliance scores.
  // The only computed field is NAWA coverage, bound to the exact quality release.
  const cantonCodes = monitoring.cantons.map(c => c.ct);
  if (monitoring.cantons.length !== 26 || unique(cantonCodes) !== 26) fail(monitoringFile, 'monitoring audit must contain 26 unique cantons');
  const nawaByCanton = new Map();
  for (const station of quality.stations) nawaByCanton.set(station.canton, (nawaByCanton.get(station.canton) ?? 0) + 1);
  const allowedScopes = new Set(['chemistry', 'biology', 'groundwater', 'lakes', 'data']);
  for (const canton of monitoring.cantons) {
    if (!['results', 'programme', 'partial'].includes(canton.record)) fail(monitoringFile, `${canton.ct} has an invalid evidence class`);
    if (!/^https:\/\//.test(canton.url ?? '')) fail(monitoringFile, `${canton.ct} has no primary HTTPS evidence link`);
    if (canton.year !== null && (!Number.isInteger(canton.year) || canton.year < 2000 || canton.year > 2026)) fail(monitoringFile, `${canton.ct} has an invalid evidence year`);
    if (!Array.isArray(canton.scope) || !canton.scope.length || canton.scope.some(s => !allowedScopes.has(s))) fail(monitoringFile, `${canton.ct} has an invalid evidence scope`);
    const expected = nawaByCanton.get(canton.ct) ?? 0;
    if (canton.nawaStations !== expected) fail(monitoringFile, `${canton.ct} states ${canton.nawaStations} NAWA stations, expected ${expected}`);
  }
  if (monitoring.meta.nationalVersion !== quality.meta.sourceVersion || monitoring.meta.nationalStations !== quality.meta.stations) fail(monitoringFile, 'national release metadata disagrees with quality.json');
  if (monitoring.meta.cantonsWithNationalStations !== nawaByCanton.size || nawaByCanton.size !== 25) fail(monitoringFile, `expected NAWA stations in 25 cantons, found ${nawaByCanton.size}`);
  const ar = monitoring.cantons.find(c => c.ct === 'AR');
  if (!ar || ar.nawaStations !== 0 || ar.record !== 'results' || ar.year !== 2024) fail(monitoringFile, 'AR counterexample is missing or no longer matches the audited record');

  if (stations.length !== unique(stations.map(s => String(s.id)))) fail(stationFile, 'station identifiers are not unique');
  if (reaches.length !== unique(reaches.map(r => r.i))) fail(networkFile, 'reach identifiers are not unique');
  if (stations.length !== 233) fail(stationFile, `published method expects 233 stations, found ${stations.length}`);
  if (stations.filter(s => s.reach).length !== 227) fail(stationFile, `published method expects 227 bound stations, found ${stations.filter(s => s.reach).length}`);
  if (reaches.length !== 8711) fail(networkFile, `published method expects 8711 reaches, found ${reaches.length}`);
  const qStations = stations.filter(s => s.hasQ);
  const unknownUnits = qStations.filter(s => !Number.isFinite(s.factor));
  const qReaches = unique(qStations.filter(s => s.reach).map(s => s.reach));
  const eligible = new Set(qStations.filter(s => s.reach && Number.isFinite(s.factor)).map(s => s.reach));
  if (qStations.length !== 187) fail(stationFile, `published method expects 187 discharge stations, found ${qStations.length}`);
  if (unknownUnits.length !== 5) fail(stationFile, `published method expects 5 unresolved discharge units, found ${unknownUnits.length}`);
  if (qReaches !== 173 || eligible.size !== 168) fail(stationFile, `published method expects 173 discharge reaches and 168 unit-verified reaches, found ${qReaches} and ${eligible.size}`);
  for (const s of qStations) {
    if (s.factor !== null && s.factor !== 1 && s.factor !== 0.001) fail(stationFile, `station ${s.id} has unsupported conversion factor ${s.factor}`);
  }

  // Recompute the structural evidence upper bound from topology. Every eligible
  // gauge is assumed current here; runtime validation can only reduce the first class.
  const byId = new Map(reaches.map(r => [r.i, r]));
  const above = new Set();
  for (const id of eligible) {
    let r = byId.get(id), guard = 0;
    while (r && guard++ < 600) { above.add(r.i); r = byId.get(r.n); }
  }
  let measured = 0, estimated = 0, none = 0;
  for (const start of reaches) {
    if (eligible.has(start.i)) { measured++; continue; }
    let r = start, guard = 0, hasDownstream = false;
    while (r && guard++ < 600) {
      if (eligible.has(r.i)) { hasDownstream = true; break; }
      r = byId.get(r.n);
    }
    if (hasDownstream || above.has(start.i)) estimated++; else none++;
  }
  if (measured !== 168 || estimated !== 5125 || none !== 3418) {
    fail(networkFile, `structural evidence changed: ${measured} measured, ${estimated} estimated, ${none} none`);
  }

  if (residual.points.length !== residual.counts.total) fail(residualFile, 'Q347 point count disagrees with summary');
  if (Object.values(residual.counts.bySource).reduce((a, n) => a + n, 0) !== residual.points.length) fail(residualFile, 'Q347 source classes do not sum to the point count');
  const minimum = q => {
    if (!(q > 0)) return null;
    if (q >= 60000) return 10000;
    const bands = [[60, 50, 0, 0], [160, 50, 10, 8], [500, 130, 10, 4.4], [2500, 280, 100, 31], [10000, 900, 100, 21.3], [60000, 2500, 1000, 150]];
    let floor = 0;
    for (const [ceil, baseValue, per, add] of bands) {
      if (q < ceil) return per ? baseValue + (q - floor) / per * add : baseValue;
      floor = ceil;
    }
    return 10000;
  };
  for (const p of residual.points) {
    if (p.q !== null && (!(p.q > 0) || !Number.isFinite(p.q))) fail(residualFile, `point ${p.id} has invalid Q347`);
    const expected = p.q === null ? null : +minimum(p.q).toFixed(1);
    if (p.min !== expected) fail(residualFile, `point ${p.id} has Art. 31 result ${p.min}, expected ${expected}`);
  }

  const weeks = reservoirs.fill.weeks;
  for (let i = 1; i < weeks.length; i++) {
    const gap = Date.parse(weeks[i][0]) - Date.parse(weeks[i - 1][0]);
    if (gap !== 7 * 86400000) fail(reservoirFile, `reservoir dates are not weekly at ${weeks[i][0]}`);
    if (!(weeks[i][1] >= 0 && weeks[i][1] <= 100)) fail(reservoirFile, `invalid filling percentage at ${weeks[i][0]}`);
  }
  if (weeks.at(-1)[0] !== reservoirs.fill.to || weeks.at(-1)[0] !== reservoirs.fill.latest.d) fail(reservoirFile, 'latest reservoir dates disagree');
  if (Date.now() - Date.parse(reservoirs.fill.to) > 15 * 86400000) fail(reservoirFile, `weekly series is more than 15 days old (${reservoirs.fill.to})`);
  for (const frame of ice.frames) {
    if (frame.drawnKm2 !== undefined && (frame.drawnKm2 > frame.km2 || frame.drawnKm2 / frame.km2 < 0.95)) fail(iceFile, `frame ${frame.y} geometry omits too much area`);
  }
  const iceYears = ice.frames.map(f => f.y);
  if (JSON.stringify(iceYears) !== JSON.stringify([1850, 1931, 1973, 2010, 2016, 2023])) fail(iceFile, `unexpected glacier inventory years: ${iceYears.join(', ')}`);
  const ice2010 = ice.frames.find(f => f.y === 2010), ice2016 = ice.frames.find(f => f.y === 2016);
  if (ice2010?.km2 !== 944.4 || ice2016?.km2 !== 961.3) fail(iceFile, 'the documented 2010–2016 method break no longer matches the data');

  const provenance = data('provenance.json');
  const vintage = data('vintage.json');
  for (const source of vintage.sources) {
    for (const field of ['key', 'name', 'holder', 'cls', 'cadence', 'licence', 'note']) {
      if (typeof source[field] !== 'string' || !source[field].trim()) fail(join(site, 'data', 'vintage.json'), `source ${source.key ?? '?'} is missing ${field}`);
    }
    if (!/^https:\/\//.test(source.url ?? '')) fail(join(site, 'data', 'vintage.json'), `source ${source.key} has no direct HTTPS link`);
    for (const link of source.links ?? []) if (!link.label || !/^https:\/\//.test(link.url ?? '')) fail(join(site, 'data', 'vintage.json'), `source ${source.key} has an invalid component link`);
  }
  if (new Set(vintage.sources.map(s => s.key)).size !== vintage.sources.length) fail(join(site, 'data', 'vintage.json'), 'source keys are not unique');
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  for (const [name, stated] of Object.entries(provenance.artifacts)) {
    const file = join(site, name);
    if (statSync(file).size !== stated.bytes || hash(file) !== stated.sha256) fail(provenanceFile, `artifact hash mismatch for ${name}; rebuild provenance`);
  }
  for (const [name, stated] of Object.entries(provenance.generators)) {
    const file = join(root, name);
    if (statSync(file).size !== stated.bytes || hash(file) !== stated.sha256) fail(provenanceFile, `generator hash mismatch for ${name}; rebuild provenance`);
  }
  for (const [key, expected] of Object.entries({ stations: 233, uniqueStationIds: 233, boundStations: 227, dischargeStations: 187, unresolvedDischargeUnits: 5, dischargeReaches: 173, eligibleDischargeReaches: 168, reaches: 8711, uniqueReachIds: 8711, q347Points: 1041, reservoirWeeks: 1390, qualityRows: quality.meta.rows, qualityStations: quality.meta.stations, qualityParameters: quality.meta.parameters, monitoringCantons: 26, monitoringCantonsWithNawa: 25 })) {
    if (provenance.facts[key] !== expected) fail(provenanceFile, `fact ${key} is ${provenance.facts[key]}, expected ${expected}`);
  }

  const claims = [readFileSync(join(root, 'README.md'), 'utf8'), ...['index.html', 'method.html', 'sources.html', 'law.html'].map(name => readFileSync(join(site, name), 'utf8'))].join('\n');
  for (const phrase of ['legally operative figure', 'what the statute would require', '8\'716 reaches', '236 federal gauges']) {
    if (claims.includes(phrase)) fail(join(root, 'README.md'), `obsolete claim remains: ${phrase}`);
  }
} catch (error) {
  fail(join(site, 'data'), `domain validation failed: ${error.message}`);
}
for (const file of [...walk(site, f => ['.js', '.mjs'].includes(extname(f))), ...walk(join(root, 'build'), f => ['.js', '.mjs'].includes(extname(f))), ...walk(join(root, 'scripts'), f => ['.js', '.mjs'].includes(extname(f)))]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) fail(file, (check.stderr || check.stdout).trim());
}

// Evaluate only the inert catalogues, then require every runtime string in all
// five languages and every literal T()/Tn() reference to resolve.
try {
  const catalogueSource = ['i18n.js', 'i18n-data.js', 'i18n-map.js']
    .map(name => readFileSync(join(site, name), 'utf8')).join('\n') +
    '\n;globalThis.__catalogue = STR;globalThis.__dataCatalogue = DSTR;';
  const sandbox = {
    document: {
      documentElement: { getAttribute: name => name === 'lang' ? 'en' : null, dataset: { root: './' } },
      addEventListener() {}, querySelectorAll() { return []; },
    },
    console: { warn() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(catalogueSource, sandbox);
  const catalogue = sandbox.__catalogue;
  const dataCatalogue = sandbox.__dataCatalogue;
  for (const [key, row] of Object.entries(catalogue)) {
    for (const lang of languages) if (typeof row?.[lang] !== 'string' || !row[lang]) fail(join(site, 'i18n.js'), `${key} has no ${lang} translation`);
  }
  for (const [key, row] of Object.entries(dataCatalogue)) {
    for (const lang of ['fr', 'it', 'rm']) if (typeof row?.[lang] !== 'string' || !row[lang]) fail(join(site, 'i18n-data.js'), `${key} has no ${lang} translation`);
  }
  const vintageStrings = JSON.parse(readFileSync(join(site, 'data', 'vintage.json'), 'utf8')).sources
    .flatMap(source => [source.name, source.holder, source.cadence, source.cls, source.note, source.licence, ...(source.links ?? []).map(link => link.label)]);
  for (const value of vintageStrings) {
    if (/^SGI\d+$/.test(value)) continue;
    for (const lang of languages.slice(1)) if (!dataCatalogue[value]?.[lang]) fail(join(site, 'i18n-data.js'), `source text has no ${lang} translation: ${value}`);
  }
  const jsSource = walk(site, f => extname(f) === '.js').map(f => readFileSync(f, 'utf8')).join('\n');
  for (const match of jsSource.matchAll(/\bT\(\s*(['"])([^'"]+)\1(?=\s*(?:,|\)))/g)) {
    if (!match[2].includes('.')) continue;
    if (!catalogue[match[2]]) fail(join(site, 'i18n.js'), `literal T() key is undefined: ${match[2]}`);
  }
  for (const match of jsSource.matchAll(/\bTn\(\s*(['"])([^'"]+)\1(?=\s*(?:,|\)))/g)) {
    for (const suffix of ['.one', '.other']) if (!catalogue[match[2] + suffix]) fail(join(site, 'i18n.js'), `literal Tn() key is undefined: ${match[2] + suffix}`);
  }
} catch (error) {
  fail(join(site, 'i18n.js'), `catalogue check failed: ${error.message}`);
}

const ogImage = readFileSync(join(site, 'og-image.jpg'));
if (!(ogImage[0] === 0xff && ogImage[1] === 0xd8 && ogImage[2] === 0xff)) fail(join(site, 'og-image.jpg'), 'file is not a JPEG');

if (errors.length) {
  console.error(`Site verification failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const dataBytes = walk(join(site, 'data')).reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Site verified: ${htmlFiles.length} HTML pages, ${canonicalUrls.size} canonicals, ${sitemapUrls.size} sitemap URLs, ${(dataBytes / 1024 / 1024).toFixed(2)} MiB of data.`);
