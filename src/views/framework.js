import { h, num } from '../ui/dom.js';
import { card, lineChart, SERIES } from '../ui/charts.js';
import { OBJECTIVES, LOOP, GLOSSARY } from '../content/framework.js';
import { EQUATIONS, SUPPORT, PROV_LABEL } from '../content/equations.js';
import { PARAM_GROUPS } from '../model/params.js';
import MATH from '../generated/math.js';
import { pageHead, explain } from './common.js';

const VIEW_LABEL = { overview: 'Overview', detect: 'Surplus radar', simulate: 'Simulation lab', redistribute: 'Redistribution', contracts: 'Contracts & audit', forecast: 'Early warning', stability: 'Stability', framework: 'Framework', pilot: 'Pilot planner', governance: 'Design & governance', validate: 'Evidence', data: 'Data & status' };

const math = (key, display = true) => h('div', { class: display ? 'math' : 'math-inline', html: MATH[key] || '' });

export function framework(root, app) {
  // Interactive explorers.
  const P0 = app.params;
  let kA = P0.kA ?? 0.15, floor = P0.floorPct ?? 0.6, piTh = P0.piTh ?? 3, epsPi = P0.epsPi ?? 0.25, sigma = P0.sigma0 ?? 700;
  const hyst = P0.hyst ?? 0.3;
  const fluxOut = h('div'), trigOut = h('div'), kerOut = h('div');
  const drawFlux = () => {
    const pts = []; for (let r = 0; r <= 3; r += 0.02) pts.push([r, kA * Math.max(0, r - floor) * 100]);
    fluxOut.replaceChildren(lineChart({ series: [{ name: 'Φ', color: SERIES[0], values: pts }], yFmt: v => `${num(v, 0)}%`, xFmt: v => `${num(v, 1)}×`, xLabel: 'Excess stock S / S_crit (Φ as % of S_crit per month; Θ = 1, full take-up, before the cap)', height: 170 }));
  };
  // Smooth switch 1/(1+e^{-(π-π_th)/ε}) and the step with hysteresis: on at π_th when inflation rises,
  // off below π_th − h_π when it falls.
  const drawTrig = () => {
    const smooth = [], up = [], down = [];
    for (let p = 0; p <= 8.001; p += 0.05) {
      smooth.push([p, 1 / (1 + Math.exp(-(p - piTh) / epsPi))]);
      up.push([p, p >= piTh ? 1 : 0]);
      down.push([p, p >= piTh - hyst ? 1 : 0]);
    }
    trigOut.replaceChildren(lineChart({ series: [{ name: 'Sigmoid', color: SERIES[0], values: smooth }, { name: 'Step, inflation rising', color: SERIES[1], values: up, dash: true }, { name: 'Step, inflation falling', color: SERIES[2], values: down, dash: true }],
      yMin: 0, yMax: 1, yFmt: v => num(v, 1), xFmt: v => `${num(v, 0)}%`, xLabel: `Inflation, % (hysteresis band h_π = ${num(hyst, 2)} pp)`, height: 170 }));
  };
  // Gaussian routing weight e^{-d²/(2σ²)} by distance, before need, inflation and currency-area factors.
  const drawKer = () => {
    const pts = []; for (let d = 0; d <= 4000; d += 50) pts.push([d, Math.exp(-(d * d) / (2 * sigma * sigma))]);
    kerOut.replaceChildren(lineChart({ series: [{ name: 'K', color: SERIES[0], values: pts }], yMin: 0, yMax: 1, yFmt: v => num(v, 1), xFmt: v => `${num(v, 0)}`, xLabel: 'Distance between capitals, km (weight before need and currency-area factors)', height: 170 }));
  };
  const rng = (label, min, max, step, val, on, tip) => h('label', { class: 'mini', 'data-tip': tip }, h('span', null, label), h('input', { type: 'range', min, max, step, value: val, oninput: e => on(+e.target.value) }));

  const P = app.params;
  const provRows = PARAM_GROUPS.flatMap(g => g.params.map(p => ({ g: g.title, p })));
  root.append(
    pageHead('The Phoenix framework', 'Twelve coupled equations on a network of economies that measure, absorb, convert, route and recall idle money, linked to output, inflation and the policy rate — and how each of the twelve objectives is delivered in this application.'),
    card({ title: 'Objectives and where they are delivered', sub: 'Each of the twelve objectives maps to live features (Solutions Table 1)',
      body: h('ol', { class: 'objectives' }, OBJECTIVES.map(o => h('li', null,
        h('span', { class: 'obj-n' }, String(o.n)),
        h('div', null, h('b', null, o.title), h('p', null, o.how), h('div', { class: 'row wrap' }, o.where.map(w => h('a', { class: 'chip', href: `#/${w}` }, VIEW_LABEL[w] || w))))))) }),
    card({ title: 'Integrated control loop', sub: 'Detect → activate → absorb → convert → redistribute → stabilise → feedback / recall',
      body: h('ol', { class: 'loop' }, LOOP.map((st, i) => h('li', null, h('span', { class: 'loop-n' }, String(i + 1)), h('b', null, st.label), h('small', null, st.pde)))) }),
    h('h2', { class: 'sec-h' }, 'The model (Solutions §4)'),
    h('div', { class: 'pdes' }, EQUATIONS.map(e => h('article', { class: 'card pde', id: `eq-${e.id}` },
      h('header', { class: 'card-h' }, h('div', null, h('span', { class: 'eyebrow' }, `Equation ${e.n} · Solutions §${e.sec} · ${e.stage}`), h('h3', { 'data-tip': e.what }, e.name)),
        null),
      math(e.id),
      e.rel.length ? h('div', { class: 'rels' }, e.rel.map((_, i) => math(`${e.id}-r${i}`, false))) : null,
      h('p', null, e.what),
      null))),
    h('h2', { class: 'sec-h' }, 'Measurement, early warning and guarantees'),
    h('div', { class: 'pdes' }, SUPPORT.map(e => h('article', { class: 'card pde' },
      h('header', { class: 'card-h' }, h('div', null, h('span', { class: 'eyebrow' }, `Solutions §${e.sec}`), h('h3', null, e.title)),
        null),
      math(e.id)))),
    card({ title: 'Parameters and provenance', sub: 'Current values in this app and where each comes from (Solutions Table 6)',
      body: h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Group', 'Parameter', 'Current', 'Default', 'Provenance'].map(c => h('th', { scope: 'col' }, c)))),
        h('tbody', null, provRows.map(({ g, p }) => h('tr', null, h('td', null, g), h('th', { scope: 'row' }, p.label), h('td', null, String(P[p.k])), h('td', null, String(p.def)),
          h('td', null, PROV_LABEL[p.cal] || '—'))))))
    }),
    h('div', { class: 'grid-3' },
      card({ title: 'Absorption response (§4.4)', body: h('div', null, rng('k_A', 0, 1, 0.01, kA, v => { kA = v; drawFlux(); }, 'Absorption speed: share of the absorbable stock converted each month at full activation.'), rng('floor f', 0, 1.2, 0.05, floor, v => { floor = v; drawFlux(); }, 'Absorption stops when the stock falls to this multiple of S_crit.'), fluxOut) }),
      card({ title: 'Trigger switch (§4.3)', legend: [{ label: 'Sigmoid', color: SERIES[0], line: true }, { label: 'Step, rising', color: SERIES[1], line: true, dash: true }, { label: 'Step, falling', color: SERIES[2], line: true, dash: true }], body: h('div', null, rng('π_th', 1, 5, 0.1, piTh, v => { piTh = v; drawTrig(); }, 'Trigger inflation, %.'), rng('ε', 0.05, 1.5, 0.05, epsPi, v => { epsPi = v; drawTrig(); }, 'Softness of the smooth switch, points: larger means a more gradual switch.'), trigOut) }),
      card({ title: 'Routing reach (§4.6)', body: h('div', null, rng('σ (km)', 100, 3000, 50, sigma, v => { sigma = v; drawKer(); }, 'Routing reach: distance at which the routing weight has fallen to about 0.61.'), kerOut) })),
    card({ title: 'Glossary', body: h('dl', { class: 'gloss' }, GLOSSARY.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])) }),
    explain('Source', h('p', null, 'Phoenix Economics Solutions: A Network Differential-Equation Framework for Real-Time Surplus Absorption, Liquidity Routing and Inflation Early Warning (4 October 2026). Section, table and figure numbers refer to that document.')));
  drawFlux(); drawTrig(); drawKer();
}
