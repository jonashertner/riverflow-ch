// Build users.json: who takes water out of these rivers, and who puts it back.
//
// Four federal registers, four different classes of evidence. None of them holds
// a measured abstraction volume, so the map must not pretend one exists.
//
//   1. BAFU Restwasserkarte, ch.bafu.wasser-entnahme. The cantonal inventory of
//      abstractions under GSchG Art. 80 ff. It gives a point, the watercourse and
//      a link to the cantonal report. It gives NO quantity. Datenstand 1.1.2004.
//   2. BFE WASTA, ch.bfe.statistik-wasserkraftanlagen. Every hydropower plant from
//      300 kW up: capacity, head, expected production, type. No water quantity
//      either, so the design discharge here is DERIVED from capacity and head.
//   3. BFE ch.bfe.kernkraftwerke. Four sites. No cooling volume in the dataset.
//   4. BAFU ARA database, ch.bafu.gewaesserschutz-klaeranlagen_anteilq347. The
//      other direction: treated wastewater going back in, and its share of the
//      receiving water at low flow. Survey of 2011, Datenstand 1.1.2014.
//
// Points come off the federal identify API in LV95 and are converted here with the
// swisstopo approximation, which is good to about a metre. That is far finer than
// a 15 arc-second river network, so the error that matters is in the geometry the
// point is read against, not in the point.
import fs from 'node:fs/promises';

const API = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';
const BBOX = '2480000,1070000,2840000,1300000';   // Switzerland, LV95, with margin

async function identify(layer) {
  const out = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({
      geometry: BBOX, geometryType: 'esriGeometryEnvelope', layers: 'all:' + layer,
      mapExtent: BBOX, imageDisplay: '1000,600,96', tolerance: '0', sr: '2056',
      returnGeometry: 'true', limit: '50', offset: String(offset),
    });
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) throw new Error(`${layer} ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const res = j.results ?? [];
    out.push(...res);
    offset += res.length;
    if (res.length < 50) break;
    if (offset > 20000) throw new Error(`${layer}: paging did not terminate`);
  }
  return out;
}

// swisstopo approximate formulas, LV95 to WGS84. Metre accuracy over Switzerland.
function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [+(lon * 100 / 36).toFixed(5), +(lat * 100 / 36).toFixed(5)];
}
const pt = f => lv95(f.geometry.x, f.geometry.y);

// ---- 1. abstractions --------------------------------------------------------
const rawEnt = await identify('ch.bafu.wasser-entnahme');
// The report link is the number without its hyphen. Checked here rather than
// assumed, because a broken link to a cantonal report is worse than no link.
// 206 of the 1,488 entries carry "-" instead of a number. They are real
// abstractions with a real point and a named watercourse, and four of them sit on
// the Rhine at Basel; what they lack is a cantonal report in the federal set. They
// are kept and marked, not dropped, because an abstraction without a report is the
// more interesting one.
let linkOk = 0, linkOdd = [], noReport = 0;
const abstraction = rawEnt.map(f => {
  const a = f.attributes;
  const num = String(a.rwknr ?? '').trim();
  const has = /^[A-Z]{2}-\d+$/.test(num);
  if (!has) noReport++;
  else {
    const expect = `https://www.bafu-daten.ch/wasser/restwasser/data/data/er/de/${num.replace(/-/g, '')}.pdf`;
    if (a.link_de === expect) linkOk++; else linkOdd.push([num, a.link_de]);
  }
  const [lon, lat] = pt(f);
  return { r: has ? num : null, c: a.kanton, w: a.ent_gew ?? '', x: lon, y: lat };
});

// ---- 2. hydropower ----------------------------------------------------------
// A quote-aware split, because WASTA writes places as "Fribourg, Oelberg". Splitting
// on every comma shifts the row and puts a Fribourg plant in the North Sea.
const splitCsv = line => {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};
const csv = async p => {
  const t = await fs.readFile(p, 'utf8');
  const [head, ...rows] = t.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  const cols = splitCsv(head);
  return rows.map(r => Object.fromEntries(splitCsv(r).map((v, i) => [cols[i], v])));
};
const W = '/tmp/riv/wasta';
const plants = await csv(`${W}/HydropowerPlant.csv`);
const specs = new Map((await csv(`${W}/TechnicalSpecification.csv`)).map(s => [s.hydropowerPlantR, s]));
const types = new Map((await csv(`${W}/HydropowerPlantTypeCatalogue.csv`)).map(t => [t.ID, t.DE]));
const status = new Map((await csv(`${W}/HydropowerPlantOperationalStatusCatalogue.csv`)).map(t => [t.ID, t.DE]));

// Design discharge from capacity and head. P = rho g Q H eta, so Q = P / (rho g H eta).
// eta is the whole chain, turbine and generator together. 0.85 is the conventional
// figure for a modern plant; an old low-head machine is worse and a large Francis
// set is better. The number is therefore an order of magnitude with a plausible
// first digit, not a design figure, and the page says so wherever it appears.
const ETA = 0.85, RHO = 1000, G = 9.81;
let noHead = 0, noPower = 0;
const hydro = plants.map(p => {
  const s = specs.get(p.WASTANumber) ?? {};
  const H = parseFloat(p.FallHeight || s.FallHeight);
  const P = parseFloat(s.PerformanceTurbineMaximum);
  const E = parseFloat(s.ProductionExpected);
  let q = null;
  if (!(H > 0)) noHead++;
  else if (!(P > 0)) noPower++;
  else {
    const v = P * 1e6 / (RHO * G * H * ETA);
    q = +v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 3);
  }
  const [lon, lat] = lv95(+p._x, +p._y);
  return {
    n: p.Name, l: p.Location, c: p.Canton,
    t: types.get(p.TypeCode) ?? p.TypeCode,
    s: status.get(s.OperationalStatusCode) ?? '',
    b: p.BeginningOfOperation ? +p.BeginningOfOperation : null,   // not y: y is the latitude
    h: H > 0 ? +H : null,
    p: P > 0 ? P : null,
    e: E > 0 ? E : null,
    q, x: lon, y: lat,
  };
});

// ---- 3. nuclear -------------------------------------------------------------
// The operator and owner fields are DE##FR##IT##EN##url, so the German name is
// the first field and the URL the last.
const first = v => String(v ?? '').split('##')[0];

// This register's data state is 20 December 2019, and that date is not a
// coincidence: it is the day Mühleberg was shut down. The register was written
// once, on that day, and has not moved since. So it still lists Mühleberg as a
// power station, and it still names its operator "BKW FMB Energie AG", a company
// that renamed itself BKW Energie AG in 2013.
//
// A site in dismantling is not a cooling-water abstraction, so leaving the entry
// as it stands would put a water user on the Aare that stopped being one seven
// years ago. Dropping it silently would be worse: the reactor is still there, the
// site is still licensed, and its history is exactly what a water case would ask
// about. So the entry is kept and corrected, and the correction is carried in the
// data with its source, so the page can show both what the register says and what
// is the case.
const CORRECTIONS = {
  'Kernkraftwerk Mühleberg': {
    status: 'shut down',
    since: '2019-12-20',
    detail: 'Shut down on 20 December 2019. Free of nuclear fuel since September 2023, after 418 fuel '
          + 'elements were moved to the interim store at Würenlingen in 66 transports, which removed over '
          + '99 % of the radioactivity on site. Nuclear dismantling is planned to be complete at the end of '
          + '2031 and the site released for other use from 2034. It no longer abstracts cooling water at '
          + 'operating volumes.',
    src: 'https://www.bkw.ch/de/energie/energieproduktion/stilllegung-kernkraftwerk-muehleberg',
  },
};

const npp = (await identify('ch.bfe.kernkraftwerke')).map(f => {
  const a = f.attributes;
  const [lon, lat] = pt(f);
  const fix = CORRECTIONS[a.name];
  return {
    n: a.name, o: first(a.operator), x: lon, y: lat,
    // st: 'operating' unless the register is known to be out of date for this site
    st: fix ? fix.status : 'operating',
    ...(fix ? { since: fix.since, fix: fix.detail, fixSrc: fix.src } : {}),
  };
});

// ---- 4. wastewater ----------------------------------------------------------
// Two fields only, both unambiguous: the size in population equivalents and the
// share of the receiving water that is treated wastewater at Q347. The daily
// volumes in the same table mix units between fields and are left out.
const ara = (await identify('ch.bafu.gewaesserschutz-klaeranlagen_anteilq347')).map(f => {
  const a = f.attributes;
  const share = a.abwasseranteil_q347;
  const [lon, lat] = pt(f);
  return {
    n: a.name, o: a.ort ?? '', c: a.kanton ?? '',
    v: a.name_vorfluter ?? '', k: a.vorfluterbez ?? '',
    e: a.ausbaugroesse_egw > 0 ? a.ausbaugroesse_egw : null,
    q: (share !== null && share !== undefined && share > -900) ? +(+share).toFixed(1) : null,
    x: lon, y: lat,
  };
});

const out = {
  built: new Date().toISOString().slice(0, 10),
  vintage: {
    abstraction: '2004-01-01', hydro: specs.values().next().value?.DateOfStatistic ?? '',
    npp: '2019-12-20', ara: '2014-01-01 (survey 2011)',
  },
  abstraction, hydro, npp, ara,
};
await fs.writeFile(new URL('../site/data/users.json', import.meta.url), JSON.stringify(out));

const sum = (a, f) => a.reduce((s, x) => s + (f(x) ?? 0), 0);
console.log(`abstractions ${abstraction.length}, with a cantonal report ${linkOk}, without a number ${noReport}, link not in the expected form ${linkOdd.length}`);
if (linkOdd.length) console.log('  odd:', linkOdd.slice(0, 5));
console.log(`hydropower ${hydro.length}, derived discharge on ${hydro.filter(h => h.q !== null).length}` +
            `, no head ${noHead}, no turbine capacity ${noPower}`);
console.log(`  run-of-river ${hydro.filter(h => h.t === 'Laufkraftwerk').length}`);
// The derived figures are checked against the design discharges the Rhine plants
// publish for themselves. They are not summed: a cascade turbines the same water
// again at every step, so a total would count the Rhine six times over.
console.log('  largest derived, against the published design discharge:');
for (const h of hydro.filter(h => h.q).sort((a, b) => b.q - a.q).slice(0, 6))
  console.log(`    ${h.n.padEnd(22)} ${String(h.q).padStart(6)} m3/s  from ${h.p} MW at ${h.h} m`);
const far = hydro.filter(h => !(5.5 < h.x && h.x < 11.0 && 45.5 < h.y && h.y < 48.0));
console.log(`  outside a generous Swiss box ${far.length}: ` + far.map(h => `${h.n} (${h.c || 'no canton'})`).join(', '));
console.log(`nuclear ${npp.length}: ${npp.map(n => `${n.n} [${n.st}]`).join(', ')}`);
console.log(`wastewater ${ara.length}, with a share of Q347 ${ara.filter(a => a.q !== null).length}` +
            `, at or above 50 % ${ara.filter(a => a.q >= 50).length}`);
