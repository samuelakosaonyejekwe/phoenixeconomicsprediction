import { h, num, pct } from '../ui/dom.js';
import { card, lineChart, SERIES, stackedBars } from '../ui/charts.js';
import { pageHead, explain, empty, objectiveChips, kpi, sourceLine } from './common.js';

// Observed dispersion of monthly inflation across economies.
function dispersionHistory(cells) {
  // From 2001, the start of the paper's samples: earlier years include episodes of very high inflation
  // (Bulgaria 1997, Romania) that would dwarf every later movement.
  const periods = [...new Set(cells.flatMap(c => (c.piFull || c.piHist).map(r => r[0])))].filter(p => /^\d{4}-\d{2}$/.test(p) && p >= '2001-01').sort();
  return periods.map(p => {
    const v = cells.map(c => (c.piFull || c.piHist).find(r => r[0] === p)?.[1]).filter(x => x !== undefined);
    if (v.length < 3) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { p, mean: m, var: v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length };
  }).filter(Boolean);
}

export function stability(root, app) {
  const cells = app.simCells();
  if (!cells.length) return root.append(pageHead('Stability & feedback'), empty());
  const P = app.effParams();
  const sim = app.sim(true), base = app.sim(false);
  const hist = dispersionHistory(app.cells);
  const end = sim.agg.at(-1), endB = base.agg.at(-1);
  const recalled = sim.totals.recallEuro + sim.totals.recallDragon;
  const tF = v => `m${num(v, 0)}`;
  const pair = (title, sub, key, fmt, refs = []) => card({
    title, sub, legend: [{ label: 'With Phoenix', color: SERIES[0], line: true }, { label: 'Without', color: SERIES[1], line: true, dash: true }],
    body: lineChart({ series: [{ name: 'With Phoenix', color: SERIES[0], values: sim.agg.map(a => [a.t, a[key]]) }, { name: 'Without', color: SERIES[1], dash: true, values: base.agg.map(a => [a.t, a[key]]) }], refs, yFmt: fmt, xFmt: tF }),
    table: () => ({ cols: ['Month', 'With', 'Without', 'Difference'], rows: sim.agg.filter((_, i) => i % 4 === 0).map((a, i) => [num(a.t, 0), fmt(a[key]), fmt(base.agg[i * 4][key]), num(a[key] - base.agg[i * 4][key], 5)]) }),
  });

  root.append(
    pageHead('Stability & feedback', 'The disorder index, the demand and policy-rate response, and the feedback loop that retunes contracts as conditions change (Solutions §4.8–4.12, §8).'),
    h('div', { class: 'kpis' },
      kpi({ label: `Disorder index at m${P.months}`, value: num(end.D, 2), delta: `${num(end.D - endB.D, 2)} vs no Phoenix`, good: end.D <= endB.D, sub: `now ${num(sim.agg[0].D, 2)}` }),
      kpi({ label: `Output gap at m${P.months}`, value: `${num(end.x, 2)}%`, sub: `${num(endB.x, 2)}% without Phoenix (${num(end.x - endB.x, 3)} pp)` }),
      kpi({ label: `Policy rate at m${P.months}`, value: pct(end.i, 2), sub: `${pct(endB.i, 2)} without Phoenix (${num(end.i - endB.i, 3)} pp)` }),
      kpi({ label: 'Live inflation dispersion', value: hist.length ? num(hist.at(-1).var, 2) : '–', sub: hist.length ? `Var(π) across economies, ${hist.at(-1).p}` : 'Monthly data needed' }),
      kpi({ label: 'Recall activity', value: recalled > 0 ? 'Engaged' : 'Idle', sub: `Saturation threshold ${P.recallAt}` })),
    h('div', { class: 'grid-2' },
      pair('Disorder index 𝒟 (§4.12)', 'GDP-weighted: (π − π*)² + ω_x x², the macroeconomic part of the loss', 'D', v => num(v, 2)),
      pair('Output gap x (§4.8)', '% of potential, GDP-weighted', 'x', v => `${num(v, 2)}%`, [{ y: 0, label: '' }]),
      pair('Policy rate i (§4.10)', 'Euro area: market forward path plus a Taylor response to Phoenix’s own effect; elsewhere a smoothed Taylor rule', 'i', v => `${num(v, 2)}%`),
      card({ title: 'Feedback field F(t) and activation Θ(t) (§4.11)', sub: 'dF/dt = −ρ_F π̇ − k_I(π − π*) − ξ(H − H*)⁺ − ν_F F; acts only when the optional gain γ is above zero',
        legend: [{ label: 'F', color: SERIES[0], line: true }, { label: 'Θ', color: SERIES[2], line: true }],
        body: lineChart({ series: [{ name: 'F', color: SERIES[0], values: sim.agg.map(a => [a.t, a.F]) }, { name: 'Θ', color: SERIES[2], values: sim.agg.map(a => [a.t, a.Theta]) }], refs: [{ y: 0, label: '' }], yFmt: v => num(v, 2), xFmt: tF }),
        table: () => ({ cols: ['Month', 'F', 'Θ'], rows: sim.agg.filter((_, i) => i % 4 === 0).map(a => [num(a.t, 0), num(a.F, 4), num(a.Theta, 3)]) }) }),
      hist.length ? card({ title: 'Observed inflation dispersion', sub: 'Cross-economy variance of monthly HICP inflation, since 2001',
        body: lineChart({ series: [{ name: 'Var(π)', color: SERIES[0], values: hist.map((x, i) => [i, x.var]), area: true }], yFmt: v => num(v, 2), xFmt: i => hist[Math.round(i)]?.p || '' }),
        table: () => ({ cols: ['Month', 'Mean π', 'Var(π)'], rows: hist.map(x => [x.p, num(x.mean, 2), num(x.var, 3)]) }) }) : null,
      cells.length > 1 ? card({ title: `Disorder by economy at month ${P.months}`, sub: 'Highest first, with Phoenix',
        body: stackedBars({ rows: cells.map((c, i) => ({ label: c.name, segments: [{ name: '𝒟', value: sim.rec.D.at(-1)[i], color: SERIES[0] }] })).sort((a, b) => b.segments[0].value - a.segments[0].value).slice(0, 15), fmt: v => num(v, 2) }) }) : null),
    explain('Reading the loop',
      h('p', null, 'The core loop runs through activation and absorption: inflation and the excess stock relative to its historical threshold set the activation Θ, Θ sets absorption Φ, and the guard eases absorption as inflation nears target. Absorption lowers demand only by the spending the absorbed funds would otherwise have financed; the output gap moves core inflation through the estimated Phillips curve; and the policy rate responds to Phoenix’s own effect (Solutions §4.8–4.10).'),
      h('p', null, 'The optional feedback field can retune the contracts — raising the absorption speed and lowering the trigger when inflation is above target or accelerating — but its gain is zero by default and it changes nothing measurable (Solutions §4.11, §7.4). When wallets saturate, recall returns PHX to the Digital Euro or bank accounts or, in an inflation crisis, to the Dragon reserve held at the central bank (§4.7).'),
      h('p', null, 'The linearised euro-area core is certified stable by a quadratic Lyapunov function, and Phoenix’s bounded input can move it only within an explicit input-to-state bound (Solutions §8). The disorder index barely differs with and without Phoenix, because the inflation effect of absorption is thousandths of a point; the overhang of the excess stock is what Phoenix changes (Solutions §7).')),
    objectiveChips([8, 9, 3]),
    sourceLine(app));
}
