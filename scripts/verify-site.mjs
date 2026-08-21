#!/usr/bin/env node
/* Dependency-free release gate for the static site.
 *
 * The publication surface is 25 HTML documents, eleven JSON datasets and three
 * shared string catalogues. A broken relative link or one missing translation can
 * therefore hide in a page nobody happened to open. This check treats the site as
 * one artifact and verifies the contracts that make those copies trustworthy. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const site = join(root, 'site');
const languages = ['en', 'de', 'fr', 'it', 'rm'];
const hreflangs = [...languages, 'x-default'];
const base = 'https://jonashertner.github.io/riverflow-ch/';
const errors = [];
const fail = (file, message) => errors.push(`${relative(root, file)}: ${message}`);

function walk(dir, accept = () => true) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) out.push(...walk(file, accept));
    else if (accept(file)) out.push(file);
  }
  return out;
}

function one(raw, pattern) {
  const matches = [...raw.matchAll(pattern)];
  return matches.length === 1 ? matches[0][1] : null;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function localTarget(from, value) {
  if (!value || /^(?:[a-z]+:|\/\/)/i.test(value)) return null;
  const [pathPart, fragment = ''] = value.split('#', 2);
  const clean = pathPart.split('?', 1)[0];
  let target = clean ? resolve(dirname(from), clean) : from;
  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
  } catch { /* reported by the caller */ }
  return { target, fragment };
}

const htmlFiles = walk(site, file => extname(file) === '.html').sort();
const htmlByFile = new Map(htmlFiles.map(file => [file, readFileSync(file, 'utf8')]));
const canonicalUrls = new Set();

for (const file of htmlFiles) {
  const raw = htmlByFile.get(file);
  const htmlTag = raw.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const lang = attribute(htmlTag, 'lang');
  const rootAttr = attribute(htmlTag, 'data-root');
  if (!languages.includes(lang)) fail(file, `unsupported or missing lang=${lang}`);
  const translated = dirname(file) !== site;
  if (rootAttr !== (translated ? '../' : './')) fail(file, `data-root should be ${translated ? '../' : './'}`);

  const titleCount = (raw.match(/<title\b/gi) ?? []).length;
  const h1Count = (raw.match(/<h1\b/gi) ?? []).length;
  const mainCount = (raw.match(/<main\b/gi) ?? []).length;
  if (titleCount !== 1) fail(file, `expected one title, found ${titleCount}`);
  if (h1Count !== 1) fail(file, `expected one h1, found ${h1Count}`);
  if (mainCount !== 1) fail(file, `expected one main landmark, found ${mainCount}`);

  for (const name of ['description', 'robots', 'twitter:card']) {
    const count = [...raw.matchAll(new RegExp(`<meta\\s+[^>]*name=["']${name.replace(':', '\\:')}["'][^>]*>`, 'gi'))].length;
    if (count !== 1) fail(file, `expected one ${name} meta tag, found ${count}`);
  }
  for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:url', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt']) {
    const count = [...raw.matchAll(new RegExp(`<meta\\s+[^>]*property=["']${property.replace(':', '\\:')}["'][^>]*>`, 'gi'))].length;
    if (count !== 1) fail(file, `expected one ${property} meta tag, found ${count}`);
  }

  const canonical = one(raw, /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
  const ogUrl = one(raw, /<meta\s+[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/gi);
  if (!canonical?.startsWith(base)) fail(file, 'canonical URL is missing or outside the publication root');
  else canonicalUrls.add(canonical);
  if (ogUrl !== canonical) fail(file, 'og:url does not match the canonical URL');

  const alternates = [...raw.matchAll(/<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const wanted of hreflangs) if (alternates.filter(x => x === wanted).length !== 1) fail(file, `hreflang ${wanted} is missing or duplicated`);
  if (alternates.some(x => !hreflangs.includes(x))) fail(file, 'unexpected hreflang value');

  const ids = [...raw.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const id of new Set(ids)) if (ids.filter(x => x === id).length > 1) fail(file, `duplicate id #${id}`);

  for (const tag of raw.match(/<(?:a|link|script)\b[^>]*>/gi) ?? []) {
    const value = attribute(tag, tag.startsWith('<script') ? 'src' : 'href');
    const found = localTarget(file, value);
    if (!found) continue;
    if (!found.target.startsWith(site + sep) && found.target !== site) {
      fail(file, `local reference escapes site/: ${value}`);
      continue;
    }
    let targetRaw;
    try { targetRaw = readFileSync(found.target, 'utf8'); }
    catch { fail(file, `missing local reference: ${value}`); continue; }
    if (found.fragment) {
      const fragment = decodeURIComponent(found.fragment);
      if (!new RegExp(`\\bid=["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(targetRaw)) {
        fail(file, `missing fragment target: ${value}`);
      }
    }
  }

  for (const tag of raw.match(/<a\b[^>]*>/gi) ?? []) {
    if (attribute(tag, 'target') === '_blank' && !/\bnoopener\b/.test(attribute(tag, 'rel') ?? '')) {
      fail(file, 'target="_blank" link is missing rel="noopener"');
    }
  }
  for (const tag of raw.match(/<button\b[^>]*>/gi) ?? []) {
    if (!attribute(tag, 'type')) fail(file, 'button is missing an explicit type');
  }
  for (const tag of raw.match(/<canvas\b[^>]*>/gi) ?? []) {
    if (attribute(tag, 'aria-hidden') !== 'true' && !attribute(tag, 'aria-label') && !attribute(tag, 'aria-labelledby')) {
      fail(file, 'canvas is neither named nor hidden from assistive technology');
    }
  }
}

// The sitemap must describe exactly the canonical publication surface.
const sitemapFile = join(site, 'sitemap.xml');
const sitemap = readFileSync(sitemapFile, 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
for (const url of canonicalUrls) if (!sitemapUrls.has(url)) fail(sitemapFile, `missing canonical URL ${url}`);
for (const url of sitemapUrls) if (!canonicalUrls.has(url)) fail(sitemapFile, `URL has no HTML canonical ${url}`);
if (sitemapUrls.size !== 25) fail(sitemapFile, `expected 25 URLs, found ${sitemapUrls.size}`);

// Parse every committed JSON artifact and syntax-check every JavaScript source.
for (const file of [...walk(join(site, 'data'), f => extname(f) === '.json'), ...walk(join(root, 'build', 'pages'), f => extname(f) === '.json')]) {
  try { JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { fail(file, `invalid JSON: ${error.message}`); }
}
for (const file of [...walk(site, f => ['.js', '.mjs'].includes(extname(f))), ...walk(join(root, 'build'), f => ['.js', '.mjs'].includes(extname(f))), ...walk(join(root, 'scripts'), f => ['.js', '.mjs'].includes(extname(f)))]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) fail(file, (check.stderr || check.stdout).trim());
}

// Evaluate only the inert catalogues, then require every runtime string in all
// five languages and every literal T()/Tn() reference to resolve.
try {
  const catalogueSource = ['i18n.js', 'i18n-data.js', 'i18n-map.js']
    .map(name => readFileSync(join(site, name), 'utf8')).join('\n') +
    '\n;globalThis.__catalogue = STR;';
  const sandbox = {
    document: {
      documentElement: { getAttribute: name => name === 'lang' ? 'en' : null, dataset: { root: './' } },
      addEventListener() {}, querySelectorAll() { return []; },
    },
    console: { warn() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(catalogueSource, sandbox);
  const catalogue = sandbox.__catalogue;
  for (const [key, row] of Object.entries(catalogue)) {
    for (const lang of languages) if (typeof row?.[lang] !== 'string' || !row[lang]) fail(join(site, 'i18n.js'), `${key} has no ${lang} translation`);
  }
  const jsSource = walk(site, f => extname(f) === '.js').map(f => readFileSync(f, 'utf8')).join('\n');
  for (const match of jsSource.matchAll(/\bT\(\s*(['"])([^'"]+)\1(?=\s*(?:,|\)))/g)) {
    if (!match[2].includes('.')) continue;
    if (!catalogue[match[2]]) fail(join(site, 'i18n.js'), `literal T() key is undefined: ${match[2]}`);
  }
  for (const match of jsSource.matchAll(/\bTn\(\s*(['"])([^'"]+)\1(?=\s*(?:,|\)))/g)) {
    for (const suffix of ['.one', '.other']) if (!catalogue[match[2] + suffix]) fail(join(site, 'i18n.js'), `literal Tn() key is undefined: ${match[2] + suffix}`);
  }
} catch (error) {
  fail(join(site, 'i18n.js'), `catalogue check failed: ${error.message}`);
}

const ogImage = readFileSync(join(site, 'og-image.jpg'));
if (!(ogImage[0] === 0xff && ogImage[1] === 0xd8 && ogImage[2] === 0xff)) fail(join(site, 'og-image.jpg'), 'file is not a JPEG');

if (errors.length) {
  console.error(`Site verification failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const dataBytes = walk(join(site, 'data')).reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Site verified: ${htmlFiles.length} HTML pages, ${canonicalUrls.size} canonicals, ${sitemapUrls.size} sitemap URLs, ${(dataBytes / 1024 / 1024).toFixed(2)} MiB of data.`);
