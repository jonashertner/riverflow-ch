#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const urls = new Set();
const vintage = JSON.parse(fs.readFileSync(path.join(site, 'data/vintage.json'), 'utf8'));
for (const source of vintage.sources) {
  urls.add(source.url);
  for (const link of source.links ?? []) urls.add(link.url);
}
const monitoring = JSON.parse(fs.readFileSync(path.join(site, 'data/canton-monitoring.json'), 'utf8'));
for (const canton of monitoring.cantons) urls.add(canton.url);
for (const name of ['about.html', 'method.html', 'law.html', 'sources.html']) {
  const raw = fs.readFileSync(path.join(site, name), 'utf8');
  for (const match of raw.matchAll(/\bhref=["'](https:\/\/[^"']+)["']/g)) urls.add(match[1].replaceAll('&amp;', '&'));
}

async function status(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if ([400, 403, 405, 429, 500, 502, 503].includes(response.status)) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { Range: 'bytes=0-1023', 'User-Agent': 'riverflow-ch-link-audit/1.0' } });
    }
    return response.status;
  } catch (error) {
    return error.name === 'AbortError' ? 'timeout' : 'network';
  } finally {
    clearTimeout(timer);
  }
}

const queue = [...urls].filter(Boolean);
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < queue.length) {
    const url = queue[cursor++];
    results.push([url, await status(url)]);
  }
}));
results.sort((a, b) => a[0].localeCompare(b[0]));
const dead = results.filter(([, code]) => code === 404 || code === 410);
const uncertain = results.filter(([, code]) => typeof code !== 'number' || code >= 400).filter(row => !dead.includes(row));
console.log('External links: ' + results.length + ' checked, ' + dead.length + ' dead, ' + uncertain.length + ' inconclusive.');
for (const [url, code] of [...dead, ...uncertain]) console.log('  ' + code + ' ' + url);
if (dead.length) process.exit(1);
