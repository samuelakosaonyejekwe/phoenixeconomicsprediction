// Fetches one World Economic Outlook vintage per year 2009–2025 (October; April for 2011 and 2025) (IMF, via DBnomics) for the EU
// economies: real GDP growth, unemployment and inflation, as published at the time; and for the non-EU
// economies of the global panel: real GDP growth and GDP in US dollars. Used for the real-time output gaps
// and the rest-of-world instrument of Phoenix Economics Solutions (§3.5, §5.2, §7.2).
import { writeFile } from 'node:fs/promises';
import { EU, GLOBAL } from '../src/data/geo.js';
const NON_EU = GLOBAL.filter(g => !EU.some(e => e.iso3 === g.iso3)).map(g => g.iso3);
const out = { source: 'IMF World Economic Outlook, one vintage per year (October; April for 2011 and 2025), via DBnomics', vintages: {} };
const map = { NGDP_RPCH: 'growth', LUR: 'unemp', PCPIPCH: 'infl' }, mapW = { NGDP_RPCH: 'growth', NGDPD: 'gdp' };
const series = async (code, subjects, countries, names) => {
  const dims = encodeURIComponent(JSON.stringify({ 'weo-subject': subjects, 'weo-country': countries }));
  const r = await fetch(`https://api.db.nomics.world/v22/series/IMF/${code}?dimensions=${dims}&observations=1&limit=1000`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const v = {};
  for (const s of (await r.json()).series?.docs || []) {
    const [iso, subj] = s.series_code.split('.');
    (v[iso] ||= {})[names[subj]] = s.period.map((p, i) => [+p, s.value[i]]).filter(r => typeof r[1] === 'number' && r[0] >= 1995);
  }
  return v;
};
// October vintages; where DBnomics has no October release, the April release of that year is used.
const codes = []; for (let y = 2009; y <= 2025; y++) codes.push([y, y === 2011 || y === 2025 ? `${y}-04` : `${y}-10`]);
for (const [y, vin] of codes) {
  const code = `WEO:${vin}`;
  try {
    const v = await series(code, Object.keys(map), EU.map(c => c.iso3), map);
    const world = await series(code, Object.keys(mapW), NON_EU, mapW);
    out.vintages[String(y)] = { release: vin, data: v, world };
    if (Object.keys(v).length < EU.length - 2) throw new Error(`only ${Object.keys(v).length} economies`);
    if (Object.values(world).filter(d => d.growth?.length).length < NON_EU.length - 2) throw new Error(`only ${Object.keys(world).length} non-EU economies`);
    console.log(code, Object.keys(v).length, Object.keys(world).length);
  } catch (e) { console.error(code, 'failed:', e.message); process.exitCode = 1; }
}
// The paper's archived vintages are replaced only when every vintage was fetched completely.
if (process.exitCode) { console.error('Not written: at least one vintage failed.'); process.exit(1); }
await writeFile(new URL('../paper/weo-vintages.json', import.meta.url), JSON.stringify(out));
