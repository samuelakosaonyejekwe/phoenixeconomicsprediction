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
  doc.addEventListener('pointerover', e => { lastX = e.clientX; lastY = e.clientY; const el = e.target.closest?.('[data-tip]'); if (el && el !== cur) show(el); else if (!el && cur) hide(); });
  doc.addEventListener('pointerdown', e => { if (!e.target.closest?.('[data-tip]')) hide(); });
  doc.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  doc.addEventListener('focusout', hide);
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, { passive: true });
}
