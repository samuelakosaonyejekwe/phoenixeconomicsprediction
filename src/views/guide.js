import { h, icon } from '../ui/dom.js';
import { card } from '../ui/charts.js';
import { pageHead } from './common.js';

export function guide(root, app) {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  root.append(
    pageHead('Guide', 'Get going in a minute, install the app, and use it anywhere — including offline.'),
    card({ title: 'Install Phoenix', sub: installed ? 'Installed — you are running the app.' : 'Works on Windows, macOS, Linux, ChromeOS, Android and iPhone / iPad.',
      body: h('div', { class: 'install' },
        app.canInstall ? h('button', { class: 'btn btn-l', onclick: () => app.install() }, icon('download', 18), 'Install now') : null,
        h('div', { class: 'grid-3' },
          h('div', { class: ['how', ios && 'hl'] }, h('h4', null, 'iPhone & iPad (Safari)'), h('ol', null, h('li', null, 'Tap the Share button.'), h('li', null, 'Choose “Add to Home Screen”.'), h('li', null, 'Tap “Add”.'))),
          h('div', { class: 'how' }, h('h4', null, 'Android (Chrome, Edge, Samsung Internet)'), h('ol', null, h('li', null, 'Tap “Install” above, or open the browser menu.'), h('li', null, 'Choose “Install app” or “Add to Home screen”.'))),
          h('div', { class: 'how' }, h('h4', null, 'Computer (Chrome, Edge, Brave, Opera)'), h('ol', null, h('li', null, 'Click “Install” above or the install icon in the address bar.'), h('li', null, 'Firefox and Safari: bookmark it, or on macOS Safari use File → Add to Dock.')))),
        h('p', { class: 'sub' }, 'Once opened, the whole app is stored on your device. It starts instantly and works in airplane mode, using the latest data it has stored.')) }),
    h('div', { class: 'grid-2' },
      card({ title: 'Quick start', body: h('ol', { class: 'steps' },
        h('li', null, h('b', null, 'Choose a region'), ' — euro area, EU or global — in the top bar.'),
        h('li', null, h('b', null, 'Overview'), ' shows which economies would trigger Phoenix today and the inflation outlook with and without it.'),
        h('li', null, h('b', null, 'Surplus radar'), ' measures excess deposits of households, firms and governments against their historical threshold; tune the weights and the threshold.'),
        h('li', null, h('b', null, 'Simulation lab'), ' runs the coupled model: excess deposits, contracts, credits, wallets, output gap, energy and core inflation, and the policy rate. Pick a scenario — including the EU-27 as of 31 December 2021 — adjust parameters, play back the map, compare regimes and stress-test.'),
        h('li', null, h('b', null, 'Redistribution'), ' shows liquidity routing, wallets, saturation and recall.'),
        h('li', null, h('b', null, 'Contracts & audit'), ' lists contract states and the tamper-evident ledger.'),
        h('li', null, h('b', null, 'Early warning'), ' flags breaches before they happen.'),
        h('li', null, h('b', null, 'Framework'), ' and ', h('b', null, 'Evidence'), ' explain the mathematics and show the paper’s results; Evidence reproduces them in your browser from the archived data. Section references (Solutions §…) are to Phoenix Economics Solutions.')) }),
      card({ title: 'Shortcuts', body: h('dl', { class: 'io' },
        h('dt', null, h('kbd', null, 'Ctrl'), ' ', h('kbd', null, 'K'), ' or ', h('kbd', null, '/')), h('dd', null, 'Search pages and economies'),
        h('dt', null, h('kbd', null, 'G'), ' then a number'), h('dd', null, 'Jump to page 1–9'),
        h('dt', null, h('kbd', null, '←'), ' ', h('kbd', null, '→')), h('dd', null, 'Move along a focused chart'),
        h('dt', null, h('kbd', null, 'R')), h('dd', null, 'Refresh live data'),
        h('dt', null, 'Table'), h('dd', null, 'Every chart has a table view for exact values and screen readers')) })),
    card({ title: 'Questions', body: h('div', { class: 'faq' },
      ...[
        ['Is the data real?', 'Yes. Inflation and its energy and core components, sector financial accounts, unemployment, GDP, central-bank rates, forward curves, exchange rates and IMF forecasts come from the official publishers. The Data page lists each source with its timestamp.'],
        ['Is PHX a real currency?', 'No. PHX is a programmable claim — a tokenised deposit at a commercial bank, redeemable at par — as set out in Phoenix Economics Solutions (§2.1); it never creates money. This application implements the framework on real economic data so its behaviour can be examined, tested and compared; it does not move money.'],
        ['What do the tags next to parameters mean?', 'D: estimated from data (the Phillips curve on the EU panel, output-gap persistence, the threshold); L: taken from the empirical literature (multiplier, Taylor rule, spending out of savings); P: a policy design choice, such as the trigger or the absorption cap; M: to be measured by the randomised trials; N: a numerical setting. Solutions Table 6 lists every parameter with its source.'],
        ['How can inflation be “today” when statistics are monthly?', 'Between official releases each economy’s inflation is nowcast every business day from Brent crude in euro (scaled by that country’s energy weight) and the euro exchange rate. The official figure and the nowcast are both shown; the nowcast can be switched off in the lab.'],
        ['Does anything I do leave my device?', 'Settings, the audit ledger and stored data stay in your browser. When the app is first opened it registers this device’s signing key in the ledger and anchors that entry automatically; later anchors happen when you press Anchor. Each anchor sends only the SHA-256 hash of the chain head, its signature and this device’s public key to the Phoenix anchor service, which enters them in the public Sigstore Rekor transparency log. No ledger contents or personal data are sent. Other requests go to the public data publishers, Rekor (to verify anchors) and the app’s own host.'],
        ['How much does Phoenix lower inflation?', 'Immeasurably little. Started from the data published at the end of 2021, its effect on EU inflation would have been about a thousandth of a percentage point, first down and later up as credits matured; the exact figures, reproduced from the archived data, are on the Evidence page (Solutions §7.2). Absorbed money would mostly not have been spent soon, a euro of spending raises output by less than a euro, and core inflation responds moderately to output. Today the EU’s excess deposits are below their historical threshold, so Phoenix is dormant. What it does is measure idle money, manage exceptional stocks under legal control, warn early and keep a verifiable record (Solutions §7).'],
        ['What if the website is down?', 'An installed app keeps working from your device. The app is also published on several independent mirrors listed on the Data page.'],
      ].map(([q, a]) => h('details', null, h('summary', null, q), h('p', null, a)))) }));
}
