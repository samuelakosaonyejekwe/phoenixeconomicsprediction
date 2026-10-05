import { h, icon, num, pct, eur, dateTime, download, toast } from '../ui/dom.js';
import { card } from '../ui/charts.js';
import { toCSV } from '../model/ledger.js';
import { PARAM_INDEX } from '../model/params.js';
import { pageHead, badge, STATE_META, explain, empty, objectiveChips, openCountry, sourceLine } from './common.js';
import { slider } from './controls.js';

let kindFilter = 'ALL';

export function contracts(root, app) {
  const cells = app.cells;
  if (!cells.length) return root.append(pageHead('Smart contracts & audit'), empty());
  const P = app.params;
  const rows = cells.map(c => ({ c, st: app.contractState(c) }))
    .sort((a, b) => ['ACTIVE', 'ARMED', 'WATCH', 'DORMANT'].indexOf(a.st.state) - ['ACTIVE', 'ARMED', 'WATCH', 'DORMANT'].indexOf(b.st.state) || b.st.thetaStar - a.st.thetaStar);

  const table = h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Economy', 'State', 'Inflation', 'vs trigger', 'S / S_crit', 'Θ* activation', 'P(breach 12 m)', ''].map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', null, rows.map(({ c, st }) => h('tr', null,
      h('th', { scope: 'row' }, c.name), h('td', null, badge(st.state)), h('td', null, `${pct(c.pi)} `, h('small', { class: 'muted' }, c.piPeriod)),
      h('td', null, `${c.pi - P.piTh >= 0 ? '+' : ''}${num(c.pi - P.piTh, 1)} pp`), h('td', null, `${num(st.rho, 2)}×`),
      h('td', null, h('span', { class: 'mini-bar' }, h('span', { style: { width: `${st.thetaStar * 100}%` } })), ` ${num(st.thetaStar, 2)}`),
      h('td', null, `${num(st.fc.pBreach * 100, 0)}%`),
      h('td', null, h('button', { class: 'chip', onclick: () => openCountry(app, c) }, 'Detail')))))));

  const thresholds = h('div', { class: 'ctrl-grid' }, ['piTh', 'scritMode', 'scritPct', 'trigMode', 'epsPi', 'hyst', 'nu'].map(k => slider(app, PARAM_INDEX[k])));

  // Ledger.
  const list = [...app.ledger].reverse().filter(e => kindFilter === 'ALL' || e.kind === kindFilter);
  const vk = app.ledgerOk;
  const verifyOut = h('span', { class: 'verify' }, vk ? (vk.ok ? h('span', { class: 'badge t-good' }, icon('ok', 14), `Chain intact · ${vk.count} entries, all signed with the registered key${vk.keyPeriods?.length > 1 ? ` (key replaced ${vk.keyPeriods.length - 1}×, each registration recorded)` : ''}${vk.anchorCheck ? ` · ${vk.anchorCheck.matched}/${vk.anchorCheck.checked} anchors verified${vk.anchorCheck.rekorVerified ? ` (${vk.anchorCheck.rekorVerified} directly against Rekor)` : ''}${vk.anchorCheck.unreachable ? ` · ${vk.anchorCheck.unreachable} not verifiable now (log unreachable or offline)` : ''}` : ''}`) : h('span', { class: 'badge t-crit' }, icon('alert', 14), `Failed at #${vk.at}: ${vk.reason}`)) : null);
  const filter = h('div', { class: 'seg' }, [['ALL', 'All'], ['LIVE', 'Live data'], ['SIM', 'Simulation']].map(([k, l]) => h('button', { class: kindFilter === k ? 'on' : '', onclick: () => { kindFilter = k; app.rerender(); } }, l)));
  const ledger = card({
    title: `Audit ledger (${app.ledger.length} entries)`, sub: 'Every trigger records time, cause, amount and indicators; entries are hash-chained, signed on this device (ECDSA P-256) and anchored in the public Sigstore Rekor transparency log (Solutions §9.4).',
    actions: h('div', { class: 'row wrap' }, filter,
      h('button', { class: 'btn btn-s', onclick: () => app.verifyLedger() }, icon('shield', 16), 'Verify'),
      h('button', { class: 'btn btn-s btn-ghost', onclick: async () => { try { await app.anchorLedger(); toast('Chain head entered in the public transparency log; receipt recorded.'); } catch (e) { toast(String(e.message || e)); } } }, icon('db', 16), 'Anchor'),
      h('button', { class: 'btn btn-s btn-ghost', onclick: () => download('phoenix-audit-ledger.csv', toCSV(app.ledger), 'text/csv') }, icon('download', 16), 'CSV'),
      h('button', { class: 'btn btn-s btn-ghost', onclick: () => download('phoenix-audit-ledger.json', JSON.stringify(app.ledger, null, 2)) }, icon('download', 16), 'JSON'),
      h('button', { class: 'btn btn-s btn-ghost', onclick: () => { if (confirm('Clear the local audit ledger on this device?')) { app.clearLedger(); toast('Ledger cleared.'); } } }, 'Clear')),
    body: h('div', null, verifyOut, list.length ? h('ol', { class: 'ledger' }, list.slice(0, 150).map(e => h('li', null,
      h('div', { class: 'lg-top' }, h('span', { class: ['kind', e.kind === 'LIVE' ? 'k-live' : 'k-sim'] }, e.kind), h('b', null, e.cell), h('span', null, e.type.replace(/_/g, ' ')), h('time', { datetime: e.ts }, dateTime(e.ts))),
      h('p', null, e.cause),
      e.converted !== undefined && e.converted !== null ? h('p', { class: 'muted' }, `Converted to date: ${eur(e.converted, 2)}${e.into ? ` · into ${e.into}` : ''}`) : null,
      h('code', { class: 'hash', title: `prev ${e.prev}` }, `#${e.seq} ${e.hash.slice(0, 16)}…`))))
      : h('p', { class: 'sub' }, 'No entries yet. Live state changes are recorded automatically as new official data arrives; simulation events can be logged from the lab.')),
  });

  root.append(
    pageHead('Smart contracts & audit', 'Contract activation from live inflation and the measured excess stock, with a tamper-evident record of every intervention (Solutions §4.3, §9).'),
    h('div', { class: 'state-legend' }, Object.entries(STATE_META).map(([k, m]) => h('div', null, badge(k), h('span', null, m.desc)))),
    card({ title: 'Contract board', sub: 'Θ* is the steady-state activation implied by today’s data', body: table }),
    h('div', { class: 'grid-2' }, card({ title: 'Trigger thresholds', sub: 'Programmable levers (Solutions §4.3, Table 6)', body: thresholds }), ledger),
    explain('Why a hash-chained ledger',
      h('p', null, 'Each entry stores the SHA-256 hash of the entry before it, so editing or deleting any past record breaks every later link. Each entry is also signed with a key created on this device whose private part cannot be exported, so entries cannot be forged. The key is registered in the ledger and anchored as soon as it is created, so replacing it later is visible.'),
      h('p', null, '“Anchor” enters the chain head in Sigstore Rekor, a public append-only transparency log run by a third party. “Verify” checks every link, hash and signature, then fetches each anchor from Rekor itself and checks the recorded hash, signature and key, Rekor’s signed timestamp, the Merkle inclusion proof and the signed checkpoint — without trusting the Phoenix anchor service (Solutions §9.4).'),
      h('p', null, 'A signature proves possession of this device’s key, not who holds it; a mandate-holder would certify its keys with qualified certificates.'),
      h('p', null, 'The ledger lives on this device (IndexedDB) and keeps working offline; exports carry hashes, signatures and receipts so third parties can re-verify independently.')),
    objectiveChips([7, 11]),
    sourceLine(app));
}
