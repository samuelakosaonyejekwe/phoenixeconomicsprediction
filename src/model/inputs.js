// Turns the merged official datasets into model cells, one per economy (Phoenix Economics
// Solutions §3). Every stock is in € billion and nominal.
//
//   excess deposits  S_k = (Σ_{q ≥ 2020Q1} (F2_{k,q} − φ̄_k Y_q))⁺, φ̄_k the 2016–2019 deposit pace as a
//                    share of GDP (§3.2); idle part from F21 + F22; excess saving, profits and fiscal
//                    balances are indicators only
//   threshold        S_crit = c_S(L)/100 · Y, c_S the 90th percentile of pre-2020 windows of length L (§3.3)
//   inflow           I_k(t) = ē_k · e^{−t/τ_k}, ē_k the mean excess flow of the last four quarters (§3.4)
//
// The reference year is that of the latest published inflation (or of the past date asked for), never the
// clock, so the same archived data always give the same results.
//
// Current-account surpluses and central-bank reserves are indicators only (§3.8).
import { EU, GLOBAL } from '../data/geo.js';
import { marketDrivers, nowcastCell } from './nowcast.js';
import { hpFilter, estimateOkunGap, estimateNowcast, estimatePhillipsRobust, outputGaps, worldGapVintage, energyOilElasticity, oilPath } from './estimation.js';

export const SECTORS = [
  { k: 'gov', lam: 'lamGov', sd: 'sdGov', label: 'Government', note: 'General-government currency and deposits (F2) acquired since 2020 above the 2016–2019 pace as a share of GDP; idle part F21+F22. Eurostat nasq_10_f_tr. Global panel: IMF fiscal balance.' },
  { k: 'corp', lam: 'lamCorp', sd: 'sdCorp', label: 'Corporate', note: 'Non-financial corporations’ currency and deposits (F2) acquired since 2020 above the 2016–2019 pace as a share of GDP; idle part F21+F22. Eurostat nasq_10_f_tr. Not measured in the global panel.' },
  { k: 'hh', lam: 'lamHh', sd: 'sdHh', label: 'Household', note: 'Households’ currency and deposits (F2) acquired since 2020 above the 2016–2019 pace as a share of GDP; idle part F21+F22. Eurostat nasq_10_f_tr. Global panel: World Bank gross savings × the EU ratio of excess deposits to excess saving.' },
];

import { TARGETS, targetAt } from './targets.js';
import { IMF_INFL_RMSE } from './imf-errors.js';
export { TARGETS, targetAt };

const last = s => (s && s.length ? s[s.length - 1] : null);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const clip = (x, a, b) => Math.min(b, Math.max(a, x));
const slope = rows => {
  if (!rows || rows.length < 3) return 0;
  const n = rows.length, xs = rows.map((_, i) => i), ys = rows.map(r => r[1]);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
};
// The energy index can end a month before headline inflation; it is then held at its last level up to
// the inflation month (the random-walk assumption of §4.9), so energy and core start from the same month.
const nextMonth = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 7);
// A policy rate is used only if it is at most six months older than the latest inflation release;
// otherwise the economy's rate follows the Taylor rule (§4.10).
const recentRate = (rows, data) => {
  const r = last(rows || []), ref = last(data?.hicp?.series?.EU27_2020 || [])?.[0];
  if (!r || !ref) return r?.[1];
  const m = s => +String(s).slice(0, 4) * 12 + +String(s).slice(5, 7);
  return m(ref) - m(r[0]) <= 6 ? r[1] : undefined;
};
export function padIndex(rows, toMonth) {
  if (!rows?.length || !toMonth || !/^\d{4}-\d{2}$/.test(toMonth)) return rows;
  const out = rows.slice();
  while (String(out.at(-1)[0]) < toMonth) out.push([nextMonth(String(out.at(-1)[0])), out.at(-1)[1]]);
  return out;
}
// Reference year of a data set: the year of its latest EU-27 inflation release.
export const refYearOf = data => { const r = data?.hicp?.series?.EU27_2020 || data?.hicp?.series?.EU; return r?.length ? +String(r.at(-1)[0]).slice(0, 4) : 2026; };
const atYear = (rows, y) => rows?.find(r => +r[0] === y)?.[1] ?? null;
const qIndex = q => { const [y, n] = q.split('-Q'); return +y * 4 + (+n - 1); };
const cut = (rows, asOf) => (asOf && rows ? rows.filter(r => String(r[0]).slice(0, 7) <= asOf) : rows);
const qOf = m => `${m.slice(0, 4)}-Q${Math.ceil(+m.slice(5, 7) / 3)}`;
// Quarterly accounts are published about 100 days after the quarter ends, so at the end of month m the
// latest published quarter is the last one ending at least four months earlier (real-time cut, §7.2).
export const qPub = m => { const mi = +m.slice(0, 4) * 12 + +m.slice(5, 7); const qi = Math.floor((mi - 4) / 3) - 1; return `${Math.floor(qi / 4)}-Q${(qi % 4) + 1}`; };
const cutQ = (rows, asOf) => (asOf && rows ? rows.filter(r => String(r[0]) <= qPub(asOf)) : rows);

// ---------------------------------------------------------------------------
// Monthly persistence of core inflation per economy, Δπ_t = −a_R(π_{t−1} − π^a) + e_t, with the
// small-sample bias removed (ρ̂ + (1 + 3ρ̂)/n). Diagnostic only: the model gives every economy the
// panel speed of §5.1, because equal speeds are not rejected (§3.6).
export function persistenceRaw(rows, anchor) {
  if (!rows || rows.length < 36) return null;
  const v = rows.map(r => r[1]);
  let num = 0, den = 0;
  for (let t = 1; t < v.length; t++) { const x = v[t - 1] - anchor; num += (v[t] - v[t - 1]) * x; den += x * x; }
  if (den < 1e-9) return null;
  const n = v.length - 1, rho = 1 + num / den;
  const rhoC = Math.min(0.999, rho + (1 + 3 * rho) / n);
  // Overlapping 12-month rates: effective sample is about n/12 independent observations.
  return { a: 1 - rhoC, varA: Math.max(1e-6, 12 * (1 - rhoC * rhoC) / n), n };
}
export function pooledPersistence(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return { a: 0.03, tau2: 0 };
  const a = Math.max(0.003, mean(ok.map(x => x.a)));
  const tau2 = Math.max(0, mean(ok.map(x => (x.a - a) ** 2)) - mean(ok.map(x => x.varA)));
  return { a, tau2, n: ok.length };
}
// Pooled trend half-life from the AR(1) of non-overlapping quarterly changes in inflation.
export function pooledHalfLife(seriesList) {
  let num = 0, den = 0;
  for (const rows of seriesList) {
    const v = rows.filter((_, i) => i % 3 === 0).map(r => r[1]);
    const d = v.slice(1).map((x, i) => x - v[i]);
    for (let t = 1; t < d.length; t++) { num += d[t] * d[t - 1]; den += d[t - 1] * d[t - 1]; }
  }
  const phiQ = den > 0 ? clip(num / den, 0.01, 0.95) : 0.5;
  return { half: clip(3 * Math.log(0.5) / Math.log(phiQ), 1, 36), phiQ };
}

// ---------------------------------------------------------------------------
// Excess flows and stocks (§3.2–3.4).
export const BASELINES = { b1619: [2016, 2019], b1219: [2012, 2019], trend: [2012, 2019] };

function baselineFn(rates, mode) {
  const [y0, y1] = BASELINES[mode] || BASELINES.b1619;
  const rows = rates.filter(r => { const y = +String(r[0]).slice(0, 4); return y >= y0 && y <= y1; });
  if (rows.length < 4) return null;
  if (mode !== 'trend') { const m = mean(rows.map(r => r[1])); return () => m; }
  const xs = rows.map(r => qIndex(r[0])), ys = rows.map(r => r[1]);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const b = den ? num / den : 0;
  return q => my + b * (qIndex(q) - mx);
}

// Annual series spread over quarters (used where quarterly accounts are not published).
const annualToQ = rows => (rows || []).flatMap(([y, v]) => [1, 2, 3, 4].map(n => [`${y}-Q${n}`, v]));
const annualLevelToQ = rows => (rows || []).flatMap(([y, v]) => [1, 2, 3, 4].map(n => [`${y}-Q${n}`, v / 4]));

function excessFlows(rates, levels, mode, fallbackQ) {
  if (!rates || rates.length < 8) return null;
  const base = baselineFn(rates, mode);
  if (!base) return null;
  const lv = new Map((levels || []).map(r => [r[0], r[1] / 1000]));
  return rates.map(([q, r]) => [q, (r - base(q)) / 100 * (lv.get(q) ?? fallbackQ)]);
}

// Stock accumulated since `start` (§3.2). No depreciation is applied: when holders spend down
// their excess, saving falls below its baseline and the negative excess flows reduce the stock.
function accumulate(flows, start) {
  if (!flows) return { stock: 0, recent: 0 };
  const rows = flows.filter(r => r[0] >= start);
  if (!rows.length) return { stock: 0, recent: 0 };
  const stock = rows.reduce((s, r) => s + r[1], 0);
  return { stock: Math.max(0, stock), recent: Math.max(0, mean(rows.slice(-4).map(r => r[1]))) };
}

// Excess deposits (§3.2): deposit transactions since the start in excess of the 2016–2019 pace, the
// pace being held as a share of nominal GDP so that growth in prices and incomes is not counted as excess.
// gdpAt(year) gives annual nominal GDP in € billion; without it the pace is a fixed amount in euro.
export function excessDeposits(rows, asOf, start = '2020-Q1', gdpAt = null) {
  if (!rows?.length) return null;
  const r = cutQ(rows, asOf);
  const gq = q => (gdpAt ? gdpAt(+q.slice(0, 4)) / 4 : 1);
  const base = r?.filter(x => x[0] >= '2016-Q1' && x[0] <= '2019-Q4');
  if (!base || base.length < 12 || base.some(x => !(gq(x[0]) > 0))) return null;
  const share = base.reduce((s, x) => s + x[1] / 1000, 0) / base.reduce((s, x) => s + gq(x[0]), 0);
  const since = r.filter(x => x[0] >= start);
  if (!since.length || since.some(x => !(gq(x[0]) > 0))) return null;
  const ex = since.map(x => x[1] / 1000 - share * gq(x[0]));
  const last4 = ex.slice(-4);
  return { stock: ex.reduce((s, x) => s + x, 0), inflowYear: mean(last4) * 4, base: share * gq(since.at(-1)[0]), quarter: r.at(-1)[0], n: since.length };
}
const sumSeries = list => {
  const m = new Map();
  for (const rows of list) for (const [q, x] of rows || []) m.set(q, (m.get(q) || 0) + x);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
};

// Critical stock from history (§3.3), measured exactly like the stock: for every EU economy and every
// window of the same length L as the current accumulation that ends by 2019 Q4, the deposits of
// households, firms and government acquired in the window in excess of their mean pace over the four
// years before it, in % of GDP. S_crit is the 90th percentile of these pre-2020 accumulations.
export function criticalFromHistory(data, L = 26, asOf = null) {
  const vals = [];
  for (const c of EU) {
    const G = new Map((data.gdp?.series?.[c.eu] || []).map(([y, v]) => [+y, v / 1000]));
    const by = new Map();
    for (const sec of ['hh', 'nfc', 'gov']) for (const [q, v] of data.finacc?.[sec]?.F2?.[c.eu] || []) by.set(q, (by.get(q) || 0) + v / 1000);
    const qs = [...by.keys()].sort();
    for (let st = 16; st + L - 1 < qs.length; st++) {
      const end = qs[st + L - 1]; if (end > '2019-Q4') break;
      const gq = q => G.get(+q.slice(0, 4)) / 4, pre = qs.slice(st - 16, st), win = qs.slice(st, st + L);
      if ([...pre, ...win].some(q => !(gq(q) > 0))) continue;
      const share = pre.reduce((s, q) => s + by.get(q), 0) / pre.reduce((s, q) => s + gq(q), 0);
      const acc = win.reduce((s, q) => s + by.get(q) - share * gq(q), 0);
      const y = G.get(+end.slice(0, 4)); if (y) vals.push(Math.max(0, acc) / y * 100);
    }
  }
  if (vals.length < 30) return null;
  vals.sort((a, b) => a - b);
  const q = p => vals[Math.floor(p * (vals.length - 1))];
  return { p90: q(0.9), p75: q(0.75), p50: q(0.5), n: vals.length, L };
}
// The threshold for an episode that lasts k more quarters (§3.3, §4.2): S_crit is re-read from history
// for length L + k as the episode ages, held at the last value when history has too few windows.
export function criticalPath(data, L, K = 24) {
  const p90 = [], p75 = [];
  for (let k = 0; k <= K; k++) { const c = criticalFromHistory(data, L + k); p90.push(c?.p90 ?? p90.at(-1) ?? null); p75.push(c?.p75 ?? p75.at(-1) ?? null); }
  return { p90, p75 };
}

// Persistence of new excess (§3.4): pooled AR(1) of annual excess deposit flows (annual sums remove
// the seasonality of the quarterly accounts), deviations from each economy's mean; decay in months.
export function depositDecay(data, sec, asOf) {
  let num = 0, den = 0;
  for (const c of EU) {
    const r = cutQ(data.finacc?.[sec]?.F2?.[c.eu], asOf); if (!r) continue;
    const by = {};
    for (const [q, v] of r) (by[+q.slice(0, 4)] ||= []).push(v);
    const G = new Map((data.gdp?.series?.[c.eu] || []).map(([y, v]) => [+y, v]));
    const ys = Object.keys(by).map(Number).filter(y => by[y].length === 4 && G.get(y) > 0).sort();
    const a = ys.map(y => by[y].reduce((s, x) => s + x, 0) / G.get(y) * 100);
    const m = mean(a), d = a.map(x => x - m);
    for (let t = 1; t < d.length; t++) { num += d[t] * d[t - 1]; den += d[t - 1] * d[t - 1]; }
  }
  const rho = den > 0 ? clip(num / den, 0.05, 0.95) : 0.5;
  return { months: -12 / Math.log(rho), rhoA: rho };
}

// ---------------------------------------------------------------------------
// Slack (§3.5): natural rate by HP filter (λ = 100) on annual unemployment including the IMF
// projections to t+5; output gap from the HP trend of real GDP.
function slack(imf, uNow, okunOf, iso, Y, gaps, uMonthly = null, okunPooled = 2.9) {
  const u = (imf.unemp || []).filter(r => +r[0] >= 1999 && +r[0] <= Y + 5);
  let uBar = null;
  if (u.length >= 8) {
    const trend = hpFilter(u.map(r => r[1]), 100);
    const i = u.findIndex(r => +r[0] === Y);
    uBar = trend[i >= 0 ? i : trend.length - 1];
  }
  // Current unemployment is Eurostat's monthly rate where there is one, while the trend is fitted to the
  // IMF's annual series. Where the two publishers measure unemployment differently (Denmark's national
  // registered rate is about 3.5 points below the survey rate) the natural rate is moved by the difference
  // between their rates of the previous year, so that the gap compares like with like.
  const uY1ref = atYear(imf.unemp, Y - 1);
  if (uBar !== null && uMonthly && uY1ref != null) uBar += uMonthly.prevYearMean - uY1ref;
  const ugap = uBar === null || uNow == null ? 0 : uNow - uBar;
  // Output gap from GDP (§3.5), updated with the latest monthly unemployment: the gap moves with the
  // difference between current unemployment and the IMF's annual figure, scaled by the pooled Okun
  // coefficient. Okun's law alone only where GDP is not available.
  const g = gaps?.[iso]?.[Y];
  // Surprise in unemployment: the change in the latest monthly (Eurostat) rate since last year's
  // average, minus the change the IMF projected for this year; both changes are within one source.
  const uY = atYear(imf.unemp, Y), uY1 = atYear(imf.unemp, Y - 1);
  const surprise = uMonthly && uY != null && uY1 != null ? (uMonthly.now - uMonthly.prevYearMean) - (uY - uY1) : null;
  const upd = g != null && surprise != null ? -okunPooled * surprise : 0;
  return { uBar, ugap, okun: okunOf(iso), x0: g != null ? g + upd : -okunPooled * ugap, gapUpdate: upd, gapSrc: g == null ? 'Okun' : 'GDP + monthly unemployment' };
}

function anchorFor(c, data, imf, asOf, Y = asOf ? +asOf.slice(0, 4) : refYearOf(data)) {
  const spf = asOf ? (data.expect?.spf || []).filter(r => r[0] <= qOf(asOf)) : data.expect?.spf;
  if ((c.ea || c.eu === 'DK') && spf?.length) return { anchor: last(spf)[1], anchorSrc: c.ea ? 'ECB SPF long-term expectations' : 'ECB SPF (euro peg)' };
  if (c.eu && TARGETS[c.eu]) return { anchor: TARGETS[c.eu], anchorSrc: 'official inflation target' };
  const y5 = atYear(imf.infl, Y + 5);
  return { anchor: y5 ?? 2, anchorSrc: y5 == null ? 'default 2%' : 'IMF medium-term projection' };
}

export function buildCells(data, region, { nowcast = true, P = {}, asOf = null } = {}) {
  const ctx = context(data, P, asOf);
  // The global panel scales by the EU-27 ratio whatever region was built before it.
  if (region === 'global' && !ctx.psiFromEU) buildEurope(data, 'eu', ctx);
  const cells = region === 'global' ? buildGlobal(data, ctx) : buildEurope(data, region, ctx);
  const drivers = asOf ? null : marketDrivers(data);
  for (const c of cells) {
    c.piOfficial = c.pi;
    if (!drivers) continue;
    const nc = nowcastCell(c, drivers, last(data.energyw?.series?.[c.euCode || c.id])?.[1], ctx.nowcast);
    c.nowcast = nc;
    if (nowcast && nc) {
      c.pi = +nc.pi.toFixed(2);
      // The nowcast moves today's energy price level; held in the energy path (§3.7, §4.9).
      // The oil part moves today's energy price level; the exchange-rate part is left in core inflation.
      if (c.energy && c.wE > 0) c.energy = { ...c.energy, levelAdjPct: nc.oilEff / c.wE };
    }
  }
  return cells;
}

// Shared estimates computed once per data vintage.
const ctxCache = new Map();
export function context(data, P = {}, asOf = null) {
  // The key includes the latest period of every source the estimates use, so new releases re-estimate.
  const latest = rows => (rows?.length ? String(rows.at(-1)[0]) : '');
  const key = JSON.stringify([asOf, data.weoVintages ? 1 : 0, P.baseline || 'b1619', P.accStart || '2020-Q1', data.hicp ? Object.keys(data.hicp.series).length : 0, latest(data.hicp?.series?.EU27_2020), latest(data.hicpx?.core?.EU27_2020), latest(data.hicpx?.energyIndex?.EU27_2020), latest(data.finacc?.hh?.F2?.DE), latest(data.unemp?.series?.DE), latest(data.gdp?.series?.DE), data.imf?.vintage || (data.imf ? 1 : 0), data.oilm ? latest(data.oilm.series || data.oilm) : 0]);
  if (ctxCache.has(key)) return ctxCache.get(key);
  let imfC = data.imf?.countries || data.weo?.countries || {};
  // For a past date, growth, unemployment and inflation come from the IMF vintage published then (§5.2, §7.2).
  const vin = asOf ? data.weoVintages?.[asOf.slice(0, 4)]?.data : null;
  if (vin) {
    imfC = { ...imfC };
    for (const [iso, v] of Object.entries(vin)) imfC[iso] = { ...(imfC[iso] || {}), growth: v.growth?.map(([y, x]) => [String(y), x]), unemp: v.unemp?.map(([y, x]) => [String(y), x]), infl: v.infl?.map(([y, x]) => [String(y), x]) };
  }
  const gaps = outputGaps(imfC, [...EU, ...GLOBAL.filter(g => !EU.some(e => e.iso3 === g.iso3))]);
  const refYear = asOf ? +asOf.slice(0, 4) : refYearOf(data);
  // Okun's law on observed years only: projection years of the vintage in use are not observations.
  const okun = estimateOkunGap(imfC, gaps, EU, 2000, refYear - 1);
  // Core Phillips curve and reversion from one estimation (§5.1), on the output gaps of the IMF vintage in
  // use. Every economy reverts at the panel speed (§3.6); the monthly per-economy estimates are kept only
  // for the homogeneity diagnostics.
  const rob = estimatePhillipsRobust(data, { y1: refYear - 1, gaps, world: (asOf && worldGapVintage(data.weoVintages, refYear)) || undefined });
  const phillips = rob ? { ...rob.iv, eMean: rob.eMean, robust: rob } : null;
  const coreOf = c => cut(data.hicpx?.core?.[c.eu]?.filter(r => r[0] >= '2010-01'), asOf);
  const raws = new Map(EU.map(c => [c.eu, persistenceRaw(coreOf(c), anchorFor(c, data, imfC[c.iso3] || {}, asOf).anchor)]));
  const pool = pooledPersistence([...raws.values()]);
  if (phillips && phillips.aAnnual > 0 && phillips.aAnnual < 1) pool.a = -Math.log(1 - phillips.aAnnual) / 12;
  const hl = pooledHalfLife(EU.map(c => coreOf(c)).filter(r => r && r.length >= 36));
  const decay = { hh: depositDecay(data, 'hh', asOf), corp: depositDecay(data, 'nfc', asOf), gov: depositDecay(data, 'gov', asOf) };
  decay.months = decay.hh.months;
  const start = P.accStart || '2020-Q1';
  const Lq = (() => { const end = asOf ? qPub(asOf) : (data.finacc?.hh?.F2?.DE?.at(-1)?.[0] || '2026-Q1'); return qIndex(end) - qIndex(start) + 1; })();
  const crit = criticalFromHistory(data, Lq, asOf);
  if (crit) Object.assign(crit, { path: criticalPath(data, Lq) });
  const psiMed = { hh: null, corp: null, gov: null }; // filled after the first pass over economies
  const out = { refYear, imfC, okun, gaps, phillips, raws, pool, crit, half: hl.half, phiQ: hl.phiQ, decay, psiMed, start, mode: P.baseline || 'b1619', asOf, nowcast: estimateNowcast(data), elasticity: energyOilElasticity(data), oilYoy: oilPath(data, { asOf, mode: 'flat' })?.yoy || null };
  ctxCache.set(key, out);
  if (ctxCache.size > 8) ctxCache.delete(ctxCache.keys().next().value);
  return out;
}

// Drawdown rates of each sector's excess stock, per year (§5.4).
export const SD_DEFAULT = { gov: 0, corp: 0.15, hh: 0.1 };

function buildEurope(data, region, ctx) {
  const { asOf } = ctx;
  const members = EU.filter(c => (region === 'ea' ? c.ea : true));
  const Y = ctx.refYear;
  // Annual nominal GDP in € billion by year. For a past date only years published by then are used
  // (annual accounts appear in the spring of the following year); later years are projected with the IMF
  // growth and inflation of the vintage in use, or at 3% a year if the IMF has no value (§3.2, §7.2).
  const gdpAtOf = c => {
    const rows = (data.gdp?.series?.[c.eu] || []).filter(r => !asOf || +r[0] <= Y - 1), imf = ctx.imfC[c.iso3] || {};
    const known = new Map(rows.map(([y, v]) => [+y, v / 1000]));
    const lastY = Math.max(...known.keys());
    return y => {
      if (known.has(y)) return known.get(y);
      if (!Number.isFinite(lastY) || y < lastY) return null;
      let v = known.get(lastY);
      for (let k = lastY + 1; k <= y; k++) { const g = atYear(imf.growth, k), p = atYear(imf.infl, k); v *= g != null && p != null ? (1 + g / 100) * (1 + p / 100) : 1.03; }
      return v;
    };
  };
  const gdpOf = c => { const f = gdpAtOf(c); return (asOf ? f(Y) : f(Math.max(...(data.gdp?.series?.[c.eu] || []).map(r => +r[0])))) || null; };
  const eaGdp = EU.filter(c => c.ea).reduce((s, c) => s + (gdpOf(c) || 0), 0);
  const liq = last(data.ecb?.liq)?.[1] ?? 0;
  const dfr = asOf ? (data.ecb?.dfrM || []).filter(r => r[0] <= asOf).at(-1)?.[1] : last(data.ecb?.dfr)?.[1];
  const cells = [];
  for (const c of members) {
    const gdp = gdpOf(c), gdpAt = gdpAtOf(c);
    const hicp = cut(data.hicp?.series?.[c.eu], asOf);
    if (!gdp || !hicp?.length) continue;
    const imf = ctx.imfC[c.iso3] || {};
    const qOrA = (q, a) => (q && q.length >= 8 ? { rows: cutQ(q, asOf), src: 'quarterly' } : a && a.length ? { rows: cutQ(annualToQ(a), asOf), src: 'annual' } : { rows: null, src: 'missing' });
    const hhR = qOrA(data.hhsave?.series?.[c.eu], data.sectA?.save?.[c.eu]);
    const hhL = data.hhinc?.series?.[c.eu]?.length >= 8 ? cutQ(data.hhinc.series[c.eu], asOf) : cutQ(annualLevelToQ(data.sectA?.inc?.[c.eu]), asOf);
    const prR = qOrA(data.profit?.series?.[c.eu], data.sectA?.profit?.[c.eu]);
    const prL = data.nfcgva?.series?.[c.eu]?.length >= 8 ? cutQ(data.nfcgva.series[c.eu], asOf) : cutQ(annualLevelToQ(data.sectA?.gva?.[c.eu]), asOf);
    const govRows = cutQ(data.gov?.series?.[c.eu], asOf) || [];
    const fHh = excessFlows(hhR.rows, hhL, ctx.mode, 0.6 * gdp / 4);
    const fPr = excessFlows(prR.rows, prL, ctx.mode, 0.55 * gdp / 4);
    const fGov = govRows.map(([q, b]) => [q, b / 100 * gdp / 4]);
    const acc = { hh: accumulate(fHh, ctx.start), corp: accumulate(fPr, ctx.start), gov: accumulate(fGov, ctx.start) };
    // Absorbable stock: excess deposits by sector (§3.2); idle part: currency and transferable deposits.
    const fin = { hh: data.finacc?.hh, corp: data.finacc?.nfc, gov: data.finacc?.gov };
    const dep = {}, idle = {};
    for (const k of ['hh', 'corp', 'gov']) {
      dep[k] = excessDeposits(fin[k]?.F2?.[c.eu], asOf, ctx.start, gdpAt);
      idle[k] = excessDeposits(sumSeries([fin[k]?.F21?.[c.eu], fin[k]?.F22?.[c.eu]]), asOf, ctx.start, gdpAt);
    }
    const govPct = last(govRows)?.[1] ?? atYear(imf.gov, Y);
    const uNow = asOf ? atYear(imf.unemp, Y) : (last(data.unemp?.series?.[c.eu])?.[1] ?? atYear(imf.unemp, Y));
    const um = asOf ? null : (() => { const r = data.unemp?.series?.[c.eu] || []; const prev = r.filter(x => +x[0].slice(0, 4) === Y - 1).map(x => x[1]); return r.length && prev.length >= 6 ? { now: last(r)[1], prevYearMean: mean(prev) } : null; })();
    const sl = slack(imf, uNow, ctx.okun.of, c.iso3, Y, ctx.gaps, um, ctx.okun.pooled);
    const [period, pi] = last(hicp);
    const an = anchorFor(c, data, imf, asOf);
    const core = cut(data.hicpx?.core?.[c.eu], asOf), eIdx = data.hicpx?.energyIndex?.[c.eu];
    const wE = ((asOf ? atYear(data.energyw?.series?.[c.eu], Y) : null) ?? last(data.energyw?.series?.[c.eu])?.[1] ?? 95) / 1000;
    cells.push({
      id: c.eu, iso3: c.iso3, name: c.name, lat: c.lat, lon: c.lon, col: c.col, row: c.row, ea: c.ea, eu: true, refYear: Y,
      gdp, pi, piPeriod: period, drift: clip(slope(hicp.slice(-6)), -0.3, 0.3),
      piHist: hicp.slice(-24), piFull: hicp,
      unemp: uNow, uBar: sl.uBar, okun: sl.okun, x0: sl.x0, gapSrc: sl.gapSrc, gapUpdate: sl.gapUpdate,
      piCore: last(core)?.[1] ?? null, coreFull: core, wE, energy: eIdx ? { type: 'index', rows: asOf ? eIdx : padIndex(eIdx, period), asOf: asOf || null, drift: ctx.phillips?.eMean ?? 3 } : { type: 'oil', elasticity: ctx.elasticity, yoy: ctx.oilYoy },
      area: c.ea ? 'EA' : c.eu, i0: c.ea ? dfr : (asOf ? undefined : recentRate(data.rates?.rates?.[c.iso3], data)),
      gPot: atYear(imf.growth, Y + 5) ?? 1.5,
      govPct, ca: atYear(imf.ca, Y) ?? 0, pop: last(data.wb?.[c.iso3]?.pop)?.[1] ?? null,
      hhNow: last(hhR.rows || [])?.[1] ?? null, prNow: last(prR.rows || [])?.[1] ?? null,
      dataQuarter: last(hhR.rows || govRows)?.[0] ?? null,
      measured: { hh: dep.hh ? 'quarterly' : 'missing', corp: dep.corp ? 'quarterly' : 'missing', gov: dep.gov ? 'quarterly' : 'missing' },
      savingSrc: { hh: hhR.src, corp: prR.src },
      ...an, aR: ctx.pool.a, driftHalf: ctx.half,
      fc: { infl: imf.infl || [], gov: imf.gov || [], ca: imf.ca || [] },
      excessSaving: { gov: acc.gov.stock, corp: acc.corp.stock, hh: acc.hh.stock },
      gross: { gov: acc.gov.stock, corp: acc.corp.stock, hh: acc.hh.stock },
      sectors: { gov: Math.max(0, dep.gov?.stock ?? 0), corp: Math.max(0, dep.corp?.stock ?? 0), hh: Math.max(0, dep.hh?.stock ?? 0) },
      flows: { gov: Math.max(0, dep.gov?.inflowYear ?? 0), corp: Math.max(0, dep.corp?.inflowYear ?? 0), hh: Math.max(0, dep.hh?.inflowYear ?? 0) },
      idle: { gov: Math.max(0, idle.gov?.stock ?? 0), corp: Math.max(0, idle.corp?.stock ?? 0), hh: Math.max(0, idle.hh?.stock ?? 0) },
      depQuarter: dep.hh?.quarter ?? null, scritHist: ctx.crit,
      inflowDecay: { hh: ctx.decay.hh.months, corp: ctx.decay.corp.months, gov: ctx.decay.gov.months },
      indicators: { external: Math.max(0, atYear(imf.ca, Y) ?? 0) * gdp / 100, reserves: c.ea && eaGdp ? (liq / 1000) * gdp / eaGdp : 0 },
    });
  }
  // Ratio of excess deposits to accumulated excess saving in the EU, used for economies without
  // financial accounts (the global panel).
  if (region !== 'ea') {
    for (const k of ['hh', 'corp', 'gov']) {
      const a = cells.reduce((x, c) => x + c.sectors[k], 0), b = cells.reduce((x, c) => x + c.excessSaving[k], 0);
      ctx.psiMed[k] = b > 0 ? clip(a / b, 0, 1) : 0.3;
    }
    ctx.psiFromEU = true;
  }
  return cells;
}

function buildGlobal(data, ctx) {
  const Y = ctx.refYear;
  // GDP in US dollars converted at the average EUR/USD rate of the last twelve months (§3.8).
  const m = data.expect?.eurusdM?.slice(-12).map(r => r[1]) || [];
  const usdPerEur = m.length ? mean(m) : data.fx?.rates?.USD || 1.1;
  const euByIso = Object.fromEntries(EU.map(c => [c.iso3, c]));
  const cells = [];
  for (const c of GLOBAL) {
    const imf = ctx.imfC[c.iso3] || {}, wb = data.wb?.[c.iso3] || {};
    const gdpUsd = atYear(imf.gdp, Y) ?? (last(wb.gdp)?.[1] ?? 0) / 1e9;
    if (!gdpUsd) continue;
    const gdp = gdpUsd / usdPerEur;
    const euc = euByIso[c.iso3];
    const monthly = euc ? data.hicp?.series?.[euc.eu] : null;
    let pi, period, drift, piHist;
    if (monthly?.length) {
      [period, pi] = last(monthly);
      drift = clip(slope(monthly.slice(-6)), -0.3, 0.3);
      piHist = monthly.slice(-24);
    } else {
      const cur = atYear(imf.infl, Y) ?? last(wb.infl)?.[1];
      const nxt = atYear(imf.infl, Y + 1) ?? cur;
      if (cur === null || cur === undefined) continue;
      pi = cur; period = `${Y} (IMF est.)`;
      drift = clip((nxt - cur) / 12, -0.5, 0.5);
      piHist = (imf.infl || wb.infl || []).filter(r => +r[0] <= Y).slice(-10);
    }
    const govPct = atYear(imf.gov, Y) ?? 0;
    const govStock = Math.max(0, ((atYear(imf.gov, Y - 1) ?? 0) + govPct) / 100 * gdp);
    const save = wb.save || [];
    const sBase = mean(save.filter(r => +r[0] >= 2015 && +r[0] <= 2019).map(r => r[1]));
    const sRecent = save.filter(r => +r[0] >= 2020);
    const hhStock = sBase === null ? 0 : Math.max(0, sRecent.reduce((a, r) => a + Math.pow(1 - SD_DEFAULT.hh, Math.max(0, Y - 1 - +r[0])) * (r[1] - sBase) / 100 * gdp, 0));
    const hhFlow = sBase === null || !sRecent.length ? 0 : Math.max(0, (last(sRecent)[1] - sBase) / 100 * gdp);
    const uNow = atYear(imf.unemp, Y) ?? last(wb.unemp)?.[1] ?? null;
    const sl = slack(imf, uNow, ctx.okun.of, c.iso3, Y, ctx.gaps, null, ctx.okun.pooled);
    const an = euc ? anchorFor(euc, data, imf) : anchorFor({}, data, imf);
    const eIdx = euc ? data.hicpx?.energyIndex?.[euc.eu] : null;
    const wE = euc ? (last(data.energyw?.series?.[euc.eu])?.[1] ?? 95) / 1000 : 0.08;
    const ea = c.ccy === 'EUR';
    const psi = { hh: ctx.psiMed.hh, corp: ctx.psiMed.corp, gov: ctx.psiMed.gov };
    cells.push({
      id: c.iso3, iso3: c.iso3, name: c.name, lat: c.lat, lon: c.lon, ccy: c.ccy, ea, euCode: euc?.eu, refYear: Y,
      gdp, pi, piPeriod: period, drift, piHist, piFull: monthly?.length ? monthly : undefined,
      unemp: uNow, uBar: sl.uBar, okun: sl.okun, x0: sl.x0, gapSrc: sl.gapSrc,
      piCore: euc ? last(data.hicpx?.core?.[euc.eu])?.[1] ?? null : null, coreFull: euc ? data.hicpx?.core?.[euc.eu] : undefined, wE, energy: eIdx ? { type: 'index', rows: padIndex(eIdx, period), asOf: null, drift: ctx.phillips?.eMean ?? 3 } : { type: 'oil', elasticity: ctx.elasticity, yoy: ctx.oilYoy },
      area: ea ? 'EA' : c.iso3, i0: ea ? last(data.ecb?.dfr)?.[1] : recentRate(data.rates?.rates?.[c.iso3], data),
      gPot: atYear(imf.growth, Y + 5) ?? 2,
      govPct, ca: atYear(imf.ca, Y) ?? 0, pop: last(wb.pop)?.[1] ?? null,
      hhNow: last(sRecent)?.[1] ?? null, dataQuarter: last(sRecent)?.[0] ?? null,
      fcRmse: IMF_INFL_RMSE[c.iso3] ?? null,
      measured: { hh: sBase === null ? 'missing' : 'annual', corp: 'missing', gov: 'annual' },
      psi, ...an, aR: ctx.pool.a, driftHalf: ctx.half,
      fc: { infl: imf.infl || [], gov: imf.gov || [], ca: imf.ca || [] },
      gross: { gov: govStock, corp: 0, hh: hhStock },
      sectors: { gov: psi.gov * govStock, corp: 0, hh: psi.hh * hhStock },
      flows: { gov: psi.gov * Math.max(0, govPct) / 100 * gdp, corp: 0, hh: psi.hh * hhFlow },
      inflowDecay: { hh: ctx.decay.hh.months, corp: ctx.decay.corp.months, gov: ctx.decay.gov.months },
      indicators: { external: Math.max(0, atYear(imf.ca, Y) ?? 0) * gdp / 100, reserves: 0 },
    });
  }
  return cells;
}

// Coverage: weighted share of the three sectors that are measured, used to scale S_crit (§3.8).
export function coverageOf(cell, p = {}) {
  let w = 0, tot = 0;
  for (const s of SECTORS) { const l = p[s.lam] ?? 1; tot += l; if (cell.measured?.[s.k] && cell.measured[s.k] !== 'missing') w += l; }
  return tot ? w / tot : 1;
}
export function scritPctOf(cell, p = {}) {
  if (p.scritMode === 'fixed') return p.scritPct ?? 10;
  return (p.scritMode === 'hist75' ? cell.scritHist?.p75 : cell.scritHist?.p90) ?? p.scritPct ?? 10;
}
export function scritPathOf(cell, p = {}) {
  if (p.scritMode === 'fixed' || cell.fixedScrit != null) return null;
  const path = cell.scritHist?.path?.[p.scritMode === 'hist75' ? 'p75' : 'p90'];
  return path?.length && path.every(v => v != null) ? path : null;
}
export function scritOf(cell, p = {}) {
  return cell.fixedScrit ?? Math.max(0.05, scritPctOf(cell, p) / 100 * cell.gdp * coverageOf(cell, p));
}

// Weighted liquid excess stock S = Σ λ_k S^k (§3.2).
export function surplusOf(cell, p = {}) {
  let s = 0;
  for (const sec of SECTORS) s += (p[sec.lam] ?? 1) * (cell.sectors[sec.k] || 0);
  return s;
}

// Reference scenarios built from data (§7.1–7.2): the EU-27 aggregated into one economy, today or
// as of a past month (the data published by 31 December 2021, §7.2).
export function referenceCell(data, P = {}, asOf = null) {
  if (!data?.hicp) return null;
  const cells = buildCells(data, 'eu', { nowcast: false, P, asOf });
  if (!cells.length) return null;
  const G = cells.reduce((s, c) => s + c.gdp, 0);
  const w = f => cells.reduce((s, c) => s + (f(c) ?? 0) * c.gdp, 0) / G;
  const sum = f => cells.reduce((s, c) => s + (f(c) || 0), 0);
  const eu27 = cut(data.hicp.series.EU27_2020 || data.hicp.series.EU, asOf) || [];
  const ea = cells.find(c => c.ea);
  return {
    id: 'EU', name: asOf ? `EU-27 as of ${asOf}` : 'EU-27 aggregate', lat: 50, lon: 10, col: 0, row: 0, eu: true, ea: true, refYear: cells[0].refYear,
    gdp: G, pi: last(eu27)?.[1] ?? w(c => c.pi), drift: clip(slope(eu27.slice(-6)), -0.3, 0.3), piPeriod: last(eu27)?.[0] ?? '', piHist: eu27.slice(-24), piFull: eu27,
    unemp: w(c => c.unemp), uBar: w(c => c.uBar ?? c.unemp), okun: w(c => c.okun), x0: w(c => c.x0), gapSrc: 'GDP',
    piCore: last(cut(data.hicpx?.core?.EU27_2020, asOf))?.[1] ?? null, wE: ((asOf ? atYear(data.energyw?.series?.EU27_2020, +asOf.slice(0, 4)) : null) ?? last(data.energyw?.series?.EU27_2020)?.[1] ?? 95) / 1000,
    energy: data.hicpx?.energyIndex?.EU27_2020 ? { type: 'index', rows: asOf ? data.hicpx.energyIndex.EU27_2020 : padIndex(data.hicpx.energyIndex.EU27_2020, last(eu27)?.[0]), asOf: asOf || null, drift: context(data, P, asOf).phillips?.eMean ?? 3 } : { type: 'oil', elasticity: 0.19 },
    area: 'EU', i0: ea?.i0, gPot: w(c => c.gPot), pop: sum(c => c.pop),
    anchor: w(c => c.anchor), anchorSrc: 'GDP-weighted', aR: w(c => c.aR), driftHalf: cells[0].driftHalf,
    idle: { gov: sum(c => c.idle?.gov), corp: sum(c => c.idle?.corp), hh: sum(c => c.idle?.hh) },
    excessSaving: { gov: sum(c => c.excessSaving?.gov), corp: sum(c => c.excessSaving?.corp), hh: sum(c => c.excessSaving?.hh) },
    measured: { gov: 'quarterly', corp: 'quarterly', hh: 'quarterly' },
    fc: { infl: [], gov: [], ca: [] },
    gross: { gov: sum(c => c.gross.gov), corp: sum(c => c.gross.corp), hh: sum(c => c.gross.hh) },
    sectors: { gov: sum(c => c.sectors.gov), corp: sum(c => c.sectors.corp), hh: sum(c => c.sectors.hh) },
    flows: { gov: sum(c => c.flows.gov), corp: sum(c => c.flows.corp), hh: sum(c => c.flows.hh) },
    inflowDecay: cells[0].inflowDecay, indicators: { external: 0, reserves: 0 }, reference: true, scritHist: cells[0].scritHist,
    dataQuarter: cells[0].dataQuarter,
  };
}
