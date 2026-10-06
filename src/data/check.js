// Plausibility check applied before newly fetched data replace a source's previous copy (in the browser,
// the snapshot build and the refresh worker): the data must contain observations, and the latest one must
// be recent for that source's release cadence. A source that fails keeps its previous data.
const MAX_AGE_MONTHS = {
  hicp: 3, hicpx: 3, unemp: 3, energyw: 24, gov: 10, hhsave: 10, profit: 10, hhinc: 10, nfcgva: 10, finacc: 10,
  gdp: 24, sectA: 30, ecb: 2, markets: 2, fx: 2, expect: 6, wb: 36, weo: 36, imf: 36, brent: 2, oilm: 4, rates: 6,
  commod: 4, money: 4, debt: 5, house: 10, fxh: 2, banks: 10, struct: 10,
};

const monthIndex = p => {
  const s = String(p);
  let m = /^(\d{4})-(\d{2})/.exec(s); if (m) return +m[1] * 12 + +m[2] - 1;
  m = /^(\d{4})-Q([1-4])$/.exec(s); if (m) return +m[1] * 12 + (+m[2] * 3 - 1);
  m = /^(\d{4})$/.exec(s); if (m) return +m[1] * 12 + 11;
  return null;
};

// Latest period found in any [period, value] series inside the data.
export function latestPeriod(x, depth = 0) {
  if (depth > 6 || x == null) return null;
  if (Array.isArray(x)) {
    if (x.length && Array.isArray(x[0]) && x[0].length === 2 && monthIndex(x[0][0]) !== null) return Math.max(...x.map(r => monthIndex(r[0]) ?? -Infinity));
    let best = null; for (const v of x.slice(0, 2000)) { const b = latestPeriod(v, depth + 1); if (b !== null && (best === null || b > best)) best = b; } return best;
  }
  if (typeof x === 'object') { let best = null; for (const v of Object.values(x)) { const b = latestPeriod(v, depth + 1); if (b !== null && (best === null || b > best)) best = b; } return best; }
  return null;
}

export function checkSource(id, data, now = new Date()) {
  if (data == null || (typeof data === 'object' && !Object.keys(data).length)) return 'no data';
  const maxAge = MAX_AGE_MONTHS[id];
  if (maxAge == null) return null;
  if (id === 'fx') return data.rates && Object.keys(data.rates).length > 3 ? null : 'too few exchange rates';
  const last = latestPeriod(data);
  if (last === null) return 'no dated observations';
  const age = now.getUTCFullYear() * 12 + now.getUTCMonth() - last;
  return age > maxAge ? `latest observation is ${age} months old (more than ${maxAge})` : null;
}
