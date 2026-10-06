import { h, num, eur, pct } from '../ui/dom.js';
import { card, stackedBars, SERIES, tileMap, dotMap, divColor } from '../ui/charts.js';
import { SECTORS } from '../model/inputs.js';
import { PARAM_INDEX } from '../model/params.js';
import { pageHead, explain, openCountry, empty, objectiveChips, sourceLine, badge } from './common.js';
import { slider } from './controls.js';

let sortBy = 'rho';

export function detect(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Surplus radar'), empty());
  const P = app.params;
  const rows = cells.map(c => ({ c, st: app.contractState(c) }));
  rows.sort((a, b) => sortBy === 'rho' ? b.st.rho - a.st.rho : sortBy === 'S' ? b.st.S - a.st.S : b.c.pi - a.c.pi);
  const total = rows.reduce((s, r) => s + r.st.S, 0), crit = rows.reduce((s, r) => s + r.st.Scrit, 0);
  const bySector = SECTORS.map((s, i) => ({ ...s, color: SERIES[i], v: cells.reduce((a, c) => a + (P[s.lam] ?? 1) * (c.sectors[s.k] || 0), 0) }));

  const weights = h('div', { class: 'ctrl-grid' }, [...SECTORS.map(s => slider(app, PARAM_INDEX[s.lam])), slider(app, PARAM_INDEX.scritMode), slider(app, PARAM_INDEX.scritPct), slider(app, PARAM_INDEX.accStart)]);
  const sortSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sort order' }, [['rho', 'S/S_crit', 'Sort by the stock as a multiple of its threshold.'], ['S', '€bn', 'Sort by the stock in euro billions.'], ['pi', 'Inflation', 'Sort by inflation.']].map(([k, l, tip]) =>
    h('button', { class: sortBy === k ? 'on' : '', 'aria-pressed': String(sortBy === k), 'data-tip': tip, onclick: () => { sortBy = k; app.rerender(); } }, l)));

  root.append(
    pageHead('Surplus radar', 'Idle money measured where it is held: deposits acquired by households, firms and governments since 2020 above their pre-pandemic pace, judged against a threshold set from two decades of pre-2020 history (Solutions §3.2–3.3).'),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Excess deposits Σλₖ·Sᵏ'), h('b', { class: 'kpi-v' }, eur(total, 0)), h('span', { class: 'kpi-s' }, `vs S_crit ${eur(crit, 0)}`)),
      ...bySector.map(s => h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, h('span', { class: 'lg-box', style: { background: s.color } }), ` ${s.label}`), h('b', { class: 'kpi-v' }, eur(s.v, 0)), h('span', { class: 'kpi-s' }, `${num(s.v / (total || 1) * 100, 0)}% of total`)))),
    h('div', { class: 'grid-2' },
      card({
        title: 'Excess deposits by economy and sector', sub: 'Bars: excess deposits by sector, € billion. Tick: the historical threshold S_crit. Select a row for detail.',
        legend: SECTORS.map((s, i) => ({ label: s.label, color: SERIES[i] })), actions: sortSeg,
        body: stackedBars({
          rows: rows.map(({ c, st }) => ({ label: c.name, sub: `${num(st.rho, 2)}× S_crit · π ${pct(c.pi)}`, marker: st.Scrit, onClick: () => openCountry(app, c),
            segments: SECTORS.map((s, i) => ({ name: s.label, value: (P[s.lam] ?? 1) * (c.sectors[s.k] || 0), color: SERIES[i] })) })),
          fmt: v => eur(v), markerLabel: 'S_crit',
        }),
        table: () => ({ cols: ['Economy', ...SECTORS.map(s => `${s.label} €bn`), 'Total €bn', 'S_crit €bn', 'Ratio'], rows: rows.map(({ c, st }) => [c.name, ...SECTORS.map(s => num((P[s.lam] ?? 1) * (c.sectors[s.k] || 0), 2)), num(st.S, 2), num(st.Scrit, 2), num(st.rho, 2)]) }),
      }),
      h('div', { class: 'stack' },
        card({ title: 'Surplus pressure map', sub: 'S/S_crit, blue below and red above the critical level',
          body: app.region === 'global'
            ? dotMap({ cells, value: c => app.contractState(c).rho, color: v => divColor(Math.log(Math.max(0.05, v)), 2), fmt: v => `${num(v, 2)}×`, onSelect: c => openCountry(app, c) })
            : tileMap({ cells, value: c => app.contractState(c).rho, color: v => divColor(Math.log(Math.max(0.05, v)), 2), fmt: v => `${num(v, 2)}×`, onSelect: c => openCountry(app, c) }) }),
        card({ title: 'Measurement choices', sub: 'Sector weights λₖ, the threshold and the start of accumulation (Solutions §7.5). Changes apply everywhere instantly.', body: weights }),
        card({ title: 'Surplus breaches', sub: 'Economies above S_crit', body: h('ul', { class: 'alerts' }, rows.filter(r => r.st.rho >= 1).map(({ c, st }) => h('li', null, h('button', { class: 'alert-row', 'data-tip': `${c.name}: excess deposits ${num(st.rho, 2)} times the historical threshold S_crit. Select for its details.`, onclick: () => openCountry(app, c) }, badge(st.state), h('b', null, c.name), h('span', null, `${eur(st.S)} · ${num(st.rho, 2)}×`))))) }))),
    explain('How surplus is measured',
      h('p', null, 'Each economy’s excess stock is S = Σ λₖ·Sᵏ over three sectors (Solutions §3.2). For each sector it is the sum, since 2020 Q1, of quarterly net acquisitions of currency and deposits (F2) above their 2016–2019 pace, the pace being held as a share of GDP so that rising prices and incomes are not counted as excess. Money put into housing, securities or debt repayment is excluded by construction, and no behavioural parameter is used. The part held in currency and transferable deposits (F21 + F22) is shown on each country page:'),
      h('ul', null, SECTORS.map(s => h('li', null, h('b', null, s.label, ': '), s.note))),
      h('p', null, 'Current-account surpluses and central-bank reserves are reported on the country pages as indicators but are not counted: export proceeds and bank reserves are not idle domestic spending power that contracts could absorb (Solutions §3.8).'),
      h('p', null, 'S_crit is the 90th percentile of all pre-2020 accumulations of the same length across EU economies, in % of GDP, so a stock counts as exceptional only if it is large by the standards of two decades of pre-2020 history. It rises as an episode ages, because longer accumulations are larger. Contracts act only when the stock is above it, and mainly once inflation is above the trigger (Solutions §3.3, §4.3). The global panel has no comparable financial accounts: its stock is built from annual saving and fiscal data, and its threshold is a fixed share of GDP (Solutions §3.8).')),
    objectiveChips([1, 10]),
    sourceLine(app));
}
