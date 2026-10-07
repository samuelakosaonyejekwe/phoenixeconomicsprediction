import { h, icon, num, eur, pct, download, toast } from '../ui/dom.js';
import { card, lineChart, SERIES, tileMap, dotMap, divColor, seqColor, inkOn } from '../ui/charts.js';
import { PARAM_GROUPS, SCENARIOS } from '../model/params.js';
import { optimiseKA } from '../model/engine.js';
import { context } from '../model/inputs.js';
import { paperResults } from '../data/paper.js';
import { pageHead, explain, kpi, empty, objectiveChips, openCountry } from './common.js';
import { slider } from './controls.js';

let frame = null, field = 'pi', playing = null, openGroup = 'absorb', mcResult = null, mcKey = '', mcRun = null, mcBtnRef = null;
// The k_A search result survives redraws (data refreshes, status updates) while its inputs are unchanged.
let kaResult = null, kaKey = '', kaBusy = '', kaData = '', kaTimer = 0, kaReveal = false, mcReveal = false, mcData = '';
// A result asked for with a button is brought into view and marked when it arrives, and again once
// the cards around it have taken their places.
function reveal(el) {
  const show = first => {
    if (!el.isConnected) return;
    const rc = el.getBoundingClientRect();
    if (first || rc.top < 70 || rc.bottom > innerHeight - 70) el.scrollIntoView({ block: rc.height > innerHeight - 160 ? 'start' : 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (first) { el.classList.add('flash'); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  };
  setTimeout(() => show(true), 60);
  setTimeout(() => show(false), 700);
}

const FIELDS = {
  pi: { label: 'Inflation π', fmt: v => pct(v, 2), color: (v, P) => divColor(v - P.target, 4), val: (r, f, i) => r.rec.pi[f][i] },
  rho: { label: 'Surplus S/S_crit', fmt: v => `${num(v, 2)}×`, color: v => divColor(Math.log(Math.max(0.05, v)), 2), val: (r, f, i) => r.rec.S[f][i] / r.Scrit[i] },
  Theta: { label: 'Activation Θ', fmt: v => num(v, 2), color: v => seqColor(v), val: (r, f, i) => r.rec.Theta[f][i] },
  H: { label: 'Saturation H', fmt: v => num(v, 2), color: v => seqColor(Math.min(1, v)), val: (r, f, i) => r.rec.H[f][i] },
  x: { label: 'Output gap x', fmt: v => `${num(v, 2)}%`, color: v => divColor(v, 4), val: (r, f, i) => r.rec.x[f][i] },
  i: { label: 'Policy rate i', fmt: v => `${num(v, 2)}%`, color: v => seqColor(Math.min(1, Math.max(0, v / 6))), val: (r, f, i) => r.rec.i[f][i] },
  D: { label: 'Disorder index 𝒟', fmt: v => num(v, 2), color: v => seqColor(Math.min(1, v / 20)), val: (r, f, i) => r.rec.D[f][i] },
};

// First month at which inflation is within ±0.3 pp of the target and stays there to the horizon.
const firstOnTarget = (agg, target) => { let t = null; for (let k = agg.length - 1; k >= 0 && Math.abs(agg[k].pi - target) <= 0.3; k--) t = agg[k].t; return t; };

export function simulate(root, app) {
  const cells = app.simCells();
  if (!cells.length) return root.append(pageHead('Simulation lab'), empty());
  const P = app.effParams();
  const sim = app.sim(true), base = app.sim(false);
  const T = sim.agg.length;
  if (frame === null || frame >= T) frame = T - 1;
  const end = sim.agg[T - 1], endB = base.agg[T - 1];

  // Scenario + parameter panel.
  const scen = h('div', { class: 'scen' }, Object.entries(SCENARIOS).map(([k, s]) =>
    h('button', { class: ['scen-b', app.scenario === k && 'on'], 'aria-pressed': String(app.scenario === k), 'data-tip': `${s.desc} Select to start the simulation from this case.`, onclick: () => app.setScenario(k) }, h('b', null, s.label), h('small', null, s.desc))));
  const groups = h('div', { class: 'acc' }, PARAM_GROUPS.map(g => h('details', { open: openGroup === g.id, ontoggle: e => { if (e.target.open) openGroup = g.id; } },
    h('summary', null, h('b', null, g.title), g.pde.length ? h('small', null, g.pde.join(' · ')) : null),
    h('div', { class: 'ctrl-grid' }, g.params.map(p => slider(app, { ...p, def: p.def }))))));

  // Results.
  const tF = v => `m${num(v, v % 1 ? 1 : 0)}`;
  const two = (title, sub, a, b, key, fmt, refs = [], names = ['With Phoenix', 'Without Phoenix']) => card({
    title, sub, legend: [{ label: names[0], color: SERIES[0], line: true }, { label: names[1], color: SERIES[1], line: true, dash: true }],
    body: lineChart({ series: [{ name: names[0], color: SERIES[0], values: a.map(x => [x.t, key(x)]) }, { name: names[1], color: SERIES[1], dash: true, values: b.map(x => [x.t, key(x)]) }], refs, yFmt: fmt, xFmt: tF, height: 200 }),
    table: () => ({ cols: ['Month', names[0], names[1]], rows: a.filter((_, i) => i % 4 === 0).map((x, i) => [num(x.t, 0), fmt(key(x)), fmt(key(b[i * 4]))]) }),
  });
  const one = (title, sub, list, fmt, refs = []) => card({
    title, sub, legend: list.length > 1 ? list.map((l, i) => ({ label: l.name, color: SERIES[l.c ?? i], line: true })) : null,
    body: lineChart({ series: list.map((l, i) => ({ name: l.name, color: SERIES[l.c ?? i], values: sim.agg.map(x => [x.t, l.key(x)]) })), refs, yFmt: fmt, xFmt: tF, height: 200 }),
    table: () => ({ cols: ['Month', ...list.map(l => l.name)], rows: sim.agg.filter((_, i) => i % 4 === 0).map(x => [num(x.t, 0), ...list.map(l => fmt(l.key(x)))]) }),
  });

  // Playback map.
  const F = FIELDS[field];
  const mapCells = sim.cells.map((c, i) => ({ ...c, _i: i }));
  const mapHost = h('div');
  const tLabel = h('b', null, tF(sim.rec.t[frame]));
  const drawMap = () => {
    const val = c => F.val(sim, frame, c._i);
    tLabel.textContent = tF(sim.rec.t[frame]);
    if (mapCells.length === 1) {
      const v = val(mapCells[0]);
      const bg = F.color(v, P);
      mapHost.replaceChildren(h('div', { class: 'single', style: { background: bg, color: inkOn(bg) } }, h('b', null, mapCells[0].name), h('span', null, F.fmt(v))));
    } else mapHost.replaceChildren(app.region === 'global' || mapCells[0].col === undefined
      ? dotMap({ cells: mapCells, value: val, color: v => F.color(v, P), fmt: F.fmt })
      : tileMap({ cells: mapCells, value: val, color: v => F.color(v, P), fmt: F.fmt, onSelect: c => app.cells.find(x => x.id === c.id) && openCountry(app, app.cells.find(x => x.id === c.id)) }));
  };
  const range = h('input', { type: 'range', min: 0, max: T - 1, step: 1, value: frame, 'aria-label': 'Simulation month', oninput: e => { frame = +e.target.value; drawMap(); } });
  const playBtn = h('button', { class: 'btn btn-s', onclick: () => {
    if (playing) { clearInterval(playing); playing = null; playBtn.replaceChildren(icon('play', 16), 'Play'); return; }
    if (frame >= T - 1) frame = 0;
    playBtn.replaceChildren(icon('pause', 16), 'Pause');
    playing = setInterval(() => {
      if (!range.isConnected) { clearInterval(playing); playing = null; return; }
      frame = Math.min(T - 1, frame + 1); range.value = frame; drawMap();
      if (frame >= T - 1) { clearInterval(playing); playing = null; playBtn.replaceChildren(icon('play', 16), 'Play'); }
    }, 120);
  } }, icon('play', 16), 'Play');
  const fieldSel = h('select', { 'aria-label': 'Field', onchange: e => { field = e.target.value; app.rerender(); } }, Object.entries(FIELDS).map(([k, f]) => h('option', { value: k, selected: k === field }, f.label)));
  drawMap();

  // Regime comparison (Solutions §7.4, Table 13), recomputed for the selected economies.
  const regimes = [
    ['No Phoenix', app.sim(false)],
    ['Phoenix (current settings)', sim],
    ['Faster absorption k_A × 3', app.sim(true, { kA: Math.min(1, P.kA * 3) })],
    ['Cap 3% of GDP a year', app.sim(true, { capPct: 3 })],
    ['Government spending rate 0.2', app.sim(true, { sdGov: 0.2 })],
    ['Steep Phillips curve κ = 0.25 (tight labour markets)', app.sim(true, { kappaPC: 0.25 })],
    ['Release at the trigger instead of the target', app.sim(true, { piRel: P.piTh })],
  ];
  const noPhx = { 'Government spending rate 0.2': app.sim(false, { sdGov: 0.2 }), 'Steep Phillips curve κ = 0.25 (tight labour markets)': app.sim(false, { kappaPC: 0.25 }) };
  const regimeTable = h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Regime', `π at m${P.months}`, 'Δπ vs no Phoenix, pp', `Policy rate at m${P.months}`, `Excess stock at m${P.months}`, 'Absorbed', `Disorder at m${P.months}`].map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', null, regimes.map(([name, r]) => { const e = r.agg.at(-1), b = (noPhx[name] || base).agg.at(-1); return h('tr', null, h('th', { scope: 'row' }, name), h('td', null, pct(e.pi, 2)), h('td', null, num(e.pi - b.pi, 4)), h('td', null, pct(e.i, 2)), h('td', null, eur(e.S, 1)), h('td', null, eur(r.totals.absorbed, 1)), h('td', null, num(e.D, 2))); }))));

  // Optimiser: k_A feasibility, economy by economy (§4.3–4.4).
  const optIntro = h('p', { class: 'sub' }, `Finds the economies that would still hold an exceptional stock (above their own S_crit) at month ${P.months} without absorption, the smallest absorption speed k_A that brings each of them down to its threshold, and what stops the others. The loss-minimising policy over all levers is in Solutions §7.6 (Table 15).`);
  const optOut = h('div', { class: 'opt-result', role: 'status', 'aria-live': 'polite', hidden: true });
  // The answer belongs to a region, scenario and parameter set; when newer data arrive it stays on screen
  // and is recomputed on them.
  const optKey = JSON.stringify([app.region, app.scenario, P]);
  const runKA = () => {
    kaBusy = optKey;
    clearTimeout(kaTimer);
    kaTimer = setTimeout(() => {
      const r = optimiseKA(app.simCells(), app.effParams(), SCENARIOS[app.scenario], { market: app.marketPath() });
      kaResult = r; kaKey = optKey; kaData = app.dataStamp; kaBusy = '';
      app.rerender();
    }, 30);
  };
  const drawKA = r => {
    const list = xs => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} and ${xs.length - 6} more` : xs.join(', '));
    optOut.hidden = false;
    if (!r.above.length) {
      optOut.replaceChildren(h('b', { class: 'opt-h' }, 'Result'), h('p', null, `No economy would still be above its S_crit at month ${P.months} without absorption: each threshold, which rises as the episode ages, overtakes the stock, so no absorption is needed.`));
      return;
    }
    const reasons = [
      r.why.cap && [list(r.why.cap), `the legal cap of ${P.capPct}% of GDP a year binds (§4.4).`],
      r.why.trigger && [list(r.why.trigger), `inflation falls below the trigger of ${P.piTh}% or near target, so contracts stand down and the guard stops absorption while new inflows keep arriving (§4.3–4.4).`],
      r.why.takeup && [list(r.why.takeup), `voluntary take-up at a premium of ${P.rP}% limits what households and firms place (§2.4, §4.4).`],
      r.why.inflow && [list(r.why.inflow), 'the stock stays only just above S_crit, where activation is deliberately weak because it grows with the size of the excess, while new inflows keep arriving (§4.3, §3.4).'],
    ].filter(Boolean);
    optOut.replaceChildren(...[
      h('b', { class: 'opt-h' }, 'Result'),
      h('p', null, `Without absorption, ${r.above.length} ${r.above.length === 1 ? 'economy stays' : 'economies stay'} above S_crit at month ${P.months}: ${list(r.above)}.`),
      r.kA !== null
        ? h('p', { class: 'opt-k' }, 'Minimum k_A ', h('b', null, `≈ ${num(r.kA, 3)}`), ` per month (now ${P.kA}) brings ${r.unreachable.length ? list(r.reachable) : r.reachable.length === 1 ? 'it' : 'all of them'} down to the threshold. `,
          h('button', { class: 'btn btn-s', 'data-tip': `Set k_A to ${num(r.kA, 3)}; every chart reruns with it.`, onclick: () => { app.setParam('kA', Math.round(r.kA * 1000) / 1000); toast(`k_A set to ${num(r.kA, 3)}.`); } }, 'Apply'))
        : h('p', { class: 'opt-k' }, 'No value of k_A up to 1 brings these economies down to their thresholds.'),
      reasons.length ? h('p', { class: 'opt-why' }, r.kA !== null ? 'Not reachable even at k_A = 1:' : 'Why:') : null,
      reasons.length ? h('ul', { class: 'opt-why' }, reasons.map(([who, why]) => h('li', null, h('b', null, `${who}: `), why))) : null,
    ].filter(Boolean));
  };
  if (kaResult && kaKey === optKey) {
    drawKA(kaResult);
    if (kaData !== app.dataStamp && kaBusy !== optKey) runKA();
    if (kaReveal) { kaReveal = false; reveal(optOut); }
  }
  const busy = kaBusy === optKey;
  const optBtn = h('button', { class: 'btn', disabled: busy, 'aria-busy': String(busy), onclick: () => { kaReveal = true; optBtn.disabled = true; optBtn.lastChild.textContent = 'Searching…'; runKA(); } }, icon('zap', 16), h('span', null, busy ? 'Searching…' : kaResult && kaKey === optKey ? 'Search again' : 'Optimise k_A'));

  // Monte Carlo.
  // The result belongs to a region, scenario and parameter set. Data arriving during or after a run do
  // not discard it: it stays on screen, marked with the data it was computed on.
  const key = JSON.stringify([app.region, app.scenario, P]);
  if (key !== mcKey) mcResult = null;
  const mcHost = h('div', { class: 'mc-result' });
  const drawMC = () => {
    if (!mcResult) { mcHost.replaceChildren(h('p', { class: 'sub' }, '200 randomised runs, as in the paper, with shocks to the inflation trend and to new inflows, correlated draws of the estimated Phillips parameters, published ranges for the behavioural parameters and four model structures, each solved with and without Phoenix under the same draws (Solutions §7.7).')); return; }
    const m = mcResult;
    mcHost.replaceChildren(
      h('div', { class: 'kpis' },
        kpi({ label: 'Phoenix effect on inflation (p10 – p90)', value: `${num(m.dPi[0], 4)} – ${num(m.dPi[2], 4)} pp`, sub: `median ${num(m.dPi[1], 4)} pp` }),
        kpi({ label: 'Runs ending with the stock below S_crit', value: `${num(m.belowOn * 100, 0)}%`, sub: `${num(m.belowOff * 100, 0)}% without Phoenix` }),
        kpi({ label: 'Absorbed (p10 – p90)', value: `${eur(m.absorbed[0], 0)} – ${eur(m.absorbed[2], 0)}`, sub: `median ${eur(m.absorbed[1], 1)}` })),
      lineChart({
        series: [{ name: 'Median with Phoenix', color: SERIES[0], values: m.t.map((t, i) => [t, m.piOn[i][1]]) }, { name: 'Median without', color: SERIES[1], dash: true, values: m.t.map((t, i) => [t, m.piOff[i][1]]) }],
        bands: [{ color: SERIES[0], values: m.t.map((t, i) => [t, m.piOn[i][0], m.piOn[i][2]]) }, { color: SERIES[1], values: m.t.map((t, i) => [t, m.piOff[i][0], m.piOff[i][2]]), opacity: 0.1 }],
        refs: [{ y: P.target, label: `Target ${P.target}%` }], yFmt: v => `${num(v, 1)}%`, xFmt: tF, height: 220 }),
      mcData !== app.dataStamp ? h('p', { class: 'sub' }, 'Newer data have arrived since this run; run it again to include them.') : null);
  };
  drawMC();
  if (mcResult && mcReveal) { mcReveal = false; reveal(mcHost); }
  // The stress test lives at module level so a page re-render (e.g. a live-data refresh)
  // never loses a run in progress or its result.
  const mcLabel = () => mcRun ? `Running… ${Math.round(mcRun.progress * 100)}%` : mcResult ? 'Re-run' : 'Run stress test';
  const mcBtn = h('button', { class: 'btn', disabled: !!mcRun, onclick: async () => {
    if (mcRun) return;
    mcReveal = true;
    // The stance structure uses the paper's calibrated k_z (§5.3, §7.7).
    const published = await paperResults();
    const w = globalThis.PHX_MC_SRC ? new Worker(URL.createObjectURL(new Blob([globalThis.PHX_MC_SRC], { type: 'text/javascript' }))) : new Worker(new URL('mc.js', document.baseURI));
    mcRun = { progress: 0, key, data: app.dataStamp }; app.busy = (app.busy || 0) + 1;
    const paint = () => { if (mcBtnRef) { mcBtnRef.disabled = !!mcRun; mcBtnRef.replaceChildren(icon(mcRun ? 'layers' : 'refresh', 16), mcLabel()); } };
    paint();
    w.onmessage = ({ data }) => {
      if (data.progress) { mcRun.progress = data.progress; paint(); return; }
      mcResult = data; mcKey = mcRun.key; mcData = mcRun.data; mcRun = null; app.busy--; w.terminate(); app.rerender();
    };
    w.onerror = () => { mcReveal = false; mcRun = null; app.busy--; paint(); toast('Stress test could not start in this browser.'); };
    w.postMessage({ cells, P, scenario: SCENARIOS[app.scenario], runs: 200, seed: Date.now() % 100000, market: app.marketPath(), est: (() => { try { return context(app.data, P).phillips; } catch { return null; } })(), kStanceAlt: published?.transmission?.kCalibrated ?? null });
  } }, icon('layers', 16), mcLabel());
  mcBtnRef = mcBtn;

  const exportCsv = () => {
    const cols = ['month', 'pi_with', 'pi_without', 'x_with', 'x_without', 'i_with', 'i_without', 'S_with', 'S_without', 'Phi', 'credits', 'wallets', 'Theta', 'D_with', 'D_without', 'F', 'active'];
    const rows = sim.agg.map((a, i) => [a.t, a.pi, base.agg[i].pi, a.x, base.agg[i].x, a.i, base.agg[i].i, a.S, base.agg[i].S, a.Phi, a.C, a.L, a.Theta, a.D, base.agg[i].D, a.F, a.active].map(v => +(+v).toFixed(6)));
    download(`phoenix-simulation-${app.region}-${app.scenario}.csv`, [cols.join(','), ...rows.map(r => r.join(','))].join('\n'), 'text/csv');
  };

  root.append(
    pageHead('Simulation lab', 'The coupled model of §4, solved on the selected economies from today’s data. Change any parameter and every chart, map and alert updates.',
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost', onclick: () => { app.logSimulation(sim); toast(`${Math.min(200, sim.events.length)} contract events written to the audit ledger.`); } }, icon('shield', 16), 'Log to ledger'),
        h('button', { class: 'btn btn-ghost', 'data-tip': 'Download the simulation results as CSV.', onclick: exportCsv }, icon('download', 16), 'CSV'),
        h('button', { class: 'btn btn-ghost', onclick: () => app.resetParams() }, icon('refresh', 16), 'Reset'))),
    card({ title: 'Scenario', sub: 'Live conditions, the EU-27 today, the EU-27 on the data published by 31 December 2021, or a stress scenario', body: scen }),
    h('div', { class: 'lab' },
      h('aside', { class: 'lab-p' }, card({ title: 'Parameters', sub: 'Values from Solutions Table 6. Tags: D estimated from data · L empirical literature · P policy design · M measured by the trials · N numerical', body: groups })),
      h('div', { class: 'lab-r' },
        h('div', { class: 'kpis' },
          kpi({ label: `Inflation at m${P.months}`, value: pct(end.pi, 2), delta: `${num(end.pi - endB.pi, 4)} pp vs no Phoenix`, good: end.pi <= endB.pi }),
          kpi({ label: `Policy rate at m${P.months}`, value: pct(end.i, 2), delta: `${num(end.i - endB.i, 4)} pp vs no Phoenix`, good: end.i <= endB.i }),
          kpi({ label: 'Excess stock absorbed', value: eur(sim.totals.absorbed, 1), sub: `${num(sim.totals.absorbed / Math.max(1e-9, sim.agg[0].S) * 100, 1)}% of the initial stock · ${num(end.S / end.Scrit, 2)}× S_crit at m${P.months} (${num(endB.S / endB.Scrit, 2)}× without)` }),
          kpi({ label: 'Months until inflation stays within ±0.3 pp of target', value: firstOnTarget(sim.agg, P.target) === null ? 'not reached' : num(firstOnTarget(sim.agg, P.target), 1), sub: firstOnTarget(base.agg, P.target) === null ? 'not reached without Phoenix' : `${num(firstOnTarget(base.agg, P.target), 1)} without` }),
          kpi({ label: `Disorder index at m${P.months}`, value: num(end.D, 2), delta: `${num(end.D - endB.D, 2)} vs no Phoenix`, good: end.D <= endB.D }),
          kpi({ label: 'Conservation check', value: Math.abs(sim.totals.residual) < 1e-6 ? 'Balanced' : eur(sim.totals.residual, 3), sub: 'Absorbed + premiums = credits + wallets + spent + matured + recalled (§4.13)', good: Math.abs(sim.totals.residual) < 1e-6 })),
        card({ title: 'Playback', sub: 'Watch the fields evolve across economies', actions: h('div', { class: 'row' }, fieldSel, playBtn),
          body: h('div', null, mapHost, h('div', { class: 'scrub' }, range, tLabel)) }),
        h('div', { class: 'grid-2' },
          two('Inflation π', 'GDP-weighted, %', sim.agg, base.agg, x => x.pi, v => `${num(v, 2)}%`, [{ y: P.target, label: 'Target' }, { y: P.piTh, label: 'Trigger' }]),
          two('Output gap x (§4.8)', 'GDP-weighted, % of potential', sim.agg, base.agg, x => x.x, v => `${num(v, 2)}%`, [{ y: 0, label: 'Potential' }]),
          two('Policy rate i (§4.10)', 'Euro area: forward path plus a Taylor response to Phoenix’s effect; elsewhere a smoothed Taylor rule, %', sim.agg, base.agg, x => x.i, v => `${num(v, 2)}%`),
          card({ title: 'Excess deposits S (§4.2)', sub: '€ billion, with the threshold S_crit, which rises with GDP and as the episode ages',
            legend: [{ label: 'With Phoenix', color: SERIES[0], line: true }, { label: 'Without Phoenix', color: SERIES[1], line: true, dash: true }, { label: 'S_crit', color: SERIES[3], line: true, dash: true }],
            body: lineChart({ series: [{ name: 'With Phoenix', color: SERIES[0], values: sim.agg.map(x => [x.t, x.S]) }, { name: 'Without Phoenix', color: SERIES[1], dash: true, values: base.agg.map(x => [x.t, x.S]) }, { name: 'S_crit', color: SERIES[3], dash: true, values: sim.agg.map(x => [x.t, x.Scrit]) }], yFmt: v => eur(v, 0), xFmt: tF, height: 200 }),
            table: () => ({ cols: ['Month', 'With Phoenix', 'Without Phoenix', 'S_crit'], rows: sim.agg.filter((_, i) => i % 4 === 0).map((x, i) => [num(x.t, 0), eur(x.S, 1), eur(base.agg[i * 4].S, 1), eur(x.Scrit, 1)]) }) }),
          one('Absorption Φ (§4.4)', '€ billion per month', [{ name: 'Φ', key: x => x.Phi }], v => eur(v, 2)),
          one('PHX credits and wallets (§4.5–4.6)', '€ billion held', [{ name: 'Credits C', key: x => x.C }, { name: 'Wallets L', key: x => x.L }], v => eur(v, 1)),
          one('Activation Θ (§4.3)', 'GDP-weighted, 0–1', [{ name: 'Θ', key: x => x.Theta }], v => num(v, 2)),
          two('Disorder index 𝒟 (§4.12)', 'GDP-weighted', sim.agg, base.agg, x => x.D, v => num(v, 2)),
          one('Feedback field F (§4.11)', 'Optional: acts only when the gain γ is above zero', [{ name: 'F', key: x => x.F }], v => num(v, 3))),
        card({ title: 'Policy regimes compared', sub: 'Solutions §7.4 (Table 13), recomputed for the selected economies. Δπ is measured against no Phoenix under the same assumptions.', body: regimeTable }),
        h('div', { class: 'grid-2' },
          card({ title: 'Policy optimiser', body: h('div', null, optIntro, optBtn, optOut) }),
          card({ title: 'Stress test (Monte Carlo)', sub: 'p10–p90 bands', actions: mcBtn, body: mcHost })),
        card({ title: `Contract events (${sim.events.length})`, sub: 'Generated by the simulation; write them to the tamper-evident ledger with “Log to ledger”.',
          body: h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Month', 'Economy', 'Event', 'Cause'].map(c => h('th', { scope: 'col' }, c)))),
            h('tbody', null, sim.events.slice(0, 80).map(e => h('tr', null, h('td', null, num(e.t, 1)), h('th', { scope: 'row' }, e.name), h('td', null, e.type.replace('_', ' ')), h('td', null, e.cause)))))) }))),
    explain('How the coupled system is solved',
      h('p', null, 'Each economy is a node; the spatial operators act along a graph weighted by a Gaussian of the distance between capitals (Solutions §4.1). Time is integrated with an explicit scheme at the chosen step, under the stability condition of Solutions §8.'),
      h('p', null, 'Absorption lowers demand only by the spending the absorbed funds would otherwise have financed (s_k × φ_sel); wallet spending and premiums add to it; the output gap moves core inflation through the Phillips curve estimated by instrumental variables on the EU panel; energy inflation follows the HICP energy index; and the euro-area policy rate follows the market’s forward path plus a Taylor response to Phoenix’s own effect (Solutions §4.8–4.10).'),
      h('p', null, 'Because absorbed money would mostly not have been spent soon, a euro of spending raises output by less than a euro, and core inflation responds moderately to output, the inflation effect is thousandths of a percentage point; credits mature and the spending returns later, so the effect also reverses over time (Solutions §7.2–7.3, §7.9).')),
    objectiveChips([2, 3, 4, 6, 12]));
}
