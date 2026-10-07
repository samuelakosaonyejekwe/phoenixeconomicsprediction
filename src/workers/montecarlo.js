// Monte Carlo stress testing off the main thread (Phoenix Economics Solutions §7.7): random
// inflation-trend and inflow shocks, each run solved with and without Phoenix under the same
// shocks, summarised as percentile fans and paired differences.
import { simulate, prepare } from '../model/engine.js';
import { summarise } from '../model/mcsummary.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function chol(A) { const n = A.length, L = A.map(() => new Array(n).fill(0)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j]; } return L; }
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

self.onmessage = ({ data }) => {
  // Runs `from` to `to` of `runs`: several workers share one stress test, each run with its own random
  // stream so that the result does not depend on how the runs are shared out. With `raw` each run is
  // sent as it finishes, for the page to merge; otherwise the runs are summarised here.
  const { cells, P, scenario, runs, seed, market, oilYoy, paramUncertainty = true, est = null, kStanceAlt = null, from = 0, to = runs, raw = false, phase = 0 } = data;
  const oil = oilYoy ? { yoy: oilYoy, at: t => { const k = Math.min(oilYoy.length - 1, Math.max(0, Math.floor(t))), k1 = Math.min(oilYoy.length - 1, k + 1); return oilYoy[k] + (oilYoy[k1] - oilYoy[k]) * (t - Math.floor(t)); } } : null;
  const prep = prepare(cells, P, scenario);
  const out = { on: [], off: [] };
  for (let k = from; k < to; k++) {
    const r = rng((seed || 7) + 7919 * (k + 1));
    const common = gauss(r) * 0.06;
    const perturb = { noise: cells.map(() => common + gauss(r) * 0.06), inj: cells.map(() => Math.exp(gauss(r) * 0.35)) };
    // Parameter uncertainty (§7.7): estimated parameters from their sampling distributions,
    // literature parameters across their published ranges, trial parameters across [0, 1].
    const U = (a, b) => a + (b - a) * r();
    // Correlated draws of (a, κ, γ_E) from the estimated covariance (Cholesky).
    let draw = null;
    if (paramUncertainty && est?.cov) {
      const L = chol(est.cov), z = [gauss(r), gauss(r), gauss(r)];
      draw = [0, 1, 2].map(i => L[i].reduce((s, v, j) => s + v * z[j], 0));
    }
    // Structural uncertainty (§7.7): four model structures drawn with equal probability.
    // Without the calibrated stance value the stance structure cannot be formed; the other three are drawn.
    const structure = paramUncertainty ? (kStanceAlt ? Math.floor(r() * 4) : [0, 2, 3][Math.floor(r() * 3)]) : 0;
    const Q = paramUncertainty ? {
      ...P,
      aPanel: Math.min(0.95, Math.max(0.05, (est?.aAnnual ?? P.aPanel) + (draw ? draw[0] : 0))),
      kappaPC: Math.max(0.005, (est?.kappa ?? P.kappaPC) + (draw ? draw[1] : 0)),
      gammaE: Math.max(0, (est?.gammaE ?? P.gammaE) + (draw ? draw[2] : 0)),
      mult: U(0.3, 1.0), sdHh: U(0.04, 0.2), sdCorp: U(0.05, 0.3), sdGov: U(0, 0.2), phiSel: U(0, 1), r0: U(1, 4), sigR: U(0, 0.1),
      ...(structure === 1 ? { kStance: kStanceAlt } : {}), // explicit policy-stance channel at its calibrated value (§5.3)
      ...(structure === 2 ? { kappaPC: 0.25 } : {}), // steep curve of tight labour markets
      ...(structure === 3 ? { aPanel: Math.max(0.05, (est?.aAnnual ?? P.aPanel) * 0.5) } : {}), // weaker anchoring
    } : P;
    // The run without Phoenix is also the baseline that the run with Phoenix needs for the market rate
    // path (the engine would otherwise solve it a second time); the result is the same.
    const needsBase = Q.rateMode !== 'taylor' && market?.curve?.length;
    const without = simulate(cells, Q, scenario, { prep, phx: false, perturb, market, oil, wantBase: !!needsBase, quiet: true });
    const withPhx = simulate(cells, Q, scenario, { prep, phx: true, perturb, market, oil, quiet: true, ...(needsBase ? { base: without.baseArrays } : {}) });
    for (const [phx, res] of [[true, withPhx], [false, without]]) {
      out[phx ? 'on' : 'off'].push({ pi: res.agg.map(a => a.pi), S: res.agg.map(a => a.S), i: res.agg.at(-1).i, x: res.agg.at(-1).x, Scrit: res.agg.at(-1).Scrit, absorbed: res.totals.absorbed, residual: Math.abs(res.totals.residual), pi12: res.agg.find(a => a.t >= 12 - 1e-9)?.pi });
    }
    if (raw) self.postMessage({ run: k, on: out.on.pop(), off: out.off.pop(), phase }); else self.postMessage({ progress: (k + 1 - from) / (to - from) });
  }
  const t = simulate(cells, P, scenario, { prep, phx: true, market, oil }).agg.map(a => a.t);
  self.postMessage(raw ? { end: true, t, phase } : summarise(out.on, out.off, t, P));
};
