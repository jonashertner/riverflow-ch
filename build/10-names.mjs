// Build names.json: what the waterways are called.
//
// HydroRIVERS carries no names. It carries HYRIV_ID, an upstream area and a mean
// discharge, and that is all: the network on this map has always been anonymous.
// The names come from a separate federal source and are joined here.
//
// Source  swissNAMES3D, swisstopo, release 2026 (published 09.03.2026), the
//         national gazetteer of the official geographical names, LV95.
//         https://data.geo.admin.ch/ch.swisstopo.swissnames3d/
//         Licence: open data, free use with source attribution (swisstopo).
//
// swissNAMES3D gives a name and ONE anchor point per placement, not a named
// geometry. The Rhine appears six times along its course, the Aare sixteen. That
// is a label file, not a river file, and it is used as one: each anchor is snapped
// to the nearest HydroRIVERS reach, which gives the anchor two things it lacks —
// the size of the water it names, so the map can decide at which zoom the name is
// worth its ink, and the local direction of the channel, so the name can be set
// along the water instead of across it.
//
// WHAT THIS DOES NOT DO. It does not rename the reaches. A reach that no anchor
// falls near stays anonymous, and a name drawn near a reach is not a claim that
// the whole reach carries that name: the Rhine label near Basel says the water
// there is the Rhine, not that HYRIV_ID 20425990 is "the Rhine" end to end. The
// snap is used for ranking and rotation only. Anchors that land more than SNAP_KM
// from any reach are kept with a default rank and no rotation, because a name
// swissNAMES3D places is a fact whether or not HydroRIVERS drew that brook.
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = process.argv[2] ?? '/tmp/riv/names';
const OUT = new URL('../site/data/names.json', import.meta.url);
const RELEASE = 'swissnames3d_2026';
const PUBLISHED = '2026-03-09';

// swisstopo approximate formulas, LV95 to WGS84. Metre accuracy over Switzerland.
function lv95(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x
            - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [lon * 100 / 36, lat * 100 / 36];
}

// The CSV is semicolon-separated, UTF-8 with a BOM, and quotes nothing that
// matters here: no field in the rows we keep contains a semicolon. Parsed by
// split rather than by a CSV library so the build keeps its zero dependencies.
async function rows(file) {
  const txt = await fs.readFile(path.join(SRC, file), 'utf8');
  const lines = txt.replace(/^﻿/, '').split(/\r?\n/);
  const head = lines[0].split(';');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(';');
    if (c.length < head.length) continue;
    const o = {};
    for (let k = 0; k < head.length; k++) o[head[k]] = c[k];
    out.push(o);
  }
  return out;
}

const lin = await rows('swissNAMES3D_LIN.csv');
const ply = await rows('swissNAMES3D_PLY.csv');
const pkt = await rows('swissNAMES3D_PKT.csv');
console.log(`swissNAMES3D ${RELEASE}: ${lin.length} lines, ${ply.length} polygons, ${pkt.length} points`);

// ---- the network, in the same coordinates the map draws in ------------------
const net = JSON.parse(await fs.readFile(new URL('../site/data/network.json', import.meta.url), 'utf8'));
const P = net.p;
const reaches = net.reaches.map(r => {
  const n = r.x.length, xs = new Float64Array(n), ys = new Float64Array(n);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += r.x[i]; y += r.y[i]; xs[i] = x / P; ys[i] = y / P; }
  return { i: r.i, u: r.u, d: r.d, o: r.o, xs, ys };
});

// A coarse grid over the country so the snap is not 7,826 x 8,716 segment tests.
const CELL = 0.02;                       // about 1.5 km east-west at 47 N
const grid = new Map();
const key = (a, b) => a + ':' + b;
for (let ri = 0; ri < reaches.length; ri++) {
  const r = reaches[ri];
  for (let i = 0; i < r.xs.length; i++) {
    const k = key(Math.floor(r.xs[i] / CELL), Math.floor(r.ys[i] / CELL));
    const a = grid.get(k);
    if (a) { if (a[a.length - 1] !== ri) a.push(ri); } else grid.set(k, [ri]);
  }
}

// The radius has to absorb the difference in scale between the two sources, and it
// is the one number here that was tuned rather than derived. swissNAMES3D is placed
// against a 1:25,000 topographic map; HydroRIVERS is a global product whose line
// for a river is generalised far coarser than that. Measured against anchors of
// rivers whose size is known, the gap runs from 85 m on the Rhine at Schaffhausen
// through 254 m on the Ticino to 1,097 m on the Reuss.
//
// It cuts both ways and there is no radius that is right. Tight, and real rivers
// vanish: at 300 m the Limmat, the Emme and the Sarine were silently gone. Wide,
// and a brook standing near a trunk river inherits the trunk's size: at 1,200 m the
// Aepelooebaechlein came out the fifth largest watercourse in Switzerland. 500 m is
// where the count of each kind of error is smallest, checked by reading the top of
// the ranking by eye at 300, 500, 650, 800 and 1,200 m.
const SNAP_KM = 0.5;
const KX = 75.5, KY = 111.2;             // km per degree at 47 N

// Nearest vertex on any nearby reach, with the local direction of the channel at
// that vertex. Direction is taken over a window of vertices rather than one
// segment, because a single HydroRIVERS segment can be 30 m long and its bearing
// is then noise rather than the run of the river.
function snap(lon, lat) {
  const gx = Math.floor(lon / CELL), gy = Math.floor(lat / CELL);
  const near = [];
  let bestD = Infinity;
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gy - 1; b <= gy + 1; b++) {
    const cell = grid.get(key(a, b));
    if (!cell) continue;
    for (const ri of cell) {
      const r = reaches[ri];
      let d = Infinity, at = 0;
      for (let i = 0; i < r.xs.length; i++) {
        const dx = (r.xs[i] - lon) * KX, dy = (r.ys[i] - lat) * KY;
        const dd = dx * dx + dy * dy;
        if (dd < d) { d = dd; at = i; }
      }
      d = Math.sqrt(d);
      if (d <= SNAP_KM) near.push({ ri, at, d });
      if (d < bestD) bestD = d;
    }
  }
  if (!near.length) return null;
  near.sort((a, b) => a.d - b.d);
  const pick = near[0];
  const r = reaches[pick.ri], i = pick.at, n = r.xs.length;
  const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
  return { h: r.i, u: r.u, d: r.d, o: r.o, km: pick.d,
           dx: r.xs[b] - r.xs[a], dy: r.ys[b] - r.ys[a] };
}

// ---- watercourses -----------------------------------------------------------
// Rank is the upstream area in km2 of the reach the name was snapped to. It is the
// only ordering here that is a measurement rather than a guess: it says how much
// country drains past the point where the name is written, so at country view the
// map spends its ink on the Rhine and the Aare and at valley view on the brook.
// A handful of gazetteer entries are the bare generic word: "Kanal", "Canal",
// "Bach". They are names in the register and they are not names on a map — a
// reader who is told that the blue line is called "Canal" has been told nothing,
// and one of them ranked high enough to hold a slot at country view. Only exact
// matches are dropped, so the Nidau-Bueren-Kanal and the Dorfbach keep theirs.
const GENERIC = new Set(['Kanal', 'Canal', 'Canale', 'Bach', 'Graben', 'Fluss', 'Weiher',
                         'Ruisseau', 'Rivière', 'Riviere', 'Fiume', 'Riale', 'Rio', 'Torrent']);

const rivers = [];
let unsnapped = 0, generic = 0;
for (const row of lin) {
  if (row.OBJEKTART !== 'Fliessgewaesser') continue;
  const name = (row.NAME ?? '').replace(/\n/g, ' ').trim();
  if (!name) continue;
  if (GENERIC.has(name)) { generic++; continue; }
  const [lon, lat] = lv95(+row.E, +row.N);
  const s = snap(lon, lat);
  if (!s) unsnapped++;
  // Bearing in Mercator, which is what the canvas draws in: the y axis of the
  // projection runs the other way from latitude, so dy is negated here and the
  // renderer can use the angle without knowing any of this.
  const ang = s && (s.dx || s.dy) ? Math.atan2(-s.dy, s.dx) : 0;
  // A name whose water this map does not draw is dropped. HydroRIVERS is clipped
  // at 5 km2 of upstream area, so a third of the gazetteer's watercourses are
  // brooks with no line on this map, and a name floating over empty ground is a
  // worse answer than no name. What is lost is stated in the build log.
  if (!s) continue;
  rivers.push({
    n: name,
    x: +lon.toFixed(5), y: +lat.toFixed(5),
    r: Math.round(s.u),
    a: (s.dx || s.dy) ? +ang.toFixed(3) : null,
    o: s.o,
    // The reach the anchor snapped to. The build knows it and the browser would
    // have to redo the whole snap to find it out, so it is carried: with an id the
    // map can put the name on the water under the cursor instead of painting it on
    // the plane and hoping the reader connects the two.
    h: s.h,
    // How far the name fell from the line it was snapped to, in metres. Several
    // names land on one reach — a canal, its river, and the odd brook all within
    // the snap radius — and the map has to say which one the water under the
    // cursor is. Distance is the honest half of that answer: the name written on
    // the line beats the name written beside it.
    d: Math.round(s.km * 1000),
  });
}
// Rank a name by the LARGEST reach any of its own anchors reached, within a
// cluster of anchors that are actually near each other. Two things force this.
//
// Largest, not median: an anchor is placed wherever the label fits, so the Aare's
// twelve anchors snap to reaches from 104 to 9,936 km2 and only the top of that
// range says what the Aare is. Checked against rivers whose size is known, the
// maximum lands on 33,383 km2 for the Rhine, 9,936 for the Aare, 10,279 for the
// Rhone, 3,398 for the Reuss, 2,311 for the Limmat, 1,340 for the Inn.
//
// Clustered, not by bare name: fourteen different brooks in this country are
// called Dorfbach and they are not one river. Anchors of the same name are grouped
// by proximity, single-linkage at CLUSTER_KM, and each group is ranked on its own.
//
// WHAT THE SNAP GETS WRONG: a canal running alongside a big river within about
// 200 m cannot be told from it in a network generalised this coarsely. The
// Rothkanal beside the Aare snaps to 9,917 km2 and the Erzbach to 10,706, and on
// this evidence alone both are trunk rivers. The snap cannot fix that — there is
// no competing label within the radius to weigh it against — so the correction is
// made where the reaches are actually named, in indexNames() in site/app.js, by
// reading the register's own vocabulary as a size class: a Bach, a Kanal, a Riale
// and an Aalte Rii do not drain four figures of country, and a name that declares
// itself small is refused a reach that is not. The two fields that decision needs,
// d and c below, are measured here because only the build knows them.
const CLUSTER_KM = 25;
const groups = new Map();
for (const r of rivers) {
  const a = groups.get(r.n);
  if (!a) { groups.set(r.n, [[r]]); continue; }
  let hit = null;
  for (const g of a) {
    for (const m of g) {
      if (Math.hypot((m.x - r.x) * KX, (m.y - r.y) * KY) <= CLUSTER_KM) { hit = g; break; }
    }
    if (hit) break;
  }
  if (hit) hit.push(r); else a.push([r]);
}
// A cluster of three or more placements has enough of its own evidence for the
// largest reading to be corroborated: the gazetteer wrote this name along a course
// three times, and the biggest reach under it is what the name is on. A cluster of
// one or two has nothing to check itself against, so it takes the most conservative
// reading of its own evidence instead of the most flattering. That is what stops
// the Erzbach, written twice beside the Aare, from claiming 10,706 km2 on the
// strength of one placement that fell 131 m from the trunk.
const CORROBORATE = 3;
let clusters = 0, demoted = 0;
for (const a of groups.values()) for (const g of a) {
  clusters++;
  let max = 0, min = Infinity;
  for (const m of g) { if (m.r > max) max = m.r; if (m.r < min) min = m.r; }
  const rank = g.length >= CORROBORATE ? max : min;
  if (rank < max) demoted++;
  // The size of the cluster travels with every anchor in it. It is the other half
  // of the ownership answer: a name the gazetteer wrote along a course a dozen
  // times is a river, a name written twice beside one is a canal, and when both
  // claim the same reach the map should believe the one with a course.
  for (const m of g) { m.r = rank; m.c = g.length; }
}
rivers.sort((a, b) => b.r - a.r);
const top = [];
const seenName = new Set();
for (const r of rivers) { if (seenName.has(r.n)) continue; seenName.add(r.n); if (top.length < 14) top.push(r); }
console.log(`watercourses ${rivers.length} anchors kept, ${groups.size} distinct names in ${clusters} clusters, ` +
            `${unsnapped} dropped for being more than ${SNAP_KM * 1000} m from any drawn reach`);
console.log(`  ${demoted} clusters of fewer than ${CORROBORATE} placements took their smallest reading, ` +
            `${generic} anchors dropped for being the bare generic word`);
console.log(`  the fourteen largest: ${top.map(r => `${r.n} ${r.r}`).join(', ')} km2`);

// ---- standing water ---------------------------------------------------------
// Lakes are ranked by the area of the lake polygon this map already draws, found
// by testing the anchor against the rings in context.json. A lake too small to be
// in that file gets rank 0 and shows only when the map is zoomed into it, which is
// the correct answer for a pond: it is a name for the place you are standing in.
const cx = JSON.parse(await fs.readFile(new URL('../site/data/context.json', import.meta.url), 'utf8'));
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const lakeArea = cx.lakes.map(l => {
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const [x, y] of l.r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { ring: l.r, km2: (x1 - x0) * KX * (y1 - y0) * KY };
});
const lakes = [];
for (const row of ply) {
  if (row.OBJEKTART !== 'See') continue;
  const name = (row.NAME ?? '').replace(/\n/g, ' ').trim();
  if (!name) continue;
  const [lon, lat] = lv95(+row.E, +row.N);
  let km2 = 0;
  for (const l of lakeArea) if (inRing(l.ring, lon, lat)) { km2 = Math.max(km2, l.km2); }
  lakes.push({ n: name, x: +lon.toFixed(5), y: +lat.toFixed(5), r: Math.round(km2) });
}
lakes.sort((a, b) => b.r - a.r);
console.log(`lakes ${lakes.length}, ${lakes.filter(l => l.r > 0).length} matched to a drawn polygon`);

// ---- ice --------------------------------------------------------------------
// Nothing here. The glaciers already carry their own names: GLAMOS attaches a name
// AND an area to each body in the inventory, so build/04-glaciers.mjs has both and
// the ice layer labels itself from the body rather than from a gazetteer anchor
// snapped near it. A join that is not needed is a join that cannot go wrong.

// ---- where water comes out of the ground ------------------------------------
// 86 named springs and 157 named waterfalls. These are the NAMED ones and nothing
// like the count of springs in Switzerland: swissNAMES3D records a name, and most
// springs have none. They are carried because a named spring is a place people
// know, and the water-sources layer says plainly that it draws named springs only.
const springs = [];
for (const row of pkt) {
  const kind = row.OBJEKTART === 'Quelle' ? 'q' : row.OBJEKTART === 'Wasserfall' ? 'f' : null;
  if (!kind) continue;
  const name = (row.NAME ?? '').replace(/\n/g, ' ').trim();
  if (!name) continue;
  const [lon, lat] = lv95(+row.E, +row.N);
  springs.push({ n: name, x: +lon.toFixed(5), y: +lat.toFixed(5), k: kind });
}
console.log(`springs ${springs.filter(s => s.k === 'q').length}, waterfalls ${springs.filter(s => s.k === 'f').length}`);

const out = { built: new Date().toISOString().slice(0, 10), release: RELEASE, published: PUBLISHED,
              rivers, lakes, springs };
await fs.writeFile(OUT, JSON.stringify(out));
const size = (await fs.stat(OUT)).size;
console.log(`wrote site/data/names.json, ${(size / 1024).toFixed(0)} kB`);
