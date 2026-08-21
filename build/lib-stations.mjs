// Deterministically bind federal station points to the committed HydroRIVERS network.
// Shared by the full network build and the weekly station-metadata refresh.
export function bindStations(stations, reaches, precision) {
  const abs = reaches.map(r => {
    const pts = [];
    let x = 0, y = 0;
    for (let k = 0; k < r.x.length; k++) {
      x += r.x[k]; y += r.y[k];
      pts.push([x / precision, y / precision]);
    }
    return pts;
  });

  const maxDegrees = 0.012; // at most about 1.3 km across Swiss latitudes
  for (const s of stations) {
    let best = null;
    for (let ri = 0; ri < reaches.length; ri++) {
      const r = reaches[ri];
      let dmin = Infinity;
      for (const [lon, lat] of abs[ri]) {
        const dx = (lon - s.lon) * Math.cos(s.lat * Math.PI / 180), dy = lat - s.lat;
        const d = dx * dx + dy * dy;
        if (d < dmin) dmin = d;
      }
      if (dmin > maxDegrees * maxDegrees) continue;
      const score = Math.sqrt(dmin) / maxDegrees - Math.min(1, Math.log10(1 + r.u) / 5);
      if (!best || score < best.score || (score === best.score && r.i < reaches[best.ri].i)) {
        best = { score, ri, dist: Math.sqrt(dmin) };
      }
    }
    if (!best) continue;
    const reach = reaches[best.ri];
    s.reach = reach.i;
    s.main = reach.m;
    s.meanQ = reach.d;
    s.snapKm = +(best.dist * 111).toFixed(2);
    if (s.hasQ) s.unitCheck = Number.isFinite(s.factor) ? 'ok' : 'unknown-unit';
  }
  return stations.filter(s => s.reach).length;
}
