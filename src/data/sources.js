// Live data connectors. Isomorphic: runs in every visitor's browser (direct CORS
// requests to the publishers) and in Node for the scheduled snapshot build.
import { EU, GLOBAL } from './geo.js';

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
const ECB = 'https://data-api.ecb.europa.eu/service/data/';
const WB = 'https://api.worldbank.org/v2/country/';
const DBN = 'https://api.db.nomics.world/v22/series/';
const IMF_DM = 'https://www.imf.org/external/datamapper/api/v1/';

export async function getJSON(url, { timeout = 20000, retries = 2, text = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      // Servers identify themselves (some publishers refuse anonymous clients). Browsers fetch with simple
      // CORS requests only: conditional revalidation headers would trigger preflights the publishers reject.
      const server = typeof window === 'undefined';
      const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', ...(server ? { headers: { 'user-agent': 'Mozilla/5.0 (compatible; PhoenixEconomics/1.0; +https://phoenixeconomics.pages.dev)', accept: '*/*' } } : {}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return text ? await res.text() : await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 600 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const num = v => (v === null || v === undefined || v === '' || v === 'NA' || Number.isNaN(+v) ? null : +v);

// JSON-stat 2.0 (Eurostat) -> { geo: [[period, value], ...] } sorted by period.
// Every dimension other than geo/time must have been filtered to a single member.
export function parseJsonStat(js) {
  const ids = js.id, size = js.size, stride = new Array(ids.length);
  let acc = 1;
  for (let k = ids.length - 1; k >= 0; k--) { stride[k] = acc; acc *= size[k]; }
  const gi = ids.indexOf('geo'), ti = ids.indexOf('time');
  const geoIdx = js.dimension.geo.category.index, timeIdx = js.dimension.time.category.index;
  const out = {};
  for (const [geo, g] of Object.entries(geoIdx)) {
    const rows = [];
    for (const [time, t] of Object.entries(timeIdx)) {
      const v = num(js.value[g * stride[gi] + t * stride[ti]]);
      if (v !== null) rows.push([time, v]);
    }
    rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (rows.length) out[geo] = rows;
  }
  return { series: out, updated: js.updated || null };
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function ecbSeries(key, n, timeout = 20000, startPeriod = null) {
  // detail=dataonly leaves out the descriptive columns, a quarter of the size for long daily series.
  const text = await getJSON(`${ECB}${key}?${startPeriod ? `startPeriod=${startPeriod}` : `lastNObservations=${n}`}&format=csvdata&detail=dataonly`, { text: true, timeout });
  const rows = parseCSV(text);
  const h = rows[0], ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  return rows.slice(1).map(r => [r[ti], num(r[vi])]).filter(r => r[1] !== null);
}

// One ECB series per reference area (country wildcard in the key) -> { geo: [[period, value], ...] },
// with the ECB's GR written as Eurostat's EL.
async function ecbByArea(key, n, timeout = 40000) {
  const rows = parseCSV(await getJSON(`${ECB}${key}?lastNObservations=${n}&format=csvdata`, { text: true, timeout }));
  const h = rows[0], ai = h.indexOf('REF_AREA'), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  const out = {};
  for (const r of rows.slice(1)) { const v = num(r[vi]); if (v !== null) (out[r[ai] === 'GR' ? 'EL' : r[ai]] ||= []).push([r[ti], v]); }
  for (const k in out) out[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return out;
}

function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const yearsAgoQ = n => `${new Date().getUTCFullYear() - n}-Q1`;

const eurostat = (ds, params) => getJSON(`${EUROSTAT}${ds}?${params}`).then(parseJsonStat);

// International commodity prices (INSEE, monthly) for the commodity basket. `per` is the number of quoted
// units in one US dollar (100 for prices quoted in cents); `each` is the physical unit.
const INSEE = 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/';
const INSEE_EURUSD = '010002053'; // euros per US dollar
export const COMMODITIES = [
  { k: 'brent', id: '010002077', label: 'Brent crude oil', unit: 'US$ per barrel', each: 'barrel', group: 'Energy' },
  { k: 'gold', id: '010002061', label: 'Gold', unit: 'US$ per ounce', each: 'ounce', group: 'Precious metals' },
  { k: 'wheat', id: '010002046', label: 'Wheat', unit: 'US¢ per bushel', per: 100, each: 'bushel', group: 'Agriculture' },
  { k: 'maize', id: '010002058', label: 'Maize', unit: 'US¢ per bushel', per: 100, each: 'bushel', group: 'Agriculture' },
  { k: 'copper', id: '010002052', label: 'Copper', unit: 'US$ per tonne', each: 'tonne', group: 'Industrial metals' },
];
// SDMX-ML (structure-specific) -> { idbank: [[period, value], ...] } sorted by period.
export function parseInsee(xml) {
  const out = {};
  for (const m of String(xml).matchAll(/<Series\b[^>]*\bIDBANK="(\d+)"[^>]*>([\s\S]*?)<\/Series>/g)) {
    const rows = [];
    for (const o of m[2].matchAll(/<Obs\b[^>]*>/g)) {
      const t = /TIME_PERIOD="([^"]+)"/.exec(o[0]), v = /OBS_VALUE="([^"]+)"/.exec(o[0]);
      if (t && v && num(v[1]) !== null) rows.push([t[1], +v[1]]);
    }
    rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (rows.length) out[m[1]] = rows;
  }
  return out;
}
// Currencies of the global panel and of the EU economies outside the euro that the ECB publishes daily.
export const FX_HISTORY = ['USD', 'CAD', 'MXN', 'BRL', 'GBP', 'CHF', 'NOK', 'PLN', 'TRY', 'ZAR', 'INR', 'CNY', 'JPY', 'KRW', 'IDR', 'SGD', 'AUD', 'SEK', 'DKK', 'CZK', 'HUF', 'RON'];

// Each connector: id, label, provider, cadence, home page, run() -> data.
export const CONNECTORS = [
  {
    id: 'hicp', label: 'HICP inflation, monthly, all EU states', provider: 'Eurostat', cadence: 'Monthly (flash + final)',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table',
    run: () => eurostat('prc_hicp_minr', 'coicop18=TOTAL&unit=RCH_A&sinceTimePeriod=1997-01'),
  },
  {
    id: 'gov', label: 'General government net lending (+) / borrowing (−), % GDP', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/gov_10q_ggnfa/default/table',
    run: () => eurostat('gov_10q_ggnfa', 'na_item=B9&unit=PC_GDP&sector=S13&s_adj=SCA&sinceTimePeriod=1999-Q1'),
  },
  {
    id: 'hhsave', label: 'Household gross saving rate, %', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasq_10_ki/default/table',
    run: () => eurostat('nasq_10_ki', 'na_item=SRG_S14_S15&sector=S14_S15&s_adj=SCA&sinceTimePeriod=1999-Q1'),
  },
  {
    id: 'profit', label: 'Corporate (non-financial) profit share, %', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasq_10_ki/default/table',
    run: () => eurostat('nasq_10_ki', 'na_item=B2G_B3G_RAT_S11&sector=S11&s_adj=SCA&sinceTimePeriod=1999-Q1'),
  },
  {
    id: 'hhinc', label: 'Household gross disposable income, quarterly, € million', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasq_10_nf_tr/default/table',
    run: () => eurostat('nasq_10_nf_tr', 'na_item=B6G&sector=S14_S15&direct=PAID&unit=CP_MEUR&s_adj=SCA&sinceTimePeriod=1999-Q1'),
  },
  {
    id: 'nfcgva', label: 'Non-financial corporations’ gross value added, quarterly, € million', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasq_10_nf_tr/default/table',
    run: () => eurostat('nasq_10_nf_tr', 'na_item=B1G&sector=S11&direct=PAID&unit=CP_MEUR&s_adj=SCA&sinceTimePeriod=1999-Q1'),
  },
  {
    id: 'unemp', label: 'Unemployment rate, monthly, %', provider: 'Eurostat', cadence: 'Monthly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table',
    run: () => eurostat('une_rt_m', `s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&sinceTimePeriod=${monthsAgo(24)}`),
  },
  {
    id: 'gdp', label: 'GDP at current prices, € million', provider: 'Eurostat', cadence: 'Annual',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nama_10_gdp/default/table',
    run: () => eurostat('nama_10_gdp', 'na_item=B1GQ&unit=CP_MEUR&sinceTimePeriod=1999'),
  },
  {
    id: 'ecb', label: 'ECB deposit facility rate (daily, since 2014) and Eurosystem deposit-facility holdings (weekly)', provider: 'European Central Bank', cadence: 'Daily / weekly',
    home: 'https://data.ecb.europa.eu/',
    run: async () => {
      const [dfrDaily, liq] = await Promise.all([
        ecbSeries('FM/D.U2.EUR.4F.KR.DFR.LEV', 0, 60000, '2014-01-01'),
        ecbSeries('ILM/W.U2.C.L020200.U2.EUR', 104),
      ]);
      // Deposit-facility rate at each month end, from 2014 (covers the past-episode scenario and its validation).
      const byM = new Map();
      for (const [d, v] of dfrDaily) byM.set(d.slice(0, 7), v);
      return { dfr: dfrDaily.slice(-1), liq, dfrM: [...byM.entries()] };
    },
  },
  {
    id: 'fx', label: 'Euro reference exchange rates (ECB)', provider: 'ECB reference rates via Frankfurter; ECB Data Portal as fallback', cadence: 'Daily',
    home: 'https://frankfurter.dev/',
    run: async () => {
      try {
        const d = await getJSON('https://api.frankfurter.dev/v1/latest', { retries: 1 });
        return { base: 'EUR', date: d.date, rates: { EUR: 1, ...d.rates } };
      } catch {
        const cur = ['USD', 'GBP', 'CHF', 'JPY', 'CNY', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON'];
        const rows = await Promise.all(cur.map(c => ecbSeries(`EXR/D.${c}.EUR.SP00.A`, 1).then(r => [c, r.at(-1)])));
        return { base: 'EUR', date: rows.find(r => r[1])?.[1]?.[0] ?? null, rates: { EUR: 1, ...Object.fromEntries(rows.filter(r => r[1]).map(([c, r]) => [c, r[1]])) } };
      }
    },
  },
  {
    id: 'markets', label: 'Daily markets: €STR, 10-year AAA yield, EUR/USD (one year)', provider: 'European Central Bank; EUR/USD reference rates via Frankfurter', cadence: 'Daily (business days)',
    home: 'https://data.ecb.europa.eu/',
    run: async () => {
      // A year of trading days: the volatility index compares the last 20 with the months before them.
      const since = new Date(Date.now() - 370 * 864e5).toISOString().slice(0, 10);
      const [estr, y10, fx] = await Promise.all([
        ecbSeries('EST/B.EU000A2X2A25.WT', 260, 40000),
        ecbSeries('YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y', 260, 40000),
        getJSON(`https://api.frankfurter.dev/v1/${since}..?symbols=USD`, { retries: 1 }).then(d => Object.entries(d.rates).map(([day, r]) => [day, r.USD])).catch(() => ecbSeries('EXR/D.USD.EUR.SP00.A', 260, 40000)),
      ]);
      return { estr, y10, eurusd: fx };
    },
  },
  {
    id: 'energyw', label: 'Energy weight in each HICP basket, ‰', provider: 'Eurostat', cadence: 'Annual',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_iw/default/table',
    run: () => eurostat('prc_hicp_iw', 'coicop18=NRG&sinceTimePeriod=1997'),
  },
  {
    id: 'wb', label: 'World Bank WDI: inflation, savings, current account, money growth, GDP, population', provider: 'World Bank', cadence: 'Annual',
    home: 'https://data.worldbank.org/',
    run: async () => {
      const codes = [...new Set([...GLOBAL.map(c => c.iso3), ...EU.map(c => c.iso3)])].join(';');
      const inds = { infl: 'FP.CPI.TOTL.ZG', save: 'NY.GNS.ICTR.ZS', ca: 'BN.CAB.XOKA.GD.ZS', m2: 'FM.LBL.BMNY.ZG', gdp: 'NY.GDP.MKTP.CD', unemp: 'SL.UEM.TOTL.ZS', pop: 'SP.POP.TOTL' };
      const out = {};
      await Promise.all(Object.entries(inds).map(async ([k, ind]) => {
        const d = await getJSON(`${WB}${codes}/indicator/${ind}?format=json&mrv=12&per_page=2000`);
        for (const r of d[1] || []) {
          if (r.value === null) continue;
          ((out[r.countryiso3code] ||= {})[k] ||= []).push([r.date, r.value]);
        }
      }));
      for (const c of Object.values(out)) for (const k in c) c[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return out;
    },
  },
  {
    id: 'weo', label: 'IMF World Economic Outlook, latest release on DBnomics (backup only: the model uses the current IMF DataMapper vintage)', provider: 'IMF via DBnomics', cadence: 'As republished by DBnomics',
    home: 'https://db.nomics.world/IMF',
    run: async () => {
      const countries = [...new Set([...GLOBAL.map(c => c.iso3), ...EU.map(c => c.iso3)])];
      const dims = encodeURIComponent(JSON.stringify({ 'weo-subject': ['PCPIPCH', 'GGXCNL_NGDP', 'BCA_NGDPD', 'NGDPD', 'LUR', 'NGDP_RPCH'], 'weo-country': countries }));
      const d = await getJSON(`${DBN}IMF/WEO:latest?dimensions=${dims}&observations=1&limit=1000`);
      const map = { PCPIPCH: 'infl', GGXCNL_NGDP: 'gov', BCA_NGDPD: 'ca', NGDPD: 'gdp', LUR: 'unemp', NGDP_RPCH: 'growth' };
      const out = {};
      for (const s of d.series.docs) {
        const [iso, subj] = s.series_code.split('.');
        const rows = s.period.map((p, i) => [p, num(s.value[i])]).filter(r => r[1] !== null);
        (out[iso] ||= {})[map[subj]] = rows;
      }
      return { vintage: d.series.docs[0]?.dataset_code || d._meta?.args?.dataset_code || 'WEO', countries: out };
    },
  },
  {
    id: 'hicpx', label: 'HICP energy and core (all items excluding energy): annual rates since 1997, energy index', provider: 'Eurostat', cadence: 'Monthly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table',
    run: async () => {
      const keep = new Set([...EU.map(c => c.eu), 'EU27_2020', 'EA20', 'EA21', 'EA']);
      const pick = d => Object.fromEntries(Object.entries(d.series).filter(([g]) => keep.has(g)));
      const [nrg, core, idx] = await Promise.all([
        eurostat('prc_hicp_minr', 'coicop18=NRG&unit=RCH_A&sinceTimePeriod=1997-01'),
        eurostat('prc_hicp_minr', 'coicop18=TOT_X_NRG&unit=RCH_A&sinceTimePeriod=1997-01'),
        eurostat('prc_hicp_minr', 'coicop18=NRG&unit=I15&sinceTimePeriod=1998-01'),
      ]);
      return { energy: pick(nrg), core: pick(core), energyIndex: pick(idx) };
    },
  },
  {
    id: 'finacc', label: 'Financial transactions by sector: currency and deposits (F2) and total (quarterly, € million)', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasq_10_f_tr/default/table',
    run: async () => {
      const out = {};
      await Promise.all([['hh', 'S14_S15'], ['nfc', 'S11'], ['gov', 'S13']].flatMap(([k, sec]) => ['F2', 'F21', 'F22', 'F_TR'].map(async item => {
        const d = await eurostat('nasq_10_f_tr', `na_item=${item}&sector=${sec}&finpos=ASS&unit=MIO_EUR&sinceTimePeriod=1999-Q1`);
        (out[k] ||= {})[item] = d.series;
      })));
      return out;
    },
  },
  {
    id: 'sectA', label: 'Annual sector accounts: household saving rate and disposable income, corporate profit share and value added', provider: 'Eurostat', cadence: 'Annual',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/nasa_10_ki/default/table',
    run: async () => {
      const [save, prof, inc, gva] = await Promise.all([
        eurostat('nasa_10_ki', 'na_item=SRG_S14_S15&sector=S14_S15&unit=PC&sinceTimePeriod=2010'),
        eurostat('nasa_10_ki', 'na_item=B2G_B3G_RAT_S11&sector=S11&unit=PC&sinceTimePeriod=2010'),
        eurostat('nasa_10_nf_tr', 'na_item=B6G&sector=S14_S15&direct=PAID&unit=CP_MEUR&sinceTimePeriod=2010'),
        eurostat('nasa_10_nf_tr', 'na_item=B1G&sector=S11&direct=PAID&unit=CP_MEUR&sinceTimePeriod=2010'),
      ]);
      return { save: save.series, profit: prof.series, inc: inc.series, gva: gva.series };
    },
  },
  {
    id: 'expect', label: 'Inflation expectations (ECB SPF, long term), euro-area forward rates, monthly EUR/USD', provider: 'European Central Bank', cadence: 'Daily / monthly / quarterly',
    home: 'https://data.ecb.europa.eu/',
    run: async () => {
      // One request per curve (the six maturities joined in the key) instead of one per maturity: the
      // connector no longer fails because a single small request timed out.
      const months = { IF_3M: 3, IF_6M: 6, IF_9M: 9, IF_1Y: 12, IF_2Y: 24, IF_3Y: 36 };
      const curveKey = `YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${Object.keys(months).join('+')}`;
      const curve = async query => {
        const rows = parseCSV(await getJSON(`${ECB}${curveKey}?${query}&format=csvdata&detail=dataonly`, { text: true, timeout: 60000 }));
        const h = rows[0], di = h.indexOf('DATA_TYPE_FM'), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
        const lastBy = {};
        for (const r of rows.slice(1)) { const v = num(r[vi]); if (v !== null && months[r[di]] && (!lastBy[r[di]] || r[ti] > lastBy[r[di]][0])) lastBy[r[di]] = [r[ti], v]; }
        const pts = Object.entries(lastBy).map(([m, [day, v]]) => [months[m], v, day]).sort((a, b) => a[0] - b[0]);
        return { date: pts.map(p => p[2]).sort().pop(), curve: pts.map(p => [p[0], p[1]]) };
      };
      const [spf, forwards, eurusdM, forwardsEpisode] = await Promise.all([
        ecbSeries('SPF/Q.U2.HICP.POINT.LT.Q.AVG', 40, 60000),
        curve('lastNObservations=1'),
        ecbSeries('EXR/M.USD.EUR.SP00.A', 340, 90000),
        // Forward curve at the start of the December 2021 reference episode (§7.2).
        curve('startPeriod=2021-12-24&endPeriod=2021-12-31'),
      ]);
      return { spf, forwards, forwardsEpisode, eurusdM };
    },
  },
  {
    id: 'commod', label: 'International commodity prices: Brent, gold, wheat, maize, copper (monthly, US$) and the euro–dollar rate', provider: 'INSEE (international prices of imported raw materials)', cadence: 'Monthly',
    home: 'https://www.insee.fr/en/statistiques/serie/010002077',
    run: async () => {
      const ids = [...COMMODITIES.map(c => c.id), INSEE_EURUSD].join('+');
      const by = parseInsee(await getJSON(`${INSEE}${ids}?startPeriod=2005-01`, { text: true, timeout: 40000 }));
      const series = Object.fromEntries(COMMODITIES.map(c => [c.k, by[c.id] || []]).filter(([, r]) => r.length));
      if (Object.keys(series).length < 3) throw new Error('INSEE returned too few commodity series');
      return { series, eurPerUsd: by[INSEE_EURUSD] || [] };
    },
  },
  {
    id: 'money', label: 'Euro-area money and credit: M3 and M1 growth, currency in circulation, loans to households and firms', provider: 'European Central Bank', cadence: 'Monthly',
    home: 'https://data.ecb.europa.eu/publications/money-credit-and-banking',
    run: async () => {
      const keys = { m3: 'BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A', m1: 'BSI/M.U2.Y.V.M10.X.I.U2.2300.Z01.A', m3Stock: 'BSI/M.U2.Y.V.M30.X.1.U2.2300.Z01.E', cash: 'BSI/M.U2.N.V.L10.X.1.U2.2300.Z01.E', hhLoans: 'BSI/M.U2.Y.U.A20.A.I.U2.2250.Z01.A', nfcLoans: 'BSI/M.U2.Y.U.A20.A.I.U2.2240.Z01.A' };
      const rows = await Promise.all(Object.entries(keys).map(([k, key]) => ecbSeries(key, 300, 40000).then(r => [k, r])));
      return Object.fromEntries(rows);
    },
  },
  {
    id: 'debt', label: 'Government debt, % of GDP (quarterly) and 10-year government bond yields (monthly)', provider: 'Eurostat', cadence: 'Quarterly / monthly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/gov_10q_ggdebt/default/table',
    run: async () => {
      const [debt, yields] = await Promise.all([
        eurostat('gov_10q_ggdebt', 'na_item=GD&sector=S13&unit=PC_GDP&sinceTimePeriod=2015-Q1'),
        eurostat('irt_lt_mcby_m', 'int_rt=MCBY&sinceTimePeriod=2015-01'),
      ]);
      return { debt: debt.series, yields: yields.series, updated: yields.updated };
    },
  },
  {
    id: 'house', label: 'House price index: annual rate of change and level (2015 = 100)', provider: 'Eurostat', cadence: 'Quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hpi_q/default/table',
    run: async () => {
      const [rch, idx] = await Promise.all([
        eurostat('prc_hpi_q', 'purchase=TOTAL&unit=RCH_A&sinceTimePeriod=2006-Q1'),
        eurostat('prc_hpi_q', 'purchase=TOTAL&unit=I15_Q&sinceTimePeriod=2005-Q1'),
      ]);
      return { rch: rch.series, idx: idx.series, updated: rch.updated };
    },
  },
  {
    id: 'fxh', label: 'Euro reference exchange rates, daily, last 13 months', provider: 'ECB reference rates via Frankfurter', cadence: 'Daily (business days)',
    home: 'https://frankfurter.dev/',
    run: async () => {
      const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
      const d = await getJSON(`https://api.frankfurter.dev/v1/${since}..?symbols=${FX_HISTORY.join(',')}`, { timeout: 30000 });
      const rates = {};
      for (const [day, r] of Object.entries(d.rates).sort((a, b) => (a[0] < b[0] ? -1 : 1))) for (const [c, v] of Object.entries(r)) (rates[c] ||= []).push([day, v]);
      return { base: 'EUR', rates };
    },
  },
  {
    id: 'banks', label: 'Bank soundness by country: non-performing loans ratio of significant institutions', provider: 'European Central Bank', cadence: 'Quarterly',
    home: 'https://data.ecb.europa.eu/data/datasets/SUP',
    run: async () => {
      return { npl: await ecbByArea('SUP/Q..W0._Z.I7000._T.SII._Z._Z._Z.PCT.C', 12) };
    },
  },
  {
    id: 'struct', label: 'Structural indicators: old-age dependency, research spending, renewable energy, exports to the United Kingdom', provider: 'Eurostat', cadence: 'Annual / quarterly',
    home: 'https://ec.europa.eu/eurostat/databrowser/explore/all/all_themes',
    run: async () => {
      const [old, rd, ren, uk] = await Promise.all([
        eurostat('demo_pjanind', 'indic_de=OLDDEP1&sinceTimePeriod=2015'),
        eurostat('rd_e_gerdtot', 'sectperf=TOTAL&unit=PC_GDP&sinceTimePeriod=2015'),
        eurostat('nrg_ind_ren', 'nrg_bal=REN&unit=PC&sinceTimePeriod=2015'),
        eurostat('bop_c6_q', 'partner=UK&bop_item=GS&stk_flow=CRE&currency=MIO_EUR&sector10=S1&sectpart=S1&sinceTimePeriod=2019-Q1'),
      ]);
      return { old: old.series, rd: rd.series, ren: ren.series, uk: uk.series };
    },
  },
];

// Server-side only (no CORS): daily Brent crude, last ~200 days.
export async function brentDaily() {
  // FRED's official spot series (U.S. EIA). If it is unreachable the previous snapshot is kept.
  const text = await getJSON('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU', { text: true, timeout: 30000, retries: 2 });
  const rows = text.trim().split('\n').slice(1).map(l => l.split(',')).map(([d, v]) => [d, num(v)]).filter(r => r[1] !== null);
  if (rows.length < 20) throw new Error('FRED DCOILBRENTEU returned too few observations');
  return { series: rows.slice(-200), source: 'FRED DCOILBRENTEU (U.S. EIA Brent spot)' };
}

// Server-side only (no CORS): monthly Brent since 1998 (FRED, U.S. EIA). If it is unreachable the previous
// snapshot is kept.
export async function oilMonthly() {
  const text = await getJSON('https://fred.stlouisfed.org/graph/fredgraph.csv?id=MCOILBRENTEU', { text: true, timeout: 30000, retries: 2 });
  const rows = text.trim().split('\n').slice(1).map(l => l.split(',')).map(([d, v]) => [d.slice(0, 7), num(v)]).filter(r => r[1] !== null && r[0] >= '1998');
  if (rows.length < 100) throw new Error('FRED MCOILBRENTEU returned too few observations');
  return { series: rows, source: 'FRED MCOILBRENTEU (U.S. EIA Brent spot, monthly average)' };
}

// Central-bank policy rates (BIS), monthly, for the global panel; fetched by the refresh services.
// Economies of the global panel whose policy rates the BIS publishes (UAE, Egypt, Nigeria, Kenya and
// Singapore are not covered: their policy rate follows the Taylor rule of §4.10).
export const ISO2 = { USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', GBR: 'GB', CHE: 'CH', NOR: 'NO', POL: 'PL', TUR: 'TR', RUS: 'RU', SAU: 'SA', ZAF: 'ZA', IND: 'IN', CHN: 'CN', JPN: 'JP', KOR: 'KR', IDN: 'ID', AUS: 'AU', SWE: 'SE', DNK: 'DK', CZE: 'CZ', HUN: 'HU', ROU: 'RO' };
export async function policyRates() {
  const codes = [...new Set(Object.values(ISO2))].join('+');
  const text = await getJSON(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.${codes}?lastNObservations=3&format=csv`, { text: true, timeout: 40000 });
  const rows = parseCSV(text), h = rows[0], ai = h.indexOf('REF_AREA'), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  const by2 = Object.fromEntries(Object.entries(ISO2).map(([a, b]) => [b, a]));
  const out = {};
  for (const r of rows.slice(1)) { const v = num(r[vi]); if (v !== null && by2[r[ai]]) (out[by2[r[ai]]] ||= []).push([r[ti], v]); }
  for (const k in out) out[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { rates: out, source: 'BIS central bank policy rates (WS_CBPOL)' };
}

// Sources fetched by the refresh services and delivered to browsers in the snapshot: the IMF and FRED do
// not allow cross-origin requests, and the BIS is kept with them so that every browser need not ask it.
export const SERVER_SOURCES = { imf: () => imfDataMapper(), brent: () => brentDaily(), oilm: () => oilMonthly(), rates: () => policyRates() };

// Server-side only (no CORS): current IMF DataMapper vintage, used by the snapshot build.
export async function imfDataMapper() {
  const map = { PCPIPCH: 'infl', GGXCNL_NGDP: 'gov', BCA_NGDPD: 'ca', NGDPD: 'gdp', LUR: 'unemp', NGDP_RPCH: 'growth' };
  const want = new Set([...GLOBAL.map(c => c.iso3), ...EU.map(c => c.iso3)]);
  const out = {};
  for (const [ind, key] of Object.entries(map)) {
    const d = await getJSON(`${IMF_DM}${ind}`, { timeout: 60000 });
    for (const [iso, years] of Object.entries(d.values[ind])) {
      if (!want.has(iso)) continue;
      (out[iso] ||= {})[key] = Object.entries(years).map(([y, v]) => [y, num(v)]).filter(r => r[1] !== null && +r[0] >= 1999);
    }
  }
  let vintage = 'IMF DataMapper (current WEO)';
  try { const meta = await getJSON(`${IMF_DM}indicators`, { timeout: 30000 }); vintage = `IMF DataMapper, ${meta.indicators?.PCPIPCH?.source || 'current WEO'}`; } catch {}
  return { vintage, countries: out };
}
