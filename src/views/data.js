import { h, icon, ago, dateTime, download, toast } from '../ui/dom.js';
import { card } from '../ui/charts.js';
import { CONNECTORS, SERVER_SOURCES } from '../data/sources.js';
import { MIRRORS } from '../data/store.js';
import { pageHead, explain } from './common.js';

const STATE = {
  live: ['good', 'Live'], snapshot: ['warn', 'Snapshot'], cached: ['warn', 'Stored'], stale: ['serious', 'Stale (refresh failed)'],
  error: ['crit', 'Unavailable'], loading: ['info', 'Refreshing…'], idle: ['info', 'Waiting'],
};

// The application's own checks, run on the device in hand: a phone or tablet is tested where it is
// used, not only on the machines the application is built on. The report stays until the page is left.
let deviceReport = null, deviceBusy = false;
async function checkDevice(app) {
  const out = [];
  const attempt = async (name, fn) => { try { out.push({ name, ok: true, note: await fn() }); } catch (e) { out.push({ name, ok: false, note: String(e?.message || e) }); } };
  await attempt('Every page draws', () => {
    const bad = [];
    for (const r of app.routes) {
      const box = document.createElement('div');
      try { r.view(box, app); if (!box.childElementCount) bad.push(r.label); } catch (e) { bad.push(`${r.label} (${e.message})`); }
    }
    if (bad.length) throw new Error(`could not draw ${bad.join(', ')}`);
    return `${app.routes.length} pages with today’s data`;
  });
  await attempt('Fits the screen', () => {
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (over > 1) throw new Error(`this page is ${over}px wider than the screen`);
    return `${innerWidth} × ${innerHeight} points, no sideways scrolling`;
  });
  await attempt('Ledger signatures', async () => {
    const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const msg = new TextEncoder().encode('phoenix'), alg = { name: 'ECDSA', hash: 'SHA-256' };
    if (!(await crypto.subtle.verify(alg, key.publicKey, await crypto.subtle.sign(alg, key.privateKey, msg), msg))) throw new Error('a signature made here did not verify');
    return 'ECDSA P-256 signs and verifies';
  });
  await attempt('Storage on the device', () => new Promise((done, fail) => {
    const name = 'phx-device-check', open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('t');
    open.onerror = () => fail(new Error('the browser refused storage (private browsing?)'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('t', 'readwrite');
      tx.objectStore('t').put(42, 'k');
      const get = tx.objectStore('t').get('k');
      tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase(name); get.result === 42 ? done('writes and reads back') : fail(new Error('a stored value did not read back')); };
      tx.onerror = () => fail(new Error('a write failed'));
    };
  }));
  await attempt('Background computation', () => new Promise((done, fail) => {
    let w;
    try { w = globalThis.PHX_MC_SRC ? new Worker(URL.createObjectURL(new Blob([globalThis.PHX_MC_SRC], { type: 'text/javascript' }))) : new Worker(new URL('mc.js', document.baseURI)); }
    catch (e) { return fail(new Error('the stress-test worker could not start')); }
    w.onerror = () => { w.terminate(); fail(new Error('the stress-test worker could not start')); };
    setTimeout(() => { w.terminate(); done('the stress-test worker starts'); }, 800);
  }));
  await attempt('Mathematics', () => {
    if (typeof MathMLElement === 'undefined') throw new Error('this browser does not draw MathML; formulas appear as text');
    return 'formulas are drawn natively';
  });
  await attempt('Offline copy', () => (globalThis.PHX_MC_SRC ? 'single-file edition: everything is in this file'
    : navigator.serviceWorker?.controller ? 'stored: opens without a connection' : 'not stored yet: open the app once more, or install it'));
  await attempt('Official data', () => {
    const st = Object.values(app.status || {}), live = st.filter(x => x.state === 'live').length, held = st.filter(x => x.at || x.state === 'snapshot' || x.state === 'cached').length;
    if (!live && !held) throw new Error('no source has answered and nothing is stored');
    return `${live} of ${st.length} sources refreshed live in this session`;
  });
  return { at: new Date().toISOString(), rows: out, device: navigator.userAgent };
}

export function data(root, app) {
  const SERVER = { imf: { label: 'IMF World Economic Outlook (current vintage)', provider: 'IMF DataMapper via cloud refresh', cadence: 'Twice yearly', home: 'https://www.imf.org/external/datamapper/' }, brent: { label: 'Brent crude oil, daily, US$', provider: 'FRED / U.S. EIA via cloud refresh', cadence: 'Daily (business days)', home: 'https://fred.stlouisfed.org/series/DCOILBRENTEU' }, oilm: { label: 'Brent crude oil, monthly, US$', provider: 'FRED / U.S. EIA via cloud refresh', cadence: 'Monthly', home: 'https://fred.stlouisfed.org/series/MCOILBRENTEU' }, rates: { label: 'Central-bank policy rates', provider: 'BIS via cloud refresh', cadence: 'Monthly', home: 'https://data.bis.org/topics/CBPOL' } };
  const list = [...CONNECTORS, ...Object.keys(SERVER_SOURCES).map(id => ({ id, ...(SERVER[id] || { label: id, provider: 'Cloud refresh', cadence: '–', home: '#' }) }))];
  const storage = h('span', null, '…');
  navigator.storage?.estimate?.().then(e => { storage.textContent = `${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1073741824).toFixed(1)} GB available`; }).catch(() => { storage.textContent = 'unknown'; });
  const persisted = h('span', null, '…');
  navigator.storage?.persisted?.().then(p => { persisted.textContent = p ? 'Protected from automatic clean-up' : 'Best-effort (browser may clear under pressure)'; }).catch(() => { persisted.textContent = 'unknown'; });

  root.append(
    pageHead('Data & status', 'Where every number comes from, how fresh it is, and how the app keeps working offline.',
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: app.refreshing, onclick: () => app.refresh() }, icon('refresh', 16), app.refreshing ? 'Refreshing…' : 'Refresh now'),
        h('button', { class: 'btn btn-ghost', onclick: () => download('phoenix-data.json', JSON.stringify({ exportedAt: new Date().toISOString(), data: app.data }, null, 1)) }, icon('download', 16), 'Export data'))),
    card({ title: 'Live sources', sub: 'Fetched directly by your browser from each publisher, every time the app opens and every 15 minutes while it is open; sources marked “via cloud refresh” are fetched by the refresh services and reach the app in the baseline snapshots, re-read hourly (Solutions §3.1)',
      body: h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl tbl-src' },
        h('thead', null, h('tr', null, [['Source', 'The data series; the link opens the publisher’s page.'], ['Publisher', 'Who publishes it and by which route it reaches the app.'], ['Release cadence', 'How often the publisher releases new figures.'], ['Status', 'Whether this copy was fetched in this session, comes from a snapshot or from this device, or could not be refreshed.'], ['Retrieved', 'When this copy was fetched from the publisher.'], ['Publisher update (where reported)', 'When the publisher last updated the dataset, where it says so.']].map(([c, tip]) => h('th', { scope: 'col', 'data-tip': tip }, c)))),
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
        h('dt', null, 'Baseline snapshots'), h('dd', null, app.snapshotInfo?.all?.length ? h('ul', { class: 'mirrors' }, app.snapshotInfo.all.map(x => h('li', null, `${/workers\.dev/.test(x.from) ? 'Cloudflare refresh worker (one source group every 10 min; each source checked hourly)' : /embedded/.test(x.from) ? 'Embedded in this file' : 'App host (GitHub cloud job, hourly)'}: ${ago(x.builtAt)}`))) : 'Not loaded'),
        h('dt', null, 'On-device storage'), h('dd', null, storage),
        h('dt', null, 'Persistence'), h('dd', null, persisted, ' ', h('button', { class: 'chip', onclick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected.' : 'The browser declined; install the app to improve persistence.'); app.rerender(); } }, 'Protect')),
        h('dt', null, 'App shell'), h('dd', null, navigator.serviceWorker?.controller ? 'Cached for offline and airplane mode' : 'Will be cached after first load')) }),
      card({ title: 'Mirrors', sub: 'Identical copies on independent hosts. If one is unavailable, use another; installed apps keep running regardless.',
        body: MIRRORS.length ? h('ul', { class: 'mirrors' }, MIRRORS.map(m => h('li', null, icon('link', 14), h('a', { href: m, target: '_blank', rel: 'noopener noreferrer' }, m.replace(/^https:\/\//, ''))))) : h('p', { class: 'sub' }, 'No mirrors configured.') })),
    card({ title: 'Check this device', sub: 'Runs the application’s own checks on the phone, tablet or computer in your hand, in a few seconds. Nothing leaves the device.',
      actions: h('button', { class: 'btn btn-s', disabled: deviceBusy, 'data-tip': 'Draws every page, signs and verifies, writes to storage and starts the background worker on this device, and reports each result.', onclick: async e => {
        deviceBusy = true; e.currentTarget.disabled = true; e.currentTarget.lastChild.textContent = 'Checking…';
        try { deviceReport = await checkDevice(app); } finally { deviceBusy = false; app.rerender(); }
      } }, icon('check', 16), h('span', null, deviceBusy ? 'Checking…' : deviceReport ? 'Run again' : 'Run the checks')),
      body: deviceReport ? h('div', { class: 'device-report', role: 'status' },
        h('p', null, h('span', { class: ['badge', deviceReport.rows.every(r => r.ok) ? 't-good' : 't-crit'] }, deviceReport.rows.every(r => r.ok) ? 'All checks passed' : `${deviceReport.rows.filter(r => !r.ok).length} of ${deviceReport.rows.length} checks failed`), ' ', h('small', { class: 'muted' }, dateTime(deviceReport.at))),
        h('dl', { class: 'io' }, deviceReport.rows.flatMap(r => [h('dt', null, h('span', { class: ['badge', r.ok ? 't-good' : 't-crit'] }, r.ok ? 'Pass' : 'Fail'), ' ', r.name), h('dd', null, r.note)])),
        h('p', { class: 'sub' }, deviceReport.device))
        : h('p', { class: 'sub' }, 'Every page drawn with today’s data, the screen width, ledger signatures, storage, the background worker, formulas, the offline copy and the data sources — each reported as pass or fail for this device.') }),
    explain('How freshness works',
      h('p', null, 'The model runs entirely in your browser. Your browser requests each dataset straight from Eurostat, the ECB, the World Bank, DBnomics and INSEE (and the ECB’s daily reference exchange rates through Frankfurter, an open relay of them), stores the result on your device, and recomputes everything locally.'),
      h('p', null, 'Two independent cloud services rebuild the baseline (including the current IMF vintage and Brent crude, whose publishers do not accept requests from browsers, and central-bank policy rates): a Cloudflare worker refreshes one of six groups of sources every 10 minutes, so each source hourly, and a GitHub job rebuilds it hourly and republishes every mirror. The app takes the newest copy of each source from both, so either can be down. The anchor log for the audit ledger runs on the same Cloudflare worker; if it is down, anchoring waits but the app keeps working.'),
      h('p', null, 'Official statistics arrive at their publishers’ pace (inflation monthly, sector accounts quarterly, central-bank liquidity weekly). Between releases, inflation is nowcast daily from oil prices in euro and the euro exchange rate, so contract states move with markets every business day; each figure shows whether it is official or nowcast.')));
}
