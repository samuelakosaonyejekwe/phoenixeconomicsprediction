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
  .replace(/ at month \d+$/, ' at month').trim();

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

export function annotate(root) {
  for (const el of root.querySelectorAll(LABELS)) {
    if (el.closest(OWN)) continue;
    // A native title becomes the shared tooltip, so the two never show together.
    if (!el.dataset.tip && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
    if (el.dataset.tip || el.closest('[data-tip]') !== el && el.closest('[data-tip]')) continue;
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

// Beyond labels: whatever the pointer rests on explains itself. A headline tile, a card header and a
// page heading take the explanation of their label; a meter says what its bar shows; every table cell
// says which row and column it belongs to and what the column means.
const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const within = (root, sel) => [...(root.matches?.(sel) ? [root] : []), ...root.querySelectorAll(sel)];
function surround(root) {
  for (const el of within(root, '.kpi, .mkt')) { const t = el.querySelector('.kpi-l')?.dataset.tip; if (t && !el.dataset.tip) el.dataset.tip = t; }
  for (const el of within(root, '.card-h')) { const t = el.querySelector('h3')?.dataset.tip; if (t && !el.dataset.tip) el.dataset.tip = t; }
  for (const el of within(root, '.page-h')) {
    if (el.dataset.tip) continue;
    const id = location.hash.split('?')[0].slice(2) || 'overview';
    el.dataset.tip = PAGES[id] || text(el.querySelector('.lead')) || text(el.querySelector('h1'));
  }
  for (const el of within(root, '.meter')) if (!el.dataset.tip) el.dataset.tip = `${el.getAttribute('aria-label') || text(el.querySelector('.meter-top span'))}: ${text(el.querySelector('.meter-top b'))}. The bar fills towards its limit and turns amber, then red, as it approaches it.`;
  for (const el of within(root, '.ledger > li')) if (!el.dataset.tip) el.dataset.tip = 'One signed entry of the audit ledger: what changed, when, the values that caused it, and the start of its hash.';
  for (const el of within(root, '.obj-chip, .state-pill')) if (!el.dataset.tip && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
  for (const el of within(root, '.state-pill')) if (!el.dataset.tip) el.dataset.tip = `${lookup(text(el).replace(/^[\d\s]+/, '')) || 'Economies in this contract state.'} Select to see them.`;
  for (const el of within(root, 'ol.loop > li')) if (!el.dataset.tip) el.dataset.tip = `Stage ${text(el.querySelector('.loop-n'))} of the control loop, ${text(el.querySelector('b'))}: today’s value ${text(el.querySelector('.loop-v')) || 'n/a'} (${text(el.querySelector('small'))}).`;
  for (const el of within(root, '.hero-main')) if (!el.dataset.tip) el.dataset.tip = 'Today’s headline for the selected region: how many economies have active contracts, and inflation against the trigger.';
  for (const el of within(root, '.hero-fig')) if (!el.dataset.tip) el.dataset.tip = 'Projected inflation at the end of the horizon with Phoenix, and without it in brackets; the difference is Phoenix’s effect.';
  for (const el of within(root, '.src-line')) if (!el.dataset.tip) el.dataset.tip = 'Publishers of the data on this page and when it was last fetched; the Data & status page lists every source.';
  for (const el of within(root, 'ol.flows > li')) if (!el.dataset.tip) { const b = el.querySelectorAll('b'); el.dataset.tip = `Wallet liquidity routed from ${text(b[0])} to ${text(b[1])} over the horizon: ${text(el.querySelector('.v'))}, across ${text(el.querySelector('.muted'))}.`; }
  for (const el of within(root, '.state-legend > div')) if (!el.dataset.tip) el.dataset.tip = `${text(el.querySelector('.badge'))}: ${text(el.querySelector(':scope > span:last-child'))}`;
  for (const el of within(root, 'dl.io > dd')) if (!el.dataset.tip) { const dt = el.previousElementSibling; if (dt?.tagName === 'DT') { const t = `${text(dt)}: ${text(el)}`.slice(0, 400); el.dataset.tip = t; if (!dt.dataset.tip) dt.dataset.tip = t; } }
  for (const el of within(root, 'details.explain > div')) if (!el.dataset.tip) el.dataset.tip = `${text(el.previousElementSibling)}: the method behind this page, in plain words.`;
  // Anything else inside a card is explained by the card; anything else on the page by the page.
  for (const el of within(root, '.card')) { const t = el.querySelector('h3')?.dataset.tip; if (t) for (const part of el.querySelectorAll(':scope > .card-body, :scope > .tbl-host, :scope > .legend')) if (!part.dataset.tip) { part.dataset.tip = t; part.dataset.tipScope = 'card'; } }
  const main = document.getElementById('main');
  if (main && (root === main || main.contains(root))) { const id = location.hash.split('?')[0].slice(2) || 'overview'; for (const el of main.children) if (!el.dataset.tip && PAGES[id]) { el.dataset.tip = PAGES[id]; el.dataset.tipScope = 'page'; } }
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
        cell.dataset.tip = cell.cellIndex === 0
          ? `${value || 'Row'}${col ? ` — ${col}` : ''}${about ? `: ${about}` : ''}`
          : `${rowName}${col ? ` · ${col}` : ''}${value ? ` = ${value}` : ''}${about ? `. ${about}` : ''}`;
      }
    }
  }
}

// One tooltip for the whole document: shown on hover, focus or tap of any element with data-tip.
let lastX = -1, lastY = -1, showFor = null;
// After a redraw the element under the pointer is new: show its explanation again if the pointer is
// still over a label (a redraw never moves the pointer).
export function retip() {
  if (lastX < 0 || !showFor) return;
  const el = document.elementFromPoint(lastX, lastY)?.closest?.('[data-tip]');
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
  const tipFor = t => { const el = t.closest?.('[data-tip]'), own = t.closest?.(`${OWN}, .chart`); return el && own && el !== own && el.contains(own) ? null : el; };
  doc.addEventListener('pointerover', e => { lastX = e.clientX; lastY = e.clientY; const el = tipFor(e.target); if (el && el !== cur) show(el); else if (!el && cur) hide(); });
  doc.addEventListener('pointerdown', e => { if (!e.target.closest?.('[data-tip]')) hide(); });
  doc.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  doc.addEventListener('focusout', hide);
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, { passive: true });
}
