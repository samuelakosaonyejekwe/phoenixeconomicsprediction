import { h, num, pct, eur } from '../ui/dom.js';
import { card, lineChart, SERIES, sparkline } from '../ui/charts.js';
import { pageHead, explain, empty, objectiveChips, openCountry, sourceLine, kpi } from './common.js';

const TONE = { act: ['crit', 'Pre-empt now'], watch: ['warn', 'Watch'], clear: ['good', 'Clear'] };

export function forecast(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Early warning'), empty());
  const P = app.params;
  const rows = cells.map(c => ({ c, f: app.contractState(c).fc })).sort((a, b) => b.f.pBreach - a.f.pBreach || b.f.rhoP - a.f.rhoP);
  const n = s => rows.filter(r => r.f.status === s).length;
  const soon = rows.filter(r => r.f.firstBreach && r.f.firstBreach > 0).sort((a, b) => a.f.firstBreach - b.f.firstBreach);

  const table = h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Economy', 'Signal', 'Trend', 'Now', '+6 m', '+12 m', 'IMF next year', 'P(breach)', 'Trigger in', 'S/S_crit now → next year'].map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', null, rows.map(({ c, f }) => h('tr', { class: 'click', onclick: () => openCountry(app, c) },
      h('th', { scope: 'row' }, c.name), h('td', null, h('span', { class: ['badge', `t-${TONE[f.status][0]}`] }, TONE[f.status][1])),
      h('td', null, sparkline([...c.piHist.slice(-12).map(r => r[1]), ...f.path.slice(0, 6)], { color: f.status === 'act' ? '#d03b3b' : 'var(--s1)' })),
      h('td', null, pct(c.pi)), h('td', null, pct(f.path[5], 1)), h('td', null, pct(f.path[11], 1)), h('td', null, f.imfNext === undefined ? '–' : pct(f.imfNext, 1)),
      h('td', null, `${num(f.pBreach * 100, 0)}%`), h('td', null, f.firstBreach === 0 ? 'breached' : f.firstBreach ? `${f.firstBreach} mo` : '–'),
      h('td', null, `${num(f.rho, 2)} → ${num(f.rhoP, 2)}`))))));

  const top = rows.slice(0, 4);
  const chart = card({
    title: 'Projected inflation, highest-risk economies', sub: `Energy–core projection: known energy base effects plus core inflation reverting to its anchor; trigger ${P.piTh}%`,
    legend: top.map((r, i) => ({ label: r.c.name, color: SERIES[i], line: true, tip: `${r.c.name}: projected inflation with its 10th–90th percentile band; breach probability ${Math.round(r.f.pBreach * 100)}% (§6.1).` })),
    body: lineChart({ series: top.map((r, i) => ({ name: r.c.name, color: SERIES[i], values: [[0, r.c.pi], ...r.f.path.map((v, k) => [k + 1, v])] })), refs: [{ y: P.piTh, label: `Trigger ${P.piTh}%` }, { y: P.target, label: 'Target' }], yFmt: v => `${num(v, 1)}%`, xFmt: v => `+${num(v, 0)}m`, xLabel: 'Months ahead' }),
    table: () => ({ cols: ['Month', ...top.map(r => r.c.name)], rows: Array.from({ length: 12 }, (_, k) => [`+${k + 1}`, ...top.map(r => num(r.f.path[k], 2))]) }),
  });

  root.append(
    pageHead('Early warning', 'Which economies are likely to breach the inflation trigger within twelve months, and whose excess deposits are at or near their threshold (Solutions §6).'),
    h('div', { class: 'kpis' },
      kpi({ label: 'Likely to activate within 12 months', value: String(n('act')), sub: 'Breach probability ≥ 50% (or above the trigger now) and the stock at or projected above S_crit' }),
      kpi({ label: 'On watch', value: String(n('watch')), sub: 'Rising risk or surplus breach' }),
      kpi({ label: 'Clear', value: String(n('clear')) }),
      kpi({ label: 'Next projected trigger', value: soon[0] ? `${soon[0].c.name}` : 'None', sub: soon[0] ? `in ≈${soon[0].f.firstBreach} months` : 'No new breach in 12 months' })),
    chart,
    card({ title: 'Breach-risk ranking', sub: 'Economies sorted by breach probability. Select a row for the full projection.', body: table }),
    explain('Method',
      h('p', null, 'Headline inflation is projected from its two components (Solutions §6.1). Energy inflation follows the HICP energy index held at its latest level, so the base effects of the coming year are exact; core inflation is projected with damped momentum and reversion to its anchor (the ECB survey for the euro area, official targets elsewhere in the EU). The energy weight is that of the current year.'),
      h('p', null, 'The breach probability is the share of 600 simulated paths on which inflation touches the trigger within twelve months. Energy shocks are Student-t, with tails estimated from the energy index and volatility that rises when energy markets are turbulent; core shocks match the core projection’s historical error. Economies outside the EU, without an energy index or core series, use a coarse headline projection towards the IMF forecast, with volatility set by each economy’s IMF forecast errors since 2009 (Solutions §6.1).'),
      h('p', null, 'This specification was fixed before the 2001–2017 hold-out test. Over 2001–2026 it beats the no-change forecast on average and the real-time historical frequency clearly, but the gains in point forecasts are not statistically significant once errors common to all economies are allowed for; at abrupt turning points such as 2021 it understates risk (Solutions §6.3, Table 7).'),
      h('p', null, 'The excess stock is projected one year ahead: each sector’s stock spent down at its spending rate, plus a year of its inflow decaying at the sector’s estimated rate (Solutions §3.4).')),
    objectiveChips([10]),
    sourceLine(app));
}
