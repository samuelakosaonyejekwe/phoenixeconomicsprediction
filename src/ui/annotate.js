// Hover explanations (data-tip) for every label on a page, from src/content/tips.js, and the tooltip that
// shows them on mouse hover, keyboard focus and tap.
import { h, showNote, hideTip } from './dom.js';
import { TIPS, STATES, PAGES, PAGE_LABELS, GROUPS } from '../content/tips.js';

// Visible label → glossary key: section, table and figure references, counts, dates and trailing month
// numbers are removed.
export const keyOf = t => String(t).replace(/\s+/g, ' ')
  .replace(/\s*\((?:Solutions\s+)?(?:§|Table|Figure)[^)]*\)/g, '')
  .replace(/\s*\(\d+(?: entries)?\)/g, '')
  .replace(/,\s*nowcast\s+\S+$/, '')
  .replace(/ at month \d+$/, ' at month')
  .replace(/ at m\d+$/, ' at the horizon').replace(/ in \d+ months$/, ' over the horizon').replace(/, \d+ months$/, ', over the horizon').trim();

const find = k => TIPS[k] ?? STATES[k] ?? GROUPS[k] ?? (PAGE_LABELS[k] ? PAGES[PAGE_LABELS[k]] : null);
export function lookup(text) {
  const k = keyOf(text);
  if (!k) return null;
  // A trailing qualifier in brackets, such as “(IV)” or “(Monte Carlo)”, may be dropped.
  return find(k) ?? find(k.replace(/\s*\([^)]*\)$/, ''));
}

// Elements that carry a label a reader may not understand. Elements that show their own live tooltip
// (map tiles, bars, chart points) are excluded.
export const LABELS = 'h3, .kpi-l, th[scope=col], .legend li, .badge, button, .chip, summary, label, .ctrl-l';
const OWN = '.tile, .dotg, .bar-row, .bar-seg, .cell';

const directText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
const firstChildText = el => (el.firstElementChild ? el.firstElementChild.textContent.trim() : '');

// A folded section's heading is exposed to assistive technology as one button that says whether it is
// open, with its text as its name and nothing inside it to stop on. Left as a bare <summary> holding an
// icon and tags, VoiceOver's move-to-next-control command comes to rest inside it and does not go past
// (found by reading every page with VoiceOver; a summary of plain text does not have the problem).
function disclosures(root) {
  for (const s of root.matches?.('summary') ? [root] : root.querySelectorAll('summary')) {
    s.setAttribute('role', 'button');
    s.setAttribute('aria-expanded', String(!!s.parentElement?.open));
    if (!s.children.length || s.firstElementChild?.classList.contains('sum-in')) continue;
    s.setAttribute('aria-label', s.textContent.replace(/\s+/g, ' ').trim());
    const inner = document.createElement('span');
    inner.className = 'sum-in';
    inner.setAttribute('aria-hidden', 'true');
    inner.append(...s.childNodes);
    s.append(inner);
  }
}
if (typeof document !== 'undefined') document.addEventListener('toggle', e => { const s = e.target.querySelector?.(':scope > summary'); if (s) s.setAttribute('aria-expanded', String(e.target.open)); }, true);

export function annotate(root) {
  disclosures(root);
  for (const el of root.querySelectorAll(LABELS)) {
    if (el.closest(OWN)) continue;
    // A native title becomes the shared tooltip, so the two never show together.
    if (!el.dataset.tip && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
    // An explanation of the card or the page around it does not stand in for the label's own.
    const outer = el.closest('[data-tip]:not([data-tip-scope])');
    if (el.dataset.tip || outer && outer !== el) continue;
    const tip = lookup(el.textContent) ?? lookup(directText(el)) ?? lookup(firstChildText(el)) ?? (el.getAttribute('aria-label') && el.tagName === 'BUTTON' ? el.getAttribute('aria-label') : null);
    // Questions and other expandable sections explain themselves once opened.
    if (!tip && el.tagName === 'SUMMARY') { el.dataset.tip = 'Select to show or hide the answer.'; continue; }
    if (!tip) continue;
    el.dataset.tip = tip;
    // Card titles get a focusable marker, so keyboard and touch users can reach the explanation too.
    if (el.tagName === 'H3' && !el.querySelector('.tip-i')) el.append(h('span', { class: 'tip-i', tabindex: 0, role: 'note', 'aria-label': tip, 'data-tip': tip }, 'i'));
  }
  surround(root);
}

// Beyond labels: a headline tile takes the explanation of its label, a meter says what its bar shows and
// a table cell says what its column means. Text that is itself an explanation gets none.
const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const within = (root, sel) => [...(root.matches?.(sel) ? [root] : []), ...root.querySelectorAll(sel)];
function surround(root) {
  for (const el of within(root, '.kpi, .mkt')) { const t = el.querySelector('.kpi-l')?.dataset.tip; if (t && !el.dataset.tip) el.dataset.tip = t; }
  for (const el of within(root, '.meter')) if (!el.dataset.tip) el.dataset.tip = `${el.getAttribute('aria-label') || text(el.querySelector('.meter-top span'))}: ${text(el.querySelector('.meter-top b'))}. The bar fills towards its limit and turns amber, then red, as it approaches it.`;
  for (const el of within(root, '.ledger > li')) if (!el.dataset.tip) el.dataset.tip = 'One signed entry of the audit ledger: what changed, when, the values that caused it, and the start of its hash.';
  for (const el of within(root, '.obj-chip, .state-pill')) if (!el.dataset.tip && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
  for (const el of within(root, '.state-pill')) if (!el.dataset.tip) el.dataset.tip = `${text(el.querySelector('b'))} economies. ${lookup(text(el.querySelector('.badge'))) || 'Economies in this contract state.'} Select to see them.`;
  for (const el of within(root, 'ol.loop > li')) if (!el.dataset.tip && el.querySelector('.loop-v')) el.dataset.tip = `Stage ${text(el.querySelector('.loop-n'))} of the control loop, ${text(el.querySelector('b'))}: today’s value ${text(el.querySelector('.loop-v'))} (${text(el.querySelector('small'))}).`;
  for (const el of within(root, '.hero-main')) if (!el.dataset.tip) { el.dataset.tip = 'Today’s headline for the selected region: how many economies have active contracts, and inflation against the trigger.'; el.dataset.tipScope = 'card'; }
  for (const el of within(root, '.hero-fig')) if (!el.dataset.tip) el.dataset.tip = 'Projected inflation at the end of the horizon with Phoenix, and without it in brackets; the difference is Phoenix’s effect.';
  for (const el of within(root, '.src-line')) if (!el.dataset.tip) el.dataset.tip = 'Publishers of the data on this page and when it was last fetched; the Data & status page lists every source.';
  for (const el of within(root, 'ol.flows > li')) if (!el.dataset.tip) { const b = el.querySelectorAll('b'); el.dataset.tip = `Wallet liquidity routed from ${text(b[0])} to ${text(b[1])} over the horizon: ${text(el.querySelector('.v'))}, across ${text(el.querySelector('.muted'))}.`; }
  // Anything else inside a card is explained by the card; anything else on the page by the page.
  for (const el of within(root, '.card')) { const t = el.querySelector('h3')?.dataset.tip; if (t) for (const part of el.querySelectorAll(':scope > .card-body, :scope > .tbl-host, :scope > .legend')) if (!part.dataset.tip) { part.dataset.tip = t; part.dataset.tipScope = 'card'; } }
  const main = document.getElementById('main');
  if (main && (root === main || main.contains(root))) { const id = location.hash.split('?')[0].slice(2) || 'overview'; for (const el of main.children) if (!el.dataset.tip && PAGES[id]) { el.dataset.tip = PAGES[id]; el.dataset.tipScope = 'page'; } }
  // A region that scrolls must be reachable by keyboard to be scrolled.
  for (const el of within(root, '.tbl-wrap, .ledger, .math, .rels, .tiles, .card-body')) if (!el.hasAttribute('tabindex') && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && /auto|scroll/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY)) { el.tabIndex = 0; if (!el.getAttribute('role') && !/^(OL|UL|TABLE)$/.test(el.tagName)) { el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Scrollable content'); } }
  const tables = new Set(within(root, 'table'));
  const own = root.closest?.('table'); if (own) tables.add(own);
  for (const t of tables) {
    const heads = [...t.querySelectorAll('thead th')];
    for (const row of t.querySelectorAll('tbody tr')) {
      const rowName = text(row.cells[0]);
      for (const cell of row.cells) {
        if (cell.dataset.tip) continue;
        const head = heads[cell.cellIndex], col = text(head), about = head?.dataset.tip;
        const value = text(cell);
        // Without an explanation of the column there is nothing to add to what the cell already shows.
        if (!about) continue;
        cell.dataset.tip = cell.cellIndex === 0 ? `${col}: ${about}` : `${rowName} · ${col}: ${about}`;
      }
    }
  }
}

const PROSE = 'p, li, dd, dt, h1, h2, h4, .sub, .lead, .state-legend, .explain, .notes';
const plain = t => String(t).replace(/\s*\((?:Solutions\s+)?(?:§|Table|Figure)[^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
let pageText = '', pageAt = 0;
function onPage(tip) {
  const t = plain(tip);
  if (t.length < 25) return false;
  if (Date.now() - pageAt > 400) { pageText = plain(document.getElementById('main')?.innerText || ''); pageAt = Date.now(); }
  return pageText.includes(t);
}

// One tooltip for the whole document: shown on hover, focus or tap of any element with data-tip.
let lastX = -1, lastY = -1, showFor = null, tipTarget = null;
// After a redraw the element under the pointer is new: show its explanation again if the pointer is
// still over a label (a redraw never moves the pointer).
export function retip() {
  if (lastX < 0 || !showFor) return;
  const at = document.elementFromPoint(lastX, lastY), el = at && tipTarget ? tipTarget(at) : null;
  if (el) showFor(el);
}

export function installTips(doc = document) {
  let cur = null;
  const show = el => {
    cur = el;
    const r = el.getBoundingClientRect();
    showNote(r.left, r.bottom + 6, el.dataset.tip, r.top);
  };
  const hide = () => { cur = null; hideTip(); };
  showFor = show;
  doc.addEventListener('pointermove', e => { lastX = e.clientX; lastY = e.clientY; }, { passive: true });
  // Charts, maps and bars show their own live values: a surrounding explanation stays out of their way.
  const tipFor = t => {
    const el = t.closest?.('[data-tip]'), own = t.closest?.(`${OWN}, .chart`);
    if (!el || own && el !== own && el.contains(own)) return null;
    // Running text is its own explanation: the card's or the page's is not repeated over it.
    if (el.dataset.tipScope && t.closest(PROSE)) return null;
    // A state badge needs none on a page whose legend spells out every state.
    if (el.classList.contains('badge') && [...document.querySelectorAll('#main .state-legend .badge')].some(b => b.textContent.trim() === el.textContent.trim())) return null;
    // Nor is an explanation that can already be read on the page.
    return onPage(el.dataset.tip) ? null : el;
  };
  tipTarget = tipFor;
  // On a touch screen a control acts on the first tap. Showing an explanation as the finger lands would
  // make iOS treat that tap as a hover and withhold the click, so a tapped control shows none; labels,
  // figures and the ⓘ marks beside controls still explain themselves on a tap.
  const CONTROL = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"]';
  let touched = 0;
  const byTouch = e => e.pointerType === 'touch' || e.pointerType === 'pen';
  doc.addEventListener('pointerover', e => {
    lastX = e.clientX; lastY = e.clientY;
    if (byTouch(e) && e.target.closest?.(CONTROL)) { if (cur) hide(); return; }
    const el = tipFor(e.target);
    if (el && el !== cur) show(el); else if (!el && cur) hide();
  });
  doc.addEventListener('pointerdown', e => { if (byTouch(e)) touched = performance.now(); if (!e.target.closest?.('[data-tip]')) hide(); }, { passive: true });
  doc.addEventListener('focusin', e => { if (performance.now() - touched < 800 && e.target.closest?.(CONTROL)) return; const el = tipFor(e.target); if (el) show(el); });
  doc.addEventListener('focusout', hide);
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, { passive: true });
}
