// Build cantons.json: who has actually delivered the drinking-water protection
// zones, and when.
//
// The zones are cantonal. There is no federal layer. What exists is geodienste.ch,
// a joint service of the cantons and swisstopo which aggregates each canton's own
// delivery of the minimal geodata model "Planerischer Gewaesserschutz" (MGDM ID
// 130.1, 131.1, 132.1) into one national WMS. That is the layer this map draws.
//
// A national service assembled from twenty-six deliveries has a currency problem
// that no single Datenstand can express: the picture is as old as its oldest
// contributor, and the picture does not say who that is. So the delivery date of
// every canton is read here from the service's own metadata and carried onto the
// page, and the map states the oldest rather than the newest.
//
// Source  https://geodienste.ch/info/services.json — the service register itself.
// Terms   per canton. All twenty-six are currently marked "Frei erhaeltlich".
import fs from 'node:fs/promises';

const TOPIC = 'planerischer_gewaesserschutz';
const OUT = new URL('../site/data/cantons.json', import.meta.url);

const all = await fetch(`https://geodienste.ch/info/services.json?topic=${TOPIC}`)
  .then(r => r.json());
const list = Array.isArray(all) ? all : all.services;
const rows = list.filter(s => s.base_topic === TOPIC);
if (!rows.length) throw new Error('geodienste.ch returned no rows for ' + TOPIC);

// FL is Liechtenstein. It is in the register because it shares the service, it is
// not a canton, and it delivers nothing here. It is reported separately rather
// than counted into a coverage figure it would make wrong either way.
const cantons = rows
  .filter(r => r.canton !== 'FL')
  .map(r => ({
    ct: r.canton,
    wms: r.publication_wms ?? null,
    full: r.cantonal_coverage === true,
    updated: r.updated_at ? r.updated_at.slice(0, 10) : null,
    cycle: r.data_update_cycle ?? null,
  }))
  .sort((a, b) => (a.updated ?? '') < (b.updated ?? '') ? -1 : 1);

const free = cantons.filter(c => c.wms === 'Frei erhältlich');
const covered = cantons.filter(c => c.full);
const dated = cantons.filter(c => c.updated);
const out = {
  built: new Date().toISOString().slice(0, 10),
  topic: TOPIC,
  version: rows[0].version ?? null,
  service: 'https://geodienste.ch/db/planerischer_gewaesserschutz_v1_2_0/deu',
  cantons,
  free: free.length,
  covered: covered.length,
  total: cantons.length,
  oldest: dated.length ? dated[0].updated : null,
  oldestCt: dated.length ? dated[0].ct : null,
  newest: dated.length ? dated[dated.length - 1].updated : null,
  fl: (rows.find(r => r.canton === 'FL')?.publication_wms) ?? null,
};
await fs.writeFile(OUT, JSON.stringify(out, null, 1));
console.log(`${out.total} cantons, ${out.free} freely available over WMS, ${out.covered} with full cantonal coverage`);
console.log(`oldest delivery ${out.oldestCt} ${out.oldest}, newest ${out.newest}`);
console.log(`the five oldest: ${dated.slice(0, 5).map(c => `${c.ct} ${c.updated}`).join(', ')}`);
