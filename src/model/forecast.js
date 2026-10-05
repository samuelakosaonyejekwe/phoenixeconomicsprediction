// Early-warning layer (Phoenix Economics Solutions §6): projects each economy's inflation and
// excess stock and gives the probability that inflation crosses the trigger within the horizon.
import { hln } from './stats.js';
import { surplusOf, scritOf, SD_DEFAULT } from './inputs.js';

const erf = x => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
export const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const reversion = (v, anchor) => {
  let num = 0, den = 0;
  for (let i = 1; i < v.length; i++) { const x = v[i - 1] - anchor; num += (v[i] - v[i - 1]) * x; den += x * x; }
  return den > 1e-9 ? Math.min(0.25, Math.max(0, -num / den)) : 0.05;
};

// Damped momentum plus reversion towards the anchor (§6.1):
//   π̂_{t+k} = π̂_{t+k−1} + 0.7^k m_t − a (π̂_{t+k−1} − π^a),   m_t = (π_t − π_{t−3})/3.
export function projectPath(v, anchor, H, a) {
  if (a === undefined) a = reversion(v, anchor);
  const path = [];
  let x = v.at(-1), d = v.length >= 4 ? (v.at(-1) - v.at(-4)) / 3 : 0;
  for (let k = 1; k <= H; k++) { d *= 0.7; x += d - a * (x - anchor); path.push(x); }
  return path;
}

// One-step residuals of the projection on the economy's own history.
function residuals(v, anchor, a) {
  const e = [];
  for (let t = 12; t < v.length; t++) e.push(v[t] - projectPath(v.slice(0, t), anchor, 1, a)[0]);
  return e;
}

// Breach probability (§6.1): share of simulated paths that touch the trigger within H months.
// Paths follow the projection's own dynamics (damped momentum, reversion) with Gaussian shocks whose
// size is set so that the simulated H-month error matches the projection's historical H-month error
// on the economy's own data (shocks are persistent, so one-month errors would understate the risk).
export function horizonError(v, anchor, a, H = 12) {
  const e = [];
  for (let t = 24; t + H < v.length; t++) e.push(v[t + H] - projectPath(v.slice(0, t + 1), anchor, H, a)[H - 1]);
  return e.length >= 6 ? Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length) : null;
}
export function breachProbability(v, anchor, trigger, { H = 12, a, paths = 1000, seed = 1, errH } = {}) {
  if (v.at(-1) >= trigger) return 1;
  if (a === undefined) a = reversion(v, anchor);
  errH ??= horizonError(v, anchor, a, H) ?? 1.5;
  let g = 0; for (let j = 0; j < H; j++) g += (1 - a) ** (2 * j);
  const sigma = errH / Math.sqrt(g);
  const r = rng(seed);
  let hit = 0;
  for (let p = 0; p < paths; p++) {
    let x = v.at(-1), d = v.length >= 4 ? (x - v.at(-4)) / 3 : 0;
    for (let k = 1; k <= H; k++) {
      d *= 0.7;
      const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      x += d - a * (x - anchor) + sigma * z;
      if (x >= trigger) { hit++; break; }
    }
  }
  return hit / paths;
}

export function forecastCell(cell, P, H = 12) {
  const Y = cell.refYear;
  const imfNext = cell.fc.infl.find(r => +r[0] === Y + 1)?.[1];
  const imfCur = cell.fc.infl.find(r => +r[0] === Y)?.[1];
  const hist = cell.piFull || cell.piHist;
  const monthly = hist.length >= 8 && /^\d{4}-\d{2}$/.test(hist[0][0]);
  const anchor = cell.anchor ?? P.target;
  let path, sd, pBreach, band = null;
  if (cell.coreFull?.length >= 36 && cell.energy?.type === 'index') {
    // Energy–core projection (§6.1): known energy base effects plus a core projection.
    const core = cell.coreFull.map(r => r[1]);
    const idx = cell.energy.rows.map(r => r[1]);
    if (cell.energy.levelAdjPct) idx[idx.length - 1] *= 1 + cell.energy.levelAdjPct / 100;
    const a = reversion(core, anchor);
    path = projectSplit({ core, idx, w: cell.wE, anchor, H, a }).path;
    const res = residuals(core, anchor, a);
    sd = Math.sqrt(res.reduce((s, e) => s + e * e, 0) / Math.max(1, res.length));
    pBreach = cell.pi >= P.piTh ? 1 : breachSplit({ core, idx, w: cell.wE, anchor, trigger: P.piTh, H, a, paths: 600, seed: 7 });
    band = bandSplit({ core, idx, w: cell.wE, anchor, H, a });
  } else if (monthly) {
    const v = hist.map(r => r[1]);
    v[v.length - 1] = cell.pi;
    const a = reversion(v, anchor);
    path = projectPath(v, anchor, H, a);
    const res = residuals(v, anchor, a);
    sd = Math.sqrt(res.reduce((s, e) => s + e * e, 0) / Math.max(1, res.length));
    pBreach = breachProbability(v, anchor, P.piTh, { H, a, paths: 600, seed: 7 });
  } else {
    // Monthly volatility from the economy's IMF next-year forecast error (§6.1); the median economy's
    // error where none is measured.
    sd = (cell.fcRmse ?? 1.74) / Math.sqrt(12);
    const a = imfCur ?? cell.pi, b = imfNext ?? a;
    path = Array.from({ length: H }, (_, k) => cell.pi + (b - a) * (k + 1) / 12);
    pBreach = cell.pi >= P.piTh ? 1 : Math.min(1, 2 * (1 - normCdf((P.piTh - Math.max(...path)) / (sd * Math.sqrt(H)))));
  }
  const firstBreach = cell.pi >= P.piTh ? 0 : path.findIndex(f => f >= P.piTh) + 1 || null;

  // Excess stock one year ahead (§3.4, §4.2): each sector's stock spent down at its rate s_k, plus a year of
  // its inflow decaying with the sector's own decay time.
  const sd0 = { gov: P.sdGov ?? SD_DEFAULT.gov, corp: P.sdCorp ?? SD_DEFAULT.corp, hh: P.sdHh ?? SD_DEFAULT.hh };
  const projCell = { ...cell, sectors: { ...cell.sectors } };
  for (const k of Object.keys(projCell.sectors)) {
    const tau = typeof cell.inflowDecay === 'object' ? cell.inflowDecay?.[k] : cell.inflowDecay;
    projCell.sectors[k] = projCell.sectors[k] * Math.exp(-sd0[k]) + (cell.flows?.[k] || 0) * (tau > 0 ? (tau / 12) * (1 - Math.exp(-12 / tau)) : 1);
  }
  const Scrit = scritOf(cell, P);
  const S = surplusOf(cell, P), Sp = surplusOf(projCell, P);
  const rho = S / Scrit, rhoP = Sp / Scrit;
  let status = 'clear';
  if ((pBreach >= 0.5 || cell.pi >= P.piTh) && Math.max(rho, rhoP) >= 1) status = 'act';
  else if (pBreach >= 0.25 || Math.max(rho, rhoP) >= 1) status = 'watch';
  return { path, sd, band, pBreach, firstBreach, imfCur, imfNext, S, Sp, Scrit, rho, rhoP, status };
}

// Diebold–Mariano test of equal squared-error loss with a Newey–West variance (h − 1 lags) and the
// Harvey–Leybourne–Newbold small-sample correction,
// computed per series and pooled; returns the statistic and a two-sided normal p-value.
export function dieboldMariano(dSeries, h) {
  let num = 0, varSum = 0, n = 0;
  for (const d of dSeries) {
    const T = d.length; if (T < 2 * h + 5) continue;
    const m = d.reduce((s, x) => s + x, 0) / T;
    let v = d.reduce((s, x) => s + (x - m) ** 2, 0) / T;
    for (let l = 1; l < h; l++) {
      let c = 0; for (let t = l; t < T; t++) c += (d[t] - m) * (d[t - l] - m);
      v += 2 * (1 - l / h) * c / T;
    }
    num += m * T; varSum += Math.max(1e-12, v) * T; n += T;
  }
  // Harvey–Leybourne–Newbold small-sample correction, Student-t(T − 1) p-value (§6.2).
  return { ...hln(num / Math.sqrt(varSum), n, h), n };
}


// ---------------------------------------------------------------------------
// Energy–core early warning (§6). Headline inflation is projected as
//   π̂_{t+k} = w_E ê_{t+k} + (1 − w_E) ĉ_{t+k},
// where ê follows from the HICP energy index held at today's level (a random walk) — so the base
// effects of the coming twelve months are known exactly — and ĉ is the damped-momentum and reversion
// projection of core inflation. The breach probability simulates both: core shocks sized to the core
// projection's twelve-month error, and Student-t energy-price shocks with the larger of the long-run
// and the exponentially weighted volatility of the energy index (§6.1).
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

function energyStats(idx, lambda = 0.94, drift = false) {
  // Monthly log changes of the energy index up to the forecast origin. The forecast is a random walk
  // (no drift; Alquist, Kilian and Vigfusson 2013) unless `drift` is set. Volatility: the larger of
  // the long-run standard deviation and an exponentially weighted estimate (λ = 0.94). Tails: Student-t
  // with degrees of freedom matched to the sample excess kurtosis (ν = 4 + 6/κ, bounded to [3, 30]).
  const d = [];
  for (let i = 1; i < idx.length; i++) if (idx[i] > 0 && idx[i - 1] > 0) d.push(Math.log(idx[i] / idx[i - 1]));
  const m = d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0;
  const v2 = d.length > 2 ? d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1) : 0.0004;
  const sdLong = Math.sqrt(v2);
  let v = v2;
  for (const x of d) v = lambda * v + (1 - lambda) * (x - m) ** 2;
  const k4 = d.length > 10 ? d.reduce((s, x) => s + (x - m) ** 4, 0) / d.length / (v2 * v2) - 3 : 0;
  const df = k4 > 0.2 ? Math.min(30, Math.max(3, 4 + 6 / k4)) : 30;
  return { drift: drift ? m : 0, sd: Math.max(sdLong, Math.sqrt(v)), sdLong, sdEwma: Math.sqrt(v), df };
}
// Student-t draw with unit variance.
function tdraw(r, df) {
  if (df >= 30) return gauss(r);
  let c = 0; for (let i = 0; i < Math.round(df); i++) { const z = gauss(r); c += z * z; }
  const nu = Math.round(df);
  return gauss(r) / Math.sqrt(c / nu) * Math.sqrt((nu - 2) / nu); // unit variance for the integer ν drawn
}

export function projectSplit({ core, idx, w, anchor, H = 12, a, drift = false }) {
  const cp = projectPath(core, anchor, H, a);
  const st = energyStats(idx, 0.94, drift), n = idx.length, I0 = idx[n - 1];
  const path = [];
  for (let k = 1; k <= H; k++) {
    const base = idx[n - 1 + k - 12];
    const e = base ? (I0 * Math.exp(st.drift * k) / base - 1) * 100 : 0;
    path.push(w * e + (1 - w) * cp[k - 1]);
  }
  return { path, core: cp, st };
}

export function breachSplit({ core, idx, w, anchor, trigger, H = 12, a, paths = 600, seed = 1, errH, tails = true, ewma = true, drift = false }) {
  if (a === undefined) a = reversion(core, anchor);
  errH ??= horizonError(core, anchor, a, H) ?? 1;
  let g = 0; for (let j = 0; j < H; j++) g += (1 - a) ** (2 * j);
  const sigC = errH / Math.sqrt(g);
  const st = energyStats(idx, 0.94, drift), n = idx.length, I0 = idx[n - 1];
  const sdE = ewma ? st.sd : st.sdLong, dfE = tails ? st.df : 30;
  const r = rng(seed);
  let hit = 0;
  for (let p = 0; p < paths; p++) {
    let x = core.at(-1), d = core.length >= 4 ? (x - core.at(-4)) / 3 : 0, le = 0;
    for (let k = 1; k <= H; k++) {
      d *= 0.7;
      x += d - a * (x - anchor) + sigC * gauss(r);
      le += st.drift + sdE * tdraw(r, dfE);
      const base = idx[n - 1 + k - 12];
      const e = base ? (I0 * Math.exp(le) / base - 1) * 100 : 0;
      if (w * e + (1 - w) * x >= trigger) { hit++; break; }
    }
  }
  return hit / paths;
}

// 10th–90th percentile band of headline inflation from the same simulated paths as the breach
// probability (§6.1), each path followed for the whole horizon.
export function bandSplit({ core, idx, w, anchor, H = 12, a, paths = 400, seed = 3, tails = true, ewma = true }) {
  if (a === undefined) a = reversion(core, anchor);
  const errH = horizonError(core, anchor, a, H) ?? 1;
  let g = 0; for (let j = 0; j < H; j++) g += (1 - a) ** (2 * j);
  const sigC = errH / Math.sqrt(g);
  const st = energyStats(idx, 0.94, false), n = idx.length, I0 = idx[n - 1];
  const sdE = ewma ? st.sd : st.sdLong, dfE = tails ? st.df : 30;
  const r = rng(seed), cols = Array.from({ length: H }, () => []);
  for (let p = 0; p < paths; p++) {
    let x = core.at(-1), d = core.length >= 4 ? (x - core.at(-4)) / 3 : 0, le = 0;
    for (let k = 1; k <= H; k++) {
      d *= 0.7; x += d - a * (x - anchor) + sigC * gauss(r); le += sdE * tdraw(r, dfE);
      const base = idx[n - 1 + k - 12];
      cols[k - 1].push(w * (base ? (I0 * Math.exp(le) / base - 1) * 100 : 0) + (1 - w) * x);
    }
  }
  return cols.map(c => { c.sort((u, v) => u - v); return [c[Math.floor(0.1 * (c.length - 1))], c[Math.floor(0.9 * (c.length - 1))]]; });
}

// Backtest of the energy–core projection and breach probability (§6.3). obs: per economy
// { months, head:Map, core:Map, coreMonths, idx:Map, idxMonths, wByYear:{y:w}, anchor } — anchor a number or a
// function of the origin month (the target then in force).
export function backtestSplit(obs, { piTh = 3, from = '2001-01', to = '9999', paths = 400, variant = {} } = {}) {
  const d6 = new Map(), d12 = new Map(), raws = [];
  const acc = { e6: 0, b6: 0, n6: 0, e12: 0, b12: 0, n12: 0 };
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  obs.forEach((o, si) => {
    const ms = o.months;
    // Real-time benchmark (§6.2): the share of this economy's past twelve-month windows, fully observed by
    // the origin, in which inflation touched the trigger.
    const hv = ms.map(m => o.head.get(m)), winBreach = ms.map((_, s) => (s + 12 < ms.length && hv.slice(s + 1, s + 13).some(x => x >= piTh) ? 1 : 0));
    const cum = [0]; winBreach.forEach(b => cum.push(cum.at(-1) + b));
    for (let t = 0; t < ms.length - 1; t++) {
      if (ms[t] < from || ms[t] > to) continue;
      const coreHist = o.coreMonths.filter(m => m <= ms[t]).map(m => o.core.get(m));
      // An energy index that ends before the origin month is held at its last level (random walk, §4.9).
      const idxHist = o.idxMonths.filter(m => m <= ms[t]).map(m => o.idx.get(m));
      const lastIdx = o.idxMonths.filter(m => m <= ms[t]).at(-1);
      if (lastIdx && lastIdx < ms[t]) { const gapM = (+ms[t].slice(0, 4) - +lastIdx.slice(0, 4)) * 12 + (+ms[t].slice(5, 7) - +lastIdx.slice(5, 7)); for (let g = 0; g < gapM; g++) idxHist.push(idxHist.at(-1)); }
      if (coreHist.length < 36 || idxHist.length < 24) continue;
      const w = o.wByYear[+ms[t].slice(0, 4)] ?? o.wLatest;
      const anchor = typeof o.anchor === 'function' ? o.anchor(ms[t]) : o.anchor;
      const a = reversion(coreHist, anchor);
      const pj = projectSplit({ core: coreHist, idx: idxHist, w, anchor, H: 12, a, drift: variant.drift });
      const h0 = o.head.get(ms[t]);
      const fut = k => o.head.get(ms[t + k]);
      if (fut(6) != null) { const e = (pj.path[5] - fut(6)) ** 2, b = (h0 - fut(6)) ** 2; acc.e6 += e; acc.b6 += b; acc.n6++; push(d6, ms[t], e - b); }
      if (fut(12) != null) {
        const e = (pj.path[11] - fut(12)) ** 2, b = (h0 - fut(12)) ** 2; acc.e12 += e; acc.b12 += b; acc.n12++; push(d12, ms[t], e - b);
        if (h0 < piTh) {
          const p = breachSplit({ core: coreHist, idx: idxHist, w, anchor, trigger: piTh, a, paths, seed: t * 31 + si, tails: variant.tails ?? true, ewma: variant.ewma ?? true, drift: variant.drift });
          const hit = [...Array(12).keys()].some(k => (fut(k + 1) ?? -Infinity) >= piTh) ? 1 : 0;
          const nWin = t - 11; // windows s = 0 … t − 12 end by the origin
          raws.push({ m: ms[t], p, hit, clim: nWin > 0 ? cum[nWin] / nWin : null });
        }
      }
    }
  });
  return { acc, d6, d12, raws };
}

// Diebold–Mariano on the cross-sectional mean loss differential per forecast month (robust to the
// correlation of errors across economies), Newey–West variance with h − 1 lags.
export function dmCross(dByMonth, h) {
  const series = [...dByMonth.keys()].sort().map(k => { const a = dByMonth.get(k); return a.reduce((s, x) => s + x, 0) / a.length; });
  return dieboldMariano([series], h);
}

// Full evaluation of the energy–core early warning on the EU-27 (§6.3).
export function evaluateEarlyWarning(data, EUlist, targets, { piTh = 3, from = '2001-01', to = '9999', variant = {}, paths = 400 } = {}) {
  const obs = EUlist.filter(c => data.hicp?.series?.[c.eu] && data.hicpx?.core?.[c.eu] && data.hicpx?.energyIndex?.[c.eu]).map(c => {
    const wr = data.energyw?.series?.[c.eu] || [];
    return {
      months: data.hicp.series[c.eu].map(r => r[0]), head: new Map(data.hicp.series[c.eu]),
      core: new Map(data.hicpx.core[c.eu]), coreMonths: data.hicpx.core[c.eu].map(r => r[0]),
      idx: new Map(data.hicpx.energyIndex[c.eu]), idxMonths: data.hicpx.energyIndex[c.eu].map(r => r[0]),
      wByYear: Object.fromEntries(wr.map(([y, v]) => [+y, v / 1000])), wLatest: (wr.at(-1)?.[1] ?? 95) / 1000, anchor: typeof targets === 'function' ? m => targets(c.eu, m) : targets[c.eu] ?? 2,
    };
  });
  const r = backtestSplit(obs, { piTh, from, to, variant, paths });
  const A = r.acc;
  // Origins without twelve months of earlier history have no real-time benchmark and are not scored.
  r.raws = r.raws.filter(x => x.clim != null);
  const brier = (arr, k = 'p') => arr.reduce((s, x) => s + (x[k] - x.hit) ** 2, 0) / arr.length;
  const rel = arr => { const bins = Array.from({ length: 5 }, (_, i) => ({ bin: `${i * 20}–${(i + 1) * 20}%`, p: 0, o: 0, n: 0 })); for (const x of arr) { const b = bins[Math.min(4, Math.floor(x.p * 5))]; b.p += x.p; b.o += x.hit; b.n++; } return bins.map(b => ({ bin: b.bin, n: b.n, meanP: b.n ? b.p / b.n : null, freq: b.n ? b.o / b.n : null })); };
  const byYear = {};
  for (const x of r.raws) (byYear[x.m.slice(0, 4)] ||= []).push(x);
  return {
    series: obs.length, n: r.raws.length, from, to,
    rmse6: Math.sqrt(A.e6 / A.n6), naive6: Math.sqrt(A.b6 / A.n6), dm6: dmCross(r.d6, 6),
    rmse12: Math.sqrt(A.e12 / A.n12), naive12: Math.sqrt(A.b12 / A.n12), dm12: dmCross(r.d12, 12),
    brier: brier(r.raws), brierClimRT: brier(r.raws, 'clim'),
    hitRate: r.raws.filter(x => x.hit).length ? r.raws.filter(x => x.hit && x.p >= 0.5).length / r.raws.filter(x => x.hit).length : null,
    falseAlarm: r.raws.filter(x => x.p >= 0.5).length ? r.raws.filter(x => x.p >= 0.5 && !x.hit).length / r.raws.filter(x => x.p >= 0.5).length : null,
    reliability: rel(r.raws),
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, a]) => [y, { n: a.length, meanP: a.reduce((s, x) => s + x.p, 0) / a.length, freq: a.reduce((s, x) => s + x.hit, 0) / a.length, brier: brier(a), brierClimRT: brier(a, 'clim') }])),
  };
}
