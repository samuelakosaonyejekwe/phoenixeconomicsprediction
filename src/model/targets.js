// Inflation targets of the EU central banks with their own target (§3.6, §5.1, §6.2): today's targets as anchors for live data, and the target in force at each past date for estimation and backtests.
export const TARGETS = { PL: 2.5, HU: 3, RO: 2.5, CZ: 2, SE: 2 };
// Inflation target in force in a month (§6.2), from the central banks' own records: year-end targets apply
// to their year. CNB: net inflation 4.5% ± 1 (end-2000) and 2–4% (end-2001); a band declining linearly from 3–5% (January 2002) to
// 2–4% (December 2005); 3% from 2006; 2% from 2010. MNB: 7% (2001, also used before inflation targeting began in June 2001), 4.5%, 3.5%, 3.5%, 4%, 3.5% (2006);
// 3% from 2007. NBP: 5.4–6.8% (2000), 6–8% (2001), 5% ± 1 for 2002 (revised to 3% ± 1 in June 2002), 3% (2003); 2.5% from 2004. BNR: 7.5% (2005, the first
// target, also used before inflation targeting began in August 2005), 5%, 4%, 3.8%, 3.5%, 3.5%, 3%, 3%
// (2012); 2.5% from 2013. Riksbank: 2%. Other economies: 2%. Midpoints of ranges and bands.
const TARGET_YEARS = {
  HU: { 2001: 7, 2002: 4.5, 2003: 3.5, 2004: 3.5, 2005: 4, 2006: 3.5 },
  PL: { 2000: 6.1, 2001: 7, 2002: 5, 2003: 3 },
  RO: { 2005: 7.5, 2006: 5, 2007: 4, 2008: 3.8, 2009: 3.5, 2010: 3.5, 2011: 3, 2012: 3 },
};
export function targetAt(eu, month) {
  const y = +String(month).slice(0, 4), m = +String(month).slice(5, 7) || 12;
  if (eu === 'CZ') {
    if (y <= 2000) return 4.5;
    if (y === 2001) return 3;
    if (y <= 2005) return 4 - ((y - 2002) * 12 + m - 1) / 47;
    return y <= 2009 ? 3 : 2;
  }
  if (eu === 'PL' && y === 2002) return m < 6 ? 5 : 3;
  const t = TARGET_YEARS[eu];
  if (t) {
    const ys = Object.keys(t).map(Number);
    if (y < Math.min(...ys)) return t[Math.min(...ys)];
    if (t[y] != null) return t[y];
  }
  return TARGETS[eu] ?? 2;
}
