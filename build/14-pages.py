#!/usr/bin/env python3
"""Five pages in five languages, with German at the publication root.

The English files under site/ are the originals except for the landing page,
whose durable source is build/pages/index.en.html. The translated files are
derived from them here, so that a change to the English structure — a new
paragraph, a renamed id, a moved link — cannot leave the other four languages
behind: it reappears as an untranslated chunk and the build says so.

A chunk is the inner HTML of the outermost element that holds text and no block
inside it: a paragraph, a list item, a heading, a label, a cell. Inline markup
stays inside the chunk, because word order moves between languages and a
translation that could not carry a <b> to its noun would be a bad translation.
Chunks are spliced back by offset, never by search-and-replace, so a heading that
reads "Law" cannot rewrite the word law in a paragraph below it.

  python3 build/14-pages.py missing de [page ...]   what German still owes
  python3 build/14-pages.py build                   write the twenty files
                                                    and the sitemap
"""
import json, os, re, subprocess, sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(os.path.dirname(HERE), 'site')
TRANS = os.path.join(HERE, 'pages')
PAGES = ['index.html', 'about.html', 'method.html', 'law.html', 'sources.html']
LANGS = ['de', 'fr', 'it', 'rm']

# A chunk stops at any of these. Inline markup (b, i, em, a, code, sub, abbr, br)
# is not here, and so travels inside the chunk it belongs to.
BARRIER = {'html', 'head', 'body', 'p', 'ul', 'ol', 'li', 'div', 'section', 'article',
           'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd', 'table', 'thead',
           'tbody', 'tr', 'td', 'th', 'nav', 'header', 'footer', 'aside', 'figure',
           'figcaption', 'form', 'fieldset', 'main', 'blockquote', 'details',
           'summary', 'button', 'label', 'option', 'select', 'caption', 'title', 'dialog',
           'svg', 'script', 'style'}
OPAQUE = {'svg', 'script', 'style'}
VOID = {'meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'wbr', 'col', 'area'}
ATTRS = ('title', 'aria-label', 'alt', 'placeholder')
META = ('description', 'og:title', 'og:description', 'og:site_name', 'og:image:alt')

ENTITY = re.compile(r'&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);')
HAS_LETTER = re.compile(r'[A-Za-zÀ-ÿ]')


def wordy(s):
    """A chunk is worth translating only if something survives once the entities
    and the markup are taken out."""
    return bool(HAS_LETTER.search(ENTITY.sub(' ', re.sub(r'<[^>]*>', ' ', s))))


class Chunks(HTMLParser):
    def __init__(self, raw):
        super().__init__(convert_charrefs=False)
        self.raw = raw
        self.out = []      # (start, end, text) into raw
        self.stack = []    # [tag, inner_start, has_text, has_barrier, pending]
        self.opaque = 0
        self.lines = [0]
        for m in re.finditer('\n', raw):
            self.lines.append(m.end())
        self.feed(raw)
        while self.stack:
            f = self.stack.pop()
            self.flush(f[4])

    def pos(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def flush(self, pending):
        self.out.extend(pending)

    def mark_text(self):
        if self.stack:
            self.stack[-1][2] = True

    def handle_starttag(self, tag, attrs):
        if self.opaque:
            return
        tagtext = self.get_starttag_text() or ''
        base = self.pos()
        d = dict(attrs)
        wanted = list(ATTRS)
        if tag == 'meta' and (d.get('name') in META or d.get('property') in META):
            wanted.append('content')
        for a in wanted:
            m = re.search(r'\b%s="([^"]*)"' % re.escape(a), tagtext)
            if m and wordy(m.group(1)):
                self.out.append((base + m.start(1), base + m.end(1), m.group(1)))
        if tag in BARRIER and self.stack:
            self.stack[-1][3] = True
        if tag in OPAQUE:
            self.opaque += 1
            return
        if tag in VOID:
            return
        self.stack.append([tag, base + len(tagtext), False, False, []])

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in OPAQUE:
            self.opaque -= 1
        elif tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in OPAQUE:
            self.opaque = max(0, self.opaque - 1)
            return
        if self.opaque or tag in VOID:
            return
        if not any(f[0] == tag for f in self.stack):
            return                                   # a stray close tag
        while self.stack[-1][0] != tag:              # a tag the page never closed
            f = self.stack.pop()
            self.stack[-1][4].extend(f[4])
        name, start, has_text, has_barrier, pending = self.stack.pop()
        end = self.pos()
        me = (start, end, self.raw[start:end])
        parent = self.stack[-1] if self.stack else None
        if has_text and not has_barrier:
            # A candidate: it supersedes everything inside it.
            if parent:
                parent[4].append(me)
                parent[2] = True
            else:
                self.out.append(me)
        else:
            self.flush(pending)
            if parent and has_text:
                parent[2] = True

    def handle_data(self, data):
        if not self.opaque and data.strip():
            self.mark_text()

    def handle_entityref(self, name):
        if not self.opaque:
            self.mark_text()

    def handle_charref(self, name):
        if not self.opaque:
            self.mark_text()


def norm(s):
    """Chunks are keyed with their whitespace flattened, so that rewrapping a line
    in the English file does not orphan four translations."""
    return re.sub(r'\s+', ' ', s).strip()


def scan(raw):
    """[(start, end, key)] for every translatable chunk of a page, in order."""
    out = []
    for start, end, text in sorted(Chunks(raw).out):
        key = norm(text)
        if key and wordy(key):
            out.append((start, end, key))
    return out


def keys_of(page):
    raw = open(source_path(page), encoding='utf-8').read()
    seen, out = set(), []
    for _, _, k in scan(raw):
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def load(lang):
    p = os.path.join(TRANS, lang + '.json')
    table = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    additions = os.path.join(TRANS, 'updates.json')
    if os.path.exists(additions):
        for key, row in json.load(open(additions, encoding='utf-8')).items():
            if row.get(lang):
                table[key] = row[lang]
    return table


# --- the mechanical half ---------------------------------------------------
ASSETS = ('fonts.css', 'tokens.css', 'style.css', 'site.css', 'favicon.svg', 'i18n.js',
          'i18n-data.js', 'i18n-map.js', 'theme.js', 'fmt.js', 'gschg31.js',
          'legal-alerts.js', 'site.js', 'app.js')
BASE = 'https://opengovclimate.ch/riverflow/'


def source_path(page):
    """The English landing source is not itself a published root document: the
    root is German. The other English pages retain their stable root URLs."""
    return (os.path.join(TRANS, 'index.en.html') if page == 'index.html'
            else os.path.join(SITE, page))


def relocate(raw, lang, page):
    """Move a page one directory down and restate where it sits in the set."""
    tail = '' if page == 'index.html' else page
    raw = raw.replace('<html lang="en" data-root="./">',
                      '<html lang="%s" data-root="../">' % lang)
    for a in ASSETS:
        for attr in ('href', 'src'):
            raw = re.sub(r'%s="%s(\?[^"#]*)?"' % (attr, re.escape(a)),
                         lambda m: '%s="../%s%s"' % (attr, a, m.group(1) or ''), raw)
    if page == 'index.html':
        canonical = BASE if lang == 'de' else '%s%s/' % (BASE, lang)
        raw = raw.replace('<link rel="canonical" href="%s">' % BASE,
                          '<link rel="canonical" href="%s">' % canonical)
        raw = raw.replace('<meta property="og:url" content="%s">' % BASE,
                          '<meta property="og:url" content="%s">' % canonical)
        # English reading pages keep their stable root URLs, while the English
        # map now lives at /en/.
        if lang == 'en':
            for target in ('method.html', 'sources.html', 'law.html', 'about.html'):
                raw = raw.replace('href="%s' % target, 'href="../%s' % target)
        alts = [
            '<link rel="alternate" hreflang="en" href="%s">' % ('./' if lang == 'en' else '../en/'),
            '<link rel="alternate" hreflang="de" href="../">',
            '<link rel="alternate" hreflang="fr" href="%s">' % ('./' if lang == 'fr' else '../fr/'),
            '<link rel="alternate" hreflang="it" href="%s">' % ('./' if lang == 'it' else '../it/'),
            '<link rel="alternate" hreflang="rm" href="%s">' % ('./' if lang == 'rm' else '../rm/'),
            '<link rel="alternate" hreflang="x-default" href="../">',
        ]
    else:
        # The English reading pages live at the publication root while their map
        # lives at /en/. Translated reading pages and maps share a directory.
        # Keep the authored English links semantically correct, then localise the
        # two map destinations when a reading page moves under /de, /fr, /it or /rm.
        map_href = '../' if lang == 'de' else './'
        raw = raw.replace('href="en/"', 'href="%s"' % map_href)
        raw = raw.replace('<link rel="canonical" href="%s%s">' % (BASE, tail),
                          '<link rel="canonical" href="%s%s/%s">' % (BASE, lang, tail))
        raw = raw.replace('<meta property="og:url" content="%s%s">' % (BASE, tail),
                          '<meta property="og:url" content="%s%s/%s">' % (BASE, lang, tail))
        alts = ['<link rel="alternate" hreflang="en" href="../%s">' % tail]
        for L in LANGS:
            href = tail if L == lang else '../%s/%s' % (L, tail)
            alts.append('<link rel="alternate" hreflang="%s" href="%s">' % (L, href))
        alts.append('<link rel="alternate" hreflang="x-default" href="../%s">' % tail)
    old = re.search(r'<link rel="alternate" hreflang="en".*?hreflang="x-default"[^>]*>', raw, re.S)
    return raw[:old.start()] + '\n'.join(alts) + raw[old.end():]


def root_german(raw):
    """Publish the German map at / while keeping German reading pages in /de/."""
    raw = raw.replace('<html lang="de" data-root="../">',
                      '<html lang="de" data-root="./">')
    for asset in ASSETS:
        for attr in ('href', 'src'):
            raw = re.sub(r'%s="\.\./%s' % (attr, re.escape(asset)),
                         '%s="%s' % (attr, asset), raw)
    for target in ('method.html', 'sources.html', 'law.html', 'about.html'):
        raw = raw.replace('href="%s' % target, 'href="de/%s' % target)
    alts = [
        '<link rel="alternate" hreflang="en" href="en/">',
        '<link rel="alternate" hreflang="de" href="./">',
        '<link rel="alternate" hreflang="fr" href="fr/">',
        '<link rel="alternate" hreflang="it" href="it/">',
        '<link rel="alternate" hreflang="rm" href="rm/">',
        '<link rel="alternate" hreflang="x-default" href="./">',
    ]
    old = re.search(r'<link rel="alternate" hreflang="en".*?hreflang="x-default"[^>]*>', raw, re.S)
    return raw[:old.start()] + '\n'.join(alts) + raw[old.end():]


def lastmod(page):
    """The date the page's English source last changed. Taken from git, because a
    checkout's file times are the time of the checkout and would date every page
    to the day the site was deployed."""
    try:
        tracked = ('build/pages/index.en.html' if page == 'index.html' else 'site/' + page)
        d = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', tracked],
                           cwd=os.path.dirname(HERE), capture_output=True, text=True).stdout.strip()
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', d):
            return d
    except OSError:
        pass
    return None


def sitemap():
    """One entry per page per language, each declaring the whole set. A search
    engine that finds one knows the complete language set. German owns /; the
    English landing page owns /en/."""
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
            '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page in PAGES:
        tail = '' if page == 'index.html' else page
        where = ([('de', BASE), ('en', BASE + 'en/'),
                  ('fr', BASE + 'fr/'), ('it', BASE + 'it/'), ('rm', BASE + 'rm/')]
                 if page == 'index.html'
                 else [('en', BASE + tail)] + [(L, '%s%s/%s' % (BASE, L, tail)) for L in LANGS])
        when = lastmod(page)
        for _, url in where:
            rows.append('  <url>')
            rows.append('    <loc>%s</loc>' % url)
            if when:
                rows.append('    <lastmod>%s</lastmod>' % when)
            for L, alt in where:
                rows.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (L, alt))
            rows.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % where[0][1])
            rows.append('  </url>')
    rows.append('</urlset>')
    open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
    open(os.path.join(SITE, 'robots.txt'), 'w', encoding='utf-8').write(
        'User-agent: *\nAllow: /\nSitemap: %ssitemap.xml\n' % BASE)
    print('sitemap: %d urls' % (len(PAGES) * (len(LANGS) + 1)))


def build():
    owed = 0
    source_index = open(source_path('index.html'), encoding='utf-8').read()
    os.makedirs(os.path.join(SITE, 'en'), exist_ok=True)
    open(os.path.join(SITE, 'en', 'index.html'), 'w', encoding='utf-8').write(
        relocate(source_index, 'en', 'index.html'))
    for lang in LANGS:
        table = load(lang)
        os.makedirs(os.path.join(SITE, lang), exist_ok=True)
        for page in PAGES:
            raw = relocate(open(source_path(page), encoding='utf-8').read(), lang, page)
            todo, out = set(), raw
            for start, end, key in reversed(scan(raw)):
                if key in table and table[key]:
                    out = out[:start] + table[key] + out[end:]
                else:
                    todo.add(key)
            if todo:
                print('%s/%s: %d chunk(s) untranslated' % (lang, page, len(todo)))
                owed += len(todo)
            open(os.path.join(SITE, lang, page), 'w', encoding='utf-8').write(out)
        print('%s: five pages written' % lang)
    open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8').write(
        root_german(open(os.path.join(SITE, 'de', 'index.html'), encoding='utf-8').read()))
    sitemap()
    return 1 if owed else 0


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'missing':
        lang, pages = sys.argv[2], (sys.argv[3:] or PAGES)
        table, out = load(lang), {}
        for page in pages:
            for k in keys_of(page):
                if k not in table and k not in out:
                    out[k] = ''
        print(json.dumps(out, ensure_ascii=False, indent=1))
    elif cmd == 'count':
        for page in PAGES:
            ks = keys_of(page)
            print('%-14s %4d chunks %6d words' % (page, len(ks), sum(len(k.split()) for k in ks)))
    else:
        sys.exit(build())
