// Daily inflation nowcast (Phoenix Economics Solutions §3.7): bridges the gap between monthly HICP
// releases using daily oil prices in euro and the euro exchange rate:
//
//   π_now = π_official + θ · w_energy · Δ%(Brent in €)  +  θ_fx · Δ%(EUR/USD)   [euro members]
//
// with θ and θ_fx estimated on monthly EU data. Δ% compares the latest five trading days with the
// average of the official reference month.
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function eurOil(brent, eurusd) {
  if (!brent?.length || !eurusd?.length) return [];
  const fx = new Map(eurusd);
  let last = null;
  const out = [];
  const days = [...new Set([...brent.map(r => r[0]), ...eurusd.map(r => r[0])])].sort();
  const bmap = new Map(brent);
  for (const d of days) {
    if (fx.has(d)) last = fx.get(d);
    if (bmap.has(d) && last) out.push([d, bmap.get(d) / last]);
  }
  return out;
}

export function marketDrivers(data) {
  const brent = data.brent?.series || [];
  const eurusd = data.markets?.eurusd || [];
  return { brent, eurusd, oilEur: eurOil(brent, eurusd), estr: data.markets?.estr || [], y10: data.markets?.y10 || [] };
}

const pctChange = (series, refMonth) => {
  const ref = series.filter(r => r[0].startsWith(refMonth)).map(r => r[1]);
  const recent = series.slice(-5).map(r => r[1]);
  const a = avg(ref), b = avg(recent);
  return a && b ? (b / a - 1) * 100 : null;
};

// Coefficients are estimated on monthly EU data (estimateNowcast, §3.7). The change since the
// reference month is base-effect free for a few weeks, so only the current change is applied.
export function nowcastCell(cell, drivers, energyW, coef = { theta: 0.095, fx: -0.009 }) {
  if (!/^\d{4}-\d{2}$/.test(cell.piPeriod || '')) return null;
  const oil = pctChange(drivers.oilEur, cell.piPeriod);
  const usd = pctChange(drivers.eurusd, cell.piPeriod); // + = euro appreciated
  if (oil === null && usd === null) return null;
  const w = (energyW ?? 95) / 1000;
  const oilEff = oil === null ? 0 : w * coef.theta * oil;
  const fxEff = usd === null || !cell.ea ? 0 : coef.fx * usd;
  const asOf = [drivers.oilEur.at(-1)?.[0], drivers.eurusd.at(-1)?.[0]].filter(Boolean).sort().pop();
  return { pi: cell.pi + oilEff + fxEff, oilEff, fxEff, oilPct: oil, usdPct: usd, weight: w, asOf, base: cell.pi, basePeriod: cell.piPeriod, coef };
}
