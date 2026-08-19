// Build vintage.json: how old every number on this map is.
//
// This exists because a federal geoportal serves a layer with no date on its face.
// map.geo.admin.ch will draw you the abstraction register and the treatment-plant
// register side by side in the same crisp style, and one of them describes 2004
// and the other a survey of 2011. Nothing in the picture says so. For a map that
// is meant to be usable as evidence, that is the defect that matters most: not a
// wrong number, but a number whose age is invisible.
//
// So the age is fetched, not remembered. Every federal layer publishes a
// "Datenstand" in its legend endpoint. This script reads it at build time and
// writes it into the site, and the page prints it next to the layer. If BAFU
// refreshes the residual-flow inventory tomorrow, the next build says so without
// anyone editing a string. If a layer goes stale for another five years, the page
// says that too, and says it in the open.
//
// The rule the page follows: a source is described by its own data state, never by
// the date the site was built. Those two are different facts and conflating them
// is how a 2004 register comes to look like today's.
import fs from 'node:fs/promises';

const LEGEND = l => `https://api3.geo.admin.ch/rest/services/all/MapServer/${l}/legend?lang=de`;

// Pull "Datenstand dd.mm.yyyy" out of the legend HTML. Returns ISO, or null if the
// legend stops carrying one — in which case the page says "not stated by the
// source", which is the truth, rather than falling back to a date we made up.
async function datenstand(layer) {
  try {
    const r = await fetch(LEGEND(layer));
    if (!r.ok) return null;
    const txt = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const m = /Datenstand\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(txt);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  } catch { return null; }
}

// cls — what kind of claim the source can support, which is the distinction the
// whole site turns on:
//   measured  an instrument read a quantity at a place and a time
//   survey    somebody went and looked, once, and wrote it down
//   register  an administrative list of things that exist, with no quantity
//   modelled  computed from other numbers by a stated method
//   context   geometry that carries no reading at all
const SOURCES = [
  {
    key: 'gauges', layer: null,
    name: 'Discharge, water level and temperature at the federal gauges',
    holder: 'BAFU', cls: 'measured', cadence: 'every 10 minutes', live: true,
    url: 'https://lindas.admin.ch/query',
    licence: 'Open government data, no key',
    fixed: null,   // its data state is the timestamp of the reading, printed live
    note: 'The only live source on the page. Its age is the age of the last reading, shown in the title bar.',
  },
  {
    key: 'reservoirFill', layer: null,
    name: 'Filling level of the storage reservoirs, weekly, in GWh',
    holder: 'BFE', cls: 'measured', cadence: 'weekly', live: false,
    url: 'https://www.uvek-gis.admin.ch/BFE/ogd/17/ogd17_fuellungsgrad_speicherseen.csv',
    licence: 'opendata.swiss, attribution',
    fixed: null,   // filled from reservoirs.json below: the last row of the file
    note: 'The file allows only map.geo.admin.ch to read it from a browser, so it is baked in at build time. The Pages workflow rebuilds weekly to keep the baked copy fresh.',
  },
  {
    key: 'dams', layer: 'ch.bfe.stauanlagen-bundesaufsicht',
    name: 'Dams under federal supervision',
    holder: 'BFE', cls: 'register', cadence: 'irregular', live: false,
    url: 'https://map.geo.admin.ch/?layers=ch.bfe.stauanlagen-bundesaufsicht',
    licence: 'opendata.swiss, attribution',
    note: 'Structures, with the volume each reservoir holds when full. It carries no fill state, and never has.',
  },
  {
    key: 'hydro', layer: 'ch.bfe.statistik-wasserkraftanlagen',
    name: 'Statistics of hydropower plants from 300 kW up (WASTA)',
    holder: 'BFE', cls: 'register', cadence: 'annual', live: false,
    url: 'https://www.bfe.admin.ch/bfe/de/home/versorgung/statistik-und-geodaten/geoinformation/geodaten/wasser/statistik-wasserkraftanlagen-schweiz.html',
    licence: 'opendata.swiss, attribution',
    note: 'The freshest of the registers. It carries capacity and head but no water quantity, so the discharge on the map is derived by arithmetic.',
  },
  {
    key: 'abstraction', layer: 'ch.bafu.wasser-entnahme',
    name: 'Residual-flow map: the cantonal inventory of existing abstractions',
    holder: 'BAFU and the cantons', cls: 'register', cadence: 'none since the inventory', live: false,
    url: 'https://map.geo.admin.ch/?layers=ch.bafu.wasser-entnahme',
    licence: 'opendata.swiss, attribution',
    note: 'The inventory the cantons filed under GSchG Art. 80 ff. A licence granted, changed or restored since the data state is not in it. It carries no volume.',
  },
  {
    key: 'q347', layer: 'ch.bafu.hydrologie-q347',
    name: 'Basis for determining Q347',
    holder: 'BAFU', cls: 'measured and modelled', cadence: 'none since', live: false,
    url: 'https://map.geo.admin.ch/?layers=ch.bafu.hydrologie-q347',
    licence: 'opendata.swiss, attribution',
    note: 'The low-flow reference the Water Protection Act runs on. Its age is not simply a defect: Art. 4(h) defines Q347 as a ten-year average, and the decade the cantons worked from is the one in this file. It is the legally operative figure and an obsolete description of the river at the same time.',
  },
  {
    key: 'ara', layer: 'ch.bafu.gewaesserschutz-klaeranlagen_anteilq347',
    name: 'Treatment plants and their share of the receiving water at Q347',
    holder: 'BAFU and the cantons', cls: 'survey', cadence: 'none since', live: false,
    url: 'https://map.geo.admin.ch/?layers=ch.bafu.gewaesserschutz-klaeranlagen_anteilq347',
    licence: 'opendata.swiss, attribution',
    note: 'From a survey of 2011, taken before the fourth treatment stage was built out. Every plant upgraded since is described here as it was before the upgrade.',
  },
  {
    key: 'npp', layer: 'ch.bfe.kernkraftwerke',
    name: 'Nuclear power stations',
    holder: 'BFE', cls: 'register', cadence: 'none since', live: false,
    url: 'https://map.geo.admin.ch/?layers=ch.bfe.kernkraftwerke',
    licence: 'opendata.swiss, attribution',
    note: 'The clearest case of a register outliving its subject: it still carries Mühleberg as a power station, and its data state is the day Mühleberg was shut down. The page corrects it and shows the correction, rather than quietly dropping the site.',
  },
  {
    key: 'ice', layer: null,
    name: 'Swiss Glacier Inventory 1850 and 2023, and glacier length change',
    holder: 'GLAMOS', cls: 'survey', cadence: 'the inventories are episodic; lengths annual', live: false,
    url: 'https://doi.glamos.ch/',
    licence: 'CC BY 4.0 per the DOI index; the length-change file header adds "scientific and non-commercial use". Both statements stand.',
    fixed: '2023-09-01',   // the state of the ice, not the date of the release
    note: 'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. The 2023 inventory was released in 2026 but describes the ice as it stood at the end of the 2023 melt season, and that is the date given here: what a source describes, not when it was published.',
  },
  {
    key: 'rivers', layer: null,
    name: 'River network, catchment area and long-term mean discharge',
    holder: 'HydroSHEDS / WWF, HydroRIVERS v1.0', cls: 'modelled', cadence: 'static', live: false,
    url: 'https://www.hydrosheds.org/products/hydrorivers',
    licence: 'Free for non-commercial and commercial use with attribution',
    fixed: '2019-01-01',
    note: 'Traced from a 15 arc-second grid, so its lines carry the staircase of the raster. The long-term mean it carries is a model output, not a gauge reading.',
  },
  {
    key: 'context', layer: null,
    name: 'Lakes and the national border',
    holder: 'Natural Earth 10m', cls: 'context', cadence: 'static', live: false,
    url: 'https://www.naturalearthdata.com/',
    licence: 'Public domain',
    fixed: '2022-05-01',
    note: 'Carries no reading. It is there so the water has a country to sit in.',
  },
];

const today = new Date().toISOString().slice(0, 10);
const days = iso => Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);

// the reservoir series dates itself: its data state is the last row of the file
let fillLatest = null;
try {
  const r = JSON.parse(await fs.readFile(new URL('../site/data/reservoirs.json', import.meta.url), 'utf8'));
  fillLatest = r.fill?.latest?.d ?? null;
} catch { /* reservoirs not built yet; the field stays null and the page says so */ }

const sources = [];
for (const s of SOURCES) {
  let ds = s.fixed ?? null;
  if (s.layer) ds = await datenstand(s.layer);
  if (s.key === 'reservoirFill') ds = fillLatest;
  sources.push({
    key: s.key, name: s.name, holder: s.holder, cls: s.cls, cadence: s.cadence,
    live: !!s.live, url: s.url, licence: s.licence, note: s.note,
    layer: s.layer, datenstand: ds,
    ageDays: ds ? days(ds) : null,
  });
}

// Sorted oldest first, because the oldest is the one that decides what the map can
// be used for.
sources.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));

const stale = sources.filter(s => s.ageDays !== null && s.ageDays > 365 * 5);
const out = { built: today, sources, staleKeys: stale.map(s => s.key) };
await fs.writeFile(new URL('../site/data/vintage.json', import.meta.url), JSON.stringify(out));

console.log(`vintage audit, ${today}\n`);
for (const s of sources) {
  const age = s.ageDays === null ? (s.live ? 'live' : 'not stated')
    : s.ageDays < 14 ? `${s.ageDays} d`
    : `${(s.ageDays / 365.25).toFixed(1)} yr`;
  const mark = s.live ? ' live ' : s.ageDays > 365 * 5 ? ' STALE' : '      ';
  console.log(`${mark} ${String(s.datenstand ?? '—').padEnd(11)} ${age.padStart(8)}  ${s.key.padEnd(14)} ${s.name.slice(0, 58)}`);
}
console.log(`\n${stale.length} sources older than five years: ${stale.map(s => s.key).join(', ')}`);
console.log('The page prints every one of these dates next to the layer it belongs to.');
