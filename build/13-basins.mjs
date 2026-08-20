// Where Swiss water goes, derived rather than asserted.
//
// Every reach in HydroRIVERS carries MAIN_RIV, the id of the most downstream reach
// of its river system. Grouping the Swiss extract by that field gives the river
// systems; classifying each system's outlet by the sea it reaches gives the four
// basins. The share of Swiss territory in each is then measured, not quoted: a one
// kilometre grid is laid over the country, every cell whose centre falls inside the
// border is assigned to the basin of the nearest mapped channel, and the cells are
// counted.
//
// The result is checkable against the federal figure, and the check is the point.
// BAFU states 67 % / 18 % / 9.3 % / 4.4 % (Wasser: internationale Zusammenarbeit,
// 19.05.2025). Those four sum to 98.7 %, because the Adige basin in Val Mustair and
// rounding sit outside them. This derivation sums to 100 % and says where the rest is.
//
// The last gauge on each river is the one with the largest modelled mean in the basin
// (HydroRIVERS DIS_AV_CMS at the reach it is snapped to, not a federal statistic).
// Whether it actually stands at the frontier is measured too, as the distance from the
// border polygon, because on one of the four rivers it does not. On a second, it does
// and still fails to measure the export: Martina sits inside the reach the Engadine
// scheme diverts, which the site's own use layer shows and this file does not model.
import fs from 'node:fs/promises';

const site = new URL('../site/data/', import.meta.url);
const net = JSON.parse(await fs.readFile(new URL('network.json', site), 'utf8'));
const ctx = JSON.parse(await fs.readFile(new URL('context.json', site), 'utf8'));
const sta = JSON.parse(await fs.readFile(new URL('stations.json', site), 'utf8'));

const P = net.p || 1e5;
const ring = ctx.border[0];

// ---- the four basins --------------------------------------------------------
// Each system is named by the reach its water leaves the country through. The five
// systems large enough to be named are identified by their outlet; the remaining 31
// are Jura headwaters on the western flank, every one of which drains to the Doubs
// or the Ain and so, through the Saone and the Rhone, to the Mediterranean.
const NAMED = {
  20323928: 'rhine',
  20537764: 'rhone',
  20504798: 'po',
  20498112: 'inn',
  20501351: 'adige',
};
const SEAS = [
  { key: 'north', sea: 'North Sea', via: 'the Rhine', systems: ['rhine'], bafuPct: 67,
    states: 'Liechtenstein, Austria, Germany, France, Luxembourg, Belgium, the Netherlands, Italy',
    reg: 'IKSR, under the Rhine Convention of 12.04.1999; hydrology coordinated by the KHR since 1970',
    // The one basin where the Swiss share can be computed here at both ends: the
    // modelled natural mean at the last Swiss gauge's reach, and the measured mean the
    // international management plan states further down the same river. One term of the
    // two is modelled, so the result is a check on the federal figure and not a source.
    down: { place: 'Rees, above the Dutch border', meanQ: 2290,
            src: 'Internationale Kommission zum Schutz des Rheins, International koordinierter Bewirtschaftungsplan 2022\u20132027 f\u00fcr die internationale Flussgebietseinheit Rhein, Teil A, M\u00e4rz 2022, Tabelle 1' },
    bafuFlowPct: 45 },
  { key: 'med', sea: 'Mediterranean', via: 'the Rhone', systems: ['rhone', 'jura'], bafuPct: 18,
    states: 'France',
    reg: 'CIPEL for Lake Geneva and the Rhone below it, by the agreement of 16.11.1962, in force 1963',
    down: null, bafuFlowPct: 20 },
  { key: 'adriatic', sea: 'Adriatic', via: 'the Ticino and the Po, and the Rom and the Adige',
    systems: ['po', 'adige'], states: 'Italy', bafuPct: 9.3,
    reg: 'CIPAIS for the Italian-Swiss waters, by the agreement of 20.04.1972',
    down: null, bafuFlowPct: 10 },
  { key: 'black', sea: 'Black Sea', via: 'the Inn and the Danube', systems: ['inn'], bafuPct: 4.4,
    states: 'Austria, Germany, Slovakia, Hungary, Croatia, Serbia, Bulgaria, Romania, Moldova, Ukraine',
    reg: 'no commission to which Switzerland is party; the Danube regime under the ICPDR does not reach the Inn headwaters in Switzerland',
    down: null, bafuFlowPct: 1 },
];

const sysOf = m => NAMED[m] ?? 'jura';
const seaOfSys = new Map();
for (const s of SEAS) for (const k of s.systems) seaOfSys.set(k, s.key);
const seaOf = m => seaOfSys.get(sysOf(m));

// ---- the grid ---------------------------------------------------------------
const inPoly = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const MIDLAT = 46.8;
const kx = 111.32 * Math.cos(MIDLAT * Math.PI / 180), ky = 110.57;

const CELL = 0.02;                                  // about 1.5 km, the hash cell
const hash = new Map();
const key = (a, b) => a + ':' + b;
for (const r of net.reaches) {
  let x = 0, y = 0;
  for (let k = 0; k < r.x.length; k++) {
    x += r.x[k]; y += r.y[k];
    const lon = x / P, lat = y / P;
    const kk = key(Math.floor(lon / CELL), Math.floor(lat / CELL));
    let a = hash.get(kk); if (!a) { a = []; hash.set(kk, a); }
    a.push([lon, lat, r.m]);
  }
}

let x0 = 9e9, y0 = 9e9, x1 = -9e9, y1 = -9e9;
for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }

const bySea = new Map(), bySys = new Map();
let cells = 0;
for (let lat = y0; lat <= y1; lat += 1 / ky) {
  for (let lon = x0; lon <= x1; lon += 1 / kx) {
    if (!inPoly(lon, lat, ring)) continue;
    cells++;
    let best = null, bd = Infinity;
    const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
    for (let ri = 1; ri <= 8; ri++) {
      for (let a = cx - ri; a <= cx + ri; a++) for (let b = cy - ri; b <= cy + ri; b++) {
        const arr = hash.get(key(a, b)); if (!arr) continue;
        for (const [vx, vy, m] of arr) {
          const dx = (vx - lon) * kx, dy = (vy - lat) * ky, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = m; }
        }
      }
      if (best !== null) break;
    }
    if (best === null) continue;
    const s = seaOf(best), y2 = sysOf(best);
    bySea.set(s, (bySea.get(s) || 0) + 1);
    bySys.set(y2, (bySys.get(y2) || 0) + 1);
  }
}

// the simplified border's own area, so the reader can see the error in the frame
let A = 0;
for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
  A += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
}
const polyKm2 = Math.round(Math.abs(A / 2));

// ---- the last gauge on each river -------------------------------------------
// Distance from the border ring, in kilometres, by brute force over its 749 vertices.
const toBorder = (lon, lat) => {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const px = (lon - ax) * kx, py = (lat - ay) * ky;
    const ex = (bx - ax) * kx, ey = (by - ay) * ky;
    const L = ex * ex + ey * ey;
    const t = L ? Math.max(0, Math.min(1, (px * ex + py * ey) / L)) : 0;
    const qx = px - t * ex, qy = py - t * ey;
    d = Math.min(d, Math.sqrt(qx * qx + qy * qy));
  }
  return d;
};

const BORDER_KM = 5;      // a gauge further from the frontier than this does not measure the export

// ---- the ice, by the sea it melts towards -----------------------------------
// A glacier is a reservoir with no concession and no operator, and the question the
// intro asks is whose river it holds water for. Each body is assigned to a basin by
// its own centroid, through the same nearest-channel rule as the grid, and the two
// dated inventories the repo already carries are summed the same way. Nothing here
// is modelled: it is the 1850 and 2023 outlines, sorted by where their melt goes.
const nearestSea = (lon, lat) => {
  let best = null, bd = Infinity;
  const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
  for (let ri = 1; ri <= 10; ri++) {
    for (let a = cx - ri; a <= cx + ri; a++) for (let b = cy - ri; b <= cy + ri; b++) {
      const arr = hash.get(key(a, b)); if (!arr) continue;
      for (const [vx, vy, m] of arr) {
        const dx = (vx - lon) * kx, dy = (vy - lat) * ky, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = m; }
      }
    }
    if (best !== null) break;
  }
  return best === null ? null : seaOf(best);
};

const gla = JSON.parse(await fs.readFile(new URL('glaciers.json', site), 'utf8'));
const GP = gla.p || P;
const iceNow = new Map(), icePast = new Map();
let iceNowSum = 0, icePastSum = 0;
for (const g of gla.glaciers) {
  const s = nearestSea(g.c[0], g.c[1]); if (!s) continue;
  iceNow.set(s, (iceNow.get(s) || 0) + g.a); iceNowSum += g.a;
}
// The 1850 outlines carry no area of their own, so each ring is measured here by
// the shoelace, in the same local kilometre frame the border area uses.
for (const r of gla.pastRings) {
  const [xs, ys] = r;
  let x = 0, y = 0; const px = [], py = [];
  for (let k = 0; k < xs.length; k++) { x += xs[k]; y += ys[k]; px.push(x / GP); py.push(y / GP); }
  let A2 = 0, cx = 0, cy = 0;
  for (let i = 0, j = px.length - 1; i < px.length; j = i++) {
    A2 += (px[j] * kx) * (py[i] * ky) - (px[i] * kx) * (py[j] * ky);
    cx += px[i]; cy += py[i];
  }
  const km2 = Math.abs(A2 / 2);
  const s = nearestSea(cx / px.length, cy / py.length); if (!s) continue;
  icePast.set(s, (icePast.get(s) || 0) + km2); icePastSum += km2;
}

const out = SEAS.map(s => {
  const km2 = bySea.get(s.key) || 0;
  const mains = Object.entries(NAMED).filter(([, y]) => s.systems.includes(y)).map(([m]) => +m);
  const cand = sta.stations
    .filter(x => x.hasQ && x.meanQ && mains.includes(x.main))
    .sort((a, b) => b.meanQ - a.meanQ);
  const wrap = x => {
    if (!x) return null;
    const d = +toBorder(x.lon, x.lat).toFixed(1);
    // factor and unit travel with the gauge so the page that reads it live needs
    // this one small file and not the whole station table.
    return { id: x.id, name: x.name, lon: x.lon, lat: x.lat, meanQ: x.meanQ,
             factor: x.factor, unit: x.unit,
             borderKm: d, atBorder: d <= BORDER_KM };
  };
  // The largest gauged point in the basin, and separately the largest one that
  // actually stands at the frontier. On three of the four rivers they are the same
  // gauge. On the fourth they are not, and that is the fact worth stating.
  const big = wrap(cand[0] ?? null);
  const atB = wrap(cand.find(x => toBorder(x.lon, x.lat) <= BORDER_KM) ?? null);
  const swissShare = s.down && big ? +(100 * big.meanQ / s.down.meanQ).toFixed(1) : null;
  return {
    key: s.key, sea: s.sea, via: s.via, states: s.states, regime: s.reg,
    km2, pct: +(100 * km2 / cells).toFixed(2), bafuPct: s.bafuPct,
    systems: Object.fromEntries(s.systems.map(y => [y, bySys.get(y) || 0])),
    gauge: big, borderGauge: atB, measuresExport: !!(big && big.atBorder),
    down: s.down, swissShare, bafuFlowPct: s.bafuFlowPct,
    iceKm2: +(iceNow.get(s.key) || 0).toFixed(1),
    iceKm2_1850: +(icePast.get(s.key) || 0).toFixed(1),
  };
}).sort((a, b) => b.km2 - a.km2);

const j = {
  built: new Date().toISOString(),
  cells, cellKm2: 1, polygonKm2: polyKm2, officialKm2: 41291,
  gaugesRead: sta.stations.filter(x => x.hasQ).length,
  ice: { now: gla.now, past: gla.past,
         nowSum: +iceNowSum.toFixed(1), pastSum: +icePastSum.toFixed(1) },
  bafuSum: +SEAS.reduce((a, s) => a + s.bafuPct, 0).toFixed(1),
  seas: out,
};
await fs.writeFile(new URL('basins.json', site), JSON.stringify(j));

for (const s of out) {
  console.log(String(s.sea).padEnd(14), String(s.km2).padStart(6), 'km2', String(s.pct).padStart(6) + ' %',
    ' via', s.via.padEnd(46),
    s.gauge ? `${s.gauge.name} (${s.gauge.id}) ${s.gauge.meanQ} m3/s, ${s.gauge.borderKm} km from the border${s.gauge.atBorder ? '' : '  <-- NOT at the frontier'}` : 'no gauge');
  if (!s.measuresExport && s.borderGauge) {
    console.log(' '.repeat(14), 'the only gauge at the frontier is', s.borderGauge.name,
      `(${s.borderGauge.id}), ${s.borderGauge.meanQ} m3/s, ${s.borderGauge.borderKm} km out`);
  }
  if (s.swissShare !== null) {
    console.log(' '.repeat(14), `Swiss share of the flow: ${s.gauge.meanQ} / ${s.down.meanQ} at ${s.down.place} = ${s.swissShare} %  (BAFU states ${s.bafuFlowPct} %)`);
  }
}
console.log(`\n${cells} cells of 1 km2 inside a border polygon of ${polyKm2} km2 (official 41291, ${(100*(41291-polyKm2)/41291).toFixed(1)} % lost to simplification)`);
console.log('ice now   ', [...iceNow].map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '),
  `= ${iceNowSum.toFixed(1)} km2 (inventory states ${gla.now.km2})`);
console.log('ice 1850  ', [...icePast].map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '),
  `= ${icePastSum.toFixed(1)} km2 (inventory states ${gla.past.km2})`);
console.log('by system:', [...bySys.entries()].map(([k, v]) => `${k} ${v}`).join(', '));
console.log('shares sum to', out.reduce((a, s) => a + s.pct, 0).toFixed(2), '%');
