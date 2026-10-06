// Estimation from official data (Phoenix Economics Solutions §3.5–3.7, §5).
import { EU } from '../data/geo.js';
import { targetAt } from './targets.js';
import { hln, betaInc } from './stats.js';

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Hodrick–Prescott trend (solves (I + λD'D)τ = y with a dense pentadiagonal system).
export function hpFilter(y, lambda = 100) {
  const n = y.length;
  if (n < 4) return y.slice();
  const A = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) A[i][i] = 1;
  for (let k = 0; k < n - 2; k++) {
    const d = [1, -2, 1];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) A[k + a][k + b] += lambda * d[a] * d[b];
  }
  // Gaussian elimination (banded, n ≤ 40).
  const b = Float64Array.from(y);
  for (let c = 0; c < n; c++) {
    for (let r = c + 1; r < Math.min(n, c + 3); r++) {
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < Math.min(n, c + 3); k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < Math.min(n, r + 3); k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return Array.from(x);
}





function invert(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(r => r.slice(n));
}



// Daily nowcast coefficients (§3.7), estimated on monthly EU data: the one-month change in each
// economy's year-on-year inflation regressed on its energy weight × the base-effect-adjusted change
// in Brent in euro, (Δ%P_t − Δ%P_{t−12}), and, for the euro area, the same for EUR/USD.
export function estimateNowcast(data) {
  const oil = data.oilm?.series, fx = data.expect?.eurusdM, H = data.hicp?.series, W = data.energyw?.series;
  if (!oil?.length || !fx?.length || !H) return { theta: 0.095, fx: -0.009, n: 0, estimated: false };
  const f = new Map(fx.map(r => [r[0], r[1]]));
  const pe = new Map(oil.filter(r => f.has(r[0])).map(r => [r[0], r[1] / f.get(r[0])]));
  const months = [...pe.keys()].sort();
  const dP = new Map(), dF = new Map();
  for (let i = 1; i < months.length; i++) {
    dP.set(months[i], (pe.get(months[i]) / pe.get(months[i - 1]) - 1) * 100);
    dF.set(months[i], (f.get(months[i]) / f.get(months[i - 1]) - 1) * 100);
  }
  const prev12 = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 13, 1)); return d.toISOString().slice(0, 7); };
  const prev1 = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); };
  const rows = [];
  for (const c of EU) {
    const s = H[c.eu]; const w = (W?.[c.eu]?.at(-1)?.[1] ?? 95) / 1000;
    if (!s) continue;
    const m = new Map(s);
    for (const [mo, v] of s) {
      const p = m.get(prev1(mo)), a = dP.get(mo), b = dP.get(prev12(mo)), fa = dF.get(mo), fb = dF.get(prev12(mo));
      if (p == null || a == null || b == null || fa == null || fb == null) continue;
      rows.push([v - p, w * (a - b), c.ea ? fa - fb : 0]);
    }
  }
  if (rows.length < 200) return { theta: 0.095, fx: -0.009, n: rows.length, estimated: false };
  // OLS with intercept, two regressors.
  const n = rows.length, my = mean(rows.map(r => r[0])), m1 = mean(rows.map(r => r[1])), m2 = mean(rows.map(r => r[2]));
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0, yy = 0;
  for (const [y, x1, x2] of rows) { const u = x1 - m1, v = x2 - m2, z = y - my; a11 += u * u; a12 += u * v; a22 += v * v; b1 += u * z; b2 += v * z; yy += z * z; }
  const det = a11 * a22 - a12 * a12;
  const theta = (a22 * b1 - a12 * b2) / det, fxc = (a11 * b2 - a12 * b1) / det;
  const rss = yy - theta * b1 - fxc * b2;
  const s2 = rss / (n - 3);
  // Out-of-sample: the last 36 months predicted with coefficients fitted on earlier data are
  // reported by nowcastBacktest(); here the full-sample fit is returned.
  return { theta, fx: fxc, thetaSe: Math.sqrt(s2 * a22 / det), fxSe: Math.sqrt(s2 * a11 / det), n, r2: 1 - rss / yy, estimated: true };
}

// Pseudo-out-of-sample check of the nowcast (§3.7): for each of the last `last` months, the change
// in inflation is predicted with coefficients fitted only on earlier months, against no change.
export function nowcastBacktest(data, { last = 36 } = {}) {
  const H = data.hicp?.series;
  if (!H) return null;
  const months = [...new Set(EU.flatMap(c => (H[c.eu] || []).map(r => r[0])))].sort();
  const test = months.slice(-last);
  let e = 0, b = 0, n = 0;
  const dser = [];
  for (const m of test) {
    const cut = { ...data, hicp: { series: Object.fromEntries(Object.entries(H).map(([k, s]) => [k, s.filter(r => r[0] < m)])) } };
    const coef = estimateNowcast(cut);
    if (!coef.estimated) continue;
    const one = estimateNowcastRows(data, m);
    let dm = 0;
    for (const r of one) { const pred = coef.theta * r.x1 + coef.fx * r.x2; e += (r.dy - pred) ** 2; b += r.dy ** 2; n++; dm += ((r.dy - pred) ** 2 - r.dy ** 2) / one.length; }
    if (one.length) dser.push(dm);
  }
  // Diebold–Mariano on the cross-sectional mean loss differential per month (h = 1).
  const T = dser.length, md = dser.reduce((s, x) => s + x, 0) / T, v = dser.reduce((s, x) => s + (x - md) ** 2, 0) / T;
  // Diebold–Mariano with the Harvey–Leybourne–Newbold small-sample correction (h = 1), Student-t p-value.
  const { stat, p } = hln(md / Math.sqrt(v / T), T, 1);
  return n ? { n, months: T, rmse: Math.sqrt(e / n), naive: Math.sqrt(b / n), dm: { stat, p } } : null;
}


function estimateNowcastRows(data, month) {
  const oil = data.oilm?.series, fx = data.expect?.eurusdM, H = data.hicp?.series, W = data.energyw?.series;
  const f = new Map(fx.map(r => [r[0], r[1]]));
  const pe = new Map(oil.filter(r => f.has(r[0])).map(r => [r[0], r[1] / f.get(r[0])]));
  const shift = (m, k) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 - k, 1)); return d.toISOString().slice(0, 7); };
  const ch = (map, m) => (map.get(m) && map.get(shift(m, 1)) ? (map.get(m) / map.get(shift(m, 1)) - 1) * 100 : null);
  const a = ch(pe, month), bq = ch(pe, shift(month, 12)), fa = ch(f, month), fb = ch(f, shift(month, 12));
  if (a == null || bq == null || fa == null || fb == null) return [];
  const out = [];
  for (const c of EU) {
    const s = H[c.eu]; if (!s) continue;
    const m = new Map(s), v = m.get(month), p = m.get(shift(month, 1));
    if (v == null || p == null) continue;
    const w = (W?.[c.eu]?.at(-1)?.[1] ?? 95) / 1000;
    out.push({ dy: v - p, x1: w * (a - bq), x2: c.ea ? fa - fb : 0 });
  }
  return out;
}

// Year-on-year change in Brent prices in euro along the simulation horizon (§4.9). `flat` holds the
// price at its latest level (what is known at the start); `realised` uses the prices that followed
// (ex-post validation of past episodes).
export function oilPath(data, { asOf = null, mode = 'flat', months = 120 } = {}) {
  const oil = data.oilm?.series, fx = data.expect?.eurusdM;
  if (!oil?.length || !fx?.length) return null;
  const f = new Map(fx.map(r => [r[0], r[1]]));
  const pe = new Map(oil.filter(r => f.has(r[0])).map(r => [r[0], r[1] / f.get(r[0])]));
  const keys = [...pe.keys()].sort();
  const start = asOf ? keys.filter(k => k <= asOf).at(-1) : keys.at(-1);
  if (!start) return null;
  const shift = (m, k) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)); return d.toISOString().slice(0, 7); };
  const p0 = pe.get(start);
  const yoy = [];
  for (let k = 0; k <= months; k++) {
    const m = shift(start, k), mPrev = shift(start, k - 12);
    const priceAt = mm => (mm <= start ? pe.get(mm) : mode === 'realised' && pe.has(mm) ? pe.get(mm) : p0) ?? p0;
    const now = priceAt(m), before = priceAt(mPrev);
    yoy.push((now / before - 1) * 100);
  }
  return { start, mode, yoy, at: t => yoy[Math.min(yoy.length - 1, Math.max(0, Math.floor(t)))] + (yoy[Math.min(yoy.length - 1, Math.floor(t) + 1)] - yoy[Math.min(yoy.length - 1, Math.max(0, Math.floor(t)))]) * (t - Math.floor(t)) };
}

// ---------------------------------------------------------------------------
// Output gap from GDP (§3.5): HP trend (λ = 100) of log real GDP built from IMF real growth,
// 1999 to t+5 (the projections reduce the end-point bias of the filter). Gap in % of potential.
export function outputGaps(imf, members = EU) {
  const out = {};
  for (const c of members) {
    const g = (imf?.[c.iso3]?.growth || []).filter(r => +r[0] >= 1999).sort((a, b) => +a[0] - +b[0]);
    if (g.length < 12) continue;
    let lv = 0;
    const ys = g.map(r => +r[0]), lnY = g.map(r => (lv += Math.log(1 + r[1] / 100)));
    const tr = hpFilter(lnY, 100);
    out[c.iso3] = Object.fromEntries(ys.map((y, i) => [y, 100 * (lnY[i] - tr[i])]));
  }
  return out;
}

// Okun's law in gap form (§3.5), reported: u − ū = −b · x, with ū the HP trend of unemployment;
// β_O = 1/b. Pooled with country intercepts, and per economy shrunk towards the pool.
export function estimateOkunGap(imf, gaps, members = EU, y0 = 2000, y1 = 2025) {
  const rows = [], est = {};
  for (const c of members) {
    const u = (imf?.[c.iso3]?.unemp || []).filter(r => +r[0] >= 1999).sort((a, b) => +a[0] - +b[0]);
    const gx = gaps[c.iso3];
    if (u.length < 12 || !gx) continue;
    const tr = hpFilter(u.map(r => r[1]), 100);
    const cr = u.map((r, i) => [+r[0], r[1] - tr[i]]).filter(([y]) => y >= y0 && y <= y1 && gx[y] != null);
    let sxy = 0, sxx = 0, see = 0;
    for (const [y, ug] of cr) { sxy += gx[y] * ug; sxx += gx[y] ** 2; rows.push({ c: c.iso3, x: gx[y], ug }); }
    if (sxx <= 0) continue;
    const b = -sxy / sxx;
    for (const [y, ug] of cr) see += (ug + b * gx[y]) ** 2;
    est[c.iso3] = { b, varB: see / Math.max(1, cr.length - 1) / sxx, n: cr.length };
  }
  let sxy = 0, sxx = 0;
  for (const r of rows) { sxy += r.x * r.ug; sxx += r.x * r.x; }
  const bP = -sxy / sxx;
  const vals = Object.values(est);
  const tau2 = Math.max(0, mean(vals.map(e => (e.b - bP) ** 2)) - mean(vals.map(e => e.varB)));
  const beta = {};
  for (const [iso, e] of Object.entries(est)) { const w = tau2 / (tau2 + e.varB); beta[iso] = 1 / Math.max(0.02, w * e.b + (1 - w) * bP); }
  return { pooled: 1 / bP, bPooled: bP, beta, n: rows.length, of: iso => beta[iso] ?? 1 / bP };
}






// Elasticity of EU-27 energy inflation to Brent-in-euro inflation (year-on-year, monthly), used to
// build energy paths for economies without an HICP energy index (§3.8).
export function energyOilElasticity(data) {
  const e = data.hicpx?.energy?.EU27_2020, oil = data.oilm?.series, fx = data.expect?.eurusdM;
  if (!e || !oil || !fx) return 0.3;
  const f = new Map(fx.map(r => [r[0], r[1]])), pe = new Map(oil.filter(r => f.has(r[0])).map(r => [r[0], r[1] / f.get(r[0])]));
  const yoy = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 13, 1)).toISOString().slice(0, 7); return pe.has(m) && pe.has(d) ? (pe.get(m) / pe.get(d) - 1) * 100 : null; };
  let sxy = 0, sxx = 0, n = 0, mx = 0, my = 0;
  const pts = e.map(([m, v]) => [yoy(m), v]).filter(([x]) => x != null);
  for (const [x, y] of pts) { mx += x / pts.length; my += y / pts.length; }
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; n++; }
  return sxx ? sxy / sxx : 0.3;
}

// Energy-inflation path (§4.9): year-on-year change of the HICP energy index when the index is held at
// its latest level ("flat", a random walk: the default forecast), grows at its historical mean rate
// ("drift", an alternative), or follows its realised values (ex-post validation). A
// nowcast adjustment of the latest level (in % of the index) can be supplied.
export function energyPath(indexRows, { asOf = null, mode = 'flat', months = 120, levelAdjPct = 0, drift = 0 } = {}) {
  if (!indexRows?.length) return null;
  const m = new Map(indexRows.map(r => [r[0], r[1]]));
  const keys = indexRows.map(r => r[0]).sort();
  const start = asOf ? keys.filter(k => k <= asOf).at(-1) : keys.at(-1);
  if (!start) return null;
  const shift = (mm, k) => new Date(Date.UTC(+mm.slice(0, 4), +mm.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7);
  const lvl0 = m.get(start) * (1 + levelAdjPct / 100);
  const ahead = mm => { const [y0, m0] = start.split('-').map(Number), [y1, m1] = mm.split('-').map(Number); return (y1 - y0) * 12 + (m1 - m0); };
  const level = mm => (mm < start ? m.get(mm) : mm === start ? lvl0 : mode === 'realised' && m.has(mm) ? m.get(mm) : mode === 'drift' ? lvl0 * Math.pow(1 + drift / 100, ahead(mm) / 12) : lvl0);
  const yoy = [];
  for (let k = 0; k <= months; k++) { const a = level(shift(start, k)), b = level(shift(start, k - 12)); yoy.push(a && b ? (a / b - 1) * 100 : 0); }
  return { start, mode, yoy, at: t => { const k = Math.min(yoy.length - 1, Math.max(0, Math.floor(t))), k1 = Math.min(yoy.length - 1, k + 1); return yoy[k] + (yoy[k1] - yoy[k]) * (t - Math.floor(t)); } };
}

// ===========================================================================
// Identification-robust core Phillips curve (§5.1).
// Annual observations are December year-on-year rates (non-overlapping). Estimators:
//   OLS with country effects (aggregate-relevant), with country and year effects (regional),
//   2SLS instrumenting the gap with its lag and the rest-of-world output gap,
//   half-panel jackknife correction of the dynamic-panel (Nickell) bias.
// Standard errors are clustered two ways, by country and by year.
import { GLOBAL } from '../data/geo.js';

export const decRate = rows => Object.fromEntries((rows || []).filter(r => r[0].endsWith('-12')).map(r => [+r[0].slice(0, 4), r[1]]));

// GDP-weighted output gap of the non-EU economies (IMF), the external-demand instrument; weights are
// GDP in US dollars of `wYear`.
export function worldGap(imf, wYear = 2019) {
  const nonEU = GLOBAL.filter(g => !EU.some(e => e.iso3 === g.iso3));
  const gaps = outputGaps(imf, nonEU), w = {};
  for (const g of nonEU) { const v = imf?.[g.iso3]?.gdp?.find(r => +r[0] === wYear)?.[1]; if (v) w[g.iso3] = v; }
  const years = [...new Set(Object.values(gaps).flatMap(g => Object.keys(g).map(Number)))].sort((a, b) => a - b);
  const out = {};
  for (const y of years) {
    let s = 0, ws = 0;
    for (const [iso, wt] of Object.entries(w)) { const v = gaps[iso]?.[y]; if (v != null) { s += wt * v; ws += wt; } }
    if (ws) out[y] = s / ws;
  }
  return out;
}
// The same instrument as it could be computed in year y: growth and its projections for the non-EU
// economies from the IMF vintage of y, weighted by that vintage's GDP of y − 1 (§5.2).
export function worldGapVintage(vintages, y) {
  const w = vintages?.[String(y)]?.world; if (!w) return null;
  const str = rows => rows?.map(([yy, x]) => [String(yy), x]);
  return worldGap(Object.fromEntries(Object.entries(w).map(([iso, d]) => [iso, { growth: str(d.growth), gdp: str(d.gdp) }])), y - 1);
}

export function phillipsRows(data, { y0 = 2001, y1 = 2025, gaps, members = EU, world } = {}) {
  const imf = data.imf?.countries || data.weo?.countries;
  gaps ||= outputGaps(imf, members);
  world ||= worldGap(imf);
  const rows = [];
  for (const c of members) {
    const pc = decRate(data.hicpx?.core?.[c.eu]), pe = decRate(data.hicpx?.energy?.[c.eu]), gx = gaps[c.iso3];
    if (!gx) continue;
    for (let y = y0; y <= y1; y++) {
      if (pc[y] == null || pc[y - 1] == null || pe[y] == null || gx[y] == null || gx[y - 1] == null || world[y] == null) continue;
      // Gap of last December's core rate from the target then in force.
      rows.push({ c: c.iso3, y, dp: pc[y] - pc[y - 1], gap: pc[y - 1] - targetAt(c.eu, `${y - 1}-12`), x: gx[y], e: pe[y], zx: gx[y - 1], zw: world[y] });
    }
  }
  return rows;
}

function demeanRows(rows, keys, cols) {
  const out = cols.map(k => rows.map(r => r[k]));
  for (let it = 0; it < (keys.length > 1 ? 40 : 1); it++) for (const key of keys) for (const v of out) {
    const sum = {}, n = {};
    rows.forEach((r, i) => { sum[r[key]] = (sum[r[key]] || 0) + v[i]; n[r[key]] = (n[r[key]] || 0) + 1; });
    for (let i = 0; i < v.length; i++) v[i] -= sum[rows[i][key]] / n[rows[i][key]];
  }
  return Object.fromEntries(cols.map((k, j) => [k, out[j]]));
}
const matT = (A, B) => A[0].map((_, i) => B[0].map((__, j) => A.reduce((s, r, k) => s + A[k][i] * B[k][j], 0)));

// Generic panel (2S)LS with two-way clustered errors. X: regressors, Z: instruments (same length or longer).
function panelIV(rows, yk, xk, zk, fe) {
  const D = demeanRows(rows, fe, [yk, ...new Set([...xk, ...zk])]);
  const n = rows.length, X = Array.from({ length: n }, (_, i) => xk.map(k => D[k][i])), Z = Array.from({ length: n }, (_, i) => zk.map(k => D[k][i])), Y = D[yk];
  const ZZi = invert(matT(Z, Z)), ZX = matT(Z, X), Zy = Z[0].map((_, a) => Z.reduce((s, r, i) => s + r[a] * Y[i], 0));
  const XPZX = matT(ZX, ZZi.map(r => r)).map(r => r); // (ZX)'(Z'Z)^-1
  const A = XPZX.map(r => ZX[0].map((_, j) => r.reduce((s, v, k) => s + v * ZX[k][j], 0))); // X'Pz X
  const b0 = XPZX.map(r => r.reduce((s, v, k) => s + v * Zy[k], 0)); // X'Pz y
  const Ai = invert(A), beta = Ai.map(r => r.reduce((s, v, j) => s + v * b0[j], 0));
  const res = Y.map((y, i) => y - X[i].reduce((s, v, j) => s + v * beta[j], 0));
  // Xhat = Pz X
  const ZZiZX = ZZi.map(r => ZX[0].map((_, j) => r.reduce((s, v, k) => s + v * ZX[k][j], 0)));
  const Xh = Z.map(zr => ZZiZX[0].map((_, j) => zr.reduce((s, v, k) => s + v * ZZiZX[k][j], 0)));
  const meat = key => { const g = {}; rows.forEach((r, i) => { const s = (g[r[key]] ||= new Float64Array(xk.length)); for (let a = 0; a < xk.length; a++) s[a] += Xh[i][a] * res[i]; }); const M = xk.map(() => new Float64Array(xk.length)); for (const s of Object.values(g)) for (let a = 0; a < xk.length; a++) for (let b = 0; b < xk.length; b++) M[a][b] += s[a] * s[b]; return { M, G: Object.keys(g).length }; };
  const mc = meat('c'), my = meat('y'), mi = { M: xk.map(() => new Float64Array(xk.length)) };
  rows.forEach((r, i) => { for (let a = 0; a < xk.length; a++) for (let b = 0; b < xk.length; b++) mi.M[a][b] += Xh[i][a] * Xh[i][b] * res[i] * res[i]; });
  const sand = M => Ai.map((r, a) => r.map((_, b) => Ai[a].reduce((s, v, k) => s + v * M[k].reduce((t, m, l) => t + m * Ai[l][b], 0), 0)));
  const Vc = sand(mc.M), Vy = sand(my.M), Vi = sand(mi.M);
  const V = Vc.map((r, a) => r.map((v, b) => v + Vy[a][b] - Vi[a][b]));
  const se = xk.map((_, a) => Math.sqrt(Math.max(V[a][a], Vc[a][a], 1e-12)));
  // first-stage F for the gap (partial, on excluded instruments)
  let fs = null;
  if (zk.length > xk.length) {
    const xi = xk.indexOf('x'), zx = Z, xg = X.map(r => r[xi]);
    const zb = invert(matT(zx, zx)).map(r => r.reduce((s, v, k) => s + v * zx.reduce((t, row, i) => t + row[k] * xg[i], 0), 0));
    const fit = zx.map(row => row.reduce((s, v, k) => s + v * zb[k], 0));
    const ssr = xg.reduce((s, v, i) => s + (v - fit[i]) ** 2, 0), sst = xg.reduce((s, v) => s + v * v, 0);
    const exog = xk.filter(k => k !== 'x');
    const Zr = Array.from({ length: n }, (_, i) => exog.map(k => D[k][i]));
    let ssr0 = sst;
    if (exog.length) { const zb0 = invert(matT(Zr, Zr)).map(r => r.reduce((s, v, k) => s + v * Zr.reduce((t, row, i) => t + row[k] * xg[i], 0), 0)); const f0 = Zr.map(row => row.reduce((s, v, k) => s + v * zb0[k], 0)); ssr0 = xg.reduce((s, v, i) => s + (v - f0[i]) ** 2, 0); }
    const q = zk.length - exog.length;
    fs = ((ssr0 - ssr) / q) / (ssr / (n - zk.length));
  }
  const Vpsd = V.map((r, a) => r.map((v, b) => (a === b ? Math.max(v, Vc[a][a], 1e-12) : v)));
  return { beta: Object.fromEntries(xk.map((k, a) => [k, beta[a]])), se: Object.fromEntries(xk.map((k, a) => [k, se[a]])), cov: Vpsd, names: xk, n, countries: new Set(rows.map(r => r.c)).size, firstStageF: fs };
}

function summarise(est) {
  // covariance of (a, κ, γ_E): a = −β_gap flips the sign of its covariances
  const ix = ['gap', 'x', 'e'].map(k => est.names.indexOf(k)), sg = [-1, 1, 1];
  const cov = ix.map((i, a) => ix.map((j, b) => sg[a] * sg[b] * est.cov[i][j]));
  return { n: est.n, countries: est.countries, aAnnual: -est.beta.gap, aSe: est.se.gap, kappa: est.beta.x, kappaSe: est.se.x, gammaE: est.beta.e, gammaESe: est.se.e, cov, firstStageF: est.firstStageF };
}

export function estimatePhillipsRobust(data, opts = {}) {
  const rows = phillipsRows(data, opts);
  if (rows.length < 60) return null;
  const xk = ['gap', 'x', 'e'];
  const ols = summarise(panelIV(rows, 'dp', xk, xk, ['c']));
  const fe2 = summarise(panelIV(rows, 'dp', xk, xk, ['c', 'y']));
  const iv = summarise(panelIV(rows, 'dp', xk, ['gap', 'e', 'zx', 'zw'], ['c']));
  // half-panel jackknife on the aggregate-relevant OLS (Dhaene and Jochmans 2015)
  const ys = [...new Set(rows.map(r => r.y))].sort(), mid = ys[Math.floor(ys.length / 2)];
  const h1 = summarise(panelIV(rows.filter(r => r.y < mid), 'dp', xk, xk, ['c'])), h2 = summarise(panelIV(rows.filter(r => r.y >= mid), 'dp', xk, xk, ['c']));
  const jk = { aAnnual: 2 * ols.aAnnual - (h1.aAnnual + h2.aAnnual) / 2, kappa: 2 * ols.kappa - (h1.kappa + h2.kappa) / 2, gammaE: 2 * ols.gammaE - (h1.gammaE + h2.gammaE) / 2 };
  const eMean = rows.reduce((s, r) => s + r.e, 0) / rows.length;
  return { ols, fe2, iv, jk, eMean, rows: rows.length, y0: opts.y0 ?? 2001, y1: opts.y1 ?? 2025 };
}

// Real-time out-of-sample test (§5.2): for each year y from 2010, the curve is estimated on earlier years
// with the EU output gaps and the rest-of-world instrument computed from the IMF vintage published in year y (what was known then), and
// December inflation of year y is predicted with that vintage's estimate of the current gap.
// Energy inflation of year y is either known (conditional forecast) or assumed from flat energy
// prices (unconditional: energy at its sample mean). Benchmarks receive the same information.
// The Phillips curve as it could have been estimated in year y: output gaps from the IMF vintage of y and
// observations up to y − 1 only (§5.2, §7.2).
export function vintageFit(data, vintages, y) {
  const v = vintages?.[String(y)]?.data; if (!v) return null;
  const imfV = Object.fromEntries(Object.entries(v).map(([iso, d]) => [iso, { growth: d.growth?.map(([yy, x]) => [String(yy), x]), unemp: d.unemp?.map(([yy, x]) => [String(yy), x]) }]));
  const gapsV = outputGaps(imfV);
  const fit = estimatePhillipsRobust({ ...data, imf: { countries: { ...(data.imf?.countries || {}), ...imfV } } }, { y1: y - 1, gaps: gapsV, world: worldGapVintage(vintages, y) || undefined });
  return fit ? { fit, gapsV } : null;
}

export function phillipsRealTime(data, vintages, { estimator = 'iv', gammaFrom = null, from = 2010, to = 2025 } = {}) {
  const W = data.energyw?.series || {};
  const res = { cond: [], condBench: [], uncond: [], naive: [] };
  for (let y = from; y <= to; y++) {
    const vf = vintageFit(data, vintages, y); if (!vf) continue;
    const { fit, gapsV } = vf;
    const est = fit[estimator], gE = gammaFrom ? fit[gammaFrom].gammaE : est.gammaE;
    for (const c of EU) {
      const pc = decRate(data.hicpx?.core?.[c.eu]), pe = decRate(data.hicpx?.energy?.[c.eu]), ph = decRate(data.hicp?.series?.[c.eu]), gx = gapsV[c.iso3];
      if (pc[y] == null || pc[y - 1] == null || pe[y] == null || ph[y] == null || ph[y - 1] == null || !gx || gx[y] == null) continue;
      const w = ((W[c.eu] || []).find(r => +r[0] === y)?.[1] ?? 95) / 1000;
      const an = targetAt(c.eu, `${y - 1}-12`);
      // The model's own equation (§4.9): energy enters as its deviation from the sample mean ē.
      const core = e => pc[y - 1] - est.aAnnual * (pc[y - 1] - an) + est.kappa * gx[y] + gE * (e - fit.eMean);
      res.cond.push(w * pe[y] + (1 - w) * core(pe[y]) - ph[y]);
      res.condBench.push(w * pe[y] + (1 - w) * pc[y - 1] - ph[y]);
      // without information on this year's energy prices: energy inflation at its sample mean in both components
      res.uncond.push(w * fit.eMean + (1 - w) * core(fit.eMean) - ph[y]);
      res.naive.push(ph[y - 1] - ph[y]);
    }
  }
  const rmse = a => Math.sqrt(mean(a.map(x => x * x)));
  return { n: res.cond.length, cond: rmse(res.cond), condBench: rmse(res.condBench), uncond: rmse(res.uncond), naive: rmse(res.naive), errors: res };
}

// Output-gap (IS) equation estimated on euro-area members (§5.3):
//   x_it = ρ x_{i,t−1} − σ (i_{t−1} − π^C_{i,t−1}) + c_i + d_t + e_it.
// Members share the policy rate, so with year effects the common rate and common shocks drop out and
// σ is identified from differences in real rates caused by differences in inflation — variation the
// common monetary policy does not respond to. Converted to monthly continuous time in the engine.
export function estimateIS(data, { y0 = 2001, y1 = 2025 } = {}) {
  const imf = data.imf?.countries || data.weo?.countries;
  const gaps = outputGaps(imf, EU.filter(c => c.ea));
  const rows = [];
  for (const c of EU.filter(c => c.ea)) {
    const gx = gaps[c.iso3], pc = decRate(data.hicpx?.core?.[c.eu]);
    if (!gx) continue;
    for (let y = y0; y <= y1; y++) if (gx[y] != null && gx[y - 1] != null && pc[y - 1] != null) rows.push({ c: c.iso3, y, dp: gx[y], lx: gx[y - 1], rr: -pc[y - 1] });
  }
  const est = panelIV(rows, 'dp', ['lx', 'rr'], ['lx', 'rr'], ['c', 'y']);
  // x = ρx₋₁ − σ(i − π): with year effects the common rate drops out and the coefficient on −π is −σ.
  return { n: est.n, countries: est.countries, rho: est.beta.lx, rhoSe: est.se.lx, sigma: -est.beta.rr, sigmaSe: est.se.rr };
}

// Homogeneity of persistence across economies (§3.6): F test of economy-specific reversion speeds
// against one common speed in the December-rate panel of §5.1, with economy effects, the output gap and
// energy inflation in both models. Small-sample F; inference is approximate because the errors of
// different economies in the same year are correlated.
const mulberry = a => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function persistenceHomogeneity(data, opts = {}) {
  const rows = phillipsRows(data, opts);
  const ids = [...new Set(rows.map(r => r.c))];
  const dm = key => { const s = {}, n = {}; rows.forEach(r => { s[r.c] = (s[r.c] || 0) + r[key]; n[r.c] = (n[r.c] || 0) + 1; }); return rows.map(r => r[key] - s[r.c] / n[r.c]); };
  const y = dm('dp'), g = dm('gap'), x = dm('x'), e = dm('e');
  const ols = (X, yy) => { const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
    X.forEach((r, i) => { for (let a = 0; a < k; a++) { b[a] += r[a] * yy[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; } });
    const beta = invert(A).map(r => r.reduce((s, v, j) => s + v * b[j], 0));
    const fit = X.map(r => r.reduce((t, v, j) => t + v * beta[j], 0)), res = yy.map((v, i) => v - fit[i]);
    return { ssr: res.reduce((s2, v) => s2 + v * v, 0), k, fit, res }; };
  const XR = rows.map((_, i) => [g[i], x[i], e[i]]), XU = rows.map((r, i) => [...ids.map(c => (r.c === c ? g[i] : 0)), x[i], e[i]]);
  const n = rows.length, q = ids.length - 1;
  const Fstat = yy => { const R = ols(XR, yy), U = ols(XU, yy); return { F: ((R.ssr - U.ssr) / q) / (U.ssr / (n - ids.length - U.k)), R, U }; };
  const { F, R, U } = Fstat(y), df2 = n - ids.length - U.k;
  // Wild cluster bootstrap by year (Cameron, Gelbach and Miller 2008): restricted residuals flipped with
  // one Rademacher sign per year, so errors common to all economies in a year keep their correlation.
  const years = [...new Set(rows.map(r => r.y))], rnd = mulberry(opts.seed ?? 11), B = opts.boot ?? 999;
  let exceed = 0;
  for (let b = 0; b < B; b++) {
    const sgn = Object.fromEntries(years.map(t => [t, rnd() < 0.5 ? -1 : 1]));
    if (Fstat(rows.map((r, i) => R.fit[i] + R.res[i] * sgn[r.y])).F >= F) exceed++;
  }
  return { F, df1: q, df2, p: fTail(F, q, df2), pBoot: (exceed + 1) / (B + 1), boot: B, n, economies: ids.length };
}
// Upper tail of the F distribution via the regularised incomplete beta function.
function fTail(F, d1, d2) { return betaInc(d2 / (d2 + d1 * F), d2 / 2, d1 / 2); }
