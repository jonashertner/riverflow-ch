/* The pages.
 *
 * One script for four documents. Everything below finds its own element or does
 * nothing, so method.html and law.html load exactly the same file as sources.html
 * and pay for nothing they do not show.
 *
 * The map's script and this one share fmt.js and gschg31.js, so a date is written
 * the same way and the statutory table is transcribed once.
 */

// ---- the contents rail ------------------------------------------------------
// The rail marks where the reader is. It is an observer rather than a scroll
// handler because the answer wanted is "which section is on the screen", and that
// is the question an intersection observer answers directly.
(function toc() {
  const rail = document.querySelector('.toc');
  if (!rail) return;
  const links = new Map();
  for (const a of rail.querySelectorAll('a[href^="#"]')) links.set(a.getAttribute('href').slice(1), a);
  const secs = [...links.keys()].map(id => document.getElementById(id)).filter(Boolean);
  if (!secs.length) return;
  const seen = new Set();
  const mark = () => {
    // The topmost section that is currently on screen wins. When none is (between
    // two long sections) the last one marked stays marked, which is what a reader
    // scrolling through the middle of a section expects to see.
    let best = null;
    for (const s of secs) if (seen.has(s.id)) { best = s.id; break; }
    if (!best) return;
    for (const [id, a] of links) a.setAttribute('aria-current', id === best ? 'true' : 'false');
  };
  const io = new IntersectionObserver(es => {
    for (const e of es) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
    mark();
  }, { rootMargin: '-80px 0px -55% 0px' });
  for (const s of secs) io.observe(s);
  // A rail that folds shut on a phone should not fold shut again on every tap.
  for (const a of links.values()) a.addEventListener('click', () => {
    const d = rail.closest('details');
    if (d && window.matchMedia('(max-width: 1079px)').matches) d.open = false;
  });
  // ...and having folded shut, it has to come back when the window widens. At
  // 1080 px the summary is display:none, because the rail is meant to be a
  // permanently open column there — so a rail left closed by a tap at phone width
  // would have neither list nor control, and no way back short of a reload.
  const wide = window.matchMedia('(min-width: 1080px)');
  const reopen = e => { const d = rail.closest('details'); if (d && e.matches) d.open = true; };
  wide.addEventListener('change', reopen);
  reopen(wide);
})();

// ---- Art. 31(1) GSchG, with the reader's own figure --------------------------
(function residualCalculator() {
  const q347 = document.getElementById('q347');
  const out = document.getElementById('q347out');
  if (!q347 || !out) return;
  const run = () => {
    const q = parseFloat(q347.value);
    const r = minResidual(q);
    if (r === null) {
      out.innerHTML = T('calc.zero');
      return;
    }
    out.innerHTML = T('calc.result', { r: nf(r, 1), m: nfd(r / 1000, 3), p: nf(100 * r / q) }) +
      (q > 60000 ? T('calc.ceiling') : '');
  };
  q347.addEventListener('input', run);
  run();
})();

// ---- the vintage spine ------------------------------------------------------
// Every source on one time axis, each drawn from its own data state to today. The
// table underneath says the same thing in words; the spine says it in lengths,
// which is the only form in which a nine-year-old register and a ten-minute-old
// reading can be compared at a glance.
const LEGEND = l => `https://api3.geo.admin.ch/rest/services/all/MapServer/${l}/legend?lang=de`;

// The build reads these same endpoints, and the file it writes is the floor: it
// paints at once and it is what the page shows when the geoportal cannot be
// reached. But that file was written on build day, and a Datenstand moves when the
// register moves, not when this site rebuilds. So every layer that publishes a
// legend is read again here, in the reader's own browser, and a date that has
// moved is corrected on the screen.
//
// The distinction the build makes holds here too: 404 is an answer — the layer
// publishes no legend and never will — and anything else is a silence. A silence
// leaves the baked date standing, and the line under the table says how many dates
// were confirmed just now and how many still stand as the build left them, rather
// than presenting a week-old file as a reading taken this minute.
async function readState(layer) {
  const r = await fetch(LEGEND(layer));
  if (r.status === 404 || r.status === 410) return { reached: true, iso: null };
  if (!r.ok) return { reached: false, iso: null };
  const txt = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  const m = /Datenstand\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(txt);
  return { reached: true, iso: m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null };
}

async function drawSpine() {
  const spineEl = document.getElementById('spine');
  const tableEl = document.getElementById('sourceTable');
  if (!spineEl && !tableEl) return;
  let v;
  try {
    v = await readJSON(ROOT + 'data/vintage.json');
  } catch (e) {
    if (spineEl) spineEl.textContent = T('src.loadFail', { e: e.message });
    return;
  }
  // What each source is, who holds it, how often it moves and what it licences:
  // the words the build wrote into the file. They are translated once here, so the
  // spine and the table below it cannot disagree about a name.
  for (const s of v.sources) {
    s.name = D(s.name); s.holder = D(s.holder); s.cadence = D(s.cadence);
    s.cls = D(s.cls); s.note = D(s.note); s.licence = D(s.licence);
    for (const link of s.links ?? []) link.label = D(link.label);
  }
  const day = 86400000;

  // Five years — the rule build/08-vintage.mjs applies, and the rule the page states
  // in words under the table. It is recomputed here rather than taken from
  // v.staleKeys, because staleKeys was decided on the build's clock against the
  // build's dates. Once this function began ageing sources to the reader's clock and
  // the live read began correcting the dates themselves, a marking frozen at build
  // time would put a red bar beside an age that no longer earns one — and the count
  // in the sentence below, which is recomputed, would contradict the colour above it.
  const STALE_DAYS = 365 * 5;

  // The file was written on the day of the build and is read on some later day, so
  // an age is counted from the source's own data state to the reader's own clock
  // and not to the build's. A spine that aged everything to the build date would be
  // a week short by the end of a weekly cycle — on a page whose whole claim is that
  // every figure carries its age.
  const paint = live => {
    const now = Date.now();
    for (const s of v.sources) {
      s.ageDays = s.datenstand ? Math.floor((now - Date.parse(s.datenstand)) / day) : null;
    }
    const rows = v.sources.slice().sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
    const dated = rows.filter(s => s.datenstand);
    const t0 = Date.UTC(new Date(Math.min(...dated.map(s => Date.parse(s.datenstand)))).getUTCFullYear(), 0, 1);
    const span = Math.max(day, now - t0);
    const at = t => 100 * (t - t0) / span;

    if (spineEl) {
      const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(now).getUTCFullYear();
      const ticks = [];
      for (let y = y0; y <= y1; y += 5) {
        ticks.push(`<span style="left:${at(Date.UTC(y, 0, 1)).toFixed(2)}%">${y}</span>` +
                   `<i style="left:${at(Date.UTC(y, 0, 1)).toFixed(2)}%"></i>`);
      }
      const axis = `<div class="spineAxis" aria-hidden="true">${ticks.join('')}</div>`;
      const list = rows.map(s => {
        const cls = s.live ? 'isLive' : (s.ageDays ?? -1) > STALE_DAYS ? 'isStale' : '';
        const a = s.live ? 99.4 : s.datenstand ? at(Date.parse(s.datenstand)) : null;
        const bar = a === null
          ? `<span class="spineTrack" title="${T('src.noState')}"></span>`
          : `<span class="spineTrack"><i style="--a:${a.toFixed(2)}%;--b:0%"></i></span>`;
        const age = s.live ? T('src.live') : s.datenstand ? ageText(s.ageDays) : T('src.notStated');
        return `<li class="spineRow ${cls}">
          <span class="spineName"><b>${esc(s.name)}</b><br>${esc(s.holder)}</span>
          ${bar}
          <span class="spineAge">${age}</span>
        </li>`;
      }).join('');
      spineEl.innerHTML = axis + `<ol class="spine">${list}</ol>`;
    }

    if (tableEl) {
      tableEl.innerHTML = `<table>
        <thead><tr>
          <th scope="col">${T('src.thSource')}</th><th scope="col">${T('src.thClass')}</th>
          <th scope="col">${T('src.thState')}</th><th scope="col">${T('src.thAge')}</th>
        </tr></thead>
        <tbody>${rows.map(s => {
          const links = (s.links?.length ? s.links : [{ label: T('src.linkSource'), url: s.url }])
            .filter(link => link?.url)
            .map(link => `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`)
            .join(' · ');
          return `<tr>
          <td><b>${esc(s.name)}</b><br>${esc(s.holder)} · ${esc(s.cadence)}${
            links ? ` · ${links}` : ''}
            <br><span class="fine">${esc(s.note)} ${T('src.licence', { l: esc(s.licence ?? T('src.seeSource')) })}</span></td>
          <td>${esc(s.cls)}</td>
          <td class="n">${s.datenstand ? fmtDate(s.datenstand) : s.live ? T('src.readLive') : T('src.notStated')}</td>
          <td class="n">${s.live ? T('src.live') : s.datenstand ? ageText(s.ageDays) : '—'}</td>
        </tr>`;
        }).join('')}</tbody></table>`;
    }

    const built = document.getElementById('vintageBuilt');
    if (built) {
      const n = rows.filter(s => (s.ageDays ?? 0) > STALE_DAYS).length;
      const vars = { d: fmtDate(v.built), n, total: rows.length, ...live };
      built.innerHTML = T(!live ? 'src.built'
        : live.r === live.layers ? 'src.builtLive' : 'src.builtPart', vars);
    }
  };

  paint(null);                       // the baked floor, on the screen at once

  // Then the geoportal, in parallel: fourteen small responses, none of which the
  // page waits for before it is usable.
  //
  // A read only ever counts as a confirmation when it carries a date, or when it
  // carries none for a layer that had none baked either — the base rasters publish
  // no legend, and the page already says so. A layer that used to state a
  // Datenstand and now states none is the one case that is not a confirmation: an
  // empty legend and a renamed layer are the same 404 from here, and the baked date
  // was verified against the source once. So it stands, and it is reported as
  // standing rather than quietly replaced by "not stated".
  const layered = v.sources.filter(s => s.layer);
  const got = await Promise.all(layered.map(s =>
    readState(s.layer).catch(() => ({ reached: false, iso: null }))));
  let r = 0;
  got.forEach((g, i) => {
    const s = layered[i];
    if (!g.reached) return;
    if (g.iso) { s.datenstand = g.iso; r++; }
    else if (!s.datenstand) r++;
  });
  if (r) paint({ r, layers: layered.length });
}
drawSpine();

// ---- the twenty-six deliveries ----------------------------------------------
// The drinking-water protection zones have no federal layer and therefore no
// single data state: they are twenty-six cantonal deliveries aggregated into one
// national service, and the picture is as old as its oldest contributor. Which
// canton that is, is not on the picture. It is here.
async function drawCantons() {
  const el = document.getElementById('cantonStrip');
  if (!el) return;
  let c;
  try {
    c = await readJSON(ROOT + 'data/cantons.json');
  } catch (e) { el.textContent = T('ct.loadFail', { e: e.message }); return; }
  const cut = Date.parse(c.newest) - 3 * 365.25 * 86400000;
  el.innerHTML = `<ul class="strip">${c.cantons.map(ct => {
    const old = ct.updated && Date.parse(ct.updated) < cut;
    return `<li class="${old ? 'old' : ''}"><b>${esc(ct.ct)}</b> ${ct.updated ? fmtDate(ct.updated) : '—'}</li>`;
  }).join('')}</ul>` +
  `<p class="fine">${T('ct.note', {
    d: fmtDate(c.built), covered: c.covered, free: c.free,
    oldCt: esc(c.oldestCt), old: fmtDate(c.oldest), new: fmtDate(c.newest),
  })}</p>`;
}
drawCantons();

// ---- what the cantons publicly show that they measure ----------------------
// This is deliberately an evidence table, not a scorecard. Art. 58 GSchG asks
// for the surveys required for implementation; it does not supply one national
// station/parameter/frequency checklist against which a coloured "compliant"
// badge could honestly be computed. The table therefore says exactly what was
// found and links the primary record. NAWA counts come from the same release as
// the quality map, which makes the important zero in AR reproducible.
async function drawMonitoringAudit() {
  const el = document.getElementById('monitoringAudit');
  if (!el) return;
  let audit;
  try {
    audit = await readJSON(ROOT + 'data/canton-monitoring.json');
  } catch (e) {
    el.textContent = T('audit.loadFail', { e: e.message });
    return;
  }
  const scope = key => T('audit.scope.' + key);
  const record = row => T(`audit.record.${row.record}${row.year ? '.year' : ''}`, { y: row.year });
  el.innerHTML = `<div class="tWrap"><table class="auditTable">
    <thead><tr>
      <th scope="col">${T('audit.thCanton')}</th>
      <th scope="col">${T('audit.thNawa')}</th>
      <th scope="col">${T('audit.thEvidence')}</th>
      <th scope="col">${T('audit.thScope')}</th>
    </tr></thead>
    <tbody>${audit.cantons.map(row => `<tr>
      <td><b>${esc(row.ct)}</b><br><span class="fine">${esc(row.name)}</span></td>
      <td class="n">${nf(row.nawaStations)}${row.nawaStations ? '' : `<br><span class="auditZero">${T('audit.zero')}</span>`}</td>
      <td><span class="auditStatus ${esc(row.record)}">${record(row)}</span><br>
        <a href="${esc(row.url)}" target="_blank" rel="noopener">${T('audit.official')}</a></td>
      <td><span class="auditScopes">${row.scope.map(s => `<span>${scope(s)}</span>`).join('')}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>
  <p class="fine auditNote">${T('audit.note', {
    version: esc(audit.meta.nationalVersion),
    stations: nf(audit.meta.nationalStations),
    covered: nf(audit.meta.cantonsWithNationalStations),
    checked: fmtDate(audit.meta.checked),
  })}</p>`;
}
drawMonitoringAudit();

// ---- the date the reader is reading on --------------------------------------
// A citation of a live map has to carry the day it was read, so the day is filled
// in rather than typed.
const today = new Date();
const pad = n => String(n).padStart(2, '0');
for (const el of document.querySelectorAll('[data-today]')) {
  el.textContent = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()}`;
}
for (const el of document.querySelectorAll('[data-year]')) el.textContent = today.getFullYear();

// ---- where Swiss water goes -------------------------------------------------
// Three figures from one small file that the build derives rather than quotes: the
// share of the country draining to each sea, the gauge that stands where the water
// leaves, and the ice in each basin's headwater in 1850 and now. The live reading is
// added on top from the same federal endpoint the map reads, so the four numbers at
// the frontier are the water leaving the country while the page is open.
async function drawBasins() {
  const figEl = document.getElementById('basinFig');
  const tabEl = document.getElementById('basinTable');
  const iceEl = document.getElementById('basinIce');
  const derEl = document.getElementById('basinDerive');
  if (!figEl && !tabEl && !iceEl && !derEl) return;
  let b;
  try {
    b = await readJSON(ROOT + 'data/basins.json');
  } catch (e) {
    if (figEl) figEl.textContent = T('bs.loadFail', { e: e.message });
    return;
  }
  const seas = b.seas;                       // already sorted largest first
  for (const s of seas) {
    s.sea = D(s.sea); s.via = D(s.via); s.states = D(s.states);
    if (s.down) { s.down.place = D(s.down.place); s.down.src = D(s.down.src); }
  }
  const n1 = x => nf(x, 1);

  // How many states share a basin with Switzerland is counted from the four lists
  // rather than typed into the prose, so the sentence cannot drift from the table
  // under it. Italy appears twice, once downstream and once as a sliver of the
  // Rhine's own catchment, and is counted once.
  const states = new Set(seas.flatMap(s => s.states.split(/,\s*/)).map(x => x.replace(/^the /, '')));
  for (const el of document.querySelectorAll('[data-basin-states]')) el.textContent = numWord(states.size);
  for (const el of document.querySelectorAll('[data-basin-sum]')) {
    el.textContent = nfd(seas.reduce((a, s) => a + s.pct, 0), 2);
  }
  for (const el of document.querySelectorAll('[data-bafu-sum]')) el.textContent = nfd(b.bafuSum, 1);

  const pctText = p => nf(p, p < 10 ? 2 : 1) + '&#8201;%';

  if (figEl) {
    // The smallest segment is four per cent of the width, which at 360 pixels is
    // fourteen of them: too narrow to hold its own label at any type size. So no
    // label goes inside or under the band. The key below carries every name and
    // number, in the band's own order and the band's own colours, and it wraps.
    const row = (cls, cell) => `<div class="bRow ${cls}">${
      seas.map((s, i) => cell(s, i)).join('')}</div>`;
    figEl.innerHTML =
      row('bBand', (s, i) => `<span class="s${i + 1}" style="flex:${s.pct}" title="${esc(s.sea)} ${pctText(s.pct)}"></span>`) +
      row('bFront', s => `<span style="flex:${s.pct}" class="${s.measuresExport ? '' : 'unmeasured'}"></span>`) +
      `<ul class="bKey">${seas.map((s, i) => `<li>
        <i class="s${i + 1}"></i><b>${esc(s.sea)}</b>
        <em class="${s.measuresExport ? '' : 'unmeasured'}">${T(s.measuresExport ? 'bs.gauged' : 'bs.ungauged')}</em>
        <span>${pctText(s.pct)}</span></li>`).join('')}</ul>`;
  }

  if (tabEl) {
    tabEl.innerHTML = `<table>
      <thead><tr>
        <th scope="col">${T('bs.thReaches')}</th><th scope="col">${T('bs.thShare')}</th>
        <th scope="col">${T('bs.thGauge')}</th><th scope="col">${T('bs.thMean')}</th>
        <th scope="col">${T('bs.thNow')}</th>
      </tr></thead>
      <tbody>${seas.map(s => `<tr>
        <td><b>${esc(s.sea)}</b>, ${T('bs.via', { via: esc(s.via) })}
          <br><span class="fine">${T('bs.through', { states: esc(s.states) })}</span></td>
        <td class="n">${pctText(s.pct)}<br><span class="fine">${nf(s.km2)} km&#178;</span></td>
        <td>${s.gauge ? `<b>${esc(s.gauge.name)}</b> <span class="fine">(${esc(s.gauge.id)})</span>
              <br><span class="fine">${T('bs.kmFromBorder', { km: nfd(s.gauge.borderKm, 1) })}${
                s.measuresExport ? '' : T('bs.notAtFrontier')}</span>` : '&mdash;'}</td>
        <td class="n">${s.gauge ? n1(s.gauge.meanQ) + ' m&#179;/s' : '&mdash;'}</td>
        <td class="n"><span class="liveQ pending" data-live="${esc(s.gauge ? s.gauge.id : '')}">${T('bs.reading')}</span></td>
      </tr>`).join('')}</tbody></table>
      <p class="fine" id="basinLive">${T('bs.meanNote')}</p>`;
  }

  if (derEl) {
    const r = seas.find(s => s.key === 'north');
    if (r && r.down && r.gauge) {
      const share = 100 * r.gauge.meanQ / r.down.meanQ;
      derEl.innerHTML = `<div class="derive">
        <b>${n1(r.gauge.meanQ)}</b> m&#179;/s&ensp;${T('bs.derLast', { name: esc(r.gauge.name) })}<br>
        <b>${n1(r.down.meanQ)}</b> m&#179;/s&ensp;${T('bs.derDown', { place: esc(r.down.place) })}<br>
        &ensp;&rarr;&ensp;<span class="res">${nf(share)}&#8201;%</span> ${T('bs.derShare')}<br>
        <br>
        <b>${nf(r.km2)}</b> km&#178;&ensp;${T('bs.derArea')}<br>
        <b>~${nf(200000)}</b> km&#178;&ensp;${T('bs.derBasin')}
        <br>&ensp;&rarr;&ensp;<span class="res">~${nf(100 * r.km2 / 200000)}&#8201;%</span> ${T('bs.derPct')}
        <cite>${T('bs.derCite', { id: esc(r.gauge.id), src: esc(r.down.src) })}</cite>
      </div>`;
    }
  }

  if (iceEl) {
    const max = Math.max(...seas.map(s => s.iceKm2_1850));
    const rows = seas.slice().sort((a, c) => c.iceKm2_1850 - a.iceKm2_1850);
    iceEl.innerHTML = `<ol class="ice">${rows.map(s => {
      const loss = s.iceKm2_1850 ? 100 * (1 - s.iceKm2 / s.iceKm2_1850) : 0;
      return `<li class="iceRow">
        <span class="iceName"><b>${esc(s.sea)}</b><br>${n1(s.iceKm2_1850)} &rarr; ${n1(s.iceKm2)} km&#178;</span>
        <span class="iceTrack">
          <i style="width:${(100 * s.iceKm2_1850 / max).toFixed(2)}%" title="${T('bs.icePast', { v: n1(s.iceKm2_1850) })}"></i>
          <u style="width:${(100 * s.iceKm2 / max).toFixed(2)}%" title="${T('bs.iceNow', { v: n1(s.iceKm2) })}"></u>
        </span>
        <span class="iceLoss">&minus;${nf(loss)}&#8201;%</span>
      </li>`;
    }).join('')}</ol>
    <p class="fine">${T('bs.iceNote', {
      now: n1(b.ice.now.km2), pastSum: n1(b.ice.pastSum), past: n1(b.ice.past.km2),
      excess: nfd((b.ice.pastSum / b.ice.past.km2 - 1) * 100, 1),
    })}</p>`;
  }

  // ---- the water leaving the country while you read this --------------------
  const cells = [...document.querySelectorAll('[data-live]')].filter(el => el.dataset.live);
  if (!cells.length) return;
  const ids = [...new Set(cells.map(el => el.dataset.live))];
  const byId = new Map();
  for (const s of seas) if (s.gauge) byId.set(s.gauge.id, s.gauge);
  const q = `PREFIX schema: <http://schema.org/>
PREFIX h: <https://environment.ld.admin.ch/foen/hydro/dimension/>
PREFIX st: <https://environment.ld.admin.ch/foen/hydro/station/>
SELECT ?id ?time ?discharge
FROM <https://lindas.admin.ch/foen/hydro>
WHERE {
  VALUES ?st { ${ids.map(i => 'st:' + i).join(' ')} }
  ?st schema:identifier ?id .
  ?obs h:station ?st ; h:measurementTime ?time .
  OPTIONAL { ?obs h:discharge ?discharge }
}`;
  try {
    const r = await fetch('https://lindas.admin.ch/query', {
      method: 'POST',
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: q }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const obs = new Map();
    let newest = null;
    for (const row of (await r.json()).results.bindings) {
      if (!row.discharge) continue;
      obs.set(row.id.value, +row.discharge.value);
      if (!newest || row.time.value > newest) newest = row.time.value;
    }
    for (const el of cells) {
      const g = byId.get(el.dataset.live);
      const v = obs.get(el.dataset.live);
      if (v === undefined || !g) { el.textContent = T('bs.noReading'); continue; }
      // The factor comes from the gauge's own plot axis, resolved at build time,
      // because the cube states no usable unit.
      const qq = v * (g.factor ?? 1);
      el.classList.remove('pending');
      el.innerHTML = `${n1(qq)} m&#179;/s<br><span class="fine">${T('bs.xModelled', { r: nfd(qq / g.meanQ, 2) })}</span>`;
    }
    const note = document.getElementById('basinLive');
    if (note && newest) {
      // fmtDate takes a date, and this is a timestamp; the day and the clock are
      // written separately so neither is guessed from the other's string.
      const d = new Date(newest);
      note.innerHTML = T('bs.liveNote', {
        d: fmtDate(newest.slice(0, 10)),
        time: fmtClock(d),
      });
    }
  } catch (e) {
    for (const el of cells) el.textContent = T('bs.readFailed');
    const note = document.getElementById('basinLive');
    if (note) note.innerHTML = T('bs.liveFail', { e: esc(e.message) });
  }
}
drawBasins();
