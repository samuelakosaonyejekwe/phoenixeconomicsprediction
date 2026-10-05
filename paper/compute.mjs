// Computes every number, table and figure input of Phoenix Economics Solutions from the archived
// data vintage. Usage: node paper/compute.mjs [snapshot.json] [results.json]
// The core results come from src/model/reproduce.js — the same function the application's Evidence page
// runs on the same archived data — and this script adds the forecast backtest, the optimisation frontier,
// the stress tests and the trial simulations.
import fs from 'fs';
const R = new URL('../src/', import.meta.url).href;
const I = await import(R + 'model/inputs.js');
const { optimisePolicy, monthlySlope } = await import(R + 'model/engine.js');
const { SCENARIOS, DEFAULTS } = await import(R + 'model/params.js');
const F = await import(R + 'model/forecast.js');
const PL = await import(R + 'model/pilot.js');
const { reproduceCore, at } = await import(R + 'model/reproduce.js');
const { EU } = await import(R + 'data/geo.js');

const snap = JSON.parse(fs.readFileSync(process.argv[2] || new URL('./vintage-2026-10-04.json', import.meta.url)));
const data = Object.fromEntries(Object.entries(snap.sources).map(([k, v]) => [k, v.data]));
data.weoVintages = JSON.parse(fs.readFileSync(new URL('./weo-vintages.json', import.meta.url))).vintages;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- 1. core results (measurement, estimation, transmission, scenarios, sensitivity, instruments)
const core = reproduceCore(data, { log });
const { ctx, ref21, P, mkt, mktEp } = core;
const out = { builtAt: snap.builtAt, imfVintage: data.imf?.vintage, weoVintage: data.weo?.vintage, params: DEFAULTS, ...core.out };

// ---- 2. early warning
out.ew = { all: F.evaluateEarlyWarning(data, EU, I.targetAt, { from: '2001-01', paths: 300 }), holdout: F.evaluateEarlyWarning(data, EU, I.targetAt, { from: '2001-01', to: '2017-12', paths: 300 }), recent: F.evaluateEarlyWarning(data, EU, I.targetAt, { from: '2018-01', paths: 300 }) };
out.ewVariants = {};
for (const [name, variant] of [['t tails, EWMA, random walk (pre-specified)', {}], ['Gaussian, EWMA, random walk', { tails: false }], ['t tails, long-run volatility, random walk', { ewma: false }], ['t tails, EWMA, historical drift', { drift: true }], ['Gaussian, long-run volatility, historical drift', { tails: false, ewma: false, drift: true }]]) {
  const h = F.evaluateEarlyWarning(data, EU, I.targetAt, { from: '2001-01', to: '2017-12', variant, paths: 300 }), s = F.evaluateEarlyWarning(data, EU, I.targetAt, { from: '2018-01', variant, paths: 300 });
  out.ewVariants[name] = { holdout: h.brier, holdoutClim: h.brierClimRT, recent: s.brier, recentClim: s.brierClimRT };
}
// Global monitor (§6.1): error of the IMF's next-year inflation forecasts for the economies outside the EU,
// vintages 2009–2024 against the outturns of the current WEO.
{ const G = JSON.parse(fs.readFileSync(new URL('./weo-inflation-global.json', import.meta.url))).vintages, imfC = data.imf.countries, errs = {};
  for (const [y, v] of Object.entries(G)) for (const [iso, rows] of Object.entries(v.infl)) {
    const f = rows.find(r => r[0] === +y + 1), a = (imfC[iso]?.infl || []).find(r => +r[0] === +y + 1);
    if (f && a && +y + 1 <= 2025) (errs[iso] ||= []).push(f[1] - a[1]);
  }
  const rmse = Object.fromEntries(Object.entries(errs).sort().map(([k, e]) => [k, Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length)]));
  const sorted = Object.values(rmse).sort((a, b) => a - b);
  out.globalForecastError = { rmse, n: Object.values(errs).reduce((s, e) => s + e.length, 0), median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1) }; }
log('early warning done');

// ---- 6. optimisation: frontier over the overhang weight, two scenarios, two horizons
out.frontier = [];
for (const [scen, cells, sc, opts] of [['EU, December 2021', ref21, SCENARIOS.episode, { market: mktEp }], ['Euro area, live', core.cellsEA, SCENARIOS.live, { market: mkt }]]) {
  for (const months of scen.startsWith('EU') ? [24, 48] : [24]) for (const lossS of [0, 0.03, 0.1, 0.3, 1]) {
    const r = optimisePolicy(cells, { ...P, months, lossS }, sc, opts, { starts: 6, iters: 40 });
    out.frontier.push({ scenario: scen, months, lossS, ...r });
  }
}
log('optimisation done');
out.detectability = { effect24: core.effect24, hicpRounding: 0.1, rmse12: out.ew.all.rmse12 };

// ---- 8. stress tests with correlated parameters and structural variants
let msg; globalThis.self = { postMessage: d => { if (d.done) msg = d; } };
await import(R + 'workers/montecarlo.js');
for (const [name, cells, sc, m] of [['ea', core.cellsEA, SCENARIOS.live, mkt], ['eu2021', ref21, SCENARIOS.episode, mktEp]]) {
  self.onmessage({ data: { cells, P, scenario: sc, runs: 200, seed: 20261004, market: m, est: out.phillips.full.iv, kStanceAlt: out.transmission.kCalibrated } });
  out['mc_' + name] = { dPi: msg.dPi, dPi12: msg.dPi12, dI: msg.dI, dX: msg.dX, belowOn: msg.belowOn, belowOff: msg.belowOff, absorbed: msg.absorbed, maxResidual: msg.maxResidual, runs: msg.runs };
}
log('stress tests done');

// ---- 9. trials
{ const hh = { takeup: 0.2, takeupC: 0.01, deposit: 5000, delta: 0.1, sigma: 6000, r2: 0.5, attrition: 0.1 };
  const firm = { takeup: 0.3, takeupC: 0.01, deposit: 50000, delta: 0.15, sigma: 150000, r2: 0.8, attrition: 0.1 };
  const nH = PL.sampleSize(hh), nF = PL.sampleSize(firm);
  out.trial = { hh, firm, nH, nF, mdeH: PL.mde(nH, hh), mdeF: PL.mde(nF, firm), simH: PL.simulateTrialsIndividual(hh, nH, { reps: 300 }), simF: PL.simulateTrialsIndividual(firm, nF, { reps: 300 }),
    budgetH: PL.budget({ nPerArm: nH, takeup: hh.takeup, deposit: hh.deposit, premium: 1, months: 12, perHousehold: 4, nudge: 5 }),
    budgetF: PL.budget({ nPerArm: nF, takeup: firm.takeup, deposit: firm.deposit, premium: 1, months: 12, perHousehold: 20, nudge: 10 }),
    firmSensitivity: [['R² 0.6', { r2: 0.6 }], ['R² 0.4', { r2: 0.4 }], ['take-up 15%', { takeup: 0.15 }]].map(([n, o]) => [n, PL.sampleSize({ ...firm, ...o })]),
    nHnoAncova: PL.sampleSize({ ...hh, r2: 0, attrition: 0 }), nHcluster: PL.sampleSize({ ...hh, cluster: 50, icc: 0.02 }),
    sensitivity: [['take-up 10%', { takeup: 0.1 }], ['take-up 30%', { takeup: 0.3 }], ['amount €2,500', { deposit: 2500 }], ['amount €10,000', { deposit: 10000 }], ['σ_y €4,000', { sigma: 4000 }], ['σ_y €9,000', { sigma: 9000 }], ['R² 0.3', { r2: 0.3 }], ['R² 0.7', { r2: 0.7 }], ['δ 0.05', { delta: 0.05 }], ['δ 0.2', { delta: 0.2 }]].map(([n, o]) => [n, PL.sampleSize({ ...hh, ...o })]) }; }

out.stabInputs = { cells: (out.eaCells || []).map(c => ({ id: c.id, w: c.gdp, aR: ctx.pool.a })), km: monthlySlope(P), lamX: P.lamX, sigR: P.sigR, lamI: P.lamI, tPi: P.tPi, tX: P.tX, kE: monthlySlope(P, P.gammaE) };
fs.writeFileSync(process.argv[3] || new URL('./results-2026-10-04.json', import.meta.url), JSON.stringify(out, null, 1));
log('done');

