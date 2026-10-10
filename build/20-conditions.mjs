// Build conditions.json: where the national water budget stands now.
//
// The BAFU balance (19-budget.mjs) is annual and arrives nine months after the
// year ends. This file answers the question in between, from the numeric data of
// the federal drought platform (BAFU, MeteoSwiss, swisstopo; trockenheit.admin.ch),
// published weekly on data.geo.admin.ch as zipped CSV:
//
//   outflow      monthly mean discharge of the Rhine at Basel (2289) and the Rhône
//                at Chancy (2174), the two gauges where most Swiss water leaves
//                the country, against the 1991–2020 mean for the same month;
//   groundwater  NAQUA levels and spring discharges, each against its own record
//                for the same calendar month;
//   lakes        lake levels, the same way;
//   drought      the combined drought index (CDI, 1 not dry to 5 extremely dry)
//                and modelled soil moisture for the 38 drought regions.
//
// Rules this script keeps:
//
//   - Only complete periods. The source dates a week or month by its first day
//     (Handbuch "Numerische Daten der Trockenheitsplattform", v1.1, 18.05.2026,
//     3.3.2), and its current files include the running week and month. A month is
//     used only once it has ended before the file's own update date.
//   - Every comparison is against the station's own record for the same calendar
//     month, computed here from the published monthly means of 1991–2020, and only
//     where at least MIN_YEARS of that window exist. The platform's own thresholds
//     are used for one thing only: to confirm that a low value means dry water at
//     that station (minimum below the 20th percentile in every month). A station
//     that fails the check is left out and counted, not guessed at.
//   - A level or a percentile is not a volume. Nothing here is converted to km³
//     except the outflow, where discharge × time is a volume by definition.
//
// The station classes (which ids are groundwater sites, which are lakes) come from
// the two hydrodaten map feeds. They are used for names and classes only, never for
// values.
import fs from 'node:fs/promises';
import { unzip } from './lib-zip.mjs';

const BASE = 'https://data.geo.admin.ch/ch.bafu.trockenheitsdaten-numerisch';
const ZIP = item => `${BASE}/trockenheitsdaten-numerisch_${item}/trockenheitsdaten-numerisch_${item}.csv.zip`;
const FEED = f => `https://www.hydrodaten.admin.ch/web-hydro-maps/${f}`;
const OUT = new URL('../site/data/conditions.json', import.meta.url);
const OUTFLOW = [
  { id: '2289', name: 'Rhein – Basel, Rheinhalle' },
  { id: '2174', name: 'Rhône – Chancy, Aux Ripes' },
];
const REF = [1991, 2020];
const MIN_YEARS = 15;

async function get(url, kind = 'buffer') {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return kind === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
      if (r.status < 500) throw new Error(`${url} ${r.status}`);
    } catch (e) { if (i === 2) throw e; }
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`${url} unreachable`);
}

// ---- read the three archives
const csv = (files, name) => {
  const b = Object.entries(files).find(([k]) => k === name || k.endsWith(`/${name}`))?.[1];
  if (!b) throw new Error(`conditions: ${name} missing from archive`);
  const lines = b.toString('utf8').split(/\r?\n/);
  const updated = lines.map(l => /letzte Aktualisierung:\s*(\d\d)\.(\d\d)\.(\d{4})/.exec(l)).find(Boolean);
  const body = lines.filter(l => l && !l.startsWith('#'));
  const head = body.shift().split(';');
  return { updated: updated ? `${updated[3]}-${updated[2]}-${updated[1]}` : null,
    rows: body.map(l => Object.fromEntries(l.split(';').map((v, i) => [head[i], v]))) };
};
const current = unzip(await get(ZIP('current')));
const historic = unzip(await get(ZIP('historic')));
const reference = unzip(await get(ZIP('reference')));

const curStations = csv(current, 'monthly_current_stations.csv');
const updated = curStations.updated;
if (!updated) throw new Error('conditions: the current file carries no update date');
const iso = d => { const [dd, mm, yyyy] = d.split('.'); return `${yyyy}-${mm}-${dd}`; };
const ym = d => iso(d).slice(0, 7);

// The latest complete month is the one before the month of the update date.
const u = new Date(`${updated}T00:00:00Z`);
const lastMonth = new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7); };
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };

// ---- monthly series per station: historic first, current overrides
const series = new Map(); // id -> { unit, label, v: Map(ym -> value) }
for (const src of [csv(historic, 'monthly_historic_stations.csv').rows, curStations.rows]) {
  for (const r of src) {
    const v = parseFloat(r.value);
    if (!Number.isFinite(v)) continue;
    const m = ym(r.measured_at);
    if (m > lastMonth) continue;              // the running month is never used
    let s = series.get(r.hydro_station_id);
    if (!s) series.set(r.hydro_station_id, s = { unit: r.unit, label: r.label, v: new Map() });
    s.v.set(m, v);
  }
}

// The platform's own reference thresholds, used only to confirm direction.
const refRows = csv(reference, 'monthly_reference_stations.csv').rows;
const lowIsDry = new Map(refRows.map(r => {
  let ok = true;
  for (let k = 1; k <= 12; k++) {
    const mn = parseFloat(r[`min_${k}`]), th = parseFloat(r[`threshold1_${k}`]);
    if (Number.isFinite(mn) && Number.isFinite(th) && mn > th) ok = false;
  }
  return [r.hydro_station_id, ok];
}));

// Empirical quantile, linear between order statistics.
const quantile = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y), h = (a.length - 1) * q, lo = Math.floor(h);
  return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (h - lo);
};
function climatology(s, m) {
  const mo = m.slice(5);
  const xs = [];
  for (let y = REF[0]; y <= REF[1]; y++) { const v = s.v.get(`${y}-${mo}`); if (v !== undefined) xs.push(v); }
  if (xs.length < MIN_YEARS) return null;
  return { n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, p20: quantile(xs, 0.2), p80: quantile(xs, 0.8) };
}

// ---- outflow at the two main border gauges
const outflowMonths = [];
for (let k = 23; k >= 0; k--) {
  const m = addMonths(lastMonth, -k);
  const q = OUTFLOW.map(g => series.get(g.id)?.v.get(m));
  const c = OUTFLOW.map(g => series.has(g.id) ? climatology(series.get(g.id), m) : null);
  if (q.some(v => v === undefined) || c.some(x => !x)) throw new Error(`conditions: outflow gauge missing for ${m}`);
  const qs = q.reduce((a, b) => a + b, 0), ns = c.reduce((a, b) => a + b.mean, 0);
  outflowMonths.push({ m, q: Math.round(qs), norm: Math.round(ns), pct: Math.round(100 * qs / ns),
    byGauge: q.map(v => Math.round(v)) });
}
const vol = (rows, key) => rows.reduce((a, r) => a + r[key] * daysIn(r.m) * 86400, 0) / 1e9;
const last12 = outflowMonths.slice(-12);
const outflow = {
  gauges: OUTFLOW, months: outflowMonths,
  last12: { from: last12[0].m, to: last12.at(-1).m,
    km3: Math.round(vol(last12, 'q') * 10) / 10, normKm3: Math.round(vol(last12, 'norm') * 10) / 10 },
};
outflow.last12.pct = Math.round(100 * outflow.last12.km3 / outflow.last12.normKm3);

// ---- groundwater and lakes, each against its own same-month record
const [pq, gw] = await Promise.all([get(FEED('hydro_sensor_pq.geojson'), 'json'), get(FEED('hydro_sensor_pq_groundwater.geojson'), 'json')]);
const props = f => f.properties ?? {};
const lakeIds = new Map(pq.features.filter(f => props(f).kind === 'lake').map(f => [String(props(f).key), props(f).label]));
const gwIds = new Map(gw.features.map(f => [String(props(f).key), props(f).label]));
if (lakeIds.size < 10 || gwIds.size < 20) throw new Error(`conditions: station feeds look incomplete (${lakeIds.size} lakes, ${gwIds.size} groundwater sites)`);

function classify(ids, kind) {
  const stations = [], skipped = { noRecent: 0, shortRecord: 0, direction: 0 };
  for (const [id, name] of ids) {
    const s = series.get(id);
    if (!s || !s.v.has(lastMonth)) { skipped.noRecent++; continue; }
    if (lowIsDry.get(id) === false) { skipped.direction++; continue; }
    const c = climatology(s, lastMonth);
    if (!c) { skipped.shortRecord++; continue; }
    const v = s.v.get(lastMonth);
    stations.push({ id, name, unit: s.unit, kind: kind === 'gw' ? (s.label === 'Abfluss' ? 'spring' : 'level') : 'lake',
      v: +v.toFixed(3), p20: +c.p20.toFixed(3), p80: +c.p80.toFixed(3), years: c.n,
      state: v < c.p20 ? 'low' : v > c.p80 ? 'high' : 'normal' });
  }
  stations.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const count = st => stations.filter(x => x.state === st).length;
  return { month: lastMonth, n: stations.length, low: count('low'), normal: count('normal'), high: count('high'), skipped, stations };
}
const groundwater = classify(gwIds, 'gw');
const lakes = classify(lakeIds, 'lake');

// ---- drought regions: the latest complete week with a CDI in nearly every region
const weekly = csv(current, 'weekly_current_regions.csv').rows;
const regionNames = new Map(csv(reference, 'regions.csv').rows.map(r => [r.drought_region_id, r.name_de]));
const byWeek = new Map();
for (const r of weekly) {
  const d = iso(r.measured_at);
  if (Date.parse(d) + 7 * 86400000 > Date.parse(updated)) continue; // week not complete
  (byWeek.get(d) ?? byWeek.set(d, []).get(d)).push(r);
}
const regionsN = regionNames.size;
const weeks = [...byWeek.keys()].sort()
  .filter(d => byWeek.get(d).filter(r => r.cdi !== '').length >= 0.9 * regionsN);
if (!weeks.length) throw new Error('conditions: no complete week with a drought index');
const levels = rows => [1, 2, 3, 4, 5].map(l => rows.filter(r => +r.cdi === l).length);
const lastWeek = weeks.at(-1), lw = byWeek.get(lastWeek);
const soil = lw.map(r => parseFloat(r.soil_moisture_ufc)).filter(Number.isFinite);
const drought = {
  week: lastWeek, regions: regionsN, levels: levels(lw),
  soilMedian: soil.length ? Math.round(quantile(soil, 0.5)) : null,
  driest: lw.filter(r => +r.cdi >= 3).map(r => ({ id: r.drought_region_id, name: regionNames.get(r.drought_region_id) ?? r.drought_region_id, cdi: +r.cdi }))
    .sort((a, b) => b.cdi - a.cdi || a.name.localeCompare(b.name, 'de')),
  weeks: weeks.slice(-52).map(d => [d, ...levels(byWeek.get(d))]),
};

const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), updated, lastMonth, ref: REF, minYears: MIN_YEARS,
    source: { holder: 'BAFU, MeteoSwiss, swisstopo', name: 'Trockenheitsplattform – numerische Daten', url: `${BASE}`, page: 'https://www.trockenheit.admin.ch/' },
  },
  outflow, groundwater: { ...groundwater }, lakes: { ...lakes }, drought,
};
await fs.writeFile(OUT, JSON.stringify(out));

const o = outflow.months.at(-1);
console.log(`conditions, source updated ${updated}; latest complete month ${lastMonth}`);
console.log(`  outflow Basel + Chancy ${o.q} m³/s = ${o.pct} % of the ${REF.join('–')} mean for the month; 12 months ${outflow.last12.km3} km³ (${outflow.last12.pct} %)`);
console.log(`  groundwater ${groundwater.n} sites: ${groundwater.low} low, ${groundwater.normal} normal, ${groundwater.high} high; skipped ${JSON.stringify(groundwater.skipped)}`);
console.log(`  lakes ${lakes.n}: ${lakes.low} low, ${lakes.normal} normal, ${lakes.high} high; skipped ${JSON.stringify(lakes.skipped)}`);
console.log(`  drought week ${lastWeek}: CDI levels 1–5 ${drought.levels.join('/')} of ${regionsN}; median soil moisture ${drought.soilMedian} %`);
