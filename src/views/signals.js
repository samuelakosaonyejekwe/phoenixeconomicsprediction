import { h, num, eur, pct } from '../ui/dom.js';
import { card, lineChart, meter, SERIES } from '../ui/charts.js';
import { TRIGGER_STATES, healthOf, CASH_TIERS } from '../model/programmes.js';
import { pageHead, explain, empty, sourceLine, openCountry } from './common.js';
import { sbadge, tkpi, tbl, waiting, settingsCard } from './progui.js';

const VOL_STATES = {
  RELEASE: { tone: 'crit', label: 'Buffer released', desc: 'Volatility is above the alert level: the volatility buffer would be released and a fifth of any recall is paid in cash.' },
  WATCH: { tone: 'warn', label: 'Watch', desc: 'Volatility is more than half-way from normal to the alert level.' },
  CALM: { tone: 'good', label: 'Calm', desc: 'Volatility is close to its own longer-run level.' },
  NA: { tone: 'info', label: 'No data', desc: 'Daily market data have not arrived yet.' },
};
const HEALTH_STATES = {
  ALERT: { tone: 'crit', label: 'Alert', desc: 'The index is below the alert level: pre-emptive contracts are prepared and the Dragon reserve may open.' },
  WATCH: { tone: 'warn', label: 'Watch', desc: 'The index is within 15 points of the alert level.' },
  STABLE: { tone: 'good', label: 'Stable', desc: 'The index is more than 15 points above the alert level.' },
  NA: { tone: 'info', label: 'No data', desc: 'The components have not arrived yet.' },
};

export function signals(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Signals & triggers'), empty());
  const P = app.params, S = app.prog, pr = app.programmes();
  const { board, vol, health, cash } = pr;

  const kpis = h('div', { class: 'kpis' },
    tkpi({ label: 'Trigger board', value: sbadge(TRIGGER_STATES, board.state), sub: `${board.monetary} of ${board.known} money and credit signals on` }, 'Whether inflation above the trigger is confirmed by a money or credit aggregate from a second publisher. A second check beside the contract states, which follow inflation and the excess stock.'),
    tkpi({ label: 'Health index', value: health.index == null ? '–' : num(health.index, 0), sub: sbadge(HEALTH_STATES, health.state) }, 'Composite of inflation, output, unemployment, fiscal and market stress, from 0 (severe) to 100 (none).'),
    tkpi({ label: 'Volatility index', value: vol.index == null ? '–' : `${num(vol.index, 2)}×`, sub: sbadge(VOL_STATES, vol.state) }, 'Volatility of the last 20 trading days as a multiple of its own longer-run level, averaged over the exchange rate, oil and the 10-year yield.'),
    tkpi({ label: 'Cash against trend', value: cash ? `${cash.excess < 0 ? '−' : '+'}${eur(Math.abs(cash.excess), 0)}` : '–', sub: cash ? `${eur(cash.stock, 2)} in circulation, ${cash.period}` : 'Waiting for ECB data' }, 'Euro banknotes and coins in circulation minus the level implied by their 2010–2019 trend: positive means excess hard cash.'),
    tkpi({ label: 'Below the deflation floor', value: String(board.below.length), sub: board.below.length ? board.below.slice(0, 4).map(c => c.name).join(', ') : `No economy below ${S.deflTh}%` }, 'Economies whose inflation is below the deflation floor, where PHX would be converted back into Digital Euro to add liquidity.'));

  const boardCard = card({ title: 'Trigger board', sub: 'A second check beside the contract states of the Overview and Contracts pages, which follow inflation and the excess stock: does money or credit growth, from another publisher, agree with the inflation signal?',
    body: h('div', null,
      h('p', null, sbadge(TRIGGER_STATES, board.state), ' ', TRIGGER_STATES[board.state].desc),
      tbl([['Indicator', 'The series watched by the contracts.'], ['Latest', 'Most recent published value.'], ['Period', 'Month the value refers to.'], ['Trigger', 'Level at or above which the condition is met; set below.'], ['Condition', 'Whether the latest value is at or above its trigger.'], ['Publisher', 'Where this browser fetched the series.']],
        board.rows.map(r => [r.label, r.value == null ? '–' : pct(r.value, 2), r.period || '–', pct(r.threshold, 1), r.breach == null ? h('span', { class: 'muted' }, 'no data') : h('span', { class: ['badge', r.breach ? 't-serious' : 't-good'], 'data-tip': r.breach ? 'At or above its trigger.' : 'Below its trigger.' }, r.breach ? 'Met' : 'Not met'), r.source]))) });

  const ranked = cells.map(c => ({ c, v: healthOf(c, P) })).sort((a, b) => a.v - b.v);
  const healthCard = card({ title: 'Economic health index', sub: 'Each component is the GDP-weighted distance from its normal value as a share of a fixed scale; the index is 100 minus their average. Below the alert level, pre-emptive contracts are prepared.',
    body: h('div', null,
      health.parts.length ? h('div', { class: 'meters' }, health.parts.map(p => meter(p.stress, { label: `${p.label}: ${num(p.value, 2)}${p.fmt === '%' || p.fmt === '×' ? p.fmt : ` ${p.fmt}`} on a scale of ${p.scale}`, max: 1, warn: 0.5, crit: 0.8 }))) : waiting('the components'),
      h('p', { class: 'sub' }, 'Weakest economies first; select one for its details.'),
      h('ul', { class: 'alerts' }, ranked.slice(0, 6).map(({ c, v }) => h('li', null, h('button', { class: 'alert-row', 'data-tip': `${c.name}: health index ${num(v, 0)} from its inflation, output gap, unemployment and fiscal balance. Select for its details.`, onclick: () => openCountry(app, c) }, h('b', null, c.name), h('span', null, `index ${num(v, 0)} · inflation ${pct(c.pi)} · gap ${num(c.x0 ?? 0, 1)}%`)))))) });

  const volCard = card({ title: 'Volatility index', sub: `Annualised volatility of daily changes over the last 20 trading days against the stored trading days before them. Alert at ${S.volTh}× normal.`,
    body: vol.parts.length ? tbl([['Market', 'The daily series.'], ['Last 20 days', 'Annualised volatility of the last 20 trading days.'], ['Normal', 'Annualised volatility over the stored trading days before the last 20.'], ['Ratio', 'Recent volatility as a multiple of normal.'], ['Days in normal', 'Number of trading days the normal level is computed from, and the first of them.'], ['Latest day', 'Last trading day in the data.']],
      vol.parts.map(p => [p.label, `${num(p.now, 2)} ${p.unit}`, `${num(p.norm, 2)} ${p.unit}`, `${num(p.ratio, 2)}×`, `${p.days} from ${p.from}`, p.asOf])) : waiting('daily market data') });

  let cashCard;
  if (cash) {
    const path = cash.path.slice(-120), labels = path.map(r => r[0]);
    cashCard = card({ title: 'Hard cash in circulation', sub: `Euro banknotes and coins, € billion, against the log-linear trend of 2010–2019 (${num(cash.trendGrowth, 1)}% a year). ${cash.yoy == null ? '' : `Now growing ${num(cash.yoy, 1)}% a year.`}`,
      legend: [{ label: 'In circulation', color: SERIES[0], line: true, tip: 'Currency in circulation reported by the ECB.' }, { label: '2010–2019 trend', color: SERIES[1], line: true, dash: true, tip: 'What the stock would be had it kept growing at its 2010–2019 pace.' }],
      body: h('div', null,
        lineChart({ series: [{ name: 'In circulation', color: SERIES[0], values: path.map((r, i) => [i, r[1]]) }, { name: 'Trend', color: SERIES[1], dash: true, values: path.map((r, i) => [i, r[2]]) }], yFmt: v => `€${num(v / 1000, 2)}tn`, xFmt: i => labels[Math.round(i)] || '', height: 200 }),
        h('p', { class: 'sub' }, cash.excess > 0 ? `Cash is ${eur(cash.excess, 0)} above trend: conversion drives and the tiered premium below would aim at this amount.` : `Cash is ${eur(-cash.excess, 0)} below trend: there is no excess hard cash to convert at present; the premium stays available to holders who choose it.`),
        tbl([['Amount converted', 'Slice of a single conversion of cash into PHX.'], ['Premium', 'One-off premium on that slice, in basis points (hundredths of a percent).']],
          CASH_TIERS.map((t, i) => [`${i ? `Above €${num(CASH_TIERS[i - 1].upTo, 0)}` : 'First'}${Number.isFinite(t.upTo) ? ` up to €${num(t.upTo, 0)}` : ''}`, `${t.bp} bp`]))),
      table: () => ({ cols: ['Month', 'In circulation €bn', 'Trend €bn'], rows: path.map(r => [r[0], num(r[1], 1), num(r[2], 1)]) }) });
  } else cashCard = card({ title: 'Hard cash in circulation', body: waiting('currency in circulation') });

  root.append(
    pageHead('Signals & triggers', 'The conditions that arm and confirm the contracts, read from several independent publishers: inflation, money and credit, market volatility, a composite health index and hard cash.'),
    kpis,
    h('div', { class: 'state-legend' }, Object.entries(TRIGGER_STATES).map(([k]) => h('div', null, sbadge(TRIGGER_STATES, k), h('span', null, TRIGGER_STATES[k].desc)))),
    boardCard,
    h('div', { class: 'grid-2' }, healthCard, h('div', { class: 'stack' }, volCard, settingsCard(app, 'triggers'))),
    cashCard,
    explain('How the signals are used',
      h('p', null, 'Contracts are self-executing rules: each watches published indicators and acts when its conditions are met. The contract states shown on the Overview and Contracts pages follow two conditions, inflation and the excess stock. Because one release can be noisy or revised, the trigger board adds a check between publishers: with inflation from Eurostat (or the IMF outside Europe) at or above its trigger, does at least one money or credit aggregate from the ECB stand at or above its own? “Confirmed” means prices and money point the same way; “Unconfirmed” means the signal comes from prices alone, as in a surge driven by energy or supply. The board informs the reading of the contract states; it does not switch them.'),
      h('p', null, 'The health index and the volatility index look ahead of the trigger. A falling health index prepares contracts before inflation breaches; high volatility releases the volatility buffer and changes how recalled PHX is paid out. When inflation falls below the deflation floor the mechanism runs in reverse and PHX is converted back into Digital Euro.'),
      h('p', null, `Every change of state on this page is written to the signed audit ledger with the values that caused it (inflation is ${pct(board.pi, 2)} now). All thresholds are settings on this page.`)),
    sourceLine(app));
}
