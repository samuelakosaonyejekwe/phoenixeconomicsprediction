// Minimal DOM toolkit. All external text enters the page through text nodes only.
const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' && 'checked' in el) el.checked = !!v;
    else if (k === 'html') el.innerHTML = v; // only for build-time trusted markup (MathML, icons)
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) { kids.unshift(props); props = null; }
  apply(el, props); append(el, kids);
  return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  apply(el, props); append(el, kids);
  return el;
}
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

// Number formatting.
const nf = new Map();
export function num(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  // A value that rounds to zero is shown as 0, not as −0.
  if (Math.abs(v) < 0.5 * 10 ** -d) v = 0;
  const key = d;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.get(key).format(v);
}
export function eur(bn, d = 1) {
  if (bn === null || bn === undefined || Number.isNaN(bn)) return '–';
  const a = Math.abs(bn);
  // A trillion-scale amount keeps at least two decimals: €2.26tn, not €2tn.
  if (a >= 1000) return `${bn < 0 ? '−' : ''}€${num(a / 1000, Math.max(d, 2))}tn`;
  if (a >= 1) return `${bn < 0 ? '−' : ''}€${num(a, d)}bn`;
  if (a === 0) return '€0';
  return `${bn < 0 ? '−' : ''}€${num(a * 1000, 0)}m`;
}
export const pct = (v, d = 1) => (v === null || v === undefined ? '–' : `${num(v, d)}%`);
export const ago = iso => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
export const dateTime = iso => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–');

// Icons: 24px stroke icons, static trusted markup.
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  back: 'M15 5l-7 7 7 7',
  radar: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12l6-6',
  play: 'M7 4v16l13-8z',
  flow: 'M4 7h12l-3-3M20 17H8l3 3M4 7v0M20 17v0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  wave: 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-3',
  sigma: 'M18 4H6l7 8-7 8h12',
  check: 'M4 12l5 5L20 6',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  help: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-5-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v6M12 7.5v.01',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  ok: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12l3 3 5-6',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  globe: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
};
export function icon(name, size = 20) {
  return s('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ic' },
    s('path', { d: P[name] || P.info }));
}

// Floating tooltip shared by every chart.
let tipEl;
export function tip() {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'status', 'aria-live': 'polite' }); document.body.append(tipEl); }
  return tipEl;
}
export function showTip(x, y, rows, title) {
  const t = clear(tip());
  t.classList.remove('tip-note');
  if (title) t.append(h('div', { class: 'tip-t' }, title));
  for (const r of rows) {
    t.append(h('div', { class: 'tip-r' },
      r.color ? h('span', { class: 'tip-k', style: { background: r.color } }) : null,
      h('b', null, r.value), h('span', null, r.label)));
  }
  t.style.display = 'block';
  const W = innerWidth, Ht = innerHeight, rect = t.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + rect.width > W - 8) left = x - rect.width - 14;
  if (top + rect.height > Ht - 8) top = y - rect.height - 14;
  t.style.left = `${Math.max(8, left)}px`; t.style.top = `${Math.max(8, top)}px`;
}
export const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };
// Explanation tooltip for a label (src/ui/annotate.js): placed below the element, or above it when there
// is no room below.
export function showNote(x, y, text, topOfEl = y) {
  const t = clear(tip());
  t.append(h('div', { class: 'tip-p' }, text));
  t.classList.add('tip-note');
  t.style.display = 'block';
  const W = innerWidth, Ht = innerHeight, rect = t.getBoundingClientRect();
  let left = Math.min(x, W - rect.width - 8), top = y;
  if (top + rect.height > Ht - 8) top = topOfEl - rect.height - 6;
  t.style.left = `${Math.max(8, left)}px`; t.style.top = `${Math.max(8, top)}px`;
}

export function toast(msg, action) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const el = h('div', { class: 'toast' }, h('span', null, msg),
    action ? h('button', { class: 'btn btn-s', onclick: () => { action.run(); el.remove(); } }, action.label) : null,
    h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icon('close', 16)));
  host.append(el);
  if (!action) setTimeout(() => el.remove(), 5000);
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

