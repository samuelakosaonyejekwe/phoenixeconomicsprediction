import { h, icon, clear, toast, ago, hideTip } from './ui/dom.js';
import { createApp, REGIONS } from './app.js';
import { overview } from './views/overview.js';
import { detect } from './views/detect.js';
import { simulate } from './views/simulate.js';
import { redistribute } from './views/redistribute.js';
import { contracts } from './views/contracts.js';
import { forecast } from './views/forecast.js';
import { stability } from './views/stability.js';
import { framework } from './views/framework.js';
import { validate } from './views/validate.js';
import { data } from './views/data.js';
import { guide } from './views/guide.js';
import { pilot } from './views/pilot.js';
import { governance } from './views/governance.js';
import { signals } from './views/signals.js';
import { markets } from './views/markets.js';
import { programmes } from './views/programmes.js';
import { openCountry } from './views/common.js';
import { annotate, installTips, retip } from './ui/annotate.js';
import { balance } from './ui/balance.js';
import { PAGES } from './content/tips.js';

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: 'home', view: overview, primary: true },
  { id: 'detect', label: 'Surplus radar', icon: 'radar', view: detect, primary: true },
  { id: 'simulate', label: 'Simulation lab', icon: 'play', view: simulate, primary: true },
  { id: 'redistribute', label: 'Redistribution', icon: 'flow', view: redistribute },
  { id: 'contracts', label: 'Contracts & audit', icon: 'shield', view: contracts, primary: true },
  { id: 'forecast', label: 'Early warning', icon: 'bell', view: forecast },
  { id: 'stability', label: 'Stability', icon: 'wave', view: stability },
  { id: 'pilot', label: 'Pilot planner', icon: 'layers', view: pilot },
  { id: 'framework', label: 'Framework', icon: 'sigma', view: framework },
  { id: 'signals', label: 'Signals & triggers', icon: 'zap', view: signals },
  { id: 'markets', label: 'Commodities & assets', icon: 'globe', view: markets },
  { id: 'programmes', label: 'Funds & programmes', icon: 'link', view: programmes },
  { id: 'governance', label: 'Design & governance', icon: 'file', view: governance },
  { id: 'validate', label: 'Evidence', icon: 'check', view: validate },
  { id: 'data', label: 'Data & status', icon: 'db', view: data },
  { id: 'guide', label: 'Guide & install', icon: 'help', view: guide },
];

const app = createApp();
const main = document.getElementById('main');
const routeOf = () => ROUTES.find(r => `#/${r.id}` === location.hash.split('?')[0]) || ROUTES[0];

// Theme.
const THEME_KEY = 'phx:theme';
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { t ? localStorage.setItem(THEME_KEY, t) : localStorage.removeItem(THEME_KEY); } catch {}
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121211' : '#fbfaf7');
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  render();
}
const themeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle dark mode', onclick: () => {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(dark ? 'light' : 'dark');
} });

// Install.
let deferred = null;
app.canInstall = false;
const installBtn = h('button', { class: 'btn btn-s install-btn', hidden: true, 'data-tip': 'Install the app on this device; it then works offline.', onclick: () => app.install() }, icon('download', 16), h('span', null, 'Install'));
app.install = async () => {
  if (deferred) { deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') toast('Phoenix installed.'); deferred = null; app.canInstall = false; installBtn.hidden = true; }
  else location.hash = '#/guide';
};
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; app.canInstall = true; installBtn.hidden = false; });
addEventListener('appinstalled', () => { installBtn.hidden = true; });
if (!matchMedia('(display-mode: standalone)').matches && !navigator.standalone) {
  // iOS and Firefox have no install prompt: the button opens the instructions instead.
  installBtn.hidden = false;
}

// Header.
const regionSel = h('select', { class: 'region', 'aria-label': 'Region', 'data-tip': 'Region shown on every page: the euro area, the EU-27, or the 29-economy global panel (§3.8).', onchange: e => app.setRegion(e.target.value) },
  Object.entries(REGIONS).map(([k, v]) => h('option', { value: k, selected: app.region === k }, v)));
const livePill = h('button', { class: 'live', onclick: () => { location.hash = '#/data'; } });
const searchBtn = h('button', { class: 'icon-btn', 'aria-label': 'Search (Ctrl+K)', onclick: () => palette() }, icon('search'));
const backBtn = h('button', { class: 'icon-btn back-btn', 'aria-label': 'Back', hidden: true, onclick: () => { if (depth > 0) history.back(); else location.hash = '#/overview'; } }, icon('back'));
document.getElementById('top').append(
  backBtn,
  h('a', { class: 'brand', href: '#/overview', 'aria-label': 'Phoenix home' }, h('img', { src: globalThis.PHX_ICON || 'icons/icon.svg', width: 28, height: 28, alt: '' }), h('span', null, 'Phoenix', h('small', null, 'Economics'))),
  h('div', { class: 'top-c' }, regionSel),
  h('div', { class: 'top-r' }, livePill, searchBtn, themeBtn, installBtn));

// Navigation.
const navLinks = ROUTES.map((r, i) => h('a', { href: `#/${r.id}`, class: 'nav-a', dataset: { id: r.id, tip: `${PAGES[r.id]}${i < 9 ? ` Shortcut: G then ${i + 1}.` : ''}` } }, icon(r.icon), h('span', null, r.label)));
document.getElementById('nav').append(...navLinks);
const moreSheet = h('dialog', { class: 'sheet', 'aria-label': 'All pages' },
  h('div', { class: 'sheet-h' }, h('b', null, 'All pages'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => moreSheet.close() }, icon('close'))),
  h('div', { class: 'sheet-g' }, ROUTES.map(r => h('a', { href: `#/${r.id}`, class: 'sheet-a', dataset: { tip: PAGES[r.id] }, onclick: () => moreSheet.close() }, icon(r.icon, 22), h('span', null, r.label)))));
document.body.append(moreSheet);
const bottomLinks = ROUTES.filter(r => r.primary).map(r => h('a', { href: `#/${r.id}`, class: 'tab', dataset: { id: r.id, tip: PAGES[r.id] } }, icon(r.icon, 22), h('span', null, r.label.split(' ')[0])));
document.getElementById('tabs').append(...bottomLinks, h('button', { class: 'tab', onclick: () => moreSheet.showModal() }, icon('more', 22), h('span', null, 'More')));

// In-app history depth, so the back button works inside the app (installed apps have no
// browser buttons). Each new page gets a sequence number; back/forward restore it.
let depth = 0;
function trackHistory() {
  if (history.state && typeof history.state.phxDepth === 'number') depth = history.state.phxDepth;
  else { depth += 1; history.replaceState({ phxDepth: depth }, ''); }
}
try { if (history.state && typeof history.state.phxDepth === 'number') depth = history.state.phxDepth; else history.replaceState({ phxDepth: 0 }, ''); } catch {}

function updateChrome() {
  const atHome = routeOf().id === 'overview';
  backBtn.hidden = depth === 0 && atHome;
  backBtn.dataset.tip = depth > 0 ? 'Back to the previous page' : 'Back to Overview';
  const r = routeOf();
  for (const a of [...navLinks, ...bottomLinks]) { if (a.dataset.id === r.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  regionSel.value = app.region;
  const st = Object.values(app.status);
  const live = st.filter(s => s.state === 'live').length, total = st.length;
  const at = st.map(s => s.at).filter(Boolean).sort().pop();
  const off = navigator.onLine === false;
  livePill.className = `live ${off ? 'off' : app.refreshing ? 'busy' : live ? 'on' : 'stored'}`;
  livePill.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', null, off ? 'Offline' : app.refreshing ? 'Updating' : live ? `Live · ${ago(at)}` : 'Stored data'));
  livePill.dataset.tip = `${live} of ${total} data sources refreshed live in this session; select for the status of each (§3.1).`;
}

// Rendering.
let lastRoute = null;
function render() {
  const r = routeOf();
  const same = lastRoute === r.id;
  const y = scrollY;
  hideTip();
  // Keep the reader's place across redraws: open explanations and the focused control.
  const open = same ? new Set([...main.querySelectorAll('details[open] > summary')].map(s => s.textContent)) : new Set();
  const act = same && main.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.getAttribute('aria-label')) : null;
  clear(main);
  try { r.view(main, app); }
  catch (e) { console.error(e); main.append(h('div', { class: 'empty' }, h('p', null, 'This view could not be drawn with the current data.'), h('pre', null, String(e.message || e)))); }
  if (same) {
    for (const s of main.querySelectorAll('details > summary')) if (open.has(s.textContent)) s.parentElement.open = true;
    if (act) (document.getElementById(act) || main.querySelector(`[aria-label="${CSS.escape(act)}"]`))?.focus({ preventScroll: true });
    scrollTo(0, y);
  } else { scrollTo(0, 0); main.focus({ preventScroll: true }); }
  annotate(main);
  balance(main);
  requestAnimationFrame(retip);
  document.title = `${r.label} · Phoenix Economics`;
  lastRoute = r.id;
  updateChrome();
}
// Explanations on hover, focus and tap for every label, including content drawn after the page
// (results, dialogs, the header).
installTips();
annotate(document.getElementById('top'));
new MutationObserver(muts => {
  // Chart drawing adds many SVG nodes; only HTML additions can carry labels or grids.
  const roots = new Set();
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !(n instanceof SVGElement)) roots.add(n.parentElement || n);
  for (const r of roots) { annotate(r); balance(r); }
}).observe(document.body, { childList: true, subtree: true });
let resizeRaf = 0;
addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => balance(document)); });
let raf = 0;
app.rerender = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
app.on((_, kind) => (kind === 'status' ? updateChrome() : app.rerender()));
// A pending update is applied at the next page change, unless a long computation is running.
const canReload = () => !(app.busy > 0);
addEventListener('hashchange', () => { if (app.updatePending && canReload()) { location.reload(); return; } trackHistory(); render(); });
addEventListener('online', () => { updateChrome(); app.refresh(); });
addEventListener('offline', updateChrome);

// Command palette: pages and economies.
function palette() {
  const input = h('input', { type: 'search', placeholder: 'Search pages and economies…', 'aria-label': 'Search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list' });
  const list = h('ul', { class: 'pal-l', role: 'listbox', id: 'pal-list', 'aria-label': 'Results' });
  let items = [], sel = 0;
  const dlg = h('dialog', { class: 'palette', 'aria-label': 'Search pages and economies' }, input, list);
  const go = it => { dlg.close(); it.run(); };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const pages = ROUTES.map(r => ({ label: r.label, hint: 'Page', icon: r.icon, run: () => { location.hash = `#/${r.id}`; } }));
    const econ = app.cells.map(c => ({ label: c.name, hint: `${c.id} · economy`, icon: 'globe', run: () => openCountry(app, c) }));
    items = [...pages, ...econ].filter(it => !q || it.label.toLowerCase().includes(q) || it.hint.toLowerCase().includes(q)).slice(0, 12);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren(...items.map((it, i) => h('li', { id: `pal-${i}`, role: 'option', 'aria-selected': String(i === sel), class: i === sel ? 'on' : '', onclick: () => go(it) }, icon(it.icon, 16), h('span', null, it.label), h('small', null, it.hint))));
    input.setAttribute('aria-activedescendant', items.length ? `pal-${sel}` : '');
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) go(items[sel]);
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  draw(); dlg.showModal(); input.focus();
}

let gPending = false;
addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); palette(); }
  else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) app.refresh();
  else if (e.key.toLowerCase() === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 1200); }
  else if (gPending && /^[1-9]$/.test(e.key)) { location.hash = `#/${ROUTES[+e.key - 1].id}`; gPending = false; }
});

// Service worker: offline shell, update prompt, periodic background refresh.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Look for a newer version whenever the app is opened or brought back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    if ('periodicSync' in reg) navigator.permissions?.query({ name: 'periodic-background-sync' }).then(p => { if (p.state === 'granted') reg.periodicSync.register('phx-refresh', { minInterval: 6 * 3600e3 }).catch(() => {}); }).catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 3600e3);
  }).catch(() => {});
  // A new version applies itself at the next page change (or when the app returns to the
  // foreground), so nobody is interrupted mid-task and nobody stays on an old version.
  // Never reload when the offline worker first takes control on a first visit.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || app.updatePending) return;
    app.updatePending = true;
    toast('Phoenix has been updated. The new version opens on your next page change.', { label: 'Open now', run: () => location.reload() });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && app.updatePending) app.reloadOnShow = true; if (document.visibilityState === 'visible' && app.reloadOnShow && canReload()) location.reload(); });
}

// Keep data fresh while open.
setInterval(() => { if (document.visibilityState === 'visible') app.refresh(); }, 15 * 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateChrome(); });

let stored = null;
try { stored = localStorage.getItem(THEME_KEY); } catch {}
setTheme(stored);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!document.documentElement.dataset.theme) setTheme(null); });
app.start();
