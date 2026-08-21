#!/usr/bin/env node
/* Build the source for the social preview from the same geometry as the map.
 * The committed PNG is rendered from this SVG at 1200 × 630. Keeping the vector
 * source deterministic means the preview can be refreshed when the network moves
 * without redrawing Switzerland by hand or introducing a design dependency. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'site');
const network = JSON.parse(readFileSync(join(site, 'data', 'network.json'), 'utf8'));
const context = JSON.parse(readFileSync(join(site, 'data', 'context.json'), 'utf8'));
const glaciers = JSON.parse(readFileSync(join(site, 'data', 'glaciers.json'), 'utf8'));
const reservoirs = JSON.parse(readFileSync(join(site, 'data', 'reservoirs.json'), 'utf8'));

const W = 1200, H = 630;
const box = { x: 560, y: 55, w: 600, h: 510 };
const bounds = { west: 5.72, east: 10.70, south: 45.72, north: 47.98 };
const mercY = lat => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const yNorth = mercY(bounds.north), ySouth = mercY(bounds.south);
const xy = (lon, lat) => [
  box.x + (lon - bounds.west) / (bounds.east - bounds.west) * box.w,
  box.y + (mercY(lat) - yNorth) / (ySouth - yNorth) * box.h,
];
const path = points => points.map(([lon, lat], i) => {
  const [x, y] = xy(lon, lat);
  return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(' ');
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

const border = context.border.map(ring => `<path d="${path(ring)} Z"/>`).join('');
const lakes = context.lakes.map(lake => `<path d="${path(lake.r)} Z"/>`).join('');
const rivers = [];
for (const reach of network.reaches) {
  if ((reach.u ?? 0) < 45) continue;
  let lon = 0, lat = 0;
  const points = [];
  for (let i = 0; i < reach.x.length; i++) {
    lon += reach.x[i]; lat += reach.y[i];
    points.push([lon / network.p, lat / network.p]);
  }
  const q = Math.max(0.05, reach.d ?? 0.05);
  const weight = Math.max(0.65, Math.min(5.2, 0.65 + Math.log10(1 + q) * 1.35));
  const light = Math.max(34, Math.min(82, 38 + Math.log10(1 + q) * 14));
  rivers.push(`<path d="${path(points)}" stroke="hsl(212 72% ${light.toFixed(0)}%)" stroke-width="${weight.toFixed(2)}"/>`);
}

const fmt = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const glacierCount = glaciers.now?.count ?? glaciers.glaciers?.length ?? 0;
const damCount = reservoirs.dams?.length ?? 0;
const title = 'Water & ice';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#0d0d0d"/><stop offset="0.72" stop-color="#0d0d0d" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="1200" height="630" fill="#0d0d0d"/>
  <g transform="translate(0 1)">
    <rect x="58" y="52" width="4" height="20" rx="2" fill="#9ec5f4"/>
    <rect x="68" y="52" width="33" height="20" rx="3" fill="#3987e5"/>
    <rect x="107" y="52" width="19" height="20" rx="3" fill="#3a4450"/>
  </g>
  <text x="58" y="154" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" letter-spacing="-2.4">${esc(title)}</text>
  <text x="58" y="226" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" letter-spacing="-2.4">in Switzerland</text>
  <text x="62" y="282" fill="#9ec5f4" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600">Rivers, live. Ice, across five surveys.</text>
  <text x="62" y="316" fill="#c3c2b7" font-family="Arial, Helvetica, sans-serif" font-size="21">Reservoirs against 26 years of their own record.</text>
  <line x1="62" y1="360" x2="474" y2="360" stroke="#2c2c2a"/>
  <text x="62" y="407" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600">${fmt.format(network.reaches.length)} river reaches</text>
  <text x="62" y="440" fill="#c3c2b7" font-family="Arial, Helvetica, sans-serif" font-size="17">${fmt.format(damCount)} dams · ${fmt.format(glacierCount)} glacier bodies</text>
  <text x="62" y="491" fill="#898781" font-family="Arial, Helvetica, sans-serif" font-size="17">Every figure carries its source,</text>
  <text x="62" y="517" fill="#898781" font-family="Arial, Helvetica, sans-serif" font-size="17">its class of evidence, and its age.</text>
  <g opacity="0.25" filter="url(#glow)" fill="none" stroke-linecap="round" stroke-linejoin="round">${rivers.join('')}</g>
  <g fill="#16294a" stroke="#9dc5f4" stroke-opacity="0.24" stroke-width="1">${lakes}</g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${rivers.join('')}</g>
  <g fill="#ffffff" fill-opacity="0.018" stroke="#c3c2b7" stroke-opacity="0.34" stroke-width="1.1">${border}</g>
  <rect x="500" width="260" height="630" fill="url(#fade)"/>
  <text x="62" y="582" fill="#898781" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" letter-spacing="1.4">RIVERFLOW.CH · MEASURED AND MODELLED, NOT A FORECAST</text>
</svg>\n`;

writeFileSync(join(here, 'social-card.svg'), svg);
console.log(`social card: ${network.reaches.length} reaches, ${damCount} dams, ${glacierCount} glacier bodies`);
