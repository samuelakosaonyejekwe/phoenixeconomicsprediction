import { h, icon, num, eur, pct, ago } from '../ui/dom.js';
import { card, lineChart, tileMap, dotMap, SERIES, seqColor, divColor, legendEl, sparkline } from '../ui/charts.js';
import { marketDrivers } from '../model/nowcast.js';
import { LOOP } from '../content/framework.js';
import { pageHead, kpi, badge, STATE_COLOR, STATE_META, openCountry, weightedPi, empty, sourceLine, objectiveChips } from './common.js';
import { REGIONS } from '../app.js';
import { SCENARIOS } from '../model/params.js';

const METRICS = {
  state: { label: 'Contract state' },
  pi: { label: 'Inflation' },
  rho: { label: 'Surplus / S_crit' },
  risk: { label: 'Breach probability' },
};
let metric = 'state';

export function overview(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Phoenix command centre'), empty());
  const P = app.params;
  const states = Object.fromEntries(cells.map(c => [c.id, app.contractState(c)]));
  const count = k => cells.filter(c => states[c.id].state === k).length;
  const piW = weightedPi(cells);
  const gw = cells.reduce((a, c) => a + c.gdp, 0) || 1;
  const piOff = cells.reduce((a, c) => a + (c.piOfficial ?? c.pi) * c.gdp, 0) / gw;
  const ncAsOf = cells.map(c => c.nowcast?.asOf).filter(Boolean).sort().pop();
  const md = marketDrivers(app.data);
  const mkt = (label, series, fmt, color) => {
    const v = series.at(-1), prev = series.at(-21) || series[0];
    return h('div', { class: 'mkt' }, h('span', { class: 'kpi-l' }, label), h('b', null, v ? fmt(v[1]) : '–'),
      sparkline(series.slice(-60).map(r => r[1]), { w: 110, color }),
      h('small', { class: 'muted' }, v ? `${v[0]}${prev ? ` · ${num((v[1] / prev[1] - 1) * 100, 1)}% vs 1 month` : ''}` : 'awaiting data'));
  };
  const markets = card({ title: 'Daily drivers', sub: 'Business-day prices that move the inflation nowcast between official releases',
    body: h('div', { class: 'mkts' },
      mkt('Brent crude in €', md.oilEur, v => `€${num(v, 2)}`, SERIES[1]),
      mkt('EUR / USD', md.eurusd, v => num(v, 4), SERIES[0]),
      mkt('€STR overnight rate', md.estr, v => `${num(v, 3)}%`, SERIES[2]),
      mkt('10-year AAA yield', md.y10, v => `${num(v, 2)}%`, SERIES[6])) });
  const Stot = cells.reduce((s, c) => s + states[c.id].S, 0), Scrit = cells.reduce((s, c) => s + states[c.id].Scrit, 0);
  const sim = app.sim(true), base = app.sim(false);
  const end = sim?.agg.at(-1), endB = base?.agg.at(-1);
  const liq = app.data.ecb?.liq?.at(-1);
  const active = count('ACTIVE'), armed = count('ARMED'), watch = count('WATCH');
  const headline = active ? `Phoenix contracts active in ${active} of ${cells.length} economies` : armed ? `${armed} economies armed, none fully active` : 'All economies within Phoenix bounds';

  const hero = h('section', { class: 'hero' },
    h('div', { class: 'hero-main' },
      h('p', { class: 'eyebrow' }, REGIONS[app.region], ' · live data'),
      h('h1', null, headline),
      h('p', { class: 'lead' }, `GDP-weighted inflation is ${pct(piW, 2)} against a ${P.piTh}% trigger; ${eur(Stot, 0)} of excess deposits are measured against a combined historical threshold of ${eur(Scrit, 0)}.`),
      h('div', { class: 'state-strip' }, ['ACTIVE', 'ARMED', 'WATCH', 'DORMANT'].map(k => h('a', { href: '#/contracts', class: 'state-pill' }, badge(k), h('b', null, count(k)))))),
    h('div', { class: 'hero-fig' }, h('span', null, 'Projected inflation in ', String(P.months), ' months', SCENARIOS[app.scenario].referenceCase ? ` · ${SCENARIOS[app.scenario].label}` : SCENARIOS[app.scenario].shock ? ` · ${SCENARIOS[app.scenario].label}` : ''),
      h('b', null, end ? pct(end.pi, 1) : '–'),
      h('span', { class: 'muted' }, endB ? `${pct(endB.pi, 2)} without Phoenix (${num(end.pi - endB.pi, 4)} pp)` : '')));

  const kpis = h('div', { class: 'kpis' },
    kpi({ label: P.nowcast && ncAsOf ? `Weighted inflation, nowcast ${ncAsOf}` : 'Weighted inflation', value: pct(piW, 2), sub: P.nowcast && ncAsOf ? `Official ${pct(piOff, 2)} (${cells[0].piPeriod})` : `Official, ${cells[0].piPeriod}`, delta: `${num(piW - P.target, 2)} pp vs target`, good: piW <= P.target }),
    kpi({ label: 'Excess deposits', value: eur(Stot, 0), sub: `Threshold S_crit ${eur(Scrit, 0)} · ${num(Stot / Scrit, 2)}× (Solutions §3.2–3.3)`, good: Stot <= Scrit }),
    app.region !== 'global' && liq ? kpi({ label: 'Eurosystem deposit facility', value: eur(liq[1] / 1000, 0), sub: `Banks’ overnight deposits at the Eurosystem, week ${liq[0]}` }) : kpi({ label: 'Economies monitored', value: String(cells.length), sub: 'IMF / World Bank panel' }),
    sim ? kpi({ label: 'Output gap and policy rate', value: `${num(sim.agg[0].x, 1)}% · ${pct(sim.agg[0].i, 2)}`, sub: `GDP-based gap updated by monthly unemployment; ${app.region === 'global' ? 'Taylor rule where no market path exists' : 'ECB deposit facility, then the forward curve'} (Solutions §3.5, §4.10)` }) : null,
    sim ? kpi({ label: 'Disorder index 𝒟', value: num(sim.agg[0].D, 2), sub: `GDP-weighted, now; ${num(end.D, 2)} at m${P.months} with Phoenix, ${num(endB.D, 2)} without (Solutions §4.12)` }) : null,
    sim ? kpi({ label: `Absorbed in ${P.months} months`, value: eur(sim.totals.absorbed, 1), sub: `${eur(sim.totals.creditsHeld + sim.totals.walletsHeld, 1)} held as PHX credits & wallets` }) : null);

  // Closed loop with live values per stage.
  const t = sim?.totals;
  const vals = {
    detect: eur(Stot, 0), activate: `${active + armed} primed`, absorb: sim ? `${eur(sim.agg[4]?.Phi ?? 0, 2)}/mo` : '–',
    convert: t ? eur(t.creditsHeld + t.walletsHeld, 1) : '–', redistribute: t ? eur(t.transfers, 2) : '–',
    stabilise: sim && endB ? `Stock ${num(end.S / end.Scrit, 2)}× S_crit (${num(endB.S / endB.Scrit, 2)}× without)` : '–', feedback: t ? (t.recallEuro + t.recallDragon > 0 ? `${eur(t.recallEuro + t.recallDragon, 2)} recalled` : `F ${num(end.F, 2)}`) : '–',
  };
  const loop = h('ol', { class: 'loop' }, LOOP.map((s, i) => h('li', null,
    h('span', { class: 'loop-n' }, String(i + 1)), h('b', null, s.label), h('small', null, s.pde), h('span', { class: 'loop-v' }, vals[s.k]))));

  // Map with metric switch.
  const value = c => metric === 'state' ? states[c.id].state : metric === 'pi' ? c.pi : metric === 'rho' ? states[c.id].rho : states[c.id].fc.pBreach;
  const fmt = v => metric === 'state' ? STATE_META[v].label : metric === 'pi' ? pct(v) : metric === 'rho' ? `${num(v, 2)}×` : `${num(v * 100, 0)}%`;
  const color = v => metric === 'state' ? STATE_COLOR[v] : metric === 'pi' ? divColor(v - P.target, 4) : metric === 'rho' ? divColor(Math.log(Math.max(0.05, v)), 2) : seqColor(v);
  const mapHost = h('div');
  const drawMap = () => {
    mapHost.replaceChildren(app.region === 'global'
      ? dotMap({ cells, value, color, fmt, onSelect: c => openCountry(app, c) })
      : tileMap({ cells, value, color, fmt, onSelect: c => openCountry(app, c) }));
  };
  drawMap();
  const seg = h('div', { class: 'seg', role: 'tablist' }, Object.entries(METRICS).map(([k, m]) => h('button', { role: 'tab', 'aria-selected': String(metric === k), class: metric === k ? 'on' : '', onclick: e => {
    metric = k; seg.querySelectorAll('button').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-selected', 'true'); drawMap(); legendHost.replaceChildren(mapLegend());
  } }, m.label)));
  const mapLegend = () => metric === 'state'
    ? legendEl(['ACTIVE', 'ARMED', 'WATCH', 'DORMANT'].map(k => ({ label: STATE_META[k].label, color: STATE_COLOR[k] })))
    : h('p', { class: 'sub' }, metric === 'pi' ? `Blue below / red above the ${P.target}% target` : metric === 'rho' ? 'Blue below / red above S_crit' : 'Darker = higher probability of crossing the trigger within 12 months');
  const legendHost = h('div', null, mapLegend());

  const proj = sim && base ? card({
    title: 'Inflation outlook: with and without Phoenix', sub: SCENARIOS[app.scenario].referenceCase ? `Scenario: ${SCENARIOS[app.scenario].label}` : `GDP-weighted, ${REGIONS[app.region]}, scenario: ${SCENARIOS[app.scenario].label}`,
    legend: [{ label: 'With Phoenix', color: SERIES[0], line: true }, { label: 'Without Phoenix', color: SERIES[1], line: true, dash: true }],
    body: lineChart({
      series: [{ name: 'With Phoenix', color: SERIES[0], values: sim.agg.map(a => [a.t, a.pi]) }, { name: 'Without Phoenix', color: SERIES[1], dash: true, values: base.agg.map(a => [a.t, a.pi]) }],
      refs: [{ y: P.target, label: `Target ${P.target}%` }, { y: P.piTh, label: `Trigger ${P.piTh}%` }], yFmt: v => `${num(v, 1)}%`, xFmt: v => `m${num(v, 0)}`, xLabel: 'Months ahead',
    }),
    table: () => ({ cols: ['Month', 'With Phoenix %', 'Without %'], rows: sim.agg.filter((_, i) => i % 4 === 0).map((a, i) => [num(a.t, 0), num(a.pi, 2), num(base.agg[i * 4]?.pi, 2)]) }),
    actions: h('a', { class: 'chip', href: '#/simulate' }, 'Open lab'),
  }) : null;

  const alerts = cells.filter(c => states[c.id].state !== 'DORMANT').sort((a, b) => ['ACTIVE', 'ARMED', 'WATCH'].indexOf(states[a.id].state) - ['ACTIVE', 'ARMED', 'WATCH'].indexOf(states[b.id].state) || b.pi - a.pi).slice(0, 8);
  const alertCard = card({
    title: 'Priority alerts', sub: 'Economies where contracts are active, armed or on watch',
    body: alerts.length ? h('ul', { class: 'alerts' }, alerts.map(c => {
      const st = states[c.id];
      return h('li', null, h('button', { class: 'alert-row', 'data-tip': `${c.name}: ${STATE_META[states[c.id].state]?.desc || ''} Select for its inflation history, forecast and sector breakdown.`, onclick: () => openCountry(app, c) },
        badge(st.state), h('b', null, c.name),
        h('span', null, `π ${pct(c.pi)} · S/S_crit ${num(st.rho, 2)} · ${c.pi >= P.piTh ? 'above trigger' : `P(breach) ${num(st.fc.pBreach * 100, 0)}%`}`)));
    })) : h('p', { class: 'sub' }, 'No alerts. All monitored economies are within Phoenix bounds.'),
  });

  root.append(
    hero,
    kpis,
    card({ title: 'The Phoenix closed loop, now', sub: 'Detect → activate → absorb → convert → redistribute → stabilise → feedback / recall (Solutions §2, §4)', body: loop, cls: 'span-2' }),
    h('div', { class: 'grid-2' },
      card({ title: app.region === 'global' ? 'Global monitor' : 'European monitor', sub: 'Select an economy for detail', actions: seg, body: h('div', null, mapHost, legendHost) }),
      h('div', { class: 'stack' }, proj, alertCard)),
    markets,
    objectiveChips([1, 7, 8, 12]),
    sourceLine(app));
}
