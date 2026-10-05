import { h, num, pct, eur, icon } from '../ui/dom.js';
import { card, lineChart, SERIES, dataTable } from '../ui/charts.js';
import { estimatePhillipsRobust } from '../model/estimation.js';
import { context } from '../model/inputs.js';
import { DEFAULTS } from '../model/params.js';
import { paperResults } from '../data/paper.js';
import REGISTER from '../content/risk-register.json';
import { pageHead, kpi, explain, objectiveChips } from './common.js';

// Evidence (Solutions §5–7, §9.6): the published results of the paper, their reproduction in this
// browser from the archived data, and the key estimates recomputed from today's live data.
let published = null, pubState = 'idle';
let repro = { state: 'idle' };
let liveCache = null;

function loadPublished(app) {
  if (pubState !== 'idle') return;
  pubState = 'loading';
  paperResults().then(j => { published = j; pubState = j ? 'ok' : 'missing'; app.rerender(); });
}

function runReproduction(app) {
  if (repro.state === 'running') return;
  let w;
  try { w = globalThis.PHX_REPRO_SRC ? new Worker(URL.createObjectURL(new Blob([globalThis.PHX_REPRO_SRC], { type: 'text/javascript' }))) : new Worker('repro.js'); } catch { repro = { state: 'error', error: 'This edition cannot start background workers; open the app from one of its web addresses.' }; app.rerender(); return; }
  repro = { state: 'running', progress: 'Starting', t0: Date.now() }; app.busy = (app.busy || 0) + 1;
  app.rerender();
  w.onmessage = ({ data }) => {
    if (data.progress) { repro.progress = data.progress; app.rerender(); }
    if (data.done || data.error) { repro = data.error ? { state: 'error', error: data.error } : { state: 'done', ...data }; app.busy--; w.terminate(); app.rerender(); }
  };
  w.onerror = e => { repro = { state: 'error', error: e.message || 'Worker failed' }; app.busy--; w.terminate(); app.rerender(); };
  w.postMessage({ base: location.href, embedded: globalThis.PHX_EMBED_PAPER || null });
}

function liveEstimates(app) {
  const key = `${app.dataStamp}:${app.params.accStart}`;
  if (liveCache?.key === key) return liveCache;
  let ph = null, crit = null;
  try { ph = estimatePhillipsRobust(app.data, { y1: new Date().getUTCFullYear() - 1 }); } catch {}
  try { crit = context(app.data, app.params).crit; } catch {}
  return (liveCache = { key, ph, crit });
}

const f3 = v => (v == null || !Number.isFinite(v) ? '–' : num(v, 3));
const m3 = v => (v == null || !Number.isFinite(v) ? '–' : num(v * 1000, 2));

export function validate(root, app) {
  loadPublished(app);
  const live = liveEstimates(app), o = published;
  const P = app.params, sim = app.sim(true);
  const changed = Object.keys(DEFAULTS).filter(k => P[k] !== DEFAULTS[k]);

  const reproCard = card({
    title: 'Reproduce the paper in this browser (§9.6)',
    sub: 'Runs the same code as the paper’s computation script on the archived data of 4 October 2026 and compares every published number. Takes one to three minutes.',
    actions: h('button', { class: 'btn', disabled: repro.state === 'running', onclick: () => runReproduction(app) }, icon('refresh', 16), repro.state === 'running' ? 'Running…' : repro.state === 'done' ? 'Run again' : 'Reproduce'),
    body: repro.state === 'idle' ? h('p', { class: 'sub' }, 'Not run yet.')
      : repro.state === 'running' ? h('p', { class: 'sub', role: 'status' }, `${repro.progress}… (${Math.round((Date.now() - repro.t0) / 1000)} s)`)
      : repro.state === 'error' ? h('p', { class: 'note', role: 'alert' }, repro.error)
      : h('div', null,
        h('p', { role: 'status' }, h('span', { class: ['badge', repro.mismatches.length ? 't-crit' : 't-good'] }, icon(repro.mismatches.length ? 'alert' : 'ok', 14), repro.mismatches.length ? `${repro.mismatches.length} differences` : 'Exact match'),
          ` ${repro.matched.toLocaleString('en')} of ${repro.checked.toLocaleString('en')} published values reproduced in ${num(repro.seconds, 0)} s from the data archived on ${repro.builtAt?.slice(0, 10)}.`),
        dataTable({ cols: ['Result', 'Paper', 'This browser', 'Where'], rows: repro.headlines.map(x => [x.label, f3(x.want), f3(x.got), x.where]) }),
        repro.mismatches.length ? dataTable({ cols: ['Value', 'Paper', 'This browser'], rows: repro.mismatches.map(m => [m.path, String(m.want), String(m.got)]) }) : null),
  });

  const blocks = [
    pageHead('Evidence', 'The paper’s results, reproduced here from its archived data, and the key estimates recomputed from today’s live data (Phoenix Economics Solutions §5–7, §9.6).'),
    h('div', { class: 'kpis' },
      kpi({ label: 'Phillips slope κ (IV), live data', value: live.ph ? num(live.ph.iv.kappa, 3) : '–', sub: live.ph ? `s.e. ${num(live.ph.iv.kappaSe, 3)} · first-stage F ${num(live.ph.iv.firstStageF, 0)} · ${live.ph.iv.n} obs. (paper: ${o ? num(o.phillips.full.iv.kappa, 3) : '…'})` : 'Data loading' }),
      kpi({ label: 'Threshold S_crit, live data', value: live.crit ? `${num(live.crit.p90, 1)}% of GDP` : '–', sub: live.crit ? `90th percentile of ${live.crit.n} pre-2020 windows of ${live.crit.L} quarters (paper: ${o ? num(o.measure.crit.p90, 1) : '…'}%)` : '' }),
      kpi({ label: 'Conservation, current run', value: sim && Math.abs(sim.totals.residual) < 1e-6 ? 'Exact' : sim ? eur(sim.totals.residual, 6) : '–', sub: 'Absorbed + premiums = credits + wallets + spent + matured + recalled (§4.13)' }),
      kpi({ label: 'Parameters', value: changed.length ? `${changed.length} changed` : 'Paper defaults', sub: changed.length ? `Live results below use your settings: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? '…' : ''}` : 'Table 6 of the paper' })),
    reproCard,
  ];

  if (!o) blocks.push(card({ title: 'Published results', body: h('p', { class: 'sub' }, pubState === 'missing' ? 'The published results are not available in this edition.' : 'Loading…') }));
  else {
    const ph = o.phillips, rt = o.phillipsRealTime, ew = o.ew;
    const val = o.validation, vr = val['actual rates, realised energy'], va = val['ex ante: market rates, flat energy'];
    blocks.push(
      h('div', { class: 'grid-2' },
        card({ title: 'Core Phillips curve, EU-27 (Table 4)', sub: 'Two-way clustered standard errors in parentheses',
          body: dataTable({ cols: ['Estimator', 'Sample', 'a', 'κ', 'γ_E', 'First-stage F'], rows: [['full', '2001–2025'], ['pre2020', '2001–2019']].flatMap(([s, lab]) => [['ols', 'OLS, country effects'], ['fe2', 'Two-way fixed effects'], ['iv', 'IV, country effects'], ['jk', 'Half-panel jackknife (OLS)']].map(([e, name]) => {
            const r = ph[s][e], se = v => (v == null ? '' : ` (${num(v, 3)})`);
            return [name, lab, `${num(r.aAnnual, 3)}${se(r.aSe)}`, `${num(r.kappa, 3)}${se(r.kappaSe)}`, `${num(r.gammaE, 3)}${se(r.gammaESe)}`, r.firstStageF ? num(r.firstStageF, 0) : '—'];
          })) }) }),
        h('div', { class: 'stack' },
        card({ title: 'Real-time out-of-sample test (Table 5)', sub: `December inflation, EU-27, 2010–2025, ${rt.iv.n} forecasts, RMSE in pp`,
          body: dataTable({ cols: ['Estimator', 'Model given energy', 'Benchmark given energy', 'Model, mean energy', 'No change'], rows: [['iv', 'IV (model)'], ['iv_gammaRegional', 'IV, γ_E two-way FE'], ['ols', 'OLS'], ['regional', 'Two-way FE']].map(([k, n]) => [n, num(rt[k].cond, 2), num(rt[k].condBench, 2), num(rt[k].uncond, 2), num(rt[k].naive, 2)]) }) }),
      card({ title: 'Validation from November 2021 (Figure 5)', sub: `No-Phoenix model paths against actual EU-27 inflation. RMSE: realised energy ${num(vr.rmse, 2)} pp; ex ante ${num(va.rmse, 2)} pp`,
        legend: [{ label: 'Actual', color: SERIES[2], line: true }, { label: 'Model, realised energy', color: SERIES[0], line: true }, { label: 'Model, ex ante', color: SERIES[1], line: true, dash: true }],
        body: lineChart({ series: [
          { name: 'Actual', color: SERIES[2], values: vr.path.filter(p => p[2] != null).map(p => [p[0], p[2]]) },
          { name: 'Model, realised energy', color: SERIES[0], values: vr.path.map(p => [p[0], p[1]]) },
          { name: 'Model, ex ante', color: SERIES[1], dash: true, values: va.path.map(p => [p[0], p[1]]) }], yFmt: v => `${num(v, 1)}%`, xFmt: v => `m${num(v, 0)}` }),
        table: () => ({ cols: ['Month', 'Actual', 'Realised energy', 'Ex ante'], rows: vr.path.map((p, k) => [p[0], p[2] == null ? '–' : num(p[2], 1), num(p[1], 2), num(va.path[k][1], 2)]) }) }))),
      card({ title: 'Early-warning backtest, EU-27 (Table 7)', sub: 'Diebold–Mariano tests on the cross-sectional mean loss; breach-probability benchmark is the real-time historical frequency',
        body: dataTable({ cols: ['Measure', 'All, 2001–2026', 'Hold-out, 2001–2017', 'Recent, 2018–2026'], rows: [
          ['Forecasts', ...['all', 'holdout', 'recent'].map(k => ew[k].n.toLocaleString('en'))],
          ['RMSE 6 months, projection / no change', ...['all', 'holdout', 'recent'].map(k => `${num(ew[k].rmse6, 2)} / ${num(ew[k].naive6, 2)}`)],
          ['DM 6 months (p)', ...['all', 'holdout', 'recent'].map(k => `${num(ew[k].dm6.stat, 2)} (${num(ew[k].dm6.p, 2)})`)],
          ['RMSE 12 months, projection / no change', ...['all', 'holdout', 'recent'].map(k => `${num(ew[k].rmse12, 2)} / ${num(ew[k].naive12, 2)}`)],
          ['DM 12 months (p)', ...['all', 'holdout', 'recent'].map(k => `${num(ew[k].dm12.stat, 2)} (${num(ew[k].dm12.p, 2)})`)],
          ['Brier score / real-time frequency', ...['all', 'holdout', 'recent'].map(k => `${num(ew[k].brier, 3)} / ${num(ew[k].brierClimRT, 3)}`)]] }) }),
      card({ title: 'EU-27 as of 31 December 2021, with and without Phoenix (Table 11)', sub: 'Effects in thousandths of a percentage point',
        body: dataTable({ cols: ['Month', 'π with, %', 'Δπ', 'S with / without, €bn', 'S_crit, €bn', 'Credits, €bn', 'Wallets, €bn'],
          rows: o.ref2021.rows.map(r => [r.m, num(r.on.pi, 2), m3(r.on.pi - r.off.pi), `${num(r.on.S, 0)} / ${num(r.off.S, 0)}`, num(r.on.Scrit, 0), num(r.on.C, 1), num(r.on.L, 1)]) }) }),
      card({ title: 'Live results by region, 24 months (Table 9)', sub: 'Archived data of 4 October 2026; effects in thousandths of a percentage point',
        body: dataTable({ cols: ['Measure', 'Euro area', 'European Union', 'Global'], rows: [
          ['Excess deposits now, €bn', ...['ea', 'eu', 'global'].map(k => num(o.live[k].rows[0].on.S, 0))],
          ['Sum of S_crit, €bn', ...['ea', 'eu', 'global'].map(k => num(o.live[k].rows[0].on.Scrit, 0))],
          ['Economies above S_crit', ...['ea', 'eu', 'global'].map(k => String(o.live[k].above.length))],
          ['Absorbed over 24 months, €bn', ...['ea', 'eu', 'global'].map(k => num(o.live[k].totals.absorbed, 1))],
          ['Effect on inflation, month 24', ...['ea', 'eu', 'global'].map(k => m3(o.live[k].rows.at(-1).on.pi - o.live[k].rows.at(-1).off.pi))]] }) }),
      card({ title: 'Stress tests (§7.7)', sub: `${o.mc_eu2021.runs} runs each with correlated parameter draws and four model structures; effect on inflation at month 24, thousandths of a pp`,
        body: dataTable({ cols: ['Scenario', '10th percentile', 'Median', '90th percentile', 'Largest conservation residual, €bn'], rows: [['EU-27 as of 31 Dec 2021', o.mc_eu2021], ['Euro area today', o.mc_ea]].map(([n, r]) => [n, m3(r.dPi[0]), m3(r.dPi[1]), m3(r.dPi[2]), r.maxResidual == null ? '–' : r.maxResidual.toExponential(1)]) }) }));
  }

  // Methodological risk register (Solutions §11, Table 20), exported from the paper itself.
  const removed = REGISTER.rows.filter(r => r.status === 'Removed').length;
  blocks.push(card({ title: 'Risk register (Table 20)', sub: `${REGISTER.rows.length} methodological risks: ${removed} removed by the method, ${REGISTER.rows.length - removed} bounded, each with the step that resolves it`,
    body: h('div', null, h('p', null, REGISTER.intro),
      h('details', null, h('summary', null, 'Show the full register'),
        dataTable({ cols: ['No.', 'Risk', 'Treatment', 'Status', 'Where', 'Resolution'], rows: REGISTER.rows.map(r => [String(r.n), r.risk, r.treatment, r.status, r.where, r.resolution]) })),
      h('p', { class: 'sub' }, REGISTER.inherent)) }));

  blocks.push(
    explain('How to read this page',
      h('p', null, 'The paper’s numbers come from one script (paper/compute.mjs) run on data archived on 4 October 2026. Its core — measurement, estimation, scenarios, sensitivity and instruments — is a single function in the application’s own model code, and “Reproduce” runs that function here on the same archived data and compares every published value. The forecast backtest, the optimisation frontier and the stress tests take longer and are shown as published; the repository’s regression tests check them with the rest.'),
      h('p', null, 'The cards at the top recompute key estimates from today’s live data, so they move as new data are published; the paper’s values are shown alongside for comparison.'),
      h('p', null, 'The central finding is that absorbing idle money moves inflation by thousandths of a percentage point — far below the 0.1-point rounding of published inflation. Phoenix’s measurable contributions are measuring idle money, managing exceptional stocks under legal control, early warning and a verifiable audit trail (§7–8, §12).')),
    objectiveChips([3, 10, 12]));
  root.append(...blocks);
}
