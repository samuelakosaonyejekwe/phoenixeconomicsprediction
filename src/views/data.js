import { h, icon, ago, dateTime, download, toast } from '../ui/dom.js';
import { card } from '../ui/charts.js';
import { CONNECTORS } from '../data/sources.js';
import { MIRRORS } from '../data/store.js';
import { pageHead, explain } from './common.js';

const STATE = {
  live: ['good', 'Live'], snapshot: ['warn', 'Snapshot'], cached: ['warn', 'Stored'], stale: ['serious', 'Stale (refresh failed)'],
  error: ['crit', 'Unavailable'], loading: ['info', 'Refreshing…'], idle: ['info', 'Waiting'],
};

export function data(root, app) {
  const list = [...CONNECTORS, { id: 'imf', label: 'IMF World Economic Outlook (current vintage)', provider: 'IMF DataMapper via hourly cloud refresh', cadence: 'Twice yearly', home: 'https://www.imf.org/external/datamapper/' }, { id: 'brent', label: 'Brent crude oil, daily, US$', provider: 'FRED / U.S. EIA (fallback: ICE Brent futures) via cloud refresh', cadence: 'Daily (business days)', home: 'https://fred.stlouisfed.org/series/DCOILBRENTEU' }, { id: 'oilm', label: 'Brent crude oil, monthly, US$', provider: 'FRED / U.S. EIA via cloud refresh', cadence: 'Monthly', home: 'https://fred.stlouisfed.org/series/MCOILBRENTEU' }, { id: 'rates', label: 'Central-bank policy rates', provider: 'BIS via cloud refresh', cadence: 'Monthly', home: 'https://data.bis.org/topics/CBPOL' }];
  const storage = h('span', null, '…');
  navigator.storage?.estimate?.().then(e => { storage.textContent = `${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1073741824).toFixed(1)} GB available`; }).catch(() => { storage.textContent = 'unknown'; });
  const persisted = h('span', null, '…');
  navigator.storage?.persisted?.().then(p => { persisted.textContent = p ? 'Protected from automatic clean-up' : 'Best-effort (browser may clear under pressure)'; }).catch(() => { persisted.textContent = 'unknown'; });

  root.append(
    pageHead('Data & status', 'Where every number comes from, how fresh it is, and how the app keeps working offline.',
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: app.refreshing, onclick: () => app.refresh() }, icon('refresh', 16), app.refreshing ? 'Refreshing…' : 'Refresh now'),
        h('button', { class: 'btn btn-ghost', onclick: () => download('phoenix-data.json', JSON.stringify({ exportedAt: new Date().toISOString(), data: app.data }, null, 1)) }, icon('download', 16), 'Export data'))),
    card({ title: 'Live sources', sub: 'Fetched directly by your browser from each publisher, every time the app opens and every 15 minutes while it is open; sources marked “via cloud refresh” cannot be fetched by browsers and come from the refresh services (Solutions §3.1)',
      body: h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Source', 'Publisher', 'Release cadence', 'Status', 'Retrieved', 'Publisher update (where reported)'].map(c => h('th', { scope: 'col' }, c)))),
        h('tbody', null, list.map(c => {
          const st = app.status[c.id] || { state: 'idle' }, [tone, label] = STATE[st.state] || STATE.idle;
          const upd = app.data[c.id]?.updated;
          return h('tr', null,
            h('th', { scope: 'row' }, h('a', { href: c.home, target: '_blank', rel: 'noopener noreferrer' }, c.label)),
            h('td', null, c.provider), h('td', null, c.cadence),
            h('td', null, h('span', { class: ['badge', `t-${tone}`] }, label), st.ms ? h('small', { class: 'muted' }, ` ${st.ms} ms`) : null, st.error ? h('small', { class: 'note' }, st.error) : null),
            h('td', null, st.at ? h('time', { datetime: st.at, title: dateTime(st.at) }, ago(st.at)) : '–'),
            h('td', null, upd ? dateTime(upd) : '–'));
        })))) }),
    h('div', { class: 'grid-2' },
      card({ title: 'Resilience', body: h('dl', { class: 'io' },
        h('dt', null, 'Connection'), h('dd', null, navigator.onLine ? 'Online' : 'Offline — running from stored data'),
        h('dt', null, 'Baseline snapshots'), h('dd', null, app.snapshotInfo?.all?.length ? h('ul', { class: 'mirrors' }, app.snapshotInfo.all.map(x => h('li', null, `${/workers\.dev/.test(x.from) ? 'Cloudflare refresh worker (one source group every 10 min; each source hourly)' : /embedded/.test(x.from) ? 'Embedded in this file' : 'App host (GitHub cloud job, hourly)'}: ${ago(x.builtAt)}`))) : 'Not loaded'),
        h('dt', null, 'On-device storage'), h('dd', null, storage),
        h('dt', null, 'Persistence'), h('dd', null, persisted, ' ', h('button', { class: 'chip', onclick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected.' : 'The browser declined; install the app to improve persistence.'); app.rerender(); } }, 'Protect')),
        h('dt', null, 'App shell'), h('dd', null, navigator.serviceWorker?.controller ? 'Cached for offline and airplane mode' : 'Will be cached after first load')) }),
      card({ title: 'Mirrors', sub: 'Identical copies on independent hosts. If one is unavailable, use another; installed apps keep running regardless.',
        body: MIRRORS.length ? h('ul', { class: 'mirrors' }, MIRRORS.map(m => h('li', null, icon('link', 14), h('a', { href: m, target: '_blank', rel: 'noopener noreferrer' }, m.replace(/^https:\/\//, ''))))) : h('p', { class: 'sub' }, 'No mirrors configured.') })),
    explain('How freshness works',
      h('p', null, 'The model runs entirely in your browser. Your browser requests each dataset straight from Eurostat, the ECB, the World Bank and DBnomics, stores the result on your device, and recomputes everything locally.'),
      h('p', null, 'Two independent cloud services rebuild the baseline (including the current IMF vintage and daily Brent crude, which browsers cannot fetch directly): a Cloudflare worker refreshes one of six groups of sources every 10 minutes, so each source hourly, and a GitHub job rebuilds it hourly and republishes every mirror. The app takes the newest copy of each source from both, so either can be down. The anchor log for the audit ledger runs on the same Cloudflare worker; if it is down, anchoring waits but the app keeps working.'),
      h('p', null, 'Official statistics arrive at their publishers’ pace (inflation monthly, sector accounts quarterly, central-bank liquidity weekly). Between releases, inflation is nowcast daily from oil prices in euro and the euro exchange rate, so contract states move with markets every business day; each figure shows whether it is official or nowcast.')));
}
