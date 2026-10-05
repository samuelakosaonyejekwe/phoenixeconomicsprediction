import { h, num, eur, pct } from '../ui/dom.js';
import { card, heatMatrix, stackedBars, meter, SERIES, lineChart } from '../ui/charts.js';
import { kernelMatrix, needIndex } from '../model/engine.js';
import { distanceKm } from '../data/geo.js';
import { pageHead, explain, kpi, empty, objectiveChips } from './common.js';

let src = null, dst = null, piSrc = null;

export function redistribute(root, app) {
  const cells = app.simCells();
  if (!cells.length) return root.append(pageHead('Redistribution'), empty());
  const P = app.effParams();
  const sim = app.sim(true);
  const N = cells.length;
  const t = sim.totals;
  const lastL = sim.rec.L.at(-1), lastH = sim.rec.H.at(-1), lastMode = sim.rec.mode.at(-1);

  // Largest kernel-routed transfers.
  const flows = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (sim.flows[i][j] > 1e-6) flows.push({ from: cells[i], to: cells[j], v: sim.flows[i][j] });
  flows.sort((a, b) => b.v - a.v);

  const kpis = h('div', { class: 'kpis' },
    kpi({ label: 'Converted to PHX credits', value: eur(t.absorbed, 1), sub: `${P.months}-month horizon · ${eur(t.creditsHeld, 1)} still held` }),
    kpi({ label: 'Released into wallets', value: eur(t.released, 1), sub: `Only once inflation is back at the release level (${P.piRel ?? P.target}%)` }),
    kpi({ label: 'Routed between economies', value: eur(t.transfers, 2), sub: `${flows.length} active corridors` }),
    kpi({ label: 'Spent into real economy', value: eur(t.spent, 1), sub: `η_c = ${P.etaC}/month` }),
    kpi({ label: 'Recalled to Digital Euro', value: eur(t.recallDE, 2), sub: `Within the holding capacity (€${P.deLimit} × ${num(P.deAdopt * 100, 0)}% adoption)` }),
    kpi({ label: 'Swept to bank accounts', value: eur(t.recallDeposits, 2), sub: 'Recall above the Digital Euro capacity' }),
    kpi({ label: 'Recalled to Dragon reserve', value: eur(t.recallDragon, 2), sub: `Crisis mode (π ≥ ${P.piCrisis}%)` }));

  const blocks = [pageHead('Redistribution & wallets', 'How absorbed surplus becomes PHX credits, is released into wallets once inflation eases, travels to economies with slack along the routing kernel, and is recalled before wallets overheat (Solutions §4.5–4.7).'), kpis];

  if (N > 1) {
    const pi = cells.map(c => c.pi);
    const K = kernelMatrix(cells, pi, P);
    blocks.push(h('div', { class: 'grid-2' },
      card({
        title: 'Routing kernel now', sub: 'Rows: source, columns: target. K = distance weight (reach widened by local inflation dispersion) × need of the target × export propensity of the source × room of the target below the trigger, within a currency area (Solutions §4.6).',
        body: heatMatrix({ matrix: K, labels: cells.map(c => c.id), fmt: v => (v === 0 ? '0' : Math.abs(v) >= 0.01 ? num(v, 3) : Number(v.toPrecision(2)).toString()), title: 'K' }),
        table: () => ({ cols: ['Source', ...cells.map(c => c.id)], rows: K.map((r, i) => [cells[i].id, ...r.map(v => (v === 0 ? '0' : Number(v.toPrecision(3)).toString()))]) }),
      }),
      card({
        title: 'Largest liquidity corridors', sub: 'Cumulative routed wallet transfers over the horizon',
        body: flows.length ? h('ol', { class: 'flows' }, flows.slice(0, 22).map(f => h('li', null,
          h('b', null, f.from.name), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'), h('b', null, f.to.name),
          h('span', { class: 'muted' }, `${num(distanceKm(f.from, f.to), 0)} km`), h('span', { class: 'v' }, eur(f.v, 2)))))
          : h('p', { class: 'sub' }, 'No corridors open: either no economy above target holds wallet liquidity yet, or no neighbour has room below the trigger (Solutions §4.6).'),
      })));
  }

  const rows = cells.map((c, i) => ({ label: c.name, sub: `${lastMode[i] === 'dragon' ? 'Crisis mode' : 'Stable'} · H ${num(lastH[i], 2)}`, segments: [{ name: 'Wallet liquidity L', value: lastL[i], color: SERIES[0] }], marker: sim.Lcap[i] }))
    .sort((a, b) => b.segments[0].value - a.segments[0].value);
  blocks.push(h('div', { class: 'grid-2' },
    card({ title: `Wallet liquidity at month ${P.months}`, sub: 'Tick = wallet capacity; recall begins at the saturation threshold',
      body: stackedBars({ rows, fmt: v => eur(v, 2), markerLabel: 'Capacity' }),
      table: () => ({ cols: ['Economy', 'L €bn', 'Capacity €bn', 'Saturation H', 'Mode'], rows: cells.map((c, i) => [c.name, num(lastL[i], 3), num(sim.Lcap[i], 2), num(lastH[i], 3), lastMode[i]]) }) }),
    card({ title: 'Overheating gauges', sub: `Saturation H = L / capacity. Recall threshold ${P.recallAt}.`,
      body: h('div', { class: 'meters' }, cells.map((c, i) => ({ c, i })).sort((a, b) => lastH[b.i] - lastH[a.i]).map(({ c, i }) => meter(lastH[i], { label: c.name, max: 1, warn: P.recallAt * 0.85, crit: P.recallAt }))) })));

  // Routing explorer (Solutions §4.6, interactive).
  if (N > 1) {
    src = cells.find(c => c.id === src?.id) || cells.reduce((a, b) => (app.contractState?.(b)?.S ?? 0) > (app.contractState?.(a)?.S ?? 0) ? b : a, cells[0]);
    dst = cells.find(c => c.id === dst?.id && c.id !== src.id) || cells.find(c => c.id !== src.id);
    if (piSrc === null) piSrc = src.pi;
    const out = h('div', { class: 'explorer-out' });
    const draw = () => {
      // The pair's weight is read from the engine's own kernel (§4.6), with the source's inflation
      // replaced by the slider value; the curve repeats this over source inflation 0–8%.
      const i = cells.indexOf(src), j = cells.indexOf(dst);
      const kAt = p => kernelMatrix(cells, cells.map((c, n) => (n === i ? p : c.pi)), P)[i][j];
      const d = distanceKm(src, dst), span = Math.max(0.1, P.piTh - P.target);
      const clip = v => Math.min(1, Math.max(0, v));
      const om = clip((P.piTh - dst.pi) / span);
      const chiOf = p => clip((p - P.target) / span);
      const G = kAt(P.piTh) / Math.max(1e-300, om * needIndex(dst, dst.pi, dst.x0 ?? 0, P)) || 0;
      const sigma = Math.sqrt(-(d * d) / (2 * Math.log(Math.max(1e-300, G)))) || P.sigma0;
      const pts = [];
      for (let p = 0; p <= 8.0001; p += 0.2) pts.push([p, kAt(p)]);
      const k = kAt(piSrc);
      // Significant figures, so that small but non-zero weights are not shown as 0.000.
      const sig = v => (v === 0 ? '0' : Math.abs(v) >= 0.01 ? num(v, 3) : Number(v.toPrecision(3)).toString());
      const why = k > 0 ? (G < 0.01 ? `open, but negligible: ${num(d, 0)} km is far beyond the routing reach σ = ${num(sigma, 0)} km` : 'open')
        : chiOf(piSrc) === 0 ? `closed: the source’s inflation (${num(piSrc, 1)}%) is at or below the ${P.target}% target, so it exports nothing`
        : `closed: ${dst.name}’s inflation (${num(dst.pi, 1)}%) is at or above the ${P.piTh}% trigger, so it has no room to receive`;
      out.replaceChildren(
        h('ul', null,
          h('li', null, `Distance ${num(d, 0)} km; routing reach σ = ${num(sigma, 0)} km (σ₀ = ${num(P.sigma0, 0)} km widened by local inflation dispersion); distance weight ${sig(G)}`),
          h('li', null, `Source export propensity χ = ${num(chiOf(piSrc), 2)} (0 at the ${P.target}% target, 1 at the ${P.piTh}% trigger)`),
          h('li', null, `Target room ω = ${num(om, 2)} and need n = ${num(needIndex(dst, dst.pi, dst.x0 ?? 0, P), 2)} (${dst.name}: inflation ${num(dst.pi, 1)}%)`)),
        h('p', null, 'Corridor ', h('b', null, why), ` — weight ${sig(k)}.`),
        lineChart({ series: [{ name: 'Corridor weight', color: SERIES[0], values: pts }], refs: [{ y: 0, label: '' }], vlines: [{ x: piSrc, label: `π = ${num(piSrc, 1)}%` }], yMin: 0, yMax: Math.max(...pts.map(q => q[1]), 1e-12) * 1.05, yFmt: sig, xFmt: v => `${num(v, 1)}%`, xLabel: 'Source inflation', height: 180 }));
    };
    const pick = (cur, set) => h('select', { onchange: e => { set(cells.find(c => c.id === e.target.value)); draw(); } }, cells.map(c => h('option', { value: c.id, selected: c.id === cur.id }, c.name)));
    const piIn = h('input', { type: 'range', min: 0, max: 8, step: 0.1, value: piSrc, 'aria-label': 'Source inflation', oninput: e => { piSrc = +e.target.value; draw(); } });
    draw();
    blocks.push(card({ title: 'Routing explorer', sub: 'What would open this corridor? Move the source’s inflation (Solutions §4.6).',
      body: h('div', null, h('div', { class: 'row wrap' }, h('label', { 'data-tip': 'Economy whose wallet liquidity would be exported.' }, 'Source ', pick(src, c => { src = c; piSrc = c.pi; piIn.value = c.pi; })), h('label', { 'data-tip': 'Economy that would receive it.' }, 'Target ', pick(dst, c => { dst = c; })), h('label', { class: 'grow', 'data-tip': 'Try other inflation rates for the source: routing starts once it is above target and grows towards the trigger (§4.6).' }, 'Source inflation ', piIn)), out) }));
  }

  blocks.push(
    explain('How redistribution works',
      h('p', null, 'Every absorbed euro is first held as a PHX credit; credits are released into wallets at rate θ₂ only once inflation is back at the release level (by default the target), and mature back to holders’ bank accounts after 36 months on average (Solutions §4.5). Wallet liquidity diffuses between neighbours (D_l), is spent (η_c), and is routed — only within a currency area — from economies running above target towards economies in need, measured by a fixed-scale index of below-target inflation, a negative output gap, unemployment above its natural rate and a fiscal deficit (Solutions §4.6).'),
      h('p', null, 'When saturation H crosses the recall threshold, PHX is converted back: into the Digital Euro up to its holding capacity, with the rest swept to bank accounts, or — when inflation is at or above the crisis level — into the Dragon reserve held at the central bank (Solutions §2.2, §4.7). Because release waits for target, wallets rarely saturate in the reported scenarios; both routes are exercised in direct tests (Solutions §7.9).')),
    objectiveChips([4, 5, 6]));
  root.append(...blocks);
}
