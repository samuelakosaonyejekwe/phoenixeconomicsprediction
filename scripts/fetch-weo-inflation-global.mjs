// Fetches the IMF World Economic Outlook inflation forecasts (PCPIPCH) of the same vintages as
// fetch-weo-vintages.mjs for the global panel's economies outside the EU, via DBnomics. Used to estimate
// the forecast error behind the global monitor's breach probability (Phoenix Economics Solutions §6.1).
import { writeFile } from 'node:fs/promises';
import { EU, GLOBAL } from '../src/data/geo.js';
const eu = new Set(EU.map(c => c.iso3));
const isos = GLOBAL.map(c => c[0] ?? c.iso3).filter(i => !eu.has(i));
const out = { source: 'IMF World Economic Outlook inflation, one vintage per year (October; April for 2011 and 2025), via DBnomics', vintages: {} };
for (let y = 2009; y <= 2025; y++) {
  const vin = y === 2011 || y === 2025 ? `${y}-04` : `${y}-10`, code = `WEO:${vin}`;
  const dims = encodeURIComponent(JSON.stringify({ 'weo-subject': ['PCPIPCH'], 'weo-country': isos }));
  try {
    const r = await fetch(`https://api.db.nomics.world/v22/series/IMF/${code}?dimensions=${dims}&observations=1&limit=1000`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json(), v = {};
    for (const s of d.series?.docs || []) v[s.series_code.split('.')[0]] = s.period.map((p, i) => [+p, s.value[i]]).filter(r => typeof r[1] === 'number' && r[0] >= 2005);
    if (Object.keys(v).length < isos.length - 2) throw new Error(`only ${Object.keys(v).length} economies`);
    out.vintages[String(y)] = { release: vin, infl: v };
    console.log(code, Object.keys(v).length);
  } catch (e) { console.error(code, 'failed:', e.message); process.exitCode = 1; }
}
if (process.exitCode) { console.error('Not written: at least one vintage failed.'); process.exit(1); }
await writeFile(new URL('../paper/weo-inflation-global.json', import.meta.url), JSON.stringify(out));
