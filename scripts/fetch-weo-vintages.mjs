// Fetches one World Economic Outlook vintage per year 2009–2025 (October; April for 2011 and 2025) (IMF, via DBnomics) for the EU
// economies: real GDP growth, unemployment and inflation, as published at the time. Used for the
// real-time output gaps of Phoenix Economics Solutions (§3.5, §5.2, §7.2).
import { writeFile } from 'node:fs/promises';
import { EU } from '../src/data/geo.js';
const out = { source: 'IMF World Economic Outlook, one vintage per year (October; April for 2011 and 2025), via DBnomics', vintages: {} };
const map = { NGDP_RPCH: 'growth', LUR: 'unemp', PCPIPCH: 'infl' };
// October vintages; where DBnomics has no October release, the April release of that year is used.
const codes = []; for (let y = 2009; y <= 2025; y++) codes.push([y, y === 2011 || y === 2025 ? `${y}-04` : `${y}-10`]);
for (const [y, vin] of codes) {
  const code = `WEO:${vin}`;
  const dims = encodeURIComponent(JSON.stringify({ 'weo-subject': Object.keys(map), 'weo-country': EU.map(c => c.iso3) }));
  try {
    const r = await fetch(`https://api.db.nomics.world/v22/series/IMF/${code}?dimensions=${dims}&observations=1&limit=1000`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const v = {};
    for (const s of d.series?.docs || []) {
      const [iso, subj] = s.series_code.split('.');
      (v[iso] ||= {})[map[subj]] = s.period.map((p, i) => [+p, s.value[i]]).filter(r => typeof r[1] === 'number' && r[0] >= 1995);
    }
    out.vintages[String(y)] = { release: vin, data: v };
    if (Object.keys(v).length < EU.length - 2) throw new Error(`only ${Object.keys(v).length} economies`);
    console.log(code, Object.keys(v).length);
  } catch (e) { console.error(code, 'failed:', e.message); process.exitCode = 1; }
}
// The paper's archived vintages are replaced only when every vintage was fetched completely.
if (process.exitCode) { console.error('Not written: at least one vintage failed.'); process.exit(1); }
await writeFile(new URL('../paper/weo-vintages.json', import.meta.url), JSON.stringify(out));
