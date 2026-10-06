// Monte Carlo stress testing off the main thread (Phoenix Economics Solutions §7.7): random
// inflation-trend and inflow shocks, each run solved with and without Phoenix under the same
// shocks, summarised as percentile fans and paired differences.
import { simulate, prepare } from '../model/engine.js';

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
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };

self.onmessage = ({ data }) => {
  const { cells, P, scenario, runs, seed, market, oilYoy, paramUncertainty = true, est = null, kStanceAlt = null } = data;
  const oil = oilYoy ? { yoy: oilYoy, at: t => { const k = Math.min(oilYoy.length - 1, Math.max(0, Math.floor(t))), k1 = Math.min(oilYoy.length - 1, k + 1); return oilYoy[k] + (oilYoy[k1] - oilYoy[k]) * (t - Math.floor(t)); } } : null;
  const r = rng(seed || 7);
  const prep = prepare(cells, P, scenario);
  const out = { on: [], off: [] };
  for (let k = 0; k < runs; k++) {
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
    for (const phx of [true, false]) {
      const res = simulate(cells, Q, scenario, { prep, phx, perturb, market, oil });
      out[phx ? 'on' : 'off'].push({ pi: res.agg.map(a => a.pi), S: res.agg.map(a => a.S), i: res.agg.at(-1).i, x: res.agg.at(-1).x, Scrit: res.agg.at(-1).Scrit, absorbed: res.totals.absorbed, residual: Math.abs(res.totals.residual), pi12: res.agg.find(a => a.t >= 12 - 1e-9)?.pi });
    }
    if (k % 10 === 9) self.postMessage({ progress: (k + 1) / runs });
  }
  const t = simulate(cells, P, scenario, { prep, phx: true, market, oil }).agg.map(a => a.t);
  const fan = (list, key) => t.map((_, i) => { const v = list.map(x => x[key][i]); return [q(v, 0.1), q(v, 0.5), q(v, 0.9)]; });
  const hit = list => list.filter(x => x.pi[x.pi.length - 1] <= P.target + 0.25).length / list.length;
  const below = list => list.filter(x => x.S[x.S.length - 1] <= x.Scrit).length / list.length;
  const dPi12 = out.on.map((x, k) => x.pi12 - out.off[k].pi12);
  const dX = out.on.map((x, k) => x.x - out.off[k].x);
  const dPi = out.on.map((x, k) => x.pi[x.pi.length - 1] - out.off[k].pi[out.off[k].pi.length - 1]);
  const dI = out.on.map((x, k) => x.i - out.off[k].i);
  self.postMessage({ done: true, dPi12: [q(dPi12, 0.1), q(dPi12, 0.5), q(dPi12, 0.9)], dX: [q(dX, 0.1), q(dX, 0.5), q(dX, 0.9)], dPi: [q(dPi, 0.1), q(dPi, 0.5), q(dPi, 0.9)], dPiRange: [Math.min(...dPi), Math.max(...dPi)], dI: [q(dI, 0.1), q(dI, 0.5), q(dI, 0.9)], belowOn: below(out.on), belowOff: below(out.off), t, piOn: fan(out.on, 'pi'), piOff: fan(out.off, 'pi'), SOn: fan(out.on, 'S'), SOff: fan(out.off, 'S'), hitOn: hit(out.on), hitOff: hit(out.off), absorbed: [q(out.on.map(x => x.absorbed), 0.1), q(out.on.map(x => x.absorbed), 0.5), q(out.on.map(x => x.absorbed), 0.9)], maxResidual: Math.max(...out.on.map(x => x.residual), ...out.off.map(x => x.residual)), runs });
};
