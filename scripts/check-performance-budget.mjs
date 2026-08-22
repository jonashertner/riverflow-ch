#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const gzip = name => gzipSync(fs.readFileSync(path.join(site, name)), { level: 9 }).length;
const bytes = name => fs.statSync(path.join(site, name)).size;
const code = [
  'index.html', 'fonts.css', 'tokens.css', 'style.css', 'i18n.js', 'i18n-data.js',
  'i18n-map.js', 'theme.js', 'fmt.js', 'gschg31.js', 'app.js', 'favicon.svg',
];
const core = ['data/network.json', 'data/stations.json', 'data/context.json'];
const fontDir = path.join(site, 'fonts');
const fonts = fs.readdirSync(fontDir).filter(name => name.endsWith('.woff2')).map(name => 'fonts/' + name);
// The default German landing view uses one Latin subset from each normal face.
// Other weights, italics and Latin-extended subsets are fetched only when a page
// actually uses them because every @font-face has a precise unicode-range.
const initialFonts = [
  'fonts/archivo-normal-latin.woff2',
  'fonts/ibm-plex-mono-400-latin.woff2',
  'fonts/source-serif-normal-latin.woff2',
];
const optional = [
  'data/glaciers.json', 'data/icehistory.json', 'data/users.json', 'data/reservoirs.json',
  'data/residual.json', 'data/wetlands.json', 'data/quality.json', 'data/vintage.json',
  'data/names.json', 'data/cantons.json',
];
const totals = {
  code: code.reduce((n, name) => n + gzip(name), 0),
  core: core.reduce((n, name) => n + gzip(name), 0),
  fonts: initialFonts.reduce((n, name) => n + bytes(name), 0),
  fontLibrary: fonts.reduce((n, name) => n + bytes(name), 0),
};
totals.initial = totals.code + totals.core + totals.fonts;
const budgets = {
  initial: 850_000,
  code: 240_000,
  core: 300_000,
  app: 80_000,
  fontLibrary: 550_000,
  optionalFile: 850_000,
};
const failures = [];
const check = (label, actual, budget) => {
  if (actual > budget) failures.push(label + ': ' + (actual / 1000).toFixed(1) + ' kB exceeds ' + (budget / 1000).toFixed(1) + ' kB');
};
check('initial compressed transfer', totals.initial, budgets.initial);
check('HTML/CSS/JS compressed transfer', totals.code, budgets.code);
check('core map data compressed transfer', totals.core, budgets.core);
check('app.js compressed transfer', gzip('app.js'), budgets.app);
check('complete self-hosted font library', totals.fontLibrary, budgets.fontLibrary);
for (const name of optional) check(name + ' compressed transfer', gzip(name), budgets.optionalFile);

console.log('Performance budget: ' + (totals.initial / 1000).toFixed(1) + ' kB initial (' +
  (totals.code / 1000).toFixed(1) + ' code, ' + (totals.core / 1000).toFixed(1) +
  ' core, ' + (totals.fonts / 1000).toFixed(1) + ' fonts); ' +
  (totals.fontLibrary / 1000).toFixed(1) + ' kB complete font library.');
if (failures.length) {
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}
