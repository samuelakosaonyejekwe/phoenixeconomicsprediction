import { h, icon, num, eur, pct, clear, ago } from '../ui/dom.js';
import { lineChart, card, legendEl, SERIES, stackedBars } from '../ui/charts.js';
import { SECTORS, surplusOf } from '../model/inputs.js';
import { OBJECTIVES } from '../content/framework.js';

export const STATE_META = {
  ACTIVE: { tone: 'crit', label: 'Active', icon: 'zap', desc: 'Inflation above the trigger and excess deposits above their historical threshold: contracts absorb.' },
  ARMED: { tone: 'serious', label: 'Armed', icon: 'alert', desc: 'One of the two conditions met. Below the threshold nothing is absorbed; just below the trigger the smooth switch allows a small activation (§4.3).' },
  WATCH: { tone: 'warn', label: 'Watch', icon: 'bell', desc: 'Forecast shows rising breach risk: pre-emptive monitoring.' },
  DORMANT: { tone: 'good', label: 'Dormant', icon: 'ok', desc: 'Within bounds: no intervention.' },
};
export const STATE_COLOR = { ACTIVE: '#d03b3b', ARMED: '#ec835a', WATCH: '#fab219', DORMANT: '#0ca30c' };

export function badge(state) {
  const m = STATE_META[state] || STATE_META.DORMANT;
  return h('span', { class: ['badge', `t-${m.tone}`] }, icon(m.icon, 14), m.label);
}

export function pageHead(title, lead, extra) {
  return h('header', { class: 'page-h' }, h('div', null, h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null), extra || null);
}

export function kpi({ label, value, sub, delta, good, trend }) {
  return h('div', { class: 'kpi' },
    h('span', { class: 'kpi-l' }, label),
    h('b', { class: 'kpi-v' }, value),
    delta ? h('span', { class: ['kpi-d', good === true ? 'up' : good === false ? 'down' : ''] }, delta) : null,
    sub ? h('span', { class: 'kpi-s' }, sub) : null,
    trend || null);
}

export function explain(title, ...body) {
  return h('details', { class: 'explain' }, h('summary', null, icon('info', 16), title), h('div', null, ...body));
}

export function objectiveChips(nums) {
  return h('div', { class: 'obj-chips' }, nums.map(n => {
    const o = OBJECTIVES.find(x => x.n === n);
    return h('span', { class: 'obj-chip', title: o.how, tabindex: 0, 'aria-label': `Objective ${n}: ${o.title}. ${o.how}` }, `Objective ${n} · ${o.title}`);
  }));
}

export function weightedPi(cells) {
  const w = cells.reduce((s, c) => s + c.gdp, 0);
  return cells.reduce((s, c) => s + c.pi * c.gdp, 0) / (w || 1);
}

export function empty(msg = 'Loading the latest official data…') {
  return h('div', { class: 'empty' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', null, msg));
}

// Country drawer: history, forecast, sector breakdown, contract state.
export function openCountry(app, cell) {
  const P = app.params, st = app.contractState(cell), fc = st.fc;
  const hist = cell.piHist.map((r, i) => [i, r[1]]);
  const n = hist.length;
  const fcVals = fc.path.map((v, k) => [n - 1 + k + 1, v]);
  const labels = [...cell.piHist.map(r => r[0]), ...fc.path.map((_, k) => `+${k + 1}m`)];
  // Monthly series: 10th–90th percentile of the simulated paths (§6.1); annual IMF series (global panel):
  // an approximate band from the projection's own error.
  const monthly = /^\d{4}-\d{2}$/.test(cell.piHist.at(-1)?.[0] || '');
  const band = fc.band ? fc.path.map((_, k) => [n + k, fc.band[k][0], fc.band[k][1]]) : fc.path.map((v, k) => [n + k, v - 1.28 * fc.sd * Math.sqrt(k + 1), v + 1.28 * fc.sd * Math.sqrt(k + 1)]);
  const sectors = SECTORS.map((s, i) => ({ name: `${s.label} (λ ${P[s.lam]})`, value: (P[s.lam] ?? 1) * (cell.sectors[s.k] || 0), color: SERIES[i] }));
  const dlg = h('dialog', { class: 'drawer', 'aria-label': cell.name },
    h('header', { class: 'drawer-h' },
      h('div', null, h('h2', null, cell.name), h('p', { class: 'sub' }, cell.nowcast && P.nowcast ? `Inflation nowcast ${pct(cell.pi, 2)} (${cell.nowcast.asOf}) · official ${pct(cell.piOfficial)} (${cell.piPeriod}) · GDP ${eur(cell.gdp, 0)}` : `Inflation ${pct(cell.pi)} (${cell.piPeriod}) · GDP ${eur(cell.gdp, 0)}`)),
      badge(st.state),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, icon('close'))),
    h('div', { class: 'drawer-b' },
      h('div', { class: 'kpis' },
        kpi({ label: 'Excess deposits', value: eur(st.S), sub: `S_crit ${eur(st.Scrit)} · ratio ${num(st.rho, 2)}${cell.idle ? ` · overnight and savings ${eur((cell.idle.hh || 0) + (cell.idle.corp || 0) + (cell.idle.gov || 0))}` : ''}` }),
        kpi({ label: 'Breach probability (12 m)', value: `${num(fc.pBreach * 100, 0)}%`, sub: fc.firstBreach === 0 ? 'Already above trigger' : fc.firstBreach ? `Trigger in ≈${fc.firstBreach} months` : 'No breach projected' }),
        kpi({ label: 'Steady-state activation Θ*', value: num(st.thetaStar, 2), sub: `π_th ${P.piTh}%` }),
        kpi({ label: 'Unemployment and output gap', value: `${pct(cell.unemp)} · ${num(cell.x0 ?? 0, 1)}%`, sub: `gap from GDP (HP trend)${cell.gapUpdate ? `, ${num(cell.gapUpdate, 2)} pp from monthly unemployment` : ''} · gov. balance ${cell.govPct == null ? 'n/a' : pct(cell.govPct)} of GDP` }),
        kpi({ label: 'Not absorbed: indicators', value: eur(cell.indicators?.external ?? 0, 0), sub: `current-account surplus${cell.indicators?.reserves ? ` · reserves share ${eur(cell.indicators.reserves, 0)}` : ''} (Solutions §3.8)` }),
        cell.nowcast ? kpi({ label: 'Daily nowcast adjustment', value: `${cell.nowcast.oilEff + cell.nowcast.fxEff >= 0 ? '+' : ''}${num(cell.nowcast.oilEff + cell.nowcast.fxEff, 2)} pp`,
          sub: `Oil in € ${cell.nowcast.oilPct === null ? 'n/a' : `${num(cell.nowcast.oilPct, 1)}%`} × energy weight ${num(cell.nowcast.weight * 100, 1)}%${cell.ea && cell.nowcast.usdPct !== null ? ` · EUR/USD ${num(cell.nowcast.usdPct, 1)}%` : ''} since ${cell.piPeriod}` }) : null),
      card({
        title: 'Inflation: history and early-warning projection', sub: fc.band ? 'Observed (solid), energy–core projection (dashed), 10th–90th percentile of the simulated paths (Solutions §6.1)' : monthly ? 'Observed (solid), headline projection (dashed), approximate 80% band from the projection error (Solutions §6.1)' : 'Annual IMF observations (solid), monthly path to next year’s IMF projection (dashed), approximate 80% band',
        legend: [{ label: 'Observed', color: SERIES[0], line: true }, { label: 'Projection', color: SERIES[1], line: true, dash: true }, { label: fc.band ? '10th–90th percentile' : '≈80% band', color: SERIES[1] }],
        body: lineChart({
          series: [{ name: 'Observed', color: SERIES[0], values: hist }, { name: 'Projection', color: SERIES[1], dash: true, values: [[n - 1, hist[n - 1]?.[1] ?? cell.pi], ...fcVals] }],
          bands: [{ color: SERIES[1], values: band }], refs: [{ y: P.piTh, label: `Trigger ${P.piTh}%` }, { y: P.target, label: `Target ${P.target}%` }],
          yFmt: v => `${num(v, 1)}%`, xFmt: i => labels[Math.round(i)] || '', height: 200,
        }),
        table: () => ({ cols: ['Period', 'Inflation %'], rows: [...cell.piHist.map(r => [r[0], num(r[1], 1)]), ...fc.path.map((v, k) => [`+${k + 1} months (projection)`, num(v, 2)])] }),
      }),
      card({
        title: 'Excess stock by sector', sub: cell.scritHist ? 'Σλₖ·Sᵏ, deposits acquired since 2020 above the 2016–2019 pace as a share of GDP, € billion; tick: S_crit, the 90th percentile of pre-2020 history (Solutions §3.2–3.3)' : 'Global panel (annual data): household gross saving since 2020 above its 2015–2019 mean, spent down at s_hh a year, × the EU ratio of excess deposits to excess saving, and the government’s positive fiscal balances of the last two years, € billion; tick: S_crit, a fixed share of GDP because these economies have no comparable financial accounts (Solutions §3.8)',
        legend: sectors.map(s => ({ label: s.name, color: s.color })),
        body: stackedBars({ rows: [{ label: cell.id, segments: sectors, marker: st.Scrit }], fmt: v => eur(v), markerLabel: 'S_crit' }),
        table: () => ({ cols: ['Sector', '€bn'], rows: sectors.map(s => [s.name, num(s.value, 2)]) }),
      }),
      h('ul', { class: 'notes' }, SECTORS.map(s => h('li', null, h('b', null, s.label, ': '), s.note)))));
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

export function sourceLine(app) {
  const at = Object.values(app.status).map(s => s.at).filter(Boolean).sort().pop();
  const live = Object.values(app.status).filter(s => s.state === 'live').length;
  return h('p', { class: 'src-line' }, icon('db', 14),
    `Official data: Eurostat, ECB, World Bank, IMF, INSEE, DBnomics. ${live ? `${live} sources refreshed live` : 'Showing stored data'} · latest ${ago(at)}.`);
}

export { clear, surplusOf };
