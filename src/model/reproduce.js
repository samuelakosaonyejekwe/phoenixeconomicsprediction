// Reproduction of Phoenix Economics Solutions (6 October 2026; data archived on 4 October 2026). One function computes every result of
// the paper except the forecast backtest, the optimisation frontier, the stress tests and the trial
// simulations; paper/compute.mjs calls it to write the published results, and the application's
// Evidence page calls the same function on the same archived data to reproduce them in the browser.
// The regression tests (test/) check that its output equals paper/results-2026-10-04.json.
import * as I from './inputs.js';
import * as E from './estimation.js';
import { simulate, monthlySlope } from './engine.js';
import { DEFAULTS, SCENARIOS } from './params.js';
import * as F from './forecast.js';
import { rng } from './pilot.js';
import { EU } from '../data/geo.js';

// The past episode uses only what was published by 31 December 2021: HICP to November 2021, quarterly
// accounts to 2021 Q2, annual GDP to 2020, the October 2021 IMF vintage and the forward curve of 31 December 2021.
export const AS_OF = '2021-11';
export const at = (r, m) => r.agg.find(a => a.t >= m - 1e-9);
const pick = a => ({ t: a.t, pi: a.pi, x: a.x, i: a.i, S: a.S, Scrit: a.Scrit, C: a.C, L: a.L, D: a.D, O: a.O, Phi: a.Phi });
export const pair = (cells, Q, sc, opts = {}) => ({ on: simulate(cells, Q, sc, { phx: true, ...opts }), off: simulate(cells, Q, sc, { phx: false, ...opts }) });
export const summ = ({ on, off }, months = [0, 3, 6, 12, 18, 24]) => ({
  rows: months.map(m => ({ m, on: pick(at(on, m)), off: pick(at(off, m)) })), totals: on.totals, lossOff: off.totals.lossAvg,
  maxAbsDpi: Math.max(...on.agg.map((a, k) => Math.abs(a.pi - off.agg[k].pi))),
  path: on.agg.filter((_, k) => k % 4 === 0).map((a, k) => ({ t: a.t, pi: a.pi, piOff: off.agg[k * 4].pi, S: a.S, SOff: off.agg[k * 4].S, Scrit: a.Scrit, i: a.i, iOff: off.agg[k * 4].i, x: a.x, xOff: off.agg[k * 4].x, C: a.C, L: a.L })),
});

// data: the archived sources ({ id: data }) with data.weoVintages attached.
export function reproduceCore(data, { log = () => {} } = {}) {
  const P = { ...DEFAULTS };
  const out = {};
  const mkt = data.expect.forwards, mktEp = data.expect.forwardsEpisode;
  const dfr = new Map(data.ecb.dfrM), dkeys = [...dfr.keys()].sort();
  const ratePathFrom = (y, m0) => t => { const d = new Date(Date.UTC(y, m0 + Math.floor(t), 1)).toISOString().slice(0, 7); return dfr.get(d) ?? dfr.get(dkeys.filter(k => k <= d).at(-1)); };
  let cellsEA = null;
  // ---- 1. measurement and estimation
  const ctx = I.context(data, P);
  out.measure = { crit: ctx.crit, decay: { hh: ctx.decay.hh, corp: ctx.decay.corp, gov: ctx.decay.gov }, psiGlobal: ctx.psiMed, half: ctx.half, phiQ: ctx.phiQ, poolA: ctx.pool.a };
  out.okun = { pooled: ctx.okun.pooled, bPooled: ctx.okun.bPooled, n: ctx.okun.n, beta: ctx.okun.beta };
  // pooled Okun CI by bootstrap over countries
  { const isos = Object.keys(ctx.okun.beta), rnd = rng(5), bs = [];
    for (let k = 0; k < 400; k++) { const pickC = isos.map(() => isos[Math.floor(rnd() * isos.length)]); const imfB = Object.fromEntries(pickC.map((iso, j) => [iso + '_' + j, ctx.imfC[iso]])); const gB = Object.fromEntries(pickC.map((iso, j) => [iso + '_' + j, ctx.gaps[iso]])); const e = E.estimateOkunGap(imfB, gB, pickC.map((iso, j) => ({ iso3: iso + '_' + j }))); if (Number.isFinite(e.pooled)) bs.push(e.pooled); }
    bs.sort((a, b) => a - b); out.okun.ci = [bs[Math.floor(0.025 * bs.length)], bs[Math.floor(0.975 * bs.length)]]; }
  // homogeneity of persistence across economies: F test in the December-rate panel (§3.6)
  out.homogeneity = E.persistenceHomogeneity(data);
  out.phillips = { full: E.estimatePhillipsRobust(data, { y1: 2025 }), pre2020: E.estimatePhillipsRobust(data, { y1: 2019 }) };
  out.phillipsRealTime = {};
  for (const [name, est, g] of [['iv', 'iv', null], ['iv_gammaRegional', 'iv', 'fe2'], ['ols', 'ols', null], ['regional', 'fe2', null]]) { const r = E.phillipsRealTime(data, data.weoVintages, { estimator: est, gammaFrom: g }); delete r.errors; out.phillipsRealTime[name] = r; }
  out.is = { full: E.estimateIS(data), pre2020: E.estimateIS(data, { y1: 2019 }) };
  out.nowcast = { coef: E.estimateNowcast(data), bt36: E.nowcastBacktest(data), bt120: E.nowcastBacktest(data, { last: 120 }) };
  out.oilElasticity = E.energyOilElasticity(data);
  out.kmMonthly = monthlySlope(P);
  log('estimation done');

  // monthly conversion check: one-year-ahead core predictions, annual equation vs monthly ODE with
  // gap and energy moving linearly within the year (§4.9)
  { const est = out.phillips.full.iv, a = est.aAnnual, am = -Math.log(1 - a) / 12, km = est.kappa * am / a, kE = est.gammaE * am / a, eM = out.phillips.full.eMean;
    const gaps = E.outputGaps(ctx.imfC); const diffs = [];
    for (const c of EU) { const pc = E.decRate(data.hicpx?.core?.[c.eu]), pe = E.decRate(data.hicpx?.energy?.[c.eu]), g = gaps[c.iso3]; if (!g) continue;
      for (let y = 2002; y <= 2025; y++) { if ([pc[y - 1], pe[y], pe[y - 1], g[y], g[y - 1]].some(v => v == null)) continue;
        const an = 2, ann = pc[y - 1] - a * (pc[y - 1] - an) + est.kappa * g[y] + est.gammaE * (pe[y] - eM) + est.gammaE * eM - est.gammaE * eM;
        let p = pc[y - 1]; const n = 120; for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = g[y - 1] + (g[y] - g[y - 1]) * t, e = pe[y - 1] + (pe[y] - pe[y - 1]) * t; p += 12 / n * (am * (an - p) + km * x + kE * (e - eM)); }
        diffs.push(Math.abs(p - ann)); } }
    diffs.sort((x, y) => x - y); out.conversionCheck = { n: diffs.length, meanAbs: diffs.reduce((s, x) => s + x, 0) / diffs.length, p90: diffs[Math.floor(0.9 * diffs.length)] }; }
  // ---- 3. monetary transmission
  { const cells21 = I.buildCells(data, 'ea', { P: { ...P, months: 49 }, asOf: AS_OF });
    const eff = k => { const Q = { ...P, months: 49, kStance: k }; const on = simulate(cells21, Q, SCENARIOS.episode, { phx: false, energyMode: 'realised', ratePath: ratePathFrom(2021, 10) }); const off = simulate(cells21, Q, SCENARIOS.episode, { phx: false, energyMode: 'realised', ratePath: () => -0.5 }); const d = on.agg.filter(a => a.t >= 14 && a.t < 50).map(a => a.pi - off.agg.find(b => Math.abs(b.t - a.t) < 1e-6).pi); return d.reduce((s, x) => s + x, 0) / d.length; };
    let lo = 0, hi = 0.5; for (let n = 0; n < 18; n++) { const m = (lo + hi) / 2; if (eff(m) > -2) lo = m; else hi = m; }
    const kCal = (lo + hi) / 2;
    const fit = k => { const c = I.buildCells(data, 'ea', { P, asOf: AS_OF }); const r = simulate(c, { ...P, months: 36, kStance: k }, SCENARIOS.episode, { phx: false, energyMode: 'realised', ratePath: ratePathFrom(2021, 10) }); let e = 0, n = 0; const ms = Array.from({ length: 37 }, (_, m) => new Date(Date.UTC(2021, 10 + m, 1)).toISOString().slice(0, 7)); for (let m = 0; m <= 36; m++) { const kk = r.rec.t.findIndex(t => t >= m - 1e-9); r.cells.forEach((cc, i) => { const a = data.hicp.series[cc.id].find(z => z[0] === ms[m])?.[1]; if (a != null) { e += (r.rec.pi[kk][i] - a) ** 2; n++; } }); } return Math.sqrt(e / n); };
    out.transmission = { kCalibrated: kCal, fitWithout: fit(0), fitWith: fit(kCal), ecbEffect: -2, tighteningBp: 450, perHundredBp: 2 / 4.5 }; }
  log('transmission done');

  // ---- 4. scenarios
  const refT = [I.referenceCell(data, P)], ref21 = [I.referenceCell(data, P, AS_OF)];
  out.refCell = { today: { ...refT[0], piFull: undefined, piHist: undefined, coreFull: undefined, energy: undefined }, dec2021: { ...ref21[0], piFull: undefined, piHist: undefined, coreFull: undefined, energy: undefined } };
  out.refToday = summ(pair(refT, P, SCENARIOS.reference, { market: mkt }));
  const ep = pair(ref21, P, SCENARIOS.episode, { market: mktEp });
  out.ref2021 = summ(ep, [0, 3, 6, 12, 18, 24]);
  out.ref2021Long = summ(pair(ref21, { ...P, months: 72 }, SCENARIOS.episode, { market: mktEp }), [0, 12, 24, 36, 48, 60, 72]);
  // The same scenario with the Phillips curve estimated only on what was known then: output gaps from the
  // IMF vintage of 2021 and observations to 2020 (§7.2).
  { const vf = E.vintageFit(data, data.weoVintages, 2021);
    if (vf) { const f = vf.fit.iv, Prt = { ...P, kappaPC: f.kappa, aPanel: f.aAnnual, gammaE: f.gammaE, eMean: vf.fit.eMean };
      const z = pair([I.referenceCell(data, Prt, AS_OF)], Prt, SCENARIOS.episode, { market: mktEp });
      out.ref2021RealTimeParams = { kappa: f.kappa, aAnnual: f.aAnnual, gammaE: f.gammaE, eMean: vf.fit.eMean, rows: vf.fit.rows, dpi12: at(z.on, 12).pi - at(z.off, 12).pi, dpi24: at(z.on, 24).pi - at(z.off, 24).pi, absorbed: at(z.on, 24).absorbed ?? z.on.totals.absorbed }; } }
  out.ref2021Events = { act: ep.on.events.find(e => e.type === 'ACTIVATED')?.t ?? null, below: ep.on.agg.find(a => a.S <= a.Scrit)?.t ?? null, belowOff: ep.off.agg.find(a => a.S <= a.Scrit)?.t ?? null };
  // validation from December 2021: no-Phoenix paths against actual EU-27 inflation, 2022–2024
  { const act = data.hicp.series.EU27_2020.filter(r => r[0] >= AS_OF && r[0] <= '2024-11');
    out.validation = {};
    for (const [name, opts] of [['ex ante: market rates, flat energy', { market: mktEp }], ['actual rates, flat energy', { ratePath: ratePathFrom(2021, 10) }], ['actual rates, realised energy', { ratePath: ratePathFrom(2021, 10), energyMode: 'realised' }]]) {
      const r = simulate(ref21, { ...P, months: 36 }, SCENARIOS.episode, { phx: false, ...opts });
      let e = 0, n = 0; for (let m = 0; m <= 36; m++) { if (!act[m]) continue; e += (at(r, m).pi - act[m][1]) ** 2; n++; }
      out.validation[name] = { rmse: Math.sqrt(e / n), path: Array.from({ length: 37 }, (_, m) => [m, at(r, m).pi, act[m]?.[1]]) };
    }
    const c2 = { ...ref21[0], energy: { type: 'oil', elasticity: E.energyOilElasticity(data) } }, oil = E.oilPath(data, { asOf: AS_OF, mode: 'realised' });
    const r = simulate([c2], { ...P, months: 36 }, SCENARIOS.episode, { phx: false, ratePath: ratePathFrom(2021, 10), oil });
    let e = 0, n = 0; for (let m = 0; m <= 36; m++) { if (!act[m]) continue; e += (at(r, m).pi - act[m][1]) ** 2; n++; }
    out.validation['actual rates, energy from oil only'] = { rmse: Math.sqrt(e / n) };
    // With realised energy prices, the model's energy inflation equals actual energy inflation, so the
    // remaining headline error is core inflation's: implied model core = (π − w·π^E)/(1 − w).
    { const v = out.validation['actual rates, realised energy'], w = ref21[0].wE, en = new Map(data.hicpx.energy.EU27_2020), co = new Map(data.hicpx.core.EU27_2020);
      const ms = Array.from({ length: 37 }, (_, m) => new Date(Date.UTC(2021, 10 + m, 1)).toISOString().slice(0, 7));
      const rows = v.path.map(([m, pi]) => ({ m, ym: ms[m], core: en.has(ms[m]) ? (pi - w * en.get(ms[m])) / (1 - w) : null, act: co.get(ms[m]) })).filter(r => r.core != null && r.act != null);
      const err = rows.map(r => r.core - r.act);
      out.validation.core = { rmse: Math.sqrt(err.reduce((s, x) => s + x * x, 0) / err.length), meanErr: err.reduce((s, x) => s + x, 0) / err.length, peakActual: Math.max(...rows.map(r => r.act)), peakModel: Math.max(...rows.map(r => r.core)), headlineShare: 1 - w, n: rows.length }; } }
  log('reference scenarios done');

  out.live = {};
  for (const region of ['ea', 'eu', 'global']) {
    const cells = I.buildCells(data, region, { nowcast: true, P });
    const s = pair(cells, P, SCENARIOS.live, { market: mkt });
    const L = { N: cells.length, ...summ(s), dpi12: at(s.on, 12).pi - at(s.off, 12).pi,
      excessSaving: ['gov', 'corp', 'hh'].map(k => cells.reduce((a, c) => a + (c.excessSaving?.[k] ?? c.gross?.[k] ?? 0), 0)), deposits: ['gov', 'corp', 'hh'].map(k => cells.reduce((a, c) => a + c.sectors[k], 0)), idle: ['gov', 'corp', 'hh'].map(k => cells.reduce((a, c) => a + (c.idle?.[k] ?? 0), 0)),
      inflow: cells.reduce((a, c) => a + Object.values(c.flows).reduce((x, y) => x + y, 0), 0), gdp: cells.reduce((a, c) => a + c.gdp, 0), above: cells.filter(c => I.surplusOf(c, P) > I.scritOf(c, P)).map(c => c.id) };
    for (const sc of ['energy', 'surge', 'slump']) { const z = pair(cells, P, SCENARIOS[sc], { market: mkt }); L[sc] = { dpi: at(z.on, 24).pi - at(z.off, 24).pi, absorbed: z.on.totals.absorbed }; }
    out.live[region] = L;
    if (region === 'ea') {
      out.eaCells = cells.map(c => { const fc = F.forecastCell(c, P); const Scrit = I.scritOf(c, P), S = I.surplusOf(c, P), rho = S / Scrit;
        const state = c.pi >= P.piTh && rho >= 1 ? 'Active' : c.pi >= P.piTh || rho >= 1 ? 'Armed' : fc.status !== 'clear' ? 'Watch' : 'Dormant';
        return { id: c.id, name: c.name, gdp: c.gdp, pi: c.pi, x0: c.x0, gapUpdate: c.gapUpdate, S, idle: (c.idle.hh + c.idle.corp + c.idle.gov), Scrit, rho, state, pBreach: fc.pBreach, depQuarter: c.depQuarter }; });
      out.eaSens = [];
      for (const [name, o] of [['Default (S_crit at the 90th percentile)', {}], ['S_crit at the 75th percentile', { scritMode: 'hist75' }], ['S_crit fixed at 5% of GDP', { scritMode: 'fixed', scritPct: 5 }], ['Accumulation from 2021 Q1', { accStart: '2021-Q1' }], ['Accumulation from 2022 Q1', { accStart: '2022-Q1' }], ['Floor 0.4', { floorPct: 0.4 }], ['Floor 0.8', { floorPct: 0.8 }], ['Trigger 2.5%', { piTh: 2.5 }], ['Trigger 3.5%', { piTh: 3.5 }]]) {
        const Q = { ...P, ...o }, cs = I.buildCells(data, 'ea', { nowcast: true, P: Q }), z = pair(cs, Q, SCENARIOS.live, { market: mkt });
        out.eaSens.push({ name, S0: at(z.on, 0).S, Scrit: at(z.on, 0).Scrit, absorbed: z.on.totals.absorbed, S24: at(z.on, 24).S, S24off: at(z.off, 24).S, dpi12: at(z.on, 12).pi - at(z.off, 12).pi, dpi24: at(z.on, 24).pi - at(z.off, 24).pi, above: cs.filter(c => I.surplusOf(c, Q) > I.scritOf(c, Q)).length });
      }
      cellsEA = cells;
    }
  }
  log('live done');

  // ---- 5. sensitivity and regimes where Phoenix engages (EU, December 2021)
  out.grid = [];
  const iv = out.phillips.full.iv;
  for (const kappaPC of [Math.max(0.01, iv.kappa - 2 * iv.kappaSe), iv.kappa, iv.kappa + 2 * iv.kappaSe, 0.25]) for (const mult of [0.3, 0.6, 1.0]) for (const phiSel of [0.25, 0.5, 1]) {
    const s = pair(ref21, { ...P, kappaPC, mult, phiSel }, SCENARIOS.episode, { market: mktEp });
    out.grid.push({ kappaPC, mult, phiSel, dpi12: at(s.on, 12).pi - at(s.off, 12).pi, dpi24: at(s.on, 24).pi - at(s.off, 24).pi, di24: at(s.on, 24).i - at(s.off, 24).i });
  }
  out.regimes = [];
  for (const [name, o] of [['Defaults', {}], ['Faster absorption k_A × 3', { kA: 0.45 }], ['Cap 3% of GDP', { capPct: 3 }], ['Premium 2%', { rP: 2 }], ['Credit maturity 12 months', { matMonths: 12 }], ['Release at the trigger instead of the target', { piRel: 3 }], ['Government spending rate 0.1', { sdGov: 0.1 }], ['Government spending rate 0.2', { sdGov: 0.2 }], ['Policy-stance channel on', { kStance: out.transmission.kCalibrated }], ['Feedback on (γ = 0.5)', { fbGain: 0.5 }], ['Step switch with hysteresis', { trigMode: 'heaviside' }], ['Taylor rule instead of market path', { rateMode: 'taylor' }], ['Upper-bound behaviour (κ + 2 s.e., m = 1, φ_sel = 1)', { kappaPC: iv.kappa + 2 * iv.kappaSe, mult: 1, phiSel: 1 }], ['Crisis multiplier m = 1.5', { mult: 1.5 }], ['Neutral real rate 0%', { rStar: 0 }]]) {
    const z = pair(ref21, { ...P, ...o }, SCENARIOS.episode, { market: mktEp });
    out.regimes.push({ name, dpi12: at(z.on, 12).pi - at(z.off, 12).pi, dpi24: at(z.on, 24).pi - at(z.off, 24).pi, S24: at(z.on, 24).S, S24off: at(z.off, 24).S, absorbed: z.on.totals.absorbed, cost: z.on.totals.premium, loss: z.on.totals.lossAvg + P.lossC * z.on.totals.costPctGDP, lossOff: z.off.totals.lossAvg + P.lossC * z.off.totals.costPctGDP }); // the full loss of §4.12, as in Table 15
  }
  // Why the options leave the effect unchanged (§7.4): the feedback field and the speed of activation
  { const fb = pair(ref21, { ...P, fbGain: 0.5 }, SCENARIOS.episode, { market: mktEp }).on, sg = ep.on, st = pair(ref21, { ...P, trigMode: 'heaviside' }, SCENARIOS.episode, { market: mktEp }).on;
    const t90 = r => r.agg.find(a => a.Theta >= 0.9)?.t ?? null;
    out.mechanisms = { feedbackMinF: Math.min(...fb.agg.map(a => a.F)), feedbackActiveThreshold: -0.5 * Math.atanh(0.1), feedbackMaxPsi: Math.max(...fb.agg.map(a => Math.max(0, Math.tanh(-a.F / 0.5)))), theta90Smooth: t90(sg), theta90Step: t90(st), thetaMaxSmooth: Math.max(...sg.agg.map(a => a.Theta)), thetaMaxStep: Math.max(...st.agg.map(a => a.Theta)) }; }
  log('sensitivity done');
  // ---- 7. instruments, costs, detectability
  { const s3 = pair(ref21, { ...P, months: 36 }, SCENARIOS.episode, { market: mktEp });
    const avg = (a, b) => { const d = a.agg.filter(x => x.t >= 12 && x.t <= 36).map(x => x.pi - b.agg.find(y => Math.abs(y.t - x.t) < 1e-6).pi); return d.reduce((s, x) => s + x, 0) / d.length; };
    const phx3 = avg(s3.on, s3.off);
    const cons = simulate(ref21, { ...P, months: 36 }, { shock: { dx: -0.6 } }, { phx: false, market: mktEp }), base = simulate(ref21, { ...P, months: 36 }, SCENARIOS.episode, { phx: false, market: mktEp });
    const cons3 = avg(cons, base);
    const balances = s3.on.agg.reduce((s, a) => s + a.C + a.L, 0) / s3.on.agg.length;
    out.instruments = { phoenixAvg2_3: phx3, rateEquivBp: phx3 / (-out.transmission.perHundredBp) * 100, consAvg2_3: cons3, consEquivPctGDP: phx3 / cons3, gdp: ref21[0].gdp,
      costs: { premium3y: s3.on.totals.premium, bankFees3y: balances * 0.001 * 3, accounts: balances * 1e9 / 5000, admin3y: (balances * 1e9 / 5000) * 10 * 3 / 1e9, itBuildLow: 0.1, itBuildHigh: 1.3, itRunPerYear: [0.08, 0.32] } }; }
  // Digital Euro and Dragon routes exercised
  { const longRun = simulate(ref21, { ...P, months: 72 }, SCENARIOS.episode, { phx: true, market: mktEp });
    const c0 = ref21[0], Lcap = P.lcapPct / 100 * c0.gdp;
    const crisis = simulate([{ ...c0, pi: 8 }], { ...P, months: 12 }, { shock: { dPi: 0 } }, { phx: true, L0: [1.2 * Lcap] });
    const calm = simulate([{ ...c0, pi: 1.5 }], { ...P, months: 12 }, {}, { phx: true, L0: [1.2 * Lcap] });
    out.routes = { long72: { de: longRun.totals.recallDE, dep: longRun.totals.recallDeposits, dragon: longRun.totals.recallDragon, released: longRun.totals.released }, crisisTest: { de: crisis.totals.recallDE, dep: crisis.totals.recallDeposits, dragon: crisis.totals.recallDragon, residual: crisis.totals.residual }, calmTest: { de: calm.totals.recallDE, dep: calm.totals.recallDeposits, dragon: calm.totals.recallDragon, residual: calm.totals.residual } }; }
  // time-step error by Richardson extrapolation
  { const eff = dt => { const z = pair(ref21, { ...P, dt }, SCENARIOS.episode, { market: mktEp }); return { e: at(z.on, 24).pi - at(z.off, 24).pi, pi: at(z.on, 24).pi }; };
    const a = eff(0.025), b = eff(0.0125);
    out.richardson = { effect: a.e, effectErr: Math.abs(a.e - b.e), level: a.pi, levelErr: Math.abs(a.pi - b.pi) }; }
  log('core done');
  return { out, cellsEA, ref21, ctx, P, mkt, mktEp, effect24: at(ep.on, 24).pi - at(ep.off, 24).pi };
}
