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

  // ---- now: one tile per store or flow, each with its own period
  const o = c.outflow, om = o.months.at(-1);
  const res = b.stocks.find(s => s.key === 'reservoirs');
  const ice = b.stocks.find(s => s.key === 'glaciers');
  const dr = c.drought;
  const dry = dr.levels[3] + dr.levels[4];
  const tiles = [
    { big: pct(om.pct), label: T('bg.tOut'), sub: T('bg.tOutSub', { m: month(om.m), q: nf(om.q), n: nf(om.norm) }) },
    { big: `${c.groundwater.low}<small>/${c.groundwater.n}</small>`, label: T('bg.tGw'),
      sub: T('bg.tGwSub', { m: month(c.groundwater.month), high: c.groundwater.high }) },
    { big: `${c.lakes.low}<small>/${c.lakes.n}</small>`, label: T('bg.tLake'),
      sub: T('bg.tLakeSub', { m: month(c.lakes.month), high: c.lakes.high }) },
    { big: `${dry}<small>/${dr.regions}</small>`, label: T('bg.tDry'),
      sub: T('bg.tDrySub', { d: fmtDate(dr.week), soil: dr.soilMedian ?? '&mdash;' }) },
    { big: pct(res.fill.pct), label: T('bg.tRes'),
      sub: T('bg.tResSub', { d: fmtDate(res.fill.d), rank: esc(D(res.fill.rank)) }) },
    { big: '&#8722;' + nfd(ice.lossLastPct, 1) + '&#8239;%', label: T('bg.tIce', { y: ice.lossYear }),
      sub: T('bg.tIceSub', { loss: nfd(ice.lossLast, 1), left: nfd(ice.km3, 1) }) },
  ];
  $('nowTiles').innerHTML = tiles.map(t => `<div class="bTile">
      <p class="bBig">${t.big}</p><p class="bLabel">${t.label}</p><p class="bSub">${t.sub}</p></div>`).join('');

  // ---- outflow: 24 months as a share of the same month's mean
  const top = Math.max(150, ...o.months.map(r => r.pct));
  const tick = v => `<span class="bTick" style="bottom:${100 * v / top}%"><em>${pct(v)}</em></span>`;
  $('outflowFig').innerHTML = `
    <div class="bPlot" role="img" aria-label="${esc(T('bg.outAria', { from: month(o.months[0].m), to: month(om.m) }))}">
      ${tick(50)}${tick(100)}
      <div class="bCols">${o.months.map(r => `<span class="bCol ${r.pct < 100 ? 'below' : 'above'}"
          style="height:${100 * r.pct / top}%" title="${esc(month(r.m))}: ${r.pct} %, ${r.q} / ${r.norm} m³/s"></span>`).join('')}</div>
    </div>
    <div class="bAxis">${o.months.map((r, i) => `<span>${(i % 3 === 0 && i < o.months.length - 2) || i === o.months.length - 1
      ? `${month(r.m, true)}${r.m.endsWith('-01') || i === 0 ? ' ' + r.m.slice(2, 4) : ''}` : ''}</span>`).join('')}</div>
    <ul class="bKey"><li><i class="below"></i>${T('bg.keyBelow')}</li><li><i class="above"></i>${T('bg.keyAbove')}</li></ul>
    <p class="fine">${T('bg.outNote', { from: month(o.last12.from), to: month(o.last12.to),
      v: nfd(o.last12.km3, 1), n: nfd(o.last12.normKm3, 1), p: o.last12.pct })}</p>
    <details class="bData"><summary>${T('bg.showNumbers')}</summary><div class="tWrap"><table>
      <thead><tr><th scope="col">${T('bg.thMonth')}</th><th scope="col">${esc(o.gauges[0].name)}</th>
        <th scope="col">${esc(o.gauges[1].name)}</th><th scope="col">${T('bg.thMeanMonth')}</th><th scope="col">${T('bg.thShare')}</th></tr></thead>
      <tbody>${o.months.map(r => `<tr><td>${month(r.m)}</td><td class="n">${nf(r.byGauge[0])} m&#179;/s</td>
        <td class="n">${nf(r.byGauge[1])} m&#179;/s</td><td class="n">${nf(r.norm)} m&#179;/s</td><td class="n">${pct(r.pct)}</td></tr>`).join('')}</tbody>
    </table></div></details>`;

  // ---- drought: 52 weeks of the five levels, stacked to the 38 regions
  $('droughtFig').innerHTML = `
    <div class="bPlot short" role="img" aria-label="${esc(T('bg.dryAria', { from: fmtDate(dr.weeks[0][0]), to: fmtDate(dr.week) }))}">
      <div class="bCols">${dr.weeks.map(w => `<span class="bStack" style="height:${100 * w.slice(1).reduce((a, n) => a + n, 0) / dr.regions}%" title="${esc(fmtDate(w[0]))}: ${w.slice(1).join(' / ')}">${
        [5, 4, 3, 2, 1].map(l => w[l] ? `<i class="cdi${l}" style="flex:${w[l]}"></i>` : '').join('')}</span>`).join('')}</div>
    </div>
    <div class="bAxis">${dr.weeks.map((w, i) => `<span>${(i % 8 === 0 && i < dr.weeks.length - 5) || i === dr.weeks.length - 1 ? fmtDate(w[0]).slice(0, 5) : ''}</span>`).join('')}</div>
    <ul class="bKey">${[1, 2, 3, 4, 5].map(l => `<li><i class="cdi${l}"></i>${T('bg.cdi' + l)}</li>`).join('')}</ul>
    ${dr.driest.length ? `<p class="fine">${T('bg.dryList', { d: fmtDate(dr.week) })} ${
      dr.driest.filter(r => r.cdi === 5).map(r => esc(r.name)).join(', ') || '&mdash;'}.</p>` : ''}`;
  $('nowNote').innerHTML = T('bg.nowNote', {
    gw: c.groundwater.skipped.shortRecord + c.groundwater.skipped.noRecent,
    lk: c.lakes.skipped.shortRecord + c.lakes.skipped.noRecent, min: c.meta.minYears,
  });

  // ---- balance: what comes in equals what goes out, for one chosen period
  const LABEL = { P: T('bg.P'), inflow: T('bg.inflow'), draw: T('bg.draw'), E: T('bg.E'), outflow: T('bg.outflow'), gain: T('bg.gain') };
  function balance(p) {
    const t = nat[p], k = t.km3;
    const ins = [['P', t.P, k.P], ['inflow', t.inflow, k.inflow]];
    const outs = [['E', t.E, k.E], ['outflow', t.outflow, k.outflow]];
    if (t.dS < 0) ins.push(['draw', -t.dS, -k.dS]); else if (t.dS > 0) outs.push(['gain', t.dS, k.dS]);
    const total = ins.reduce((a, x) => a + x[1], 0);
    const row = (name, xs) => `<div class="bBalRow"><span class="bBalName">${name}</span><div class="bRow bBand">${
      xs.map(([key, v]) => `<span class="t-${key}" style="flex:${v}" title="${esc(LABEL[key])}: ${v} mm"></span>`).join('')}</div></div>`;
    $('balanceFig').innerHTML = `
      <div class="bSeg" role="group" aria-label="${esc(T('bg.periodPick'))}">${b.periods.slice().reverse().map(q =>
        `<button type="button" data-p="${q}" aria-pressed="${q === p}">${q === Y ? T('bg.yearN', { y: q }) : T('bg.meanN', { p: q.replace('-', '–') })}</button>`).join('')}</div>
      ${row(T('bg.in'), ins)}${row(T('bg.out'), outs)}
      <ul class="bKey">${[...ins, ...outs].map(([key, v, q]) => `<li><i class="t-${key}"></i><b>${esc(LABEL[key])}</b>
        <span>${mm(v)} &middot; ${km3(q)}</span></li>`).join('')}</ul>
      <p class="fine">${T('bg.balSum', { t: mm(total), k: km3(total * b.meta.areaKm2 / 1e6) })}</p>`;
    for (const btn of $('balanceFig').querySelectorAll('button[data-p]')) btn.addEventListener('click', () => balance(btn.dataset.p));
  }
  balance(Y);

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

  // ---- catchments
  const rel = (v, n) => n ? `<br><span class="fine">${pct(Math.round(100 * v / n))}</span>` : '';
  $('catchTable').innerHTML = `<table>
    <thead><tr><th scope="col">${T('bg.thCatch')}</th><th scope="col">${T('bg.P')} ${Y}</th>
      <th scope="col">${T('bg.R')} ${Y}</th><th scope="col">${T('bg.E')} ${Y}</th><th scope="col">${T('bg.dS')} ${Y}</th></tr></thead>
    <tbody>${b.basins.map(x => `<tr><td>${esc(x.name)}</td>
      <td class="n">${mm(x[Y].P)}${rel(x[Y].P, x[N].P)}</td><td class="n">${mm(x[Y].R)}${rel(x[Y].R, x[N].R)}</td>
      <td class="n">${mm(x[Y].E)}${rel(x[Y].E, x[N].E)}</td><td class="n">${signed(x[Y].dS, mm)}<br><span class="fine">${
        T('bg.normDs', { v: signed(x[N].dS, mm) })}</span></td></tr>`).join('')}</tbody></table>
    <p class="fine">${T('bg.catchNote')}</p>`;

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

  // ---- use
  const dk = b.use.drinking.rows.slice(-10), last = dk.at(-1);
  $('useFig').innerHTML = `<p>${T('bg.useLead', { y: last.y, v: nfd(last.total / 1000, 2), mio: nf(last.total),
      share: nfd(100 * last.total / 1000 / nat[Y].km3.P, 1), py: Y, lpd: nf(last.lpd) })}</p>
    <table><thead><tr><th scope="col">${T('bg.thYear')}</th><th scope="col">${T('bg.thTotal')}</th>
      <th scope="col">${T('bg.thSpring')}</th><th scope="col">${T('bg.thGround')}</th><th scope="col">${T('bg.thLake')}</th><th scope="col">${T('bg.thLpd')}</th></tr></thead>
    <tbody>${dk.slice().reverse().map(r => `<tr><td class="n">${r.y}</td><td class="n">${nfd(r.total, 1)}</td><td class="n">${nfd(r.spring, 1)}</td>
      <td class="n">${nfd(r.ground, 1)}</td><td class="n">${nfd(r.lake, 1)}</td><td class="n">${nf(r.lpd)}</td></tr>`).join('')}</tbody></table>
    <p class="fine">${T('bg.useNote', { url: esc(b.use.drinking.url), d: b.use.drinking.changed ? fmtDate(b.use.drinking.changed) : '&mdash;' })}</p>`;
  $('useOther').innerHTML = `<table><thead><tr><th scope="col">${T('bg.thUse')}</th><th scope="col">${T('bg.thVolume')}</th><th scope="col">${T('bg.thYear')}</th></tr></thead>
    <tbody>${b.use.other.map(u => `<tr><td><b>${T('bg.u.' + u.key)}</b><br><span class="fine">${T('bg.un.' + u.key)}</span></td>
      <td class="n">${nf(u.mioM3)} ${T('bg.mio')}</td><td class="n">${u.year ?? T('bg.noYear')}</td></tr>`).join('')}</tbody></table>
    <p class="fine">${T('bg.otherNote', { url: esc(b.use.otherSource.url), d: fmtDate(b.use.otherSource.date) })}</p>`;
})();
