// Plausibility check applied before data replace a source's previous copy (in the browser for live
// fetches, snapshots and stored copies; in the snapshot build; in the refresh worker): the data must
// contain observations, and the latest one of every part the application relies on must be recent for
// its release cadence. A source that fails keeps its previous data.
//
// Limits are in months for whole sources and for their parts (so one fresh series cannot hide a stale
// one), and in days for daily series.
const MAX_AGE_MONTHS = {
  hicp: 3, hicpx: 3, unemp: 3, energyw: 24, gov: 10, hhsave: 10, profit: 10, hhinc: 10, nfcgva: 10, finacc: 10,
  gdp: 24, sectA: 30, ecb: 2, markets: 2, fx: 2, expect: 6, wb: 36, weo: 36, imf: 36, brent: 2, oilm: 4, rates: 6,
  commod: 4, money: 4, debt: 5, house: 10, fxh: 2, banks: 10, struct: 10,
};
const PARTS = {
  hicpx: { energy: 3, core: 3, energyIndex: 3 },
  finacc: { hh: 10, nfc: 10, gov: 10 },
  sectA: { save: 30, profit: 30, inc: 30, gva: 30 },
  ecb: { dfr: 2, liq: 2 },
  markets: { estr: 2, y10: 2, eurusd: 2 },
  expect: { spf: 6, eurusdM: 4 },
  commod: { series: 4, eurPerUsd: 4 },
  money: { m3: 4, m1: 4, m3Stock: 4, cash: 4, hhLoans: 4, nfcLoans: 4 },
  debt: { debt: 10, yields: 5 },
  house: { rch: 10, idx: 10 },
  banks: { npl: 10 },
  struct: { old: 24, rd: 36, ren: 30, uk: 10 },
};
const MAX_AGE_DAYS = { brent: 21, markets: 21, fxh: 21, fx: 10 };

// Both refresh services store numbers to six significant digits, so their snapshots are identical for
// identical publisher data.
export const compact = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toPrecision(6) : v);

const monthIndex = p => {
  const s = String(p);
  let m = /^(\d{4})-(\d{2})/.exec(s); if (m) return +m[1] * 12 + +m[2] - 1;
  m = /^(\d{4})-Q([1-4])$/.exec(s); if (m) return +m[1] * 12 + (+m[2] * 3 - 1);
  m = /^(\d{4})-W(\d{2})$/.exec(s); if (m) return +m[1] * 12 + Math.min(11, Math.floor((+m[2] - 1) * 12 / 53));
  m = /^(\d{4})$/.exec(s); if (m) return +m[1] * 12 + 11;
  return null;
};

// Latest period (as a month index) found in any [period, value] series inside the data.
export function latestPeriod(x, depth = 0) {
  if (depth > 6 || x == null) return null;
  if (Array.isArray(x)) {
    if (x.length && Array.isArray(x[0]) && x[0].length === 2 && monthIndex(x[0][0]) !== null) return Math.max(...x.map(r => monthIndex(r[0]) ?? -Infinity));
    let best = null; for (const v of x.slice(0, 2000)) { const b = latestPeriod(v, depth + 1); if (b !== null && (best === null || b > best)) best = b; } return best;
  }
  if (typeof x === 'object') { let best = null; for (const v of Object.values(x)) { const b = latestPeriod(v, depth + 1); if (b !== null && (best === null || b > best)) best = b; } return best; }
  return null;
}
// Latest calendar day ('YYYY-MM-DD') found anywhere in the data.
function latestDay(x, depth = 0) {
  if (depth > 6 || x == null) return null;
  if (typeof x === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
  if (Array.isArray(x) && x.length && Array.isArray(x[0]) && typeof x[0][0] === 'string') return x.reduce((b, r) => (/^\d{4}-\d{2}-\d{2}$/.test(r[0]) && (!b || r[0] > b) ? r[0] : b), null);
  if (typeof x === 'object') { let best = null; for (const v of Object.values(x)) { const b = latestDay(v, depth + 1); if (b && (!best || b > best)) best = b; } return best; }
  return null;
}

export function checkSource(id, data, now = new Date()) {
  if (data == null || typeof data !== 'object' || !Object.keys(data).length) return 'no data';
  const maxAge = MAX_AGE_MONTHS[id];
  if (maxAge == null) return null;
  const nowM = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const age = (x, limit, what) => {
    const last = latestPeriod(x);
    if (last === null) return `no dated observations${what}`;
    return nowM - last > limit ? `latest observation${what} is ${nowM - last} months old (more than ${limit})` : null;
  };
  if (id === 'fx') {
    if (!data.rates || Object.keys(data.rates).length <= 3) return 'too few exchange rates';
  } else if (id === 'imf' || id === 'weo') {
    // Forecast vintages always contain future years, so the age of the vintage is judged instead: the
    // release named in it where there is one, and otherwise the reach of its projections (the IMF
    // projects five years ahead, so a vintage more than two years old stops short of now + 3).
    const m = /(\d{4})-(\d{2})/.exec(String(data.vintage || ''));
    const reach = latestPeriod(data.countries);
    if (reach === null) return 'no dated observations';
    if (m) { const a = nowM - (+m[1] * 12 + +m[2] - 1); if (a > maxAge) return `vintage ${m[0]} is ${a} months old (more than ${maxAge})`; }
    else if (reach < (now.getUTCFullYear() + 3) * 12) return 'projections stop short of three years ahead: an old vintage';
  } else {
    const bad = age(data, maxAge, '');
    if (bad) return bad;
    for (const [part, limit] of Object.entries(PARTS[id] || {})) { const b = age(data[part], limit, ` of ${part}`); if (b) return b; }
  }
  const days = MAX_AGE_DAYS[id];
  if (days != null) {
    const d = latestDay(id === 'fx' ? data.date : data);
    if (!d) return 'no dated observations';
    const a = Math.floor((now.getTime() - Date.parse(d)) / 864e5);
    if (a > days) return `latest observation is ${a} days old (more than ${days})`;
    if (a < -2) return 'latest observation is dated in the future';
  }
  if (id === 'expect' && !(data.forwards?.curve?.length >= 3)) return 'forward curve missing';
  return null;
}
