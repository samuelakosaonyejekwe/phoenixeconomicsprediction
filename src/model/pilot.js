// Pilot planner (Phoenix Economics Solutions §10): randomised encouragement trials that measure the
// behavioural parameters on which the effect of absorption depends.
//
// Household arm. Households are randomly offered a PHX savings wallet (T) or not (C). Outcomes are
// total spending over 12 months y and the net increase in PHX balances d, both from consented,
// consolidated account data (all accounts, via account-information services), plus total financial
// assets to detect substitution. The estimand
//     δ = −∂(annual spending)/∂(PHX balance)
// is the spending forgone per euro moved into PHX. In the model it equals φ_sel · s_hh (§4.8), so
// the trial identifies φ_sel = δ / s_hh. If wallets are funded from other savings rather than from
// spending, δ = 0 and absorption has no demand effect — the estimand captures that directly.
// Take-up at different premia identifies r₀ (§2.4).
//
// Firm arm. Small and medium firms are randomly offered PHX absorption bonds; the outcome is
// investment plus distributions, giving φ_sel · s_corp.
//
// Estimator: Wald / IV with the random offer as instrument, ANCOVA adjustment for pre-period
// spending, heteroskedasticity- (or cluster-) robust standard errors.
import { normCdf } from './forecast.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const varOf = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1); };
const Z = { 0.1: 1.645, 0.05: 1.96, 0.01: 2.576 };
const ZB = { 0.7: 0.524, 0.8: 0.842, 0.9: 1.282 };

// Sample size per arm (§10.2):
//   n = DE · 2 (z_{1−α/2} + z_{1−β})² σ²(1 − R²) / ((p_T − p_C) A δ)² / (1 − attrition)
// with design effect DE = 1 + (m − 1)ICC when randomising clusters of size m (1 for individuals).
export function sampleSize(s) {
  const d = (s.takeup - (s.takeupC || 0)) * s.deposit * s.delta;
  if (!(d > 0)) return Infinity;
  const de = 1 + Math.max(0, (s.cluster || 1) - 1) * (s.icc || 0);
  const n = de * 2 * (Z[s.alpha || 0.05] + ZB[s.power || 0.8]) ** 2 * s.sigma ** 2 * (1 - (s.r2 || 0)) / (d * d);
  return Math.ceil(n / (1 - (s.attrition || 0)));
}
export function powerAt(n, s) {
  const d = (s.takeup - (s.takeupC || 0)) * s.deposit * s.delta;
  const de = 1 + Math.max(0, (s.cluster || 1) - 1) * (s.icc || 0);
  const nEff = n * (1 - (s.attrition || 0)) / de;
  return normCdf(Math.abs(d) * Math.sqrt(nEff / 2) / (s.sigma * Math.sqrt(1 - (s.r2 || 0))) - Z[s.alpha || 0.05]);
}
export const mde = (n, s) => {
  const de = 1 + Math.max(0, (s.cluster || 1) - 1) * (s.icc || 0);
  const nEff = n * (1 - (s.attrition || 0)) / de;
  return (Z[s.alpha || 0.05] + ZB[0.8]) * s.sigma * Math.sqrt(1 - (s.r2 || 0)) * Math.sqrt(2 / nEff) / ((s.takeup - (s.takeupC || 0)) * s.deposit);
};

// Strata: economies where contracts would act, allocated in proportion to GDP, seeded order.
export function design(cells, states, P, { nPerArm, seed = 20261004, maxStrata = 6 }) {
  const pool = cells.filter(c => states[c.id] && (c.pi >= P.piTh - 0.5 || states[c.id].rho >= 1))
    .sort((a, b) => b.gdp - a.gdp).slice(0, maxStrata);
  const r = rng(seed);
  const order = pool.map(c => ({ c, u: r() })).sort((a, b) => a.u - b.u).map(x => x.c);
  const g = order.reduce((s, c) => s + c.gdp, 0) || 1;
  // Allocation in proportion to GDP by largest remainders, so the strata always sum to nPerArm.
  const raw = order.map(c => nPerArm * c.gdp / g), base = raw.map(Math.floor);
  let left = nPerArm - base.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  const strata = order.map((c, i) => ({ id: c.id, name: c.name, pi: c.pi, rho: states[c.id].rho, n: base[i] })).filter(s => s.n > 0);
  return { seed, strata, nPerArm };
}

// Repeated simulated trials (sampling distributions of arm means, normal approximation): empirical
// power, bias and coverage of the 95% interval (§10.3).
export function simulateTrials(s, n, { reps = 2000, seed = 7 } = {}) {
  const r = rng(seed);
  const pT = s.takeup, pC = s.takeupC || 0, A = s.deposit, dlt = s.delta, sig = s.sigma * Math.sqrt(1 - (s.r2 || 0));
  const nEff = Math.max(2, Math.round(n * (1 - (s.attrition || 0))));
  const est = [];
  let cover = 0, reject = 0;
  for (let k = 0; k < reps; k++) {
    // arm means of placed balances (log-normal amounts, CV 0.6) and spending changes
    const dT = pT * A + Math.sqrt(pT * A * A * (1 + 0.36) - (pT * A) ** 2) / Math.sqrt(nEff) * gauss(r);
    const dC = pC * A + Math.sqrt(Math.max(1e-9, pC * A * A * (1 + 0.36) - (pC * A) ** 2)) / Math.sqrt(nEff) * gauss(r);
    const yT = -dlt * dT + sig / Math.sqrt(nEff) * gauss(r), yC = -dlt * dC + sig / Math.sqrt(nEff) * gauss(r);
    const dd = dT - dC, e = -(yT - yC) / dd;
    const se = Math.sqrt(2) * sig / Math.sqrt(nEff) / Math.abs(dd);
    est.push(e);
    if (Math.abs(e - dlt) <= 1.96 * se) cover++;
    if (Math.abs(e / se) > 1.96) reject++;
  }
  est.sort((a, b) => a - b);
  return { reps, power: reject / reps, coverage: cover / reps, mean: mean(est), p10: est[Math.floor(0.1 * reps)], p90: est[Math.floor(0.9 * reps)] };
}

// One simulated trial with individual records, for the data template (§10.3).
export function simulateTrial({ n, takeup, takeupC = 0, deposit, delta, sigma, r2 = 0.5, seed = 7 }) {
  const r = rng(seed), rows = [];
  for (const arm of ['T', 'C']) for (let k = 0; k < n; k++) {
    const took = r() < (arm === 'T' ? takeup : takeupC) ? 1 : 0;
    const d = took ? Math.max(0, deposit * Math.exp(0.6 * gauss(r) - 0.18)) : 0;
    const pre = 24000 * Math.exp(0.35 * gauss(r));
    const common = Math.sqrt(r2) * sigma * gauss(r);
    const post = pre + common + Math.sqrt(1 - r2) * sigma * gauss(r) - delta * d;
    rows.push({ id: `${arm}${k + 1}`, arm, took, d, pre, post, prePrev: pre - common });
  }
  return rows;
}

// Wald / IV estimator with ANCOVA adjustment and robust standard error (§10.3).
export function estimate(rows) {
  const T = rows.filter(x => x.arm === 'T'), C = rows.filter(x => x.arm === 'C');
  if (T.length < 2 || C.length < 2) return { ok: false };
  const y = x => x.post - x.pre;
  const dd = mean(T.map(x => x.d)) - mean(C.map(x => x.d));
  if (!(Math.abs(dd) > 1e-9)) return { ok: false, reason: 'No difference in PHX balances between arms.' };
  const itt = mean(T.map(y)) - mean(C.map(y));
  const delta = -itt / dd;
  const res = x => y(x) + delta * x.d;
  const se = Math.sqrt(varOf(T.map(res)) / T.length + varOf(C.map(res)) / C.length) / Math.abs(dd);
  return { ok: Number.isFinite(delta), delta, se, lo: delta - 1.96 * se, hi: delta + 1.96 * se, itt, dd, nT: T.length, nC: C.length, takeT: mean(T.map(x => x.took)), takeC: mean(C.map(x => x.took)) };
}

export function budget({ nPerArm, takeup, deposit, premium, months, perHousehold, nudge }) {
  const takers = nPerArm * takeup;
  const remuneration = takers * deposit * premium / 100 * months / 12;
  const ops = 2 * nPerArm * perHousehold;
  const encouragement = nPerArm * nudge;
  return { takers, held: takers * deposit, remuneration, ops, encouragement, total: remuneration + ops + encouragement };
}

// Observed trial data: id, arm (T/C), took_up (0/1), phx_balance_eur, spend_pre, spend_post.
export function parseTrialCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',').map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  const ix = { id: col('id'), arm: col('arm'), took: col('took_up'), d: col('phx_balance_eur') >= 0 ? col('phx_balance_eur') : col('deposit_eur'), pre: col('spend_pre'), post: col('spend_post') };
  if (ix.arm < 0 || ix.d < 0 || ix.pre < 0 || ix.post < 0) throw new Error('Columns needed: arm, phx_balance_eur, spend_pre, spend_post (and optionally id, took_up)');
  return lines.map((l, k) => {
    const r = l.split(',').map(x => x.trim());
    const row = { id: ix.id >= 0 ? r[ix.id] : String(k + 1), arm: r[ix.arm].toUpperCase(), took: ix.took >= 0 ? +r[ix.took] : (+r[ix.d] > 0 ? 1 : 0), d: +r[ix.d], pre: +r[ix.pre], post: +r[ix.post] };
    if (!['T', 'C'].includes(row.arm) || ![row.d, row.pre, row.post].every(Number.isFinite)) throw new Error(`Row ${k + 2}: arm must be T or C and amounts numeric`);
    return row;
  });
}

export function templateCSV(rows) {
  return ['id,arm,took_up,phx_balance_eur,spend_pre,spend_post', ...rows.map(x => `${x.id},${x.arm},${x.took},${x.d.toFixed(0)},${x.pre.toFixed(0)},${x.post.toFixed(0)}`)].join('\n');
}

// Individual-level simulated trials (§10.3): every household is drawn — take-up, amount placed
// (log-normal, CV 0.6), pre-period spending and a spending change with the assumed variance and
// pre-period correlation — and the Wald estimate is computed on the individual records.
export function simulateTrialsIndividual(s, n, { reps = 300, seed = 11 } = {}) {
  // Every unit is drawn individually (§10.3): take-up (treated p_T, controls p_C), the amount placed
  // (log-normal around A), pre-period spending y₀ and the twelve-month outcome y, correlated with y₀ so
  // that y₀ explains a share R² of its variance; attrition removes units at random. The estimator adjusts
  // y for y₀ by the pooled regression slope (ANCOVA) and takes the Wald ratio with a robust standard error.
  const r = rng(seed), nEff = Math.max(3, Math.round(n * (1 - (s.attrition || 0))));
  const sig = s.sigma, rho = Math.sqrt(Math.max(0, Math.min(0.99, s.r2 || 0))), est = [];
  let cover = 0, reject = 0;
  const y = new Float64Array(2 * nEff), y0 = new Float64Array(2 * nEff), d = new Float64Array(2 * nEff);
  for (let k = 0; k < reps; k++) {
    for (let i = 0; i < 2 * nEff; i++) {
      const treated = i < nEff, took = r() < (treated ? s.takeup : s.takeupC || 0);
      d[i] = took ? s.deposit * Math.exp(0.6 * gauss(r) - 0.18) : 0;
      y0[i] = sig * gauss(r);
      y[i] = rho * y0[i] + Math.sqrt(1 - rho * rho) * sig * gauss(r) - s.delta * d[i];
    }
    let m0 = 0, my = 0; for (let i = 0; i < 2 * nEff; i++) { m0 += y0[i]; my += y[i]; } m0 /= 2 * nEff; my /= 2 * nEff;
    let sxy = 0, sxx = 0; for (let i = 0; i < 2 * nEff; i++) { sxy += (y0[i] - m0) * (y[i] - my); sxx += (y0[i] - m0) ** 2; }
    const b = sxx > 0 ? sxy / sxx : 0;
    let yT = 0, yC = 0, dT = 0, dC = 0;
    for (let i = 0; i < 2 * nEff; i++) { const ya = y[i] - b * y0[i]; if (i < nEff) { yT += ya; dT += d[i]; } else { yC += ya; dC += d[i]; } }
    yT /= nEff; yC /= nEff; dT /= nEff; dC /= nEff;
    const dd = dT - dC, e = -(yT - yC) / dd;
    let sT = 0, sC = 0, qT = 0, qC = 0;
    for (let i = 0; i < 2 * nEff; i++) { const rr = y[i] - b * y0[i] + e * d[i]; if (i < nEff) { sT += rr; qT += rr * rr; } else { sC += rr; qC += rr * rr; } }
    const vT = (qT - sT * sT / nEff) / (nEff - 1), vC = (qC - sC * sC / nEff) / (nEff - 1);
    const se = Math.sqrt(vT / nEff + vC / nEff) / Math.abs(dd);
    est.push(e);
    if (Math.abs(e - s.delta) <= 1.96 * se) cover++;
    if (Math.abs(e / se) > 1.96) reject++;
  }
  est.sort((a, b) => a - b);
  return { reps, n: nEff, power: reject / reps, coverage: cover / reps, mean: mean(est), p10: est[Math.floor(0.1 * reps)], p90: est[Math.floor(0.9 * reps)] };
}
