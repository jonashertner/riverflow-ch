// Build icehistory.json: six dated states of Swiss ice, so the retreat can be
// played instead of cross-faded.
//
//   1850  doi:10.18750/inventory.sgi1850.r1992   Maisch and others
//   1931  doi:10.18750/inventory.sgi1931.r2022   from the 1931 aerial survey
//   1973  doi:10.18750/inventory.sgi1973.r1976
//   2010  doi:10.18750/inventory.sgi2010.r2010
//   2016  doi:10.18750/inventory.sgi2016.r2020
//   2023  doi:10.18750/inventory.sgi2023.r2026
//
// The intervals are 81, 42, 37, 6 and 7 years. Holding each frame in proportion to
// its own interval is the whole point: an animation that gives every frame the
// same time makes 1850-1931 look as fast as 2010-2023, which is the opposite of
// what the numbers say.
//
// WHAT THIS SHOWS AND WHAT IT DOES NOT. It shows area. Area is what an inventory
// measures and it is the honest quantity to animate from these files. Area is not
// the same as volume and the two have not moved together: through the recent
// decades Swiss glaciers thinned faster than they shrank in plan, because a
// glacier loses thickness over its whole surface before it loses its outline. So
// the per-year area figures printed below are real and they must not be passed off
// as the rate of ice loss. Where the page wants to say how fast the ice is going,
// it says so in volume and cites the volume sources, which are separate work by
// separate methods.
//
// Areas come from each inventory's own attribute where it has one. SGI1931 has
// none, so its area is computed from the geometry in the source projection, in
// square metres, before reprojection. That method is checked against SGI1850,
// which carries both: computed 1788.3 km2 against a stated 1788.3 km2.
import fs from 'node:fs/promises';

const P = 1e5;                            // 1e-5 deg, about 1 m
const G = process.argv[2] ?? '/tmp/gl';

// Bodies below this are smaller than a pixel at the country view, where this
// animation is watched. They are dropped from the GEOMETRY to keep the file
// loadable on a phone, and kept in the AREA TOTAL, which is computed over every
// body in the inventory. The two numbers printed below say how much that costs.
const MIN_KM2 = 0.05;

const FRAMES = [
  { y: 1850, f: 'g1850.json', area: p => (p.Shape_Area ?? p.AREA_M2) * 1e-6, doi: '10.18750/inventory.sgi1850.r1992' },
  { y: 1931, f: 'g1931.json', area: p => p.AREA_M2 * 1e-6, doi: '10.18750/inventory.sgi1931.r2022' },
  { y: 1973, f: 'g1973.json', area: p => p.AREA_M2 * 1e-6, doi: '10.18750/inventory.sgi1973.r1976' },
  { y: 2010, f: 'g2010.json', area: p => p.AREA_M2 * 1e-6, doi: '10.18750/inventory.sgi2010.r2010' },
  { y: 2016, f: 'g2016.json', area: p => p.area_km2, doi: '10.18750/inventory.sgi2016.r2020' },
  { y: 2023, f: 'g2023.json', area: p => p.area_km2, doi: '10.18750/inventory.sgi2023.r2026' },
];

// Same encoding as the river network and the glacier bodies: quantise to 1e-5 deg
// and delta-encode, which is what makes five national silhouettes fit in a file a
// phone will load.
function encode(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 4) continue;
      const xs = [], ys = [];
      let px = 0, py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * P), y = Math.round(lat * P);
        if (xs.length && x === px && y === py) continue;
        xs.push(x - px); ys.push(y - py);
        px = x; py = y;
      }
      if (xs.length >= 4) rings.push([xs, ys]);
    }
  }
  return rings;
}

// 1850 and 2023 already ship in glaciers.json, as the silhouette under the ice
// layer and as the clickable bodies over it. Carrying them again here would put
// 1.1 MB of the same coordinates on the wire twice, so this file holds only the
// four frames that are new, and the page composes the sequence from both: 1850
// from glaciers.pastRings, 1931-1973-2010-2016 from here, 2023 from the bodies
// themselves. Every frame still carries its area, because the counter and the
// chart need all six and the numbers cost nothing.
const GEOM_FOR = new Set([1931, 1973, 2010, 2016]);

const frames = [];
for (const fr of FRAMES) {
  const j = JSON.parse(await fs.readFile(`${G}/${fr.f}`, 'utf8'));
  const wantGeom = GEOM_FOR.has(fr.y);
  let total = 0, counted = 0, drawn = 0, drawnArea = 0;
  const rings = [];
  for (const ft of j.features) {
    const a = fr.area(ft.properties);
    if (typeof a === 'number' && isFinite(a) && a > 0) { total += a; counted++; }
    if (!wantGeom || !ft.geometry) continue;
    if (!(a >= MIN_KM2)) continue;
    rings.push(...encode(ft.geometry));
    drawn++; drawnArea += a;
  }
  frames.push({
    y: fr.y, doi: fr.doi,
    km2: +total.toFixed(1),
    bodies: counted,
    // where the geometry lives, so the page never has to guess
    from: wantGeom ? 'icehistory' : (fr.y === 1850 ? 'glaciers.pastRings' : 'glaciers.bodies'),
    ...(wantGeom ? { drawn, drawnKm2: +drawnArea.toFixed(1), rings } : {}),
  });
  console.log(`${fr.y}  ${counted} bodies, ${total.toFixed(1)} km2 total; ` +
              (wantGeom
                ? `${drawn} drawn (${(100 * drawnArea / total).toFixed(1)} % of the area), ${rings.length} rings`
                : `geometry already in glaciers.json`));
}

// ---- what the sequence says -------------------------------------------------
console.log('\ninterval, area lost, and the rate per year:');
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i];
  const yrs = b.y - a.y, lost = a.km2 - b.km2;
  console.log(`  ${a.y}-${b.y}  ${String(yrs).padStart(3)} yr  ${lost.toFixed(1).padStart(7)} km2  ` +
              `${(lost / yrs).toFixed(2).padStart(6)} km2/yr  ${(100 * lost / a.km2).toFixed(1)} % of the ice at the start`);
}
const first = frames[0], last = frames.at(-1);
console.log(`\n${first.y} to ${last.y}: ${first.km2} km2 -> ${last.km2} km2, ` +
            `${(100 * (1 - last.km2 / first.km2)).toFixed(1)} % of the area gone.`);
console.log('Area, not volume. The two did not move together and the page says so.');

const out = {
  built: new Date().toISOString().slice(0, 10),
  p: P,
  minKm2: MIN_KM2,
  source: 'GLAMOS, Swiss Glacier Inventories. Licence: CC BY 4.0 per the DOI index; '
        + 'some GLAMOS file headers add "scientific and non-commercial use". Both statements stand.',
  frames,
};
await fs.writeFile(new URL('../site/data/icehistory.json', import.meta.url), JSON.stringify(out));
const size = (await fs.stat(new URL('../site/data/icehistory.json', import.meta.url))).size;
console.log(`\nwrote icehistory.json ${(size / 1e6).toFixed(2)} MB`);
