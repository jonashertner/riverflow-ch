// Build budget.json: the national water balance of Switzerland, as BAFU states it.
//
// Source: BAFU Hydrologie, "Natürlicher Wasserhaushalt der ganzen Schweiz und
// bedeutender Grosseinzugsgebiete", an Excel table linked from the page
// "Wasserhaushalt heute". It gives, for political Switzerland, hydrological
// Switzerland and twelve large catchments, precipitation P, runoff R,
// evapotranspiration E and storage change dS in mm per year, for 1981–2010,
// 1991–2020 and the latest calendar year. The method is Zappa et al. (2017),
// "Wasserhaushalt der Schweiz 2.0": the PREVAH model on a 200 m grid, with measured
// discharge treated as exact and the model error pushed into precipitation.
//
// What the table can claim, and what it cannot:
//
//   - It is a model result constrained by measurement, not a measurement. The page
//     says so beside every number.
//   - It is the natural balance. Abstraction, use and return flows are not in it.
//   - BAFU replaces the file each year; earlier years are not republished in it.
//     This script keeps every year it has ever read (see `years` below), so the
//     site accumulates the series that the source does not.
//   - The file name says 2021 while the title and columns say 2024. The year is
//     read from the title and the column headers, never from the file name.
//
// The script refuses to write if the table does not close: P − R − E − dS must be
// zero within rounding for every row, and runoff plus inflow from abroad must equal
// total outflow. A layout change at BAFU therefore fails the build rather than
// shifting a column into the wrong term.
//
// Stocks (glaciers, lakes, groundwater, reservoirs, soil) are not in the BAFU table.
// They are listed in STOCKS below, each with its holder, document and pinpoint, and
// the reservoir figures are read from reservoirs.json so that they cannot drift
// from the reservoir layer.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzip } from './lib-zip.mjs';

const PAGE = 'https://www.bafu.admin.ch/de/wasserhaushalt-heute';
const KNOWN = 'https://www.bafu.admin.ch/dam/de/sd-web/xrKgtJ0MOUQk/tabelle-wasserhaushalt-schweiz-2021.xlsx';
const OUT = new URL('../site/data/budget.json', import.meta.url);
const SCHEMA = 1;
// Political Switzerland, the area every national mm figure in the table refers to.
// Zappa et al. 2017, Bild 1 (Wasser Energie Luft 109(3), p. 205).
const AREA_KM2 = 41285;
const km3 = mm => Math.round(mm * AREA_KM2 / 1e5) / 10; // mm × km² / 10⁶, one decimal

// ---- fetch: find the current table on the BAFU page, fall back to the known URL
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      if (r.status < 500) throw new Error(`${url} ${r.status}`);
    } catch (e) { if (i === 2) throw e; }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error(`${url} unreachable`);
}
let tableUrl = KNOWN;
try {
  const html = await (await get(PAGE)).text();
  const m = /href="([^"]+wasserhaushalt[^"]*\.xlsx)"/i.exec(html);
  if (m) tableUrl = new URL(m[1], PAGE).href;
  else console.warn('budget: no .xlsx link on the BAFU page; using the last known URL');
} catch (e) {
  console.warn(`budget: BAFU page unreachable (${e.message}); using the last known URL`);
}
const buf = Buffer.from(await (await get(tableUrl)).arrayBuffer());
const sha256 = createHash('sha256').update(buf).digest('hex');

const zip = unzip(buf);
const xml = name => {
  if (!zip[name]) throw new Error(`table has no ${name}`);
  return zip[name].toString('utf8');
};
const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const shared = [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => ent([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
const cells = {};
for (const m of xml('xl/worksheets/sheet1.xml').matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const v = /<v>([\s\S]*?)<\/v>/.exec(m[4] ?? '');
  if (!v) continue;
  (cells[m[2]] ??= {})[m[1]] = /t="s"/.test(m[3]) ? shared[+v[1]] : /t="str"/.test(m[3]) ? ent(v[1]) : +v[1];
}
const rows = Object.entries(cells).map(([r, c]) => ({ r: +r, c })).sort((a, b) => a.r - b.r);

// ---- read: the year from the title, then check the column headers agree
const title = rows.find(x => typeof x.c.A === 'string' && /Wasserhaushalt/.test(x.c.A))?.c.A;
const year = +(/für (\d{4})/.exec(title ?? '')?.[1] ?? NaN);
if (!Number.isInteger(year)) throw new Error(`budget: no year in the table title (${title})`);
const COLS = { P: ['B', 'C', 'D'], R: ['E', 'F', 'G'], E: ['H', 'I', 'J'], dS: ['K', 'L', 'M'] };
const head = rows.find(x => Object.values(COLS).every(([, b, c]) => x.c[b] === 1991 && x.c[c] === year));
if (!head) throw new Error(`budget: column headers are not 1981 | 1991 | ${year} in four groups; the layout changed`);
const stamp = rows.map(x => x.c.A).find(a => typeof a === 'string' && /Bundesamt für Umwelt/.test(a)) ?? '';

const PERIODS = ['1981-2010', '1991-2020', String(year)];
const label = s => s.trim();
function balance(x) {
  const out = {};
  PERIODS.forEach((p, i) => {
    const t = {};
    for (const [k, cols] of Object.entries(COLS)) {
      const v = x.c[cols[i]];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`budget: ${label(x.c.A)} ${k} ${p} is not a number`);
      t[k] = Math.round(v);
    }
    // Closure. The source rounds each term to whole mm, so allow 2 mm.
    const gap = Math.round(x.c[COLS.P[i]] - x.c[COLS.R[i]] - x.c[COLS.E[i]] - x.c[COLS.dS[i]]);
    if (Math.abs(gap) > 2) throw new Error(`budget: ${label(x.c.A)} ${p} does not close (P−R−E−dS = ${gap} mm)`);
    out[p] = t;
  });
  return out;
}

const iNat = rows.findIndex(x => typeof x.c.A === 'string' && /^Politische Schweiz/.test(label(x.c.A)));
const iHyd = rows.findIndex(x => typeof x.c.A === 'string' && /^Hydrologische Schweiz/.test(label(x.c.A)));
if (iNat < 0 || iHyd < 0) throw new Error('budget: national rows not found');
const national = balance(rows[iNat]);
const hydrological = balance(rows[iHyd]);

// Inflow from abroad and total outflow sit between the two national rows, with
// their three values in whichever columns the sheet happens to use. They are taken
// in column order and must satisfy R + inflow = outflow in every period.
const numbersOf = x => Object.keys(x.c).filter(k => k !== 'A' && typeof x.c[k] === 'number')
  .sort((a, b) => a.length - b.length || a.localeCompare(b)).map(k => x.c[k]);
const between = rows.slice(iNat + 1, iHyd);
const inRow = between.find(x => /Zufluss aus dem Ausland/.test(x.c.A ?? ''));
const outRow = between.find(x => /Gesamtabfluss/.test(x.c.A ?? ''));
if (!inRow || !outRow) throw new Error('budget: inflow or total outflow row not found');
const inflow = numbersOf(inRow), outflow = numbersOf(outRow);
if (inflow.length !== 3 || outflow.length !== 3) throw new Error('budget: inflow/outflow rows do not have three periods');
PERIODS.forEach((p, i) => {
  national[p].inflow = Math.round(inflow[i]);
  national[p].outflow = Math.round(outflow[i]);
  const gap = national[p].R + national[p].inflow - national[p].outflow;
  if (Math.abs(gap) > 2) throw new Error(`budget: ${p} runoff + inflow ≠ total outflow (${gap} mm)`);
});
for (const p of PERIODS) {
  const t = national[p];
  t.km3 = { P: km3(t.P), R: km3(t.R), E: km3(t.E), dS: km3(t.dS), inflow: km3(t.inflow), outflow: km3(t.outflow) };
}

// The large catchments are in mm over their own area, which the table does not
// state, so they are never converted to volumes here.
const basins = rows.slice(0, iNat)
  .filter(x => typeof x.c.A === 'string' && /-/.test(x.c.A) && typeof x.c.B === 'number')
  .map(x => ({ name: label(x.c.A), ...balance(x) }));
if (basins.length < 10) throw new Error(`budget: only ${basins.length} catchment rows found`);

// ---- stocks: not in the table. Each with holder, document and pinpoint.
const res = JSON.parse(await fs.readFile(new URL('../site/data/reservoirs.json', import.meta.url), 'utf8'));
const STOCKS = [
  {
    key: 'groundwater', km3: 150, approx: true, cls: 'estimate', date: '2021',
    usable: 18, usableNote: 'km³ per year sustainably usable',
    holder: 'NCCS, BAFU, MeteoSwiss', doc: 'Hydro-CH2018 brochure “Schweizer Gewässer im Klimawandel”, 2021', pin: 'p. 7',
    url: 'https://www.bafu.admin.ch/dam/de/sd-web/IX5Cqzys7Y9C/de_NCCS_Broschuere_Hydro-CH2018%20(3).pdf',
    note: 'An estimate going back to Sinreich et al. (2012). Zappa et al. (2017, p. 208) describe the 18 km³ as the usable part of the store each year; the brochure as a sustainably usable volume per year. Not a measured stock.',
  },
  {
    key: 'lakes', km3: 130, approx: true, cls: 'estimate', date: '2021',
    usable: 2, usableNote: 'km³ per year sustainably usable',
    holder: 'NCCS, BAFU, MeteoSwiss', doc: 'Hydro-CH2018 brochure', pin: 'p. 7',
    url: 'https://www.bafu.admin.ch/dam/de/sd-web/IX5Cqzys7Y9C/de_NCCS_Broschuere_Hydro-CH2018%20(3).pdf',
    note: 'Counts the whole volume of the border lakes, including the parts in France, Germany, Austria and Italy. BAFU’s own total of about 325 km³ for all stores counts only the Swiss shares. The two are not reconciled in the sources.',
  },
  {
    key: 'glaciers', km3: 45.1, approx: true, cls: 'model', date: '2025-09-30',
    lossLast: 1.4, lossLastPct: 3.0, lossYear: 2025, km3In2000: 74.9,
    holder: 'GLAMOS', doc: 'Swiss Glacier Bulletin 2025 (Annual Report 146), February 2026', pin: 'p. 10, Fig. 3.6',
    url: 'https://doi.glamos.ch/pubs/glbulletin/glbulletin_2025.pdf',
    note: 'Ice volume, not water equivalent. Mass balance measured on a set of glaciers and extrapolated over a 2021 ice-thickness inventory. The 2000 volume is from the 2024 bulletin, Fig. 3.6.',
  },
  {
    key: 'soil', km3: 9, approx: false, upTo: true, cls: 'estimate', date: '2014',
    holder: 'BAFU', doc: 'Zappa et al., “Wasserhaushalt der Schweiz 2.0”, Wasser Energie Luft 109(3), 2017', pin: 'p. 208',
    url: 'https://www.bafu.admin.ch/dam/de/sd-web/r5wsqRim2y1u/WHH_CH_WEL_2017_3_Methode.pdf',
    note: 'An upper bound for water held in the soil, after Jörg-Hess et al. (2014). The amount actually present varies through the year.',
  },
  {
    key: 'reservoirs', km3: Math.round(res.totals.volumeMioM3 / 100) / 10, approx: false, cls: 'register',
    date: res.built, usable: 3.5, usableNote: 'km³ usable (Hydro-CH2018 brochure, p. 6)',
    fill: { d: res.fill.latest.d, pct: res.fill.latest.pct, gwh: res.fill.latest.gwh, max: res.fill.latest.max, rank: res.fill.latest.rank },
    holder: 'BFE', doc: 'Register of dams under federal supervision; weekly filling level of the storage lakes', pin: 'reservoirs.json on this site',
    url: 'https://www.uvek-gis.admin.ch/BFE/ogd/17/ogd17_fuellungsgrad_speicherseen.csv',
    note: 'The volume is the sum of full-supply volumes of the 225 federally supervised dams, including weirs and flood-retention structures. The weekly filling level is reported in GWh of stored energy, not in cubic metres, so it is shown as a share and never converted to a volume.',
  },
];

// ---- use: what is taken out. Drinking water is a federal table; the rest is old.
// BFS T 02.03.01.01 "Trinkwasser", an SVGW extrapolation from reporting utilities.
// Spring + ground + lake water must add to the total, or the layout changed.
const BFS = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/36409183/master';
const bz = unzip(Buffer.from(await (await get(BFS)).arrayBuffer()));
const bss = [...bz['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => ent([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
const brows = [];
for (const r of bz['xl/worksheets/sheet1.xml'].toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const c = {};
  for (const m of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[3] ?? '');
    if (v) c[m[1]] = /t="s"/.test(m[2]) ? bss[+v[1]] : +v[1];
  }
  brows.push(c);
}
if (!/Quell/.test(brows.map(c => c.B).join(' ')) || !/Grund/.test(brows.map(c => c.C).join(' ')))
  throw new Error('budget: BFS drinking-water columns are not spring | ground | lake | total');
const drinking = brows.filter(c => Number.isInteger(c.A) && c.A >= 2000 && [c.B, c.C, c.D, c.E, c.F].every(Number.isFinite))
  .map(c => {
    if (Math.abs(c.B + c.C + c.D - c.E) > 2) throw new Error(`budget: BFS ${c.A} sources do not add to the total`);
    return { y: c.A, spring: +c.B.toFixed(1), ground: +c.C.toFixed(1), lake: +c.D.toFixed(1), total: +c.E.toFixed(1), lpd: +c.F.toFixed(1) };
  });
if (!drinking.length) throw new Error('budget: no drinking-water rows');
const bnote = brows.map(c => c.A).filter(a => typeof a === 'string');
const USE = {
  drinking: {
    rows: drinking, holder: 'BFS, from SVGW', url: BFS, table: 'T 02.03.01.01',
    basis: bnote.find(a => /Jahr \d{4}: Hochrechnung/.test(a)) ?? null,
    changed: (/Letzte Änderung:\s*(\d\d)\.(\d\d)\.(\d{4})/.exec(bnote.join(' ')) ?? []).slice(1).reverse().join('-') || null,
  },
  // BAFU, "Wassernutzung", page of 25 September 2025. These are the only national
  // figures for the other sectors, and most describe 2006. They are shown with
  // their year and never added to the drinking-water total.
  other: [
    { key: 'industry', mioM3: 1120, year: 2006, note: 'Self-supply of industry, trade and services; about two thirds for cooling and air conditioning.' },
    { key: 'nuclear', mioM3: 1600, year: null, note: 'River water passed through the cooling of nuclear power plants, per year; the page gives no year. Mostly returned, warmer.' },
    { key: 'agriculture', mioM3: 410, year: 2006, note: 'Agricultural demand; about one third for irrigation. Abstracted volumes are measured in only a few cantons.' },
    { key: 'snow', mioM3: 15, year: 2006, note: 'Water used to make snow on ski runs.' },
  ],
  otherSource: { holder: 'BAFU', page: 'Wassernutzung', date: '2025-09-25', url: 'https://www.bafu.admin.ch/de/wassernutzung' },
};

// ---- keep every year ever read: BAFU overwrites its file, this file does not
let years = {};
try {
  const old = JSON.parse(await fs.readFile(OUT, 'utf8'));
  if (old.meta?.schema === SCHEMA) years = old.years ?? {};
} catch { /* first build */ }
years[year] = { ...national[String(year)], sourceSha256: sha256, sourceStamp: stamp };

const out = {
  meta: {
    schema: SCHEMA, built: new Date().toISOString().slice(0, 10),
    source: { title: title.trim(), stamp, url: tableUrl, page: PAGE, sha256, holder: 'BAFU, Abteilung Hydrologie', contact: 'hydrologie@bafu.admin.ch' },
    method: { doc: 'Zappa et al., “Wasserhaushalt der Schweiz 2.0”, Wasser Energie Luft 109(3), 2017, pp. 203–211', url: 'https://www.bafu.admin.ch/dam/de/sd-web/r5wsqRim2y1u/WHH_CH_WEL_2017_3_Methode.pdf' },
    areaKm2: AREA_KM2, hydrologicalAreaKm2: 53566,
  },
  year, periods: PERIODS, national, hydrological, basins, years, stocks: STOCKS, use: USE,
};
await fs.writeFile(OUT, JSON.stringify(out));

const t = national[String(year)], n = national['1991-2020'];
console.log(`water budget ${year} (BAFU table, ${stamp || 'undated'}; sha256 ${sha256.slice(0, 12)})`);
console.log(`  P ${t.P} mm (${t.km3.P} km³), ${Math.round(100 * t.P / n.P)} % of 1991–2020`);
console.log(`  R ${t.R}  E ${t.E}  dS ${t.dS}  inflow ${t.inflow}  outflow ${t.outflow} mm`);
console.log(`  ${basins.length} catchments, ${Object.keys(years).length} year(s) kept`);
console.log(`  drinking water ${drinking.at(-1).y}: ${drinking.at(-1).total} million m³`);
