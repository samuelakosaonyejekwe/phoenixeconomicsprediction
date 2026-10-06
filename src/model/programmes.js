// Stabilisation programmes that run beside the core model on live data: the multi-indicator trigger
// board, the economic health and volatility indices, the commodity basket with price bands, the
// asset-price and exchange-rate monitors, debt conversion, the stability fund and the recall ladder.
// Pure functions of the fetched data, the economies in view and the settings below; none of them
// changes the core simulation.
import { needIndex } from './engine.js';
import { COMMODITIES } from '../data/sources.js';

export const PROG_GROUPS = [
  { id: 'triggers', title: 'Trigger board', params: [
    { k: 'm3Th', label: 'Money-growth trigger (M3, % a year)', min: 2, max: 12, step: 0.5, def: 5, help: 'Annual growth of the broad money stock M3 above which the monetary condition of the trigger board is met.' },
    { k: 'creditTh', label: 'Credit-growth trigger (% a year)', min: 2, max: 15, step: 0.5, def: 6, help: 'Annual growth of bank loans to households above which credit counts as a second monetary signal and as leverage in the asset-price monitor.' },
    { k: 'deflTh', label: 'Deflation floor (%)', min: -1, max: 1.5, step: 0.1, def: 0.5, help: 'Inflation below this floor reverses the mechanism: PHX is converted back into Digital Euro to add liquidity instead of absorbing it.' },
    { k: 'healthTh', label: 'Health-index alert level', min: 30, max: 80, step: 5, def: 60, help: 'A composite health index below this level puts pre-emptive contracts on alert before any single indicator breaches.' },
    { k: 'volTh', label: 'Volatility alert (× normal)', min: 1.1, max: 3, step: 0.1, def: 1.5, help: 'Recent market volatility as a multiple of its own longer-run level; above this the volatility buffer would be released.' },
  ] },
  { id: 'markets', title: 'Commodities, assets and currencies', params: [
    { k: 'bandPct', label: 'Commodity price band (± %)', min: 10, max: 60, step: 5, def: 25, help: 'Half-width of the band around each commodity’s five-year average price in euro. Outside the band the stabilisation reserve would buy (below) or release (above).' },
    { k: 'wEnergy', label: 'Basket weight of energy (%)', min: 0, max: 80, step: 5, def: 40, help: 'Weight of Brent crude oil in the commodity basket; the remaining weight is shared by gold, wheat, maize and copper in fixed proportions.' },
    { k: 'bubbleReal', label: 'House-price signal: real growth (% a year)', min: 2, max: 15, step: 0.5, def: 6, help: 'House prices rising faster than this after inflation count as one of the three asset-price signals.' },
    { k: 'bubbleGap', label: 'House-price signal: gap from trend (%)', min: 3, max: 30, step: 1, def: 10, help: 'House prices above their own ten-year trend by more than this count as one of the three asset-price signals.' },
    { k: 'divertMax', label: 'Largest diversion offer (% of new investment)', min: 5, max: 30, step: 1, def: 20, help: 'Share of new investment in the overheated asset that would be offered conversion into stabilisation bonds when all three signals are on; one third of it per signal.' },
    { k: 'devalTh', label: 'Depreciation trigger (% in 12 months)', min: 5, max: 40, step: 1, def: 15, help: 'A fall of a currency against the US dollar larger than this over twelve months opens its swap line and reserve-diversification programme.' },
    { k: 'reserveMax', label: 'Largest reserve share in PHX (%)', min: 5, max: 40, step: 1, def: 20, help: 'Ceiling on the share of official reserves a central bank would hold in PHX under the diversification programme.' },
  ] },
  { id: 'funds', title: 'Debt, stability fund and recall', params: [
    { k: 'swapShare', label: 'Share of debt eligible for conversion (%)', min: 5, max: 50, step: 5, def: 20, help: 'Share of a government’s debt offered for exchange into PHX-denominated bonds.' },
    { k: 'swapFee', label: 'Margin over the reference yield (pp)', min: 0, max: 1.5, step: 0.05, def: 0.25, help: 'The PHX bond pays the lowest euro-area ten-year yield plus this margin, which covers the issuer’s costs and risk.' },
    { k: 'swapMaturity', label: 'Average maturity of the debt (years)', min: 3, max: 15, step: 1, def: 8, help: 'Debt is exchanged only as it falls due, so about one part in this many is converted each year.' },
    { k: 'gdpLink', label: 'Growth link of repayments', min: 0, max: 1, step: 0.05, def: 0.25, help: 'How strongly scheduled repayments move with growth: each point of growth below potential lowers the year’s repayment by this share, and conversely, within 50–150%.' },
    { k: 'fundSize', label: 'Stability fund (€ billion)', min: 5, max: 500, step: 5, def: 50, help: 'Size of the fund distributed among economies with measured need.' },
    { k: 'fundUGap', label: 'Unemployment disparity trigger (pp)', min: 0.5, max: 8, step: 0.5, def: 2, help: 'An economy becomes eligible when its unemployment rate exceeds the area average by more than this.' },
    { k: 'fundFirst', label: 'First tranche (%)', min: 10, max: 100, step: 5, def: 40, help: 'Share of an allocation paid at once; the rest is paid as agreed milestones are met.' },
    { k: 'recallTh', label: 'Recall trigger (inflation, %)', min: 3, max: 8, step: 0.25, def: 4, help: 'Area inflation at which PHX in circulation starts to be recalled.' },
    { k: 'recallBase', label: 'Recall at the trigger (% of PHX)', min: 0.5, max: 10, step: 0.5, def: 2, help: 'Share of PHX in circulation recalled when inflation is exactly at the recall trigger.' },
    { k: 'recallSlope', label: 'Extra recall per point above (% of PHX)', min: 0, max: 5, step: 0.25, def: 1, help: 'Additional share recalled for each percentage point of inflation above the recall trigger, so a small breach gives a small recall.' },
    { k: 'recallMax', label: 'Largest recall (% of PHX)', min: 2, max: 30, step: 1, def: 10, help: 'Ceiling on the share of PHX recalled in one step.' },
    { k: 'themeSize', label: 'Each thematic fund (€ billion)', min: 1, max: 100, step: 1, def: 10, help: 'Size of each thematic fund; it is shared among the eligible economies in proportion to their measured gap and their size.' },
    { k: 'dragonCap', label: 'Dragon reserve cap (% of PHX a year)', min: 0, max: 20, step: 1, def: 5, help: 'Largest share of PHX in circulation that may be converted into the Dragon reserve in a year, so that the reserve stays scarce.' },
  ] },
];
export const PROG_INDEX = Object.fromEntries(PROG_GROUPS.flatMap(g => g.params.map(p => [p.k, p])));
export const PROG_DEFAULTS = Object.fromEntries(PROG_GROUPS.flatMap(g => g.params.map(p => [p.k, p.def])));
export function sanitizeProg(s = {}) {
  const out = { ...PROG_DEFAULTS };
  for (const [k, m] of Object.entries(PROG_INDEX)) if (typeof s[k] === 'number' && Number.isFinite(s[k])) out[k] = Math.min(m.max, Math.max(m.min, s[k]));
  return out;
}

const last = r => (r && r.length ? r[r.length - 1] : null);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const wmean = (cells, f) => { let w = 0, s = 0; for (const c of cells) { const v = f(c); if (v == null || !Number.isFinite(v)) continue; w += c.gdp; s += v * c.gdp; } return w ? s / w : null; };

// ---- 1. Trigger board: inflation confirmed by independent monetary indicators ----------------------
// A conversion fires on inflation only when a money or credit aggregate from a second publisher agrees,
// which keeps a single noisy release from triggering it.
export function triggerBoard(data, cells, P, S) {
  const pi = wmean(cells, c => c.pi);
  const m = data.money || {};
  const ind = (k, label, row, th, source, unit = '%') => ({ k, label, value: row ? row[1] : null, period: row ? row[0] : null, threshold: th, breach: row ? row[1] >= th : null, source, unit });
  const cashYoy = (() => { const r = m.cash || []; if (r.length < 13) return null; return [last(r)[0], (last(r)[1] / r[r.length - 13][1] - 1) * 100]; })();
  const rows = [
    { k: 'pi', label: 'Inflation, GDP-weighted', value: pi, period: cells.map(c => c.piPeriod).sort().pop() || null, threshold: P.piTh, breach: pi == null ? null : pi >= P.piTh, source: 'Eurostat / IMF', unit: '%' },
    ind('m3', 'Broad money M3, annual growth', last(m.m3), S.m3Th, 'ECB'),
    ind('m1', 'Narrow money M1, annual growth', last(m.m1), S.m3Th, 'ECB'),
    ind('hhLoans', 'Loans to households, annual growth', last(m.hhLoans), S.creditTh, 'ECB'),
    ind('nfcLoans', 'Loans to firms, annual growth', last(m.nfcLoans), S.creditTh, 'ECB'),
    ind('cash', 'Currency in circulation, annual growth', cashYoy, S.m3Th, 'ECB'),
  ];
  const monetary = rows.slice(1).filter(r => r.breach).length;
  const known = rows.slice(1).filter(r => r.breach !== null).length;
  const below = cells.filter(c => c.pi < S.deflTh);
  let state = 'CLEAR';
  if (rows[0].breach && monetary >= 1) state = 'CONFIRMED';
  else if (rows[0].breach) state = known ? 'UNCONFIRMED' : 'CONFIRMED';
  else if (monetary >= 2) state = 'MONETARY';
  else if (pi != null && pi < S.deflTh) state = 'INJECT';
  return { rows, state, monetary, known, pi, below };
}
export const TRIGGER_STATES = {
  CONFIRMED: { tone: 'crit', label: 'Confirmed', desc: 'Inflation is above the trigger and at least one money or credit aggregate agrees: conversions proceed.' },
  UNCONFIRMED: { tone: 'serious', label: 'Unconfirmed', desc: 'Inflation is above the trigger but no money or credit aggregate agrees: contracts stay armed and conversions wait for confirmation.' },
  MONETARY: { tone: 'warn', label: 'Monetary signal', desc: 'Two or more money or credit aggregates are above their triggers while inflation is not: an early signal, monitored.' },
  INJECT: { tone: 'info', label: 'Inject', desc: 'Inflation is below the deflation floor: PHX would be converted back into Digital Euro to add liquidity.' },
  CLEAR: { tone: 'good', label: 'Clear', desc: 'No trigger condition is met.' },
};

// ---- 2. Volatility index: recent against longer-run realised volatility -----------------------------
// Annualised standard deviation of daily changes (log returns for prices, differences for yields).
export function realisedVol(rows, n, diff = false) {
  const v = (rows || []).map(r => r[1]).filter(x => x != null && (diff || x > 0));
  if (v.length < n + 1) return null;
  const tail = v.slice(-(n + 1)), ch = [];
  for (let i = 1; i < tail.length; i++) ch.push(diff ? tail[i] - tail[i - 1] : Math.log(tail[i] / tail[i - 1]));
  const s = sd(ch);
  return s == null ? null : s * Math.sqrt(252) * (diff ? 1 : 100);
}
export function volatilityIndex(data, S, short = 20) {
  const defs = [
    { k: 'eurusd', label: 'Euro–dollar rate', rows: data.markets?.eurusd, unit: '%' },
    { k: 'brent', label: 'Brent crude oil', rows: data.brent?.series, unit: '%' },
    { k: 'y10', label: '10-year AAA yield', rows: data.markets?.y10, diff: true, unit: 'pp' },
  ];
  const parts = [];
  for (const d of defs) {
    const n = (d.rows || []).length;
    if (n < short + 30) continue;
    const now = realisedVol(d.rows, short, d.diff), norm = realisedVol(d.rows, n - 1, d.diff);
    if (now == null || !norm) continue;
    parts.push({ k: d.k, label: d.label, now, norm, ratio: now / norm, unit: d.unit, days: n, asOf: last(d.rows)[0] });
  }
  const index = parts.length ? mean(parts.map(p => p.ratio)) : null;
  return { parts, index, state: index == null ? 'NA' : index >= S.volTh ? 'RELEASE' : index >= (1 + S.volTh) / 2 ? 'WATCH' : 'CALM' };
}

// ---- 3. Economic health index (0–100) -----------------------------------------------------------------
// Each component is the GDP-weighted distance from its normal value, as a share of a fixed scale.
export function healthIndex(cells, P, S, vol) {
  const comp = (k, label, value, scale, fmt) => ({ k, label, value, stress: value == null ? null : clamp(Math.abs(value) / scale, 0, 1), scale, fmt });
  const parts = [
    comp('pi', 'Inflation away from target', wmean(cells, c => Math.abs(c.pi - (c.anchor ?? P.target))), 4, 'pp'),
    comp('gap', 'Output gap', wmean(cells, c => Math.abs(c.x0 ?? 0)), 4, '%'),
    comp('u', 'Unemployment above its natural rate', wmean(cells, c => Math.max(0, (c.unemp ?? 0) - (c.uBar ?? c.unemp ?? 0))), 4, 'pp'),
    comp('fiscal', 'Government deficit', wmean(cells, c => Math.max(0, -(c.govPct ?? 0))), 6, '% of GDP'),
    comp('vol', 'Market volatility above normal', vol?.index == null ? null : Math.max(0, vol.index - 1), 1, '×'),
  ].filter(p => p.stress !== null);
  if (!parts.length) return { parts, index: null, state: 'NA' };
  const index = 100 * (1 - mean(parts.map(p => p.stress)));
  return { parts, index, state: index < S.healthTh ? 'ALERT' : index < S.healthTh + 15 ? 'WATCH' : 'STABLE' };
}
// The same index for one economy, used to rank where pre-emptive contracts would be prepared first.
export const healthOf = (c, P) => 100 * (1 - mean([clamp(Math.abs(c.pi - (c.anchor ?? P.target)) / 4, 0, 1), clamp(Math.abs(c.x0 ?? 0) / 4, 0, 1), clamp(Math.max(0, (c.unemp ?? 0) - (c.uBar ?? c.unemp ?? 0)) / 4, 0, 1), clamp(Math.max(0, -(c.govPct ?? 0)) / 6, 0, 1)]));

// ---- 4. Hard cash: currency in circulation against its pre-2020 trend ---------------------------------
export function cashExcess(data) {
  const r = (data.money?.cash || []).filter(x => x[1] > 0);
  const base = r.filter(x => x[0] >= '2010-01' && x[0] <= '2019-12');
  if (base.length < 60 || r.length < 13) return null;
  // Log-linear trend fitted on 2010–2019 and extended to the latest month.
  const t0 = r.findIndex(x => x[0] === base[0][0]);
  const xs = base.map((_, i) => i), ys = base.map(x => Math.log(x[1]));
  const mx = mean(xs), my = mean(ys);
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0), a = my - b * mx;
  const trendAt = i => Math.exp(a + b * (i - t0));
  const path = r.slice(t0).map((x, i) => [x[0], x[1] / 1000, trendAt(t0 + i) / 1000]);
  const [period, stock] = last(r), trend = trendAt(r.length - 1);
  return { period, stock: stock / 1000, trend: trend / 1000, excess: (stock - trend) / 1000, yoy: (stock / r[r.length - 13][1] - 1) * 100, trendGrowth: (Math.exp(12 * b) - 1) * 100, path };
}
// Tiered conversion reward: larger amounts moved out of cash earn a higher premium, in basis points.
export const CASH_TIERS = [{ upTo: 1000, bp: 10 }, { upTo: 10000, bp: 20 }, { upTo: 100000, bp: 35 }, { upTo: Infinity, bp: 50 }];
export function cashReward(amount) {
  let prev = 0, total = 0;
  for (const t of CASH_TIERS) { const slice = Math.max(0, Math.min(amount, t.upTo) - prev); total += slice * t.bp / 1e4; prev = t.upTo; if (amount <= t.upTo) break; }
  return total;
}

// ---- 5. Commodity basket, price bands and commodity-linked credits ------------------------------------
const OTHER_W = { gold: 1 / 3, wheat: 0.25, maize: 1 / 6, copper: 0.25 };
export function basketWeights(S, keys) {
  const e = keys.includes('brent') ? S.wEnergy / 100 : 0;
  const rest = keys.filter(k => k !== 'brent'), tot = rest.reduce((s, k) => s + (OTHER_W[k] || 0), 0) || 1;
  const w = Object.fromEntries(rest.map(k => [k, (1 - e) * (OTHER_W[k] || 0) / tot]));
  if (e) w.brent = rest.length ? e : 1;
  return w;
}
export function commodityBasket(data, S, window = 60) {
  const src = data.commod;
  if (!src?.series) return null;
  const fx = new Map(src.eurPerUsd || []);
  let lastFx = null;
  const items = [];
  for (const def of COMMODITIES) {
    const usd = src.series[def.k];
    if (!usd || usd.length < window + 13) continue;
    // Prices in euro: the band and the basket are for euro-area buyers.
    const eur = usd.map(([p, v]) => { if (fx.has(p)) lastFx = fx.get(p); return [p, lastFx ? v * lastFx : null]; }).filter(r => r[1] != null);
    if (eur.length < window + 13) continue;
    const win = eur.slice(-window).map(r => r[1]);
    const avg = mean(win), lower = avg * (1 - S.bandPct / 100), upper = avg * (1 + S.bandPct / 100);
    const [period, price] = last(eur), priceUsd = last(usd)[1];
    const yoy = (price / eur[eur.length - 13][1] - 1) * 100;
    const ret = []; for (let i = eur.length - 36; i < eur.length; i++) if (i > 0) ret.push(Math.log(eur[i][1] / eur[i - 1][1]));
    const dev = (price / avg - 1) * 100;
    const state = price > upper ? 'ABOVE' : price < lower ? 'BELOW' : Math.abs(dev) > 0.8 * S.bandPct ? 'NEAR' : 'INSIDE';
    items.push({ ...def, period, price, priceUsd, avg, lower, upper, dev, yoy, vol: (sd(ret) ?? 0) * Math.sqrt(12) * 100, state, eur,
      // Price insurance: what a producer holding a floor at the lower band, or a buyer holding a cap at the upper band, is paid per unit.
      floorPay: Math.max(0, lower - price), capPay: Math.max(0, price - upper) });
  }
  if (!items.length) return null;
  const w = basketWeights(S, items.map(i => i.k));
  // Geometric index, 100 = each commodity at its own five-year average; common months only.
  const months = items.map(i => new Set(i.eur.map(r => r[0]))).reduce((a, b) => new Set([...a].filter(x => b.has(x))));
  const idx = [...months].sort().map(p => [p, 100 * Math.exp(items.reduce((s, it) => s + w[it.k] * Math.log(it.eur.find(r => r[0] === p)[1] / it.avg), 0))]);
  const iret = []; for (let i = Math.max(1, idx.length - 36); i < idx.length; i++) iret.push(Math.log(idx[i][1] / idx[i - 1][1]));
  const vol = (sd(iret) ?? 0) * Math.sqrt(12) * 100, avgVol = items.reduce((s, it) => s + w[it.k] * it.vol, 0);
  const now = last(idx), y1 = idx[idx.length - 13];
  return { items, weights: w, index: idx, level: now[1], period: now[0], yoy: y1 ? (now[1] / y1[1] - 1) * 100 : null, vol, avgVol,
    // A credit of 100 issued twelve months ago and linked to the basket is worth this today.
    credit: y1 ? 100 * now[1] / y1[1] : null };
}
export const BAND_STATES = {
  ABOVE: { tone: 'crit', label: 'Above band', desc: 'Price above the upper band: the stabilisation reserve would release stock, and holders of price caps are paid the difference.' },
  BELOW: { tone: 'serious', label: 'Below band', desc: 'Price below the lower band: the stabilisation reserve would buy, and producers holding a price floor are paid the difference.' },
  NEAR: { tone: 'warn', label: 'Near band', desc: 'Price within a fifth of the band’s half-width of one of its edges: intervention is prepared.' },
  INSIDE: { tone: 'good', label: 'Inside band', desc: 'Price inside the band: no intervention.' },
};

// ---- 6. Asset-price monitor (housing) -----------------------------------------------------------------
// Three signals: real price growth, price level above its own ten-year trend, and credit growth.
export function bubbleMonitor(data, cells, S) {
  const h = data.house;
  if (!h?.rch) return null;
  const credit = last(data.money?.hhLoans)?.[1] ?? null;
  const rows = [];
  for (const c of cells) {
    const geo = c.euCode || (c.eu ? c.id : null);
    const rch = geo ? h.rch[geo] : null, idx = geo ? h.idx?.[geo] : null;
    if (!rch?.length) continue;
    const [quarter, nominal] = last(rch);
    const real = nominal - (c.piOfficial ?? c.pi);
    let gap = null;
    if (idx && idx.length >= 24) {
      const win = idx.slice(-40), xs = win.map((_, i) => i), ys = win.map(r => Math.log(r[1]));
      const mx = mean(xs), my = mean(ys), b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      gap = (Math.exp(ys[ys.length - 1] - (my + b * (xs.length - 1 - mx))) - 1) * 100;
    }
    const signals = { real: real > S.bubbleReal, gap: gap != null && gap > S.bubbleGap, credit: c.ea !== false && credit != null && credit > S.creditTh };
    const n = Object.values(signals).filter(Boolean).length;
    rows.push({ c, quarter, nominal, real, gap, signals, n, state: BUBBLE_ORDER[n], divert: n / 3 * S.divertMax, hist: rch.slice(-24) });
  }
  rows.sort((a, b) => b.n - a.n || b.real - a.real);
  return { rows, credit, creditPeriod: last(data.money?.hhLoans)?.[0] ?? null };
}
export const BUBBLE_ORDER = ['CALM', 'WATCH', 'ELEVATED', 'SIGNAL'];
export const BUBBLE_STATES = {
  SIGNAL: { tone: 'crit', label: 'Bubble signal', desc: 'All three signals are on: the full diversion offer into stabilisation bonds applies.' },
  ELEVATED: { tone: 'serious', label: 'Elevated', desc: 'Two of the three signals are on: two thirds of the diversion offer applies.' },
  WATCH: { tone: 'warn', label: 'Watch', desc: 'One of the three signals is on: one third of the diversion offer applies.' },
  CALM: { tone: 'good', label: 'Calm', desc: 'No signal: no diversion is offered.' },
};

// ---- 7. Exchange-rate monitor: depreciation, swap lines and reserve diversification -------------------
export function devaluationMonitor(data, S, names = {}) {
  const r = data.fxh?.rates;
  if (!r?.USD?.length) return null;
  const usd = new Map(r.USD);
  const rows = [];
  for (const [ccy, eurRows] of Object.entries(r)) {
    if (eurRows.length < 60) continue;
    // Units of the currency per euro; per dollar = per euro / dollars per euro.
    const perUsd = ccy === 'USD' ? null : eurRows.filter(x => usd.has(x[0])).map(x => [x[0], x[1] / usd.get(x[0])]);
    const base = ccy === 'USD' ? eurRows : perUsd;
    const first = mean(base.slice(0, 10).map(x => x[1])), now = mean(base.slice(-5).map(x => x[1]));
    // A rise in units per dollar (or per euro, for the dollar itself) is a depreciation.
    const dep = (1 - first / now) * 100;
    const eFirst = mean(eurRows.slice(0, 10).map(x => x[1])), eNow = mean(eurRows.slice(-5).map(x => x[1]));
    const depEur = (1 - eFirst / eNow) * 100;
    const vol = realisedVol(base, 30);
    const trig = dep >= S.devalTh;
    // Reserve share: 5% in normal times, rising by half a point per point of depreciation beyond the trigger.
    const share = clamp(5 + (trig ? 0.5 * (dep - S.devalTh) + 5 : 0), 0, S.reserveMax);
    rows.push({ ccy, name: names[ccy] || ccy, against: ccy === 'USD' ? 'EUR' : 'USD', dep, depEur, vol, state: trig ? 'SWAP' : dep >= 0.6 * S.devalTh ? 'WATCH' : 'STABLE', share, from: base[0][0], to: last(base)[0], path: base.filter((_, i) => i % 5 === 0 || i === base.length - 1).map(x => [x[0], (x[1] / first) * 100]) });
  }
  rows.sort((a, b) => b.dep - a.dep);
  return { rows, asOf: last(r.USD)[0] };
}
export const FX_STATES = {
  SWAP: { tone: 'crit', label: 'Swap line open', desc: 'Depreciation beyond the trigger: the swap line is open and the reserve share in PHX is raised.' },
  WATCH: { tone: 'warn', label: 'Watch', desc: 'Depreciation above three fifths of the trigger: monitored.' },
  STABLE: { tone: 'good', label: 'Stable', desc: 'Depreciation below three fifths of the trigger: reserve share at its normal level.' },
};

// ---- 8. Debt conversion into PHX bonds ----------------------------------------------------------------
// The PHX bond pays the lowest euro-area ten-year yield plus a margin. The saving is the yield difference
// on the converted share, and reaches its full value only once the whole share has fallen due.
export function debtSwap(data, cells, S) {
  const d = data.debt;
  if (!d?.yields || !d?.debt) return null;
  const imf = data.imf?.countries || data.weo?.countries || {};
  const rows = [];
  for (const c of cells) {
    const geo = c.euCode || (c.eu ? c.id : null);
    const y = geo ? last(d.yields[geo]) : null, dbt = geo ? last(d.debt[geo]) : null;
    if (!y || !dbt) continue;
    rows.push({ c, geo, yield: y[1], yieldPeriod: y[0], debtPct: dbt[1], debtPeriod: dbt[0], debt: dbt[1] / 100 * c.gdp });
  }
  if (!rows.length) return null;
  const eaRows = rows.filter(r => r.c.ea);
  const ref = Math.min(...(eaRows.length ? eaRows : rows).map(r => r.yield));
  const rate = ref + S.swapFee;
  for (const r of rows) {
    r.spread = r.yield - ref;
    r.cut = Math.max(0, r.yield - rate);
    r.converted = S.swapShare / 100 * r.debt;
    r.saving = r.converted * r.cut / 100;            // € bn a year once fully converted
    r.savingY1 = r.saving / S.swapMaturity;          // first year: only maturing debt is exchanged
    r.savingPct = r.c.gdp ? r.saving / r.c.gdp * 100 : 0;
    const g = (imf[r.c.iso3]?.growth || []).find(x => +x[0] === r.c.refYear)?.[1] ?? null;
    r.growth = g;
    r.payFactor = g == null ? 1 : clamp(1 + S.gdpLink * (g - (r.c.gPot ?? 1.5)), 0.5, 1.5);
  }
  rows.sort((a, b) => b.saving - a.saving);
  return { rows, ref, rate, total: rows.reduce((s, r) => s + r.saving, 0), totalY1: rows.reduce((s, r) => s + r.savingY1, 0), converted: rows.reduce((s, r) => s + r.converted, 0) };
}

// ---- 9. Stability fund: allocation by measured need, paid in tranches ---------------------------------
export function stabilityFund(cells, P, S) {
  if (cells.length < 2) return null;
  const uAvg = wmean(cells, c => c.unemp), xAvg = wmean(cells, c => c.x0 ?? 0);
  const rows = cells.map(c => {
    const need = needIndex(c, c.pi, c.x0 ?? 0, P);
    const uGap = c.unemp == null || uAvg == null ? null : c.unemp - uAvg;
    const eligible = uGap != null && uGap > S.fundUGap || (c.x0 ?? 0) < xAvg - 1.5;
    return { c, need, uGap, xGap: (c.x0 ?? 0) - xAvg, eligible, why: uGap != null && uGap > S.fundUGap ? 'unemployment' : (c.x0 ?? 0) < xAvg - 1.5 ? 'output gap' : null };
  });
  const el = rows.filter(r => r.eligible);
  // Shares in proportion to need × economic size, so the support per unit of GDP rises with need.
  const tot = el.reduce((s, r) => s + r.need * r.c.gdp, 0);
  for (const r of rows) {
    r.alloc = r.eligible && tot ? S.fundSize * r.need * r.c.gdp / tot : 0;
    r.first = r.alloc * S.fundFirst / 100;
    r.pctGdp = r.c.gdp ? r.alloc / r.c.gdp * 100 : 0;
  }
  rows.sort((a, b) => b.alloc - a.alloc || b.need - a.need);
  return { rows, uAvg, xAvg, eligible: el.length, first: el.reduce((s, r) => s + r.first, 0) };
}

// ---- 10. Proportional recall and the conversion ladder ------------------------------------------------
// The recalled share grows with the size of the breach; what is recalled goes to the Digital Euro, to
// cash when markets are short of liquidity, or — in a crisis and within an annual cap — to the Dragon reserve.
export function recallLadder({ pi, phx, P, S, vol, health, m3 }) {
  const breach = pi != null && pi >= S.recallTh;
  const share = breach ? Math.min(S.recallMax, S.recallBase + S.recallSlope * (pi - S.recallTh)) : 0;
  const amount = phx * share / 100;
  const crisis = pi != null && pi >= P.piCrisis || health?.state === 'ALERT';
  const shortage = vol?.state === 'RELEASE';
  const dragon = crisis ? Math.min(amount, phx * S.dragonCap / 100) : 0;
  const cash = shortage ? 0.2 * (amount - dragon) : 0;
  const digitalEuro = amount - dragon - cash;
  const rule = !breach ? 'No recall: inflation is below the recall trigger.'
    : crisis ? 'Crisis: the Dragon reserve takes its capped share first.' : shortage ? 'Markets are short of liquidity: a fifth is paid out in cash.' : 'Normal: everything recalled becomes Digital Euro.';
  // Circulation weights of PHX and the euro (M3), which sum to 100.
  const wPhx = m3 && phx >= 0 ? 100 * phx / (phx + m3) : null;
  return { breach, share, amount, dragon, cash, digitalEuro, crisis, shortage, rule, wPhx, wEur: wPhx == null ? null : 100 - wPhx,
    wAfter: m3 && phx >= 0 ? 100 * (phx - amount) / (phx - amount + m3 + digitalEuro + cash) : null };
}

// ---- 11. Thematic funds: one live official indicator each, allocation by gap × size -------------------
// gapOf returns how far an economy is on the wrong side of the fund's benchmark (0 = not eligible).
const med = a => { const v = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const geoOf = c => c.euCode || (c.eu ? c.id : null);
export const THEME_FUNDS = [
  { k: 'jobs', title: 'Employment and recovery fund', unit: 'pp', indicator: 'Unemployment above its natural rate', uses: 'Job creation, training and support for new firms where unemployment is above its natural rate.',
    value: c => (c.unemp == null ? null : c.unemp - (c.uBar ?? c.unemp)), bench: () => 0.5, gap: (v, b) => Math.max(0, v - b), source: 'Eurostat / IMF' },
  { k: 'export', title: 'Export support fund', unit: '% of GDP', indicator: 'Current-account balance', uses: 'Export credit at the reference rate, export insurance and trade logistics for economies with an external deficit.',
    value: c => c.ca ?? null, bench: () => -1, gap: (v, b) => Math.max(0, b - v), source: 'IMF' },
  { k: 'banks', title: 'Bank liquidity facility', unit: '%', indicator: 'Non-performing loans ratio', uses: 'Liquidity against collateral and a standing swap line for banking systems with weak loan books; drawn only in stress.',
    value: (c, d) => last(d.banks?.npl?.[geoOf(c)])?.[1] ?? null, bench: (vals) => { const m = med(vals); return m == null ? null : 1.5 * m; }, gap: (v, b) => Math.max(0, v - b), source: 'ECB banking supervision' },
  { k: 'ageing', title: 'Ageing and welfare fund', unit: 'per 100', indicator: 'Old-age dependency ratio', uses: 'Pensions, health and care services where people aged 65 and over are many relative to those of working age.',
    value: (c, d) => last(d.struct?.old?.[geoOf(c)])?.[1] ?? null, bench: vals => med(vals), gap: (v, b) => Math.max(0, v - b), source: 'Eurostat' },
  { k: 'research', title: 'Productivity and research fund', unit: '% of GDP', indicator: 'Research and development spending', uses: 'Research, development and technology adoption where spending is below the European 3% objective.',
    value: (c, d) => last(d.struct?.rd?.[geoOf(c)])?.[1] ?? null, bench: () => 3, gap: (v, b) => Math.max(0, b - v), source: 'Eurostat' },
  { k: 'green', title: 'Green and digital infrastructure fund', unit: '%', indicator: 'Renewable share of energy use', uses: 'Renewable generation, grids and digital networks where the renewable share is below the European 42.5% objective for 2030.',
    value: (c, d) => last(d.struct?.ren?.[geoOf(c)])?.[1] ?? null, bench: () => 42.5, gap: (v, b) => Math.max(0, b - v), source: 'Eurostat' },
  { k: 'uk', title: 'United Kingdom trade adjustment fund', unit: '% of GDP', indicator: 'Exports of goods and services to the United Kingdom', uses: 'Customs, compliance and market-diversification costs of exporters most exposed to trade with the United Kingdom.',
    value: (c, d) => { const r = d.struct?.uk?.[geoOf(c)]; return r && r.length >= 4 && c.gdp ? r.slice(-4).reduce((s, x) => s + x[1], 0) / 1000 / c.gdp * 100 : null; }, bench: vals => med(vals), gap: (v, b) => Math.max(0, v - b), source: 'Eurostat' },
];
export function themeFunds(data, cells, S) {
  return THEME_FUNDS.map(f => {
    const vals = cells.map(c => f.value(c, data));
    const bench = f.bench(vals);
    const rows = cells.map((c, i) => ({ c, value: vals[i], gap: vals[i] == null || bench == null ? 0 : f.gap(vals[i], bench) })).filter(r => r.value != null);
    const tot = rows.reduce((s, r) => s + r.gap * r.c.gdp, 0);
    for (const r of rows) { r.alloc = tot ? S.themeSize * r.gap * r.c.gdp / tot : 0; r.pctGdp = r.c.gdp ? r.alloc / r.c.gdp * 100 : 0; }
    rows.sort((a, b) => b.alloc - a.alloc || b.gap - a.gap);
    return { ...f, bench, rows, covered: rows.length, eligible: rows.filter(r => r.gap > 0).length };
  });
}

// ---- 12. Where PHX above the wallets' capacity goes -------------------------------------------------
// Excess PHX is locked into instruments rather than paid out in cash: time deposits, PHX bonds and the
// strategic investment fund (infrastructure, green technology, innovation), with the Dragon reserve capped.
export const SINKS = [
  { k: 'deposits', label: 'Time deposits (12–36 months)', share: 0.3, note: 'Convertible into Digital Euro at maturity, with a premium for waiting.' },
  { k: 'bonds', label: 'PHX bonds', share: 0.3, note: 'Government and project bonds denominated in PHX, including green bonds.' },
  { k: 'infra', label: 'Investment fund: infrastructure', share: 0.15, note: 'Transport, energy grids and digital networks.' },
  { k: 'green', label: 'Investment fund: green technology', share: 0.15, note: 'Renewable energy, efficiency and carbon capture; settles carbon credits.' },
  { k: 'innov', label: 'Investment fund: innovation', share: 0.1, note: 'Research centres, grants and competitions.' },
];
export function saturationSinks(excess, phx, S, crisis = false) {
  const dragon = crisis ? Math.min(excess, phx * S.dragonCap / 100) : 0;
  const rest = Math.max(0, excess - dragon);
  return { excess, dragon, rows: [...SINKS.map(k => ({ ...k, amount: rest * k.share })), { k: 'dragon', label: 'Dragon reserve', share: excess ? dragon / excess : 0, amount: dragon, note: crisis ? 'Crisis: capped share of PHX in circulation.' : 'Closed outside a crisis.' }] };
}

// ---- 13. Currency credits: what 100 placed twelve months ago is worth today, by type ------------------
export function creditTypes(data, cells, basket) {
  const pi = wmean(cells, c => c.piOfficial ?? c.pi);
  const y10 = last(data.markets?.y10)?.[1] ?? null, estr = last(data.markets?.estr)?.[1] ?? null;
  const row = (k, label, value, basis, use) => ({ k, label, value, basis, use });
  return [
    row('hedge', 'Inflation-hedge credit', pi == null ? null : 100 * (1 + pi / 100), 'Indexed to consumer prices', 'Protects cash converted into PHX from inflation.'),
    row('stab', 'Stabilisation credit', y10 == null ? null : 100 * (1 + y10 / 100), 'Pays the 10-year AAA euro yield', 'Earned when funds move from volatile assets into PHX.'),
    row('commodity', 'Commodity-linked credit', basket?.credit ?? null, 'Follows the commodity basket in euro', 'A hedge for buyers and producers of commodities.'),
    row('invest', 'Investment-incentive credit', estr == null ? null : 100 * (1 + (estr + 0.5) / 100), 'Overnight rate plus half a point', 'Paid on surplus funds placed in PHX instruments.'),
    row('loyalty', 'Loyalty and cashback credit', 100 + cashReward(100) + 0.5, 'Half a percent of purchases plus the conversion premium', 'Rewards paying in PHX instead of cash.'),
  ];
}

// ---- Everything at once, and the states that are written to the audit ledger when they change --------
export function programmes(data, cells, P, S, { phx = 0, excess = 0, names = {} } = {}) {
  const vol = volatilityIndex(data, S);
  const board = triggerBoard(data, cells, P, S);
  const health = healthIndex(cells, P, S, vol);
  const m3 = last(data.money?.m3Stock)?.[1];
  const basket = commodityBasket(data, S);
  const recall = recallLadder({ pi: board.pi, phx, P, S, vol, health, m3: m3 ? m3 / 1000 : null });
  return {
    board, vol, health, cash: cashExcess(data), basket, bubble: bubbleMonitor(data, cells, S),
    fx: devaluationMonitor(data, S, names), swap: debtSwap(data, cells, S), fund: stabilityFund(cells, P, S),
    recall, themes: themeFunds(data, cells, S), credits: creditTypes(data, cells, basket),
    sinks: saturationSinks(excess, phx, S, recall.crisis),
  };
}
// Flat map of state keys, e.g. { 'trigger': 'CLEAR', 'commodity:gold': 'ABOVE', 'housing:PT': 'SIGNAL' }.
// Only states that mean an intervention would start or stop are tracked for housing and currencies.
export function programmeStates(pr) {
  const out = { trigger: pr.board.state };
  if (pr.vol.state !== 'NA') out.volatility = pr.vol.state;
  if (pr.health.state !== 'NA') out.health = pr.health.state;
  for (const it of pr.basket?.items || []) out[`commodity:${it.k}`] = it.state === 'NEAR' ? 'INSIDE' : it.state;
  for (const r of pr.bubble?.rows || []) out[`housing:${r.c.id}`] = r.n >= 2 ? r.state : 'CALM';
  for (const r of pr.fx?.rows || []) out[`currency:${r.ccy}`] = r.state === 'SWAP' ? 'SWAP' : 'STABLE';
  out.recall = pr.recall.breach ? 'RECALL' : 'NONE';
  return out;
}
export const QUIET = new Set(['CLEAR', 'CALM', 'STABLE', 'INSIDE', 'NONE']);
