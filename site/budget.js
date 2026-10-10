/* The water budget page.
 *
 * Two files, two clocks. budget.json is the national balance BAFU publishes once a
 * year, with the stores and uses that are not in it; conditions.json is where the
 * same budget stands in the latest complete week and month, from the federal
 * drought platform. Every figure below is read from one of them, and every
 * sentence that carries a figure names the period it describes.
 *
 * Nothing here adds unlike things together. The stores are drawn on one axis so
 * that their sizes can be compared, but no total is printed, because the sources
 * count the border lakes differently and the reservoir figure is a register of
 * capacity, not of water.
 *
 * The charts are SVG drawn at the width they are given and redrawn when it
 * changes, so text is never stretched. Every mark that carries a number has a
 * hover reading, and every chart has a table with the same numbers.
 */
(async function drawBudget() {
  const $ = id => document.getElementById(id);
  if (!$('nowTiles')) return;

  let b, c;
  try {
    [b, c] = await Promise.all([readJSON(ROOT + 'data/budget.json'), readJSON(ROOT + 'data/conditions.json')]);
  } catch (e) {
    $('budgetDateline').textContent = T('bg.loadFail', { e: e.message });
    return;
  }

  const pct = v => nf(v) + '&#8239;%';
  const km3 = v => nfd(v, 1) + '&#8239;km&#179;';
  const mm = v => nf(v) + '&#8239;mm';
  const signed = (v, f) => (v > 0 ? '+' : v < 0 ? '&#8722;' : '') + f(Math.abs(v));
  const sum = xs => xs.reduce((a, x) => a + x, 0);
  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Month names come from the browser's own calendar data, which has no Romansh.
  const RM_MONTHS = ['schaner', 'favrer', 'mars', 'avrigl', 'matg', 'zercladur', 'fanadur',
    'avust', 'settember', 'october', 'november', 'december'];
  const DATE_LOCALE = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', it: 'it-CH' }[LANG] ?? 'de-CH';
  const month = (ym, short) => {
    const [y, m] = ym.split('-').map(Number);
    if (LANG === 'rm') return short ? RM_MONTHS[m - 1].slice(0, 3) : `${RM_MONTHS[m - 1]} ${y}`;
    return new Intl.DateTimeFormat(DATE_LOCALE, short ? { month: 'short' } : { month: 'long', year: 'numeric' })
      .format(new Date(Date.UTC(y, m - 1, 15)));
  };

  // ---- hover readings: one tooltip for the page, filled from a table of strings
  // so that no markup has to survive an attribute.
  const tips = [], tipIndex = new Map();
  const tip = html => {
    if (!tipIndex.has(html)) tipIndex.set(html, tips.push(html) - 1);
    return `data-tip="${tipIndex.get(html)}"`;
  };
  const tipEl = document.createElement('div');
  tipEl.className = 'bTip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.hidden = true;
  document.body.append(tipEl);
  let tipOn = null;
  function showTip(e) {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { hideTip(); return; }
    if (t !== tipOn) {
      tipOn?.classList.remove('on');
      tipOn = t; t.classList.add('on');
      tipEl.innerHTML = tips[t.dataset.tip];
      tipEl.hidden = false;
    }
    const r = tipEl.getBoundingClientRect(), pad = 14;
    let x = e.clientX + pad, y = e.clientY - r.height - pad;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
    if (x < 8) x = 8;
    if (y < 8) y = e.clientY + pad;
    tipEl.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function hideTip() { tipOn?.classList.remove('on'); tipOn = null; tipEl.hidden = true; }
  const main = $('main');
  main.addEventListener('pointermove', showTip);
  main.addEventListener('pointerdown', showTip);
  main.addEventListener('pointerleave', hideTip);
  addEventListener('scroll', hideTip, { passive: true });

  // Draw an SVG at the element's own width, and again whenever that width changes.
  function responsive(el, draw) {
    let w = 0;
    const run = () => {
      const nw = Math.round(el.clientWidth);
      if (nw && nw !== w) { w = nw; draw(w); }
    };
    new ResizeObserver(run).observe(el);
    run();
    return () => { w = 0; run(); };
  }
  const svg = (w, h, label, body) =>
    `<svg class="bSvg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  const f1 = v => Math.round(v * 10) / 10;
  // Time-axis labels: the last is always printed, flush right; the others only where
  // they clear their neighbours, judged by the width of the monospace text.
  const timeAxis = (cands, y) => {
    const wOf = t => t.length * 6.5, last = cands.at(-1), stop = last.x - wOf(last.t) - 10;
    let right = -Infinity, out = '';
    for (const c of cands.slice(0, -1)) {
      if (c.x < right + 10 || c.x + wOf(c.t) > stop) continue;
      out += `<text class="tick" x="${f1(c.x)}" y="${y}">${c.t}</text>`;
      right = c.x + wOf(c.t);
    }
    return out + `<text class="tick" x="${f1(last.x)}" y="${y}" text-anchor="end">${last.t}</text>`;
  };

  // ---- dateline
  const nat = b.national, Y = String(b.year), N = '1991-2020';
  // BAFU stamps its table in German, "Bundesamt für Umwelt, September 2025".
  const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];
  const stampRaw = b.meta.source.stamp.replace(/^Bundesamt für Umwelt,?\s*/, '');
  const stampM = /^(\S+)\s+(\d{4})$/.exec(stampRaw), stampI = stampM ? DE_MONTHS.indexOf(stampM[1]) : -1;
  $('budgetDateline').innerHTML = T('bg.dateline', {
    y: Y, stamp: stampI >= 0 ? month(`${stampM[2]}-${String(stampI + 1).padStart(2, '0')}`) : esc(stampRaw),
    upd: fmtDate(c.meta.updated), m: month(c.meta.lastMonth),
  });

  // ---- now: one tile per store or flow, each with its own period and a small
  // picture of the same number: a bar against its reference, or one square per site.
  const o = c.outflow, om = o.months.at(-1);
  const res = b.stocks.find(s => s.key === 'reservoirs');
  const ice = b.stocks.find(s => s.key === 'glaciers');
  const dr = c.drought;
  const dry = dr.levels[3] + dr.levels[4];
  const STATE = { low: 'lo', normal: 'no', high: 'hi' };
  const ORDER = { low: 0, normal: 1, high: 2 };
  // The platform's 'depth' series are groundwater levels in metres above sea level.
  const UNIT = { depth: 'bg.unit.masl', discharge_lmin: 'bg.unit.lmin', discharge_ms: 'bg.unit.ms', masl: 'bg.unit.masl' };
  const DIGITS = { depth: 2, discharge_lmin: 0, discharge_ms: 2, masl: 2 };
  const siteTip = (s, m) => `<b>${esc(s.name)}</b><span>${T('bg.kind.' + s.kind)} &middot; ${T('bg.s.' + s.state)}</span>
    <span>${T('bg.tipSite', {
      m: month(m), v: nfd(s.v, DIGITS[s.unit] ?? 1), u: T(UNIT[s.unit] ?? s.unit),
      a: nfd(Math.min(s.p20, s.p80), DIGITS[s.unit] ?? 1), z: nfd(Math.max(s.p20, s.p80), DIGITS[s.unit] ?? 1), y: s.years,
    })}</span>`;
  const sortSites = xs => xs.slice().sort((p, q) => ORDER[p.state] - ORDER[q.state] || p.name.localeCompare(q.name));
  // Square grids are laid out in even rows, so 45 sites are three rows of 15, not 22, 22 and 1.
  const cols = n => `style="--cols:${Math.ceil(n / Math.ceil(n / 20))}"`;
  const siteDots = (set, cls = '') => `<span class="bDots ${cls}" ${cols(set.stations.length)}>${sortSites(set.stations).map(s =>
    `<i class="${STATE[s.state]}" ${tip(siteTip(s, set.month))}></i>`).join('')}</span>`;
  // Regions at levels 1 and 2 are counted by the platform but not named in its summary.
  const named = new Map(dr.driest.map(r => [r.cdi, []]));
  for (const r of dr.driest) named.get(r.cdi).push(r.name);
  const regionDots = `<span class="bDots" ${cols(dr.regions)}>${[5, 4, 3, 2, 1].flatMap(l => {
    const names = named.get(l) ?? [];
    return Array.from({ length: dr.levels[l - 1] }, (_, i) =>
      `<i class="cdi${l}" ${tip(`<b>${names[i] ? esc(names[i]) : T('bg.cdi' + l)}</b><span>${names[i] ? T('bg.cdi' + l) : ''}</span>`)}></i>`);
  }).join('')}</span>`;
  const meter = (v, max, ref, cls) => `<span class="bMeter ${cls}"><i style="width:${Math.min(100, 100 * v / max)}%"></i>${
    ref != null ? `<b style="left:${100 * ref / max}%"></b>` : ''}</span>`;
  const tiles = [
    { big: pct(om.pct), label: T('bg.tOut'), sub: T('bg.tOutSub', { m: month(om.m), q: nf(om.q), n: nf(om.norm) }),
      pic: meter(om.pct, Math.max(150, om.pct), 100, om.pct < 100 ? 'below' : 'above') },
    { big: `${c.groundwater.low}<small>/${c.groundwater.n}</small>`, label: T('bg.tGw'),
      sub: T('bg.tGwSub', { m: month(c.groundwater.month), high: c.groundwater.high }), pic: siteDots(c.groundwater) },
    { big: `${c.lakes.low}<small>/${c.lakes.n}</small>`, label: T('bg.tLake'),
      sub: T('bg.tLakeSub', { m: month(c.lakes.month), high: c.lakes.high }), pic: siteDots(c.lakes) },
    { big: `${dry}<small>/${dr.regions}</small>`, label: T('bg.tDry'),
      sub: T('bg.tDrySub', { d: fmtDate(dr.week), soil: dr.soilMedian ?? '&mdash;' }), pic: regionDots },
    { big: pct(res.fill.pct), label: T('bg.tRes'),
      sub: T('bg.tResSub', { d: fmtDate(res.fill.d), rank: esc(D(res.fill.rank)) }), pic: meter(res.fill.pct, 100, null, 'store') },
    { big: '&#8722;' + nfd(ice.lossLastPct, 1) + '&#8239;%', label: T('bg.tIce', { y: ice.lossYear }),
      sub: T('bg.tIceSub', { loss: nfd(ice.lossLast, 1), left: nfd(ice.km3, 1) }),
      pic: meter(ice.km3, ice.km3In2000, null, 'ice') },
  ];
  $('nowTiles').innerHTML = tiles.map(t => `<div class="bTile">
      <p class="bBig">${t.big}</p>${t.pic}<p class="bLabel">${t.label}</p><p class="bSub">${t.sub}</p></div>`).join('');

  // ---- outflow: 24 months as a share of the same month's mean, drawn from the
  // mean line, so a bar's length is the departure and its side is the sign.
  const outTip = r => `<b>${month(r.m)}</b><span>${T('bg.tipShare', { p: pct(r.pct) })}</span>
    <span>${esc(o.gauges[0].name)}: ${nf(r.byGauge[0])}&#8239;m&#179;/s</span>
    <span>${esc(o.gauges[1].name)}: ${nf(r.byGauge[1])}&#8239;m&#179;/s</span>
    <span>${T('bg.tipMean', { n: nf(r.norm) })}</span>`;
  responsive($('outflowChart'), W => {
    const H = W < 480 ? 190 : 230, top = Math.ceil(Math.max(160, ...o.months.map(r => r.pct)) / 10) * 10;
    const pT = 14, pB = 24, pR = 44, pw = W - pR, n = o.months.length, step = pw / n;
    const y = v => pT + (1 - v / top) * (H - pT - pB);
    let g = '';
    for (const v of [50, 100, 150]) {
      if (v > top) continue;
      g += `<line class="${v === 100 ? 'ref' : 'grid'}" x1="0" x2="${pw}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>
        <text class="tick" x="${W}" y="${f1(y(v) + 4)}" text-anchor="end">${nf(v)}&#8239;%</text>`;
    }
    const y0 = y(100), cands = [];
    o.months.forEach((r, i) => {
      const y1 = y(r.pct), x = i * step + 1, w = Math.max(1, step - 2);
      g += `<rect class="${r.pct < 100 ? 'below' : 'above'}" x="${f1(x)}" y="${f1(Math.min(y0, y1))}" width="${f1(w)}" height="${f1(Math.max(1.5, Math.abs(y1 - y0)))}" rx="${Math.min(2, w / 3)}"/>`;
      if (i % 3 === 0 || i === n - 1) cands.push({ x: i === n - 1 ? x + w : x,
        t: month(r.m, true) + (r.m.endsWith('-01') || i === 0 ? ' ' + r.m.slice(2, 4) : '') });
    });
    g += timeAxis(cands, H - 6);
    const last = o.months.at(-1), ly = y(last.pct);
    g += `<text class="direct" x="${f1(pw - step / 2)}" y="${f1(last.pct < 100 ? ly + 14 : ly - 6)}" text-anchor="middle">${pct(last.pct)}</text>`;
    g += o.months.map((r, i) => `<rect class="hit" x="${f1(i * step)}" y="${pT}" width="${f1(step)}" height="${H - pT - pB}" ${tip(outTip(r))}/>`).join('');
    $('outflowChart').innerHTML = svg(W, H, T('bg.outAria', { from: month(o.months[0].m), to: month(om.m) }), g);
  });
  $('outflowAfter').innerHTML = `
    <ul class="bKey"><li><i class="below"></i>${T('bg.keyBelow')}</li><li><i class="above"></i>${T('bg.keyAbove')}</li>
      <li><i class="refKey"></i>${T('bg.meanLine')}</li></ul>
    <p class="fine">${T('bg.outNote', { from: month(o.last12.from), to: month(o.last12.to),
      v: nfd(o.last12.km3, 1), n: nfd(o.last12.normKm3, 1), p: o.last12.pct })}</p>
    <details class="bData"><summary>${T('bg.showNumbers')}</summary><div class="tWrap"><table>
      <thead><tr><th scope="col">${T('bg.thMonth')}</th><th scope="col">${esc(o.gauges[0].name)}</th>
        <th scope="col">${esc(o.gauges[1].name)}</th><th scope="col">${T('bg.thMeanMonth')}</th><th scope="col">${T('bg.thShare')}</th></tr></thead>
      <tbody>${o.months.slice().reverse().map(r => `<tr><td>${month(r.m)}</td><td class="n">${nf(r.byGauge[0])} m&#179;/s</td>
        <td class="n">${nf(r.byGauge[1])} m&#179;/s</td><td class="n">${nf(r.norm)} m&#179;/s</td><td class="n">${pct(r.pct)}</td></tr>`).join('')}</tbody>
    </table></div></details>`;

  // ---- drought: a year of weeks, each column the 38 regions sorted by level with
  // the driest at the foot, so the height of the warm part is the share in drought.
  const weekTip = w => `<b>${T('bg.tipWeek', { d: fmtDate(w[0]) })}</b>${[5, 4, 3, 2, 1].map(l =>
    `<span><i class="sw cdi${l}"></i>${T('bg.cdi' + l)}: ${w[l]}</span>`).join('')}`;
  responsive($('droughtChart'), W => {
    const H = W < 480 ? 150 : 180, pT = 8, pB = 24, pR = 44, pw = W - pR, n = dr.weeks.length, step = pw / n;
    const ph = H - pT - pB, k = ph / dr.regions, cands = [];
    let g = '';
    for (const v of [0, Math.round(dr.regions / 2), dr.regions]) {
      g += `<text class="tick" x="${W}" y="${f1(pT + ph - v * k + 4)}" text-anchor="end">${v}</text>`;
    }
    dr.weeks.forEach((w, i) => {
      let yb = pT + ph;
      const x = i * step + 0.5, cw = Math.max(1, step - 1);
      for (const l of [5, 4, 3, 2, 1]) {
        if (!w[l]) continue;
        const h = w[l] * k;
        g += `<rect class="cdi${l}" x="${f1(x)}" y="${f1(yb - h + 0.5)}" width="${f1(cw)}" height="${f1(Math.max(0.5, h - 1))}"/>`;
        yb -= h;
      }
      if (i % 8 === 0 || i === n - 1) cands.push({ x: i === n - 1 ? x + cw : x, t: fmtDate(w[0]).slice(0, 5) });
    });
    g += timeAxis(cands, H - 6);
    g += dr.weeks.map((w, i) => `<rect class="hit" x="${f1(i * step)}" y="${pT}" width="${f1(step)}" height="${ph}" ${tip(weekTip(w))}/>`).join('');
    $('droughtChart').innerHTML = svg(W, H, T('bg.dryAria', { from: fmtDate(dr.weeks[0][0]), to: fmtDate(dr.week) }), g);
  });
  $('droughtAfter').innerHTML = `
    <ul class="bKey">${[1, 2, 3, 4, 5].map(l => `<li><i class="cdi${l}"></i>${T('bg.cdi' + l)}</li>`).join('')}</ul>
    ${dr.driest.length ? `<p class="fine">${T('bg.dryList', { d: fmtDate(dr.week) })} ${
      dr.driest.filter(r => r.cdi === 5).map(r => esc(r.name)).join(', ') || '&mdash;'}.</p>` : ''}`;

  // ---- groundwater and lakes, one square per site
  const siteBlock = (set, key) => {
    const counts = ['low', 'normal', 'high'].map(s => `<span><i class="${STATE[s]}"></i>${T('bg.s.' + s)} <b>${set[s]}</b></span>`).join('');
    return `<div class="bSites"><p class="bSitesHead">${T(key, { n: set.n, m: month(set.month) })}</p>
      ${siteDots(set, 'big')}<p class="bSitesKey">${counts}</p></div>`;
  };
  const siteRows = set => sortSites(set.stations).map(s => `<tr><td>${esc(s.name)}</td><td>${T('bg.kind.' + s.kind)}</td>
    <td><span class="bState ${STATE[s.state]}">${T('bg.s.' + s.state)}</span></td>
    <td class="n">${nfd(s.v, DIGITS[s.unit] ?? 1)} ${T(UNIT[s.unit] ?? s.unit)}</td>
    <td class="n">${nfd(Math.min(s.p20, s.p80), DIGITS[s.unit] ?? 1)}&#8211;${nfd(Math.max(s.p20, s.p80), DIGITS[s.unit] ?? 1)}</td>
    <td class="n">${s.years}</td></tr>`).join('');
  $('sitesFig').innerHTML = `<div class="bSitesGrid">${siteBlock(c.groundwater, 'bg.gwSites')}${siteBlock(c.lakes, 'bg.lakeSites')}</div>
    <details class="bData"><summary>${T('bg.showSites')}</summary><div class="tWrap"><table>
      <thead><tr><th scope="col">${T('bg.thSite')}</th><th scope="col">${T('bg.thKind')}</th><th scope="col">${T('bg.thState')}</th>
        <th scope="col">${month(c.groundwater.month)}</th><th scope="col">${T('bg.thRange')}</th><th scope="col">${T('bg.thYears')}</th></tr></thead>
      <tbody>${siteRows(c.groundwater)}${siteRows(c.lakes)}</tbody></table></div></details>`;
  $('nowNote').innerHTML = T('bg.nowNote', {
    gw: c.groundwater.skipped.shortRecord + c.groundwater.skipped.noRecent,
    lk: c.lakes.skipped.shortRecord + c.lakes.skipped.noRecent, min: c.meta.minYears,
  });

  // ---- balance: what comes in equals what goes out. A flow diagram for one
  // period: the inputs on the left run into the country, the outputs leave on the
  // right, and every band is as thick as its volume.
  const LABEL = { P: T('bg.P'), inflow: T('bg.inflow'), draw: T('bg.draw'), E: T('bg.E'), outflow: T('bg.outflow'), gain: T('bg.gain') };
  const terms = p => {
    const t = nat[p], k = t.km3;
    const ins = [['P', t.P, k.P], ['inflow', t.inflow, k.inflow]];
    const outs = [['E', t.E, k.E], ['outflow', t.outflow, k.outflow]];
    ins.push(['draw', Math.max(0, -t.dS), Math.max(0, -k.dS)]);
    outs.push(['gain', Math.max(0, t.dS), Math.max(0, k.dS)]);
    return { ins, outs };
  };
  let period = Y, shown = terms(Y), redrawFlow;
  function flow(W) {
    const { ins, outs } = shown, target = terms(period);
    // Wide, the labels stand in gutters beside the nodes; narrow, they sit on their bands.
    const narrow = W < 560, gut = W >= 720 ? 172 : 0, H = narrow ? 330 : 380, pT = 46, pB = 10, nw = narrow ? 8 : 10, gap = narrow ? 22 : 26;
    // One scale for every period, so a wet year is drawn bigger than the normal.
    const tot = Math.max(sum(ins.map(x => x[1])), sum(outs.map(x => x[1]))), most = Math.max(tot, ...b.periods.map(q => sum(terms(q).ins.map(x => x[1]))));
    const count = xs => xs.filter(x => x[1] > 0).length;
    const k = (H - pT - pB - gap * (Math.max(count(ins), count(outs)) - 1)) / most;
    const cx = W / 2 - nw / 2, ch = tot * k, cy = pT + (H - pT - pB - ch) / 2;
    // Each side is stacked with gaps and centred; the centre column has none.
    const stack = xs => {
      const live = xs.filter(x => x[1] > 0), h = sum(live.map(x => x[1] * k)) + gap * (live.length - 1);
      let yy = pT + (H - pT - pB - h) / 2, cc = cy;
      return xs.map(x => {
        const hh = x[1] * k, r = { key: x[0], y: yy, h: hh, cy: cc };
        if (x[1] > 0) { yy += hh + gap; cc += hh; }
        return r;
      });
    };
    const xl = gut, xr = W - gut - nw;
    const L = stack(ins), R = stack(outs), mid1 = (xl + nw + cx) / 2, mid2 = (cx + nw + xr) / 2;
    const band = (x0, ya, x1, yb, h, m) => `M${f1(x0)},${f1(ya)}C${f1(m)},${f1(ya)} ${f1(m)},${f1(yb)} ${f1(x1)},${f1(yb)}V${f1(yb + h)}C${f1(m)},${f1(yb + h)} ${f1(m)},${f1(ya + h)} ${f1(x0)},${f1(ya + h)}Z`;
    const tipOf = (key, side) => {
      const x = target[side].find(t => t[0] === key);
      return `<b>${esc(LABEL[key])}</b><span>${mm(x[1])} &middot; ${km3(x[2])}</span><span>${pct(Math.round(100 * x[1] / sum(target[side].map(t => t[1]))))} ${T('bg.ofTotal')}</span>`;
    };
    let g = '';
    for (const n of L) if (n.h > 0.2) g += `<path class="band t-${n.key}" d="${band(xl + nw, n.y, cx, n.cy, n.h, mid1)}" ${tip(tipOf(n.key, 'ins'))}/>`;
    for (const n of R) if (n.h > 0.2) g += `<path class="band t-${n.key}" d="${band(cx + nw, n.cy, xr, n.y, n.h, mid2)}" ${tip(tipOf(n.key, 'outs'))}/>`;
    for (const n of L) if (n.h > 0.2) g += `<rect class="node t-${n.key}" x="${f1(xl)}" y="${f1(n.y)}" width="${nw}" height="${f1(Math.max(1.5, n.h))}" rx="2"/>`;
    for (const n of R) if (n.h > 0.2) g += `<rect class="node t-${n.key}" x="${f1(xr)}" y="${f1(n.y)}" width="${nw}" height="${f1(Math.max(1.5, n.h))}" rx="2"/>`;
    g += `<rect class="node core" x="${f1(cx)}" y="${f1(cy)}" width="${nw}" height="${f1(ch)}" rx="2"/>
      <text class="lab name" x="${f1(W / 2)}" y="16" text-anchor="middle">${T('bg.ch')}</text>
      <text class="lab val" x="${f1(W / 2)}" y="32" text-anchor="middle">${nf(b.meta.areaKm2)}&#8239;km&#178;</text>`;
    // Labels sit over their own band beside the node; a thin band's label is pushed
    // clear of its neighbour rather than overlapping it.
    const labels = (nodes, side, x, anchor) => {
      const live = nodes.map(n => [n, target[side].find(v => v[0] === n.key)]).filter(([, t]) => t[1] > 0);
      const ys = [];
      live.forEach(([n], i) => ys.push(Math.max(n.y + n.h / 2 - 3, i ? ys[i - 1] + 36 : -Infinity)));
      for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], H - 22 - (ys.length - 1 - i) * 36);
      return live.map(([n, t], i) => `<text class="lab name" x="${x}" y="${f1(ys[i])}" text-anchor="${anchor}">${esc(LABEL[n.key])}</text>
          <text class="lab val" x="${x}" y="${f1(ys[i] + 16)}" text-anchor="${anchor}">${mm(t[1])} &middot; ${km3(t[2])}</text>`).join('');
    };
    g += gut ? labels(L, 'ins', xl - 10, 'end') + labels(R, 'outs', xr + nw + 10, 'start')
      : labels(L, 'ins', nw + 8, 'start') + labels(R, 'outs', W - nw - 8, 'end');
    const desc = xs => xs.filter(x => x[1] > 0).map(x => `${LABEL[x[0]]} ${nf(x[1])} mm`).join(', ');
    $('balanceChart').innerHTML = svg(W, H, T('bg.flowAria', { p: period === Y ? Y : period.replace('-', '–'),
      ins: desc(target.ins), outs: desc(target.outs) }), g);
  }
  function setPeriod(p) {
    const from = shown, to = terms(p);
    period = p;
    for (const btn of $('balancePick').querySelectorAll('button')) btn.setAttribute('aria-pressed', String(btn.dataset.p === p));
    const total = sum(to.ins.map(x => x[1]));
    $('balanceSum').innerHTML = T('bg.balSum', { t: mm(total), k: km3(total * b.meta.areaKm2 / 1e6) });
    const W = $('balanceChart').clientWidth;
    if (REDUCED || !W) { shown = to; redrawFlow(); return; }
    // Tween the volumes, not the picture, so every frame is itself a closed budget.
    const t0 = performance.now(), D = 520;
    const mix = (a, z, s) => a.map((x, i) => [x[0], x[1] + (z[i][1] - x[1]) * s, x[2] + (z[i][2] - x[2]) * s]);
    const frame = now => {
      const s = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - s, 3);
      shown = { ins: mix(from.ins, to.ins, e), outs: mix(from.outs, to.outs, e) };
      flow(W);
      if (s < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  $('balancePick').innerHTML = b.periods.slice().reverse().map(q =>
    `<button type="button" data-p="${q}" aria-pressed="${q === Y}">${q === Y ? T('bg.yearN', { y: q }) : T('bg.meanN', { p: q.replace('-', '–') })}</button>`).join('');
  $('balancePick').setAttribute('aria-label', T('bg.periodPick'));
  for (const btn of $('balancePick').querySelectorAll('button')) btn.addEventListener('click', () => setPeriod(btn.dataset.p));
  redrawFlow = responsive($('balanceChart'), flow);
  setPeriod(Y);

  const TERMS = [['P', 'bg.P'], ['E', 'bg.E'], ['R', 'bg.R'], ['dS', 'bg.dS'], ['inflow', 'bg.inflow'], ['outflow', 'bg.outflow']];
  $('balanceTable').innerHTML = `<table>
    <thead><tr><th scope="col">${T('bg.thTerm')}</th>${b.periods.map(p => `<th scope="col">${p === Y ? p : p.replace('-', '–')}</th>`).join('')}</tr></thead>
    <tbody>${TERMS.map(([k, label]) => `<tr><td>${T(label)}</td>${b.periods.map(p =>
      `<td class="n">${k === 'dS' ? signed(nat[p][k], mm) : mm(nat[p][k])}<br><span class="fine">${
        k === 'dS' ? signed(nat[p].km3[k], km3) : km3(nat[p].km3[k])}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('balanceNote').innerHTML = T('bg.balNote', {
    y: Y, p: Math.round(100 * nat[Y].P / nat[N].P), r: Math.round(100 * nat[Y].R / nat[N].R),
    url: esc(b.meta.source.url), m: esc(b.meta.method.url),
  });

  // ---- catchments: each against its own normal, so a wet Ticino and a dry Jura
  // can sit on one axis.
  const share = (x, k) => x[N][k] ? Math.round(100 * x[Y][k] / x[N][k]) : null;
  const CK = ['P', 'R', 'E'];
  const catchTip = x => `<b>${esc(x.name)}</b>${CK.map(k => `<span><i class="sw t-${k}"></i>${T('bg.' + k)}: ${mm(x[Y][k])} &middot; ${pct(share(x, k))}</span>`).join('')}
    <span>${T('bg.dS')}: ${signed(x[Y].dS, mm)} (${T('bg.normDs', { v: signed(x[N].dS, mm) })})</span>`;
  const shape = (k, x, y, r) => k === 'P' ? `<circle class="mk t-${k}" cx="${f1(x)}" cy="${f1(y)}" r="${r}"/>`
    : k === 'R' ? `<rect class="mk t-${k}" x="${f1(x - r * 0.9)}" y="${f1(y - r * 0.9)}" width="${f1(r * 1.8)}" height="${f1(r * 1.8)}" rx="1.5"/>`
    : `<path class="mk t-${k}" d="M${f1(x)},${f1(y - r * 1.25)}L${f1(x + r * 1.25)},${f1(y)}L${f1(x)},${f1(y + r * 1.25)}L${f1(x - r * 1.25)},${f1(y)}Z"/>`;
  const allShares = b.basins.flatMap(x => CK.map(k => share(x, k))).filter(v => v != null);
  const lo = Math.min(80, Math.floor(Math.min(...allShares) / 20) * 20), hi = Math.max(140, Math.ceil(Math.max(...allShares) / 20) * 20);
  responsive($('catchChart'), W => {
    const narrow = W < 560, lw = narrow ? 0 : 168, rh = narrow ? 46 : 32, pT = 26;
    const H = pT + rh * b.basins.length + 4, x = v => lw + 8 + (v - lo) / (hi - lo) * (W - lw - 16);
    let g = '';
    for (let v = lo; v <= hi; v += 20) {
      g += `<line class="${v === 100 ? 'ref' : 'grid'}" x1="${f1(x(v))}" x2="${f1(x(v))}" y1="${pT - 6}" y2="${H}"/>
        <text class="tick" x="${f1(x(v))}" y="12" text-anchor="middle">${nf(v)}&#8239;%</text>`;
    }
    b.basins.forEach((bs, i) => {
      const y0 = pT + i * rh, cy = narrow ? y0 + 30 : y0 + rh / 2;
      const vs = CK.map(k => share(bs, k)).filter(v => v != null);
      g += `<text class="lab rowName" x="${narrow ? 0 : lw}" y="${f1(narrow ? y0 + 13 : cy + 4)}" text-anchor="${narrow ? 'start' : 'end'}">${esc(bs.name)}</text>`;
      g += `<line class="span" x1="${f1(x(Math.min(...vs)))}" x2="${f1(x(Math.max(...vs)))}" y1="${f1(cy)}" y2="${f1(cy)}"/>`;
      for (const k of ['E', 'R', 'P']) { const v = share(bs, k); if (v != null) g += shape(k, x(v), cy, 5.4); }
      g += `<rect class="hit" x="0" y="${f1(y0)}" width="${W}" height="${rh}" ${tip(catchTip(bs))}/>`;
    });
    $('catchChart').innerHTML = svg(W, H, T('bg.catchAria', { y: Y }), g);
  });
  const keyShape = k => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${shape(k, 6, 6, 4.2)}</svg>`;
  $('catchKey').innerHTML = CK.map(k => `<li>${keyShape(k)}${T('bg.' + k)} ${Y}</li>`).join('') +
    `<li><i class="refKey vert"></i>${T('bg.meanLine')}</li>`;
  const rel = (v, n) => n ? `<br><span class="fine">${pct(Math.round(100 * v / n))}</span>` : '';
  $('catchTable').innerHTML = `<table>
    <thead><tr><th scope="col">${T('bg.thCatch')}</th><th scope="col">${T('bg.P')} ${Y}</th>
      <th scope="col">${T('bg.R')} ${Y}</th><th scope="col">${T('bg.E')} ${Y}</th><th scope="col">${T('bg.dS')} ${Y}</th></tr></thead>
    <tbody>${b.basins.map(x => `<tr><td>${esc(x.name)}</td>
      <td class="n">${mm(x[Y].P)}${rel(x[Y].P, x[N].P)}</td><td class="n">${mm(x[Y].R)}${rel(x[Y].R, x[N].R)}</td>
      <td class="n">${mm(x[Y].E)}${rel(x[Y].E, x[N].E)}</td><td class="n">${signed(x[Y].dS, mm)}<br><span class="fine">${
        T('bg.normDs', { v: signed(x[N].dS, mm) })}</span></td></tr>`).join('')}</tbody></table>`;
  $('catchNote').innerHTML = T('bg.catchNote');

  // ---- stores, on one axis, with a year's flow beside them for scale
  const order = ['groundwater', 'lakes', 'glaciers', 'soil', 'reservoirs'];
  const stocks = order.map(k => b.stocks.find(s => s.key === k)).filter(Boolean);
  const flows = [{ key: 'flowP', km3: nat[Y].km3.P }, { key: 'flowOut', km3: nat[Y].km3.outflow }];
  const max = Math.max(...stocks.map(s => s.km3), ...flows.map(f => f.km3));
  const bar = (cls, v, ghost) => `<div class="bTrack">${ghost ? `<u style="width:${100 * ghost / max}%"></u>` : ''}<i class="${cls}" style="width:${100 * v / max}%"></i></div>`;
  $('storeFig').innerHTML = `<div class="bStores">${stocks.map(s => `<div class="bStore">
      <span class="bStoreName">${T('bg.st.' + s.key)}</span>${bar('st', s.km3, s.km3In2000)}
      <span class="bStoreVal">${s.upTo ? T('bg.upTo') + ' ' : s.approx ? '~' : ''}${km3(s.km3)}</span></div>`).join('')}
    ${flows.map(f => `<div class="bStore flow"><span class="bStoreName">${T('bg.' + f.key, { y: Y })}</span>${bar('fl', f.km3)}
      <span class="bStoreVal">${km3(f.km3)}</span></div>`).join('')}</div>
    <p class="fine">${T('bg.storeNote', { y0: 2000, v0: nfd(ice.km3In2000, 1) })}</p>`;
  $('storeTable').innerHTML = `<table>
    <thead><tr><th scope="col">${T('bg.thStore')}</th><th scope="col">${T('bg.thSize')}</th><th scope="col">${T('bg.thSource')}</th></tr></thead>
    <tbody>${stocks.map(s => `<tr><td><b>${T('bg.st.' + s.key)}</b><br><span class="fine">${T('bg.stn.' + s.key)}</span></td>
      <td><span class="bNum">${s.upTo ? T('bg.upTo') + ' ' : s.approx ? '~' : ''}${km3(s.km3)}</span>${s.usable ? `<br><span class="fine">${T(s.key === 'reservoirs' ? 'bg.usableCap' : 'bg.usableYr', { v: nfd(s.usable, 1) })}</span>` : ''}
        ${s.fill ? `<br><span class="fine">${T('bg.fillNow', { p: nfd(s.fill.pct, 1), d: fmtDate(s.fill.d) })}</span>` : ''}</td>
      <td><a href="${esc(s.url)}">${esc(s.holder)}</a><br><span class="fine">${esc(D(s.doc))}, ${esc(D(s.pin))}</span></td></tr>`).join('')}</tbody></table>`;

  // ---- use: public supply by source, every year the series has
  const rows = b.use.drinking.rows, last = rows.at(-1), first = rows[0];
  const SRC = [['spring', 'bg.thSpring'], ['ground', 'bg.thGround'], ['lake', 'bg.thLake']];
  $('useLead').innerHTML = T('bg.useLead', { y: last.y, v: nfd(last.total / 1000, 2), mio: nf(last.total),
    share: nfd(100 * last.total / 1000 / nat[Y].km3.P, 1), py: Y, lpd: nf(last.lpd) }) + ' ' +
    T('bg.useTrend', { a: first.y, b: last.y, d: nf(Math.round(100 * (1 - last.total / first.total))), l0: nf(first.lpd), l1: nf(last.lpd) });
  const useTip = r => `<b>${r.y}</b><span>${T('bg.thTotal')}: ${nfd(r.total, 1)}</span>${SRC.map(([k, l]) =>
    `<span><i class="sw u-${k}"></i>${T(l)}: ${nfd(r[k], 1)}</span>`).join('')}<span>${T('bg.thLpd')}: ${nf(r.lpd)}</span>`;
  responsive($('useChart'), W => {
    const narrow = W < 560, H = narrow ? 200 : 240, pT = 10, pB = 24, pL = 40, pR = narrow ? 0 : 104;
    const top = Math.ceil(Math.max(...rows.map(r => r.total)) / 100) * 100, ph = H - pT - pB;
    const pw = W - pL - pR, step = pw / rows.length, y = v => pT + ph - v / top * ph;
    let g = '';
    for (let v = 0; v <= top; v += 250) {
      g += `<line class="grid" x1="${pL}" x2="${f1(pL + pw)}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>
        <text class="tick" x="${pL - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${nf(v)}</text>`;
    }
    rows.forEach((r, i) => {
      const x = pL + i * step + 1, w = Math.max(1, step - 2);
      let acc = 0;
      for (const [k] of SRC) {
        const y1 = y(acc + r[k]), y0 = y(acc);
        g += `<rect class="u-${k}" x="${f1(x)}" y="${f1(y1 + 1)}" width="${f1(w)}" height="${f1(Math.max(0.5, y0 - y1 - 1))}"/>`;
        acc += r[k];
      }
      const lab = i === 0 || i === rows.length - 1 || (r.y % 5 === 0 && i > 1 && i < rows.length - 2);
      if (lab) g += `<text class="tick" x="${f1(x + w / 2)}" y="${H - 6}" text-anchor="middle">${r.y}</text>`;
    });
    if (!narrow) {
      let acc = 0, prev = Infinity;
      for (const [k, l] of SRC) {
        const yc = Math.min(y(acc + last[k] / 2) + 4, prev - 14);
        prev = yc; acc += last[k];
        g += `<text class="lab src" x="${f1(pL + pw + 8)}" y="${f1(yc)}">${T(l)}</text>`;
      }
    }
    g += rows.map((r, i) => `<rect class="hit" x="${f1(pL + i * step)}" y="${pT}" width="${f1(step)}" height="${ph}" ${tip(useTip(r))}/>`).join('');
    $('useChart').innerHTML = svg(W, H, T('bg.useAria', { a: first.y, b: last.y }), g);
  });
  $('useKey').innerHTML = SRC.map(([k, l]) => `<li><i class="u-${k}"></i>${T(l)}</li>`).join('');
  $('useTable').innerHTML = `<table><thead><tr><th scope="col">${T('bg.thYear')}</th><th scope="col">${T('bg.thTotal')}</th>
      <th scope="col">${T('bg.thSpring')}</th><th scope="col">${T('bg.thGround')}</th><th scope="col">${T('bg.thLake')}</th><th scope="col">${T('bg.thLpd')}</th></tr></thead>
    <tbody>${rows.slice().reverse().map(r => `<tr><td class="n">${r.y}</td><td class="n">${nfd(r.total, 1)}</td><td class="n">${nfd(r.spring, 1)}</td>
      <td class="n">${nfd(r.ground, 1)}</td><td class="n">${nfd(r.lake, 1)}</td><td class="n">${nf(r.lpd)}</td></tr>`).join('')}</tbody></table>`;
  $('useNote').innerHTML = T('bg.useNote', { url: esc(b.use.drinking.url), d: b.use.drinking.changed ? fmtDate(b.use.drinking.changed) : '&mdash;' });
  $('useOther').innerHTML = `<table><thead><tr><th scope="col">${T('bg.thUse')}</th><th scope="col">${T('bg.thVolume')}</th><th scope="col">${T('bg.thYear')}</th></tr></thead>
    <tbody>${b.use.other.map(u => `<tr><td><b>${T('bg.u.' + u.key)}</b><br><span class="fine">${T('bg.un.' + u.key)}</span></td>
      <td class="n">${nf(u.mioM3)} ${T('bg.mio')}</td><td class="n">${u.year ?? T('bg.noYear')}</td></tr>`).join('')}</tbody></table>
    <p class="fine">${T('bg.otherNote', { url: esc(b.use.otherSource.url), d: fmtDate(b.use.otherSource.date) })}</p>`;
})();
