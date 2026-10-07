// Balanced rows for grids of equal items (headline figures, scenarios, market tiles, state legend): as
// many columns as fit, but spread evenly over the rows needed, so no item is left alone on a last row.
const GRIDS = { kpis: 170, scen: 200, mkts: 190, 'state-legend': 230 };
const SEL = Object.keys(GRIDS).map(k => `.${k}`).join(', ');

export function balance(root = document) {
  const grids = root.matches?.(SEL) ? [root] : [...root.querySelectorAll(SEL)];
  for (const g of grids) {
    const n = g.children.length, W = g.clientWidth;
    if (!n || !W) continue;
    const min = GRIDS[Object.keys(GRIDS).find(k => g.classList.contains(k))];
    const gap = parseFloat(getComputedStyle(g).columnGap) || 12;
    const fit = Math.max(1, Math.floor((W + gap) / (min + gap)));
    const cols = Math.ceil(n / Math.ceil(n / fit));
    g.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    if (cols === n && n > 1) widths(g, n);
  }
}

// Items on a single row need not be equally wide: one with more to say is given more room, so that the
// others are not left taller than their content.
function widths(g, n) {
  const items = [...g.children], set = w => { g.style.gridTemplateColumns = w.map(x => `minmax(0, ${x.toFixed(3)}fr)`).join(' '); };
  const spread = () => { const hs = items.map(it => it.offsetHeight); return { hs, d: Math.max(...hs) - Math.min(...hs) }; };
  g.style.alignItems = 'start';
  let w = new Array(n).fill(1), best = { w, d: spread().d };
  for (let i = 0; i < 5 && best.d > 28; i++) {
    const { hs } = spread(), mean = hs.reduce((a, b) => a + b, 0) / n;
    w = w.map((x, k) => Math.min(1.9, Math.max(0.8, x * (hs[k] / mean) ** 0.8)));
    set(w);
    const d = spread().d;
    if (d < best.d - 4) best = { w, d };
  }
  if (best.w.every(x => x === 1)) g.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`; else set(best.w);
  g.style.alignItems = '';
}


// Cards side by side. A grid row makes its cards equally tall, which leaves a short card hollow next
// to a long one. Instead the cards are measured at column width and at full width and arranged so
// that the least area is left empty: each card goes into a column or across the whole row and the
// columns are filled independently. The cards stay in reading order in the document — a keyboard and a
// screen reader meet them in the order the page was written — and are placed on a fine grid of rows.
// What difference remains between two columns is shared by the cards of the shorter one, whose charts
// and lists take it up. Rows of similar cards are left as rows.
const PAIRS = '.grid-2, .grid-3';
const GAP = 16, UNIT = 4, FULL = -1, SPAN_COST = 55, EVEN = 48;
const SPLITS = [0.5, 0.46, 0.54, 0.42, 0.58, 0.38, 0.62];
const plans = new Map();
const columnsFor = g => (matchMedia('(max-width: 1100px)').matches ? 1 : g.classList.contains('grid-3') && matchMedia('(min-width: 1400px)').matches ? 3 : 2);
const titleOf = el => el.querySelector('h3')?.firstChild?.textContent || el.className;
const up = v => Math.ceil(v / UNIT) * UNIT;

// Charts are drawn at once at the width they now have, not a frame later: those whose height follows
// their width, and those not drawn yet.
function draw(g, all = false) {
  for (const host of g.querySelectorAll('[data-fit]')) if (host._fit && (all || host._fit.byWidth || !host.firstElementChild)) host._fit.redraw();
}

// Spare height given to a card is taken up by its charts, or by the spacing of its rows.
const ROWS = '.alerts, .flows, .steps, .mirrors, .io, .ctrl-grid, .bars, .meters, .tbl tbody, .faq';
function unfill(it) {
  if (!it._fill && !it._want) return;
  for (const host of it.querySelectorAll('[data-fit]')) host._fit?.grow(0);
  it.style.removeProperty('--fill');
  it.style.removeProperty('--centre');
  it._fill = it._want = 0;
}
// `natural` is the card's height without any filling; returns the height taken up.
function fill(it, spare, natural) {
  if (Math.abs(spare - (it._want || 0)) < 6) return;
  unfill(it);
  it._want = spare;
  if (spare < 8) return;
  const charts = [...it.querySelectorAll('[data-fit]')].filter(c => c._fit?.tall && c.clientWidth);
  if (charts.length) for (const c of charts) c._fit.grow(spare / charts.length);
  else {
    const list = [...it.querySelectorAll(ROWS)].filter(l => l.clientHeight && l.children.length > 1).sort((a, b) => b.clientHeight - a.clientHeight)[0];
    // Nothing in the card can grow (a map of fixed proportions): its content is centred in the space.
    if (!list) it.style.setProperty('--centre', `${Math.floor(spare / 2)}px`);
    else {
      const rows = Math.max(1, Math.round(list.clientHeight / Math.max(12, list.firstElementChild.offsetHeight)));
      it.style.setProperty('--fill', `${Math.min(9, spare / (2 * rows)).toFixed(1)}px`);
    }
  }
  it._fill = Math.max(0, it.offsetHeight - natural);
}

function flat(g, items) {
  g.classList.remove('bal', 'bal-m');
  for (const it of items) { it.classList.remove('wide'); it.style.gridColumn = it.style.gridRow = ''; }
}

// Segments of columns between full-width cards, in reading order.
function segments(assign) {
  const out = [];
  let seg = null;
  assign.forEach((a, i) => {
    if (a === FULL) { out.push({ full: i }); seg = null; return; }
    if (!seg) out.push(seg = { cols: [] });
    (seg.cols[a] ||= []).push(i);
  });
  return out;
}

function costOf(assign, hCol, hFull, C) {
  let cost = 0, worst = 0, length = 0;
  for (const seg of segments(assign)) {
    // A card whose content grows with its width (a map, a matrix) is not improved by spanning the row.
    if (seg.full !== undefined) { cost += SPAN_COST + Math.max(0, hFull[seg.full] - hCol[seg.full]); length += hFull[seg.full]; continue; }
    const sums = Array.from({ length: C }, (_, c) => (seg.cols[c] || []).reduce((a, i) => a + hCol[i] + GAP, -GAP));
    const top = Math.max(...sums);
    for (const s of sums) { const spare = top - Math.max(0, s); cost += spare; worst = Math.max(worst, spare); }
    // Reading order runs across the columns: a segment starts in the first column.
    if (!seg.cols[0] || Math.min(...seg.cols[0]) !== Math.min(...seg.cols.flat())) cost += 1;
    length += top;
  }
  return { cost: cost + 0.08 * length, worst };
}

function solve(hCol, hFull, C) {
  const n = hCol.length;
  // Rows of similar cards stay rows; a card left alone on the last row spans it.
  let even = true;
  for (let i = 0; i < n; i += C) { const row = hCol.slice(i, i + C); if (row.length === C && Math.max(...row) - Math.min(...row) > EVEN) even = false; }
  if (even) return { rows: true, worst: EVEN };
  let best = null;
  const assign = new Array(n).fill(0);
  for (let k = 0, total = (C + 1) ** n; k < total; k++) {
    for (let i = 0, v = k; i < n; i++, v = Math.floor(v / (C + 1))) assign[i] = v % (C + 1) === C ? FULL : v % (C + 1);
    const c = costOf(assign, hCol, hFull, C);
    if (!best || c.cost < best.cost - 1e-9) best = { ...c, assign: assign.slice() };
  }
  return best;
}

// The cards' own heights, without stretching and without any filling.
function natural(g) {
  g.classList.add('bal-m');
  const hs = g._items.map(it => it.offsetHeight - (it._fill || 0));
  g.classList.remove('bal-m');
  return hs;
}

// Places the cards of the chosen arrangement from their present heights. Returns the largest
// difference between columns that had to be shared out.
function place(g, C) {
  const plan = g._plan, items = g._items, hs = natural(g);
  g._nat = hs.join();
  let worst = 0;
  const give = [];
  if (plan.rows) {
    for (let i = 0; i < items.length; i += C) {
      const row = hs.slice(i, i + C), top = Math.max(...row);
      if (row.length === C) worst = Math.max(worst, top - Math.min(...row));
      row.forEach((v, k) => { give[i + k] = top - v; });
    }
  } else {
    let y = 0;
    const at = (i, c, top, height) => { items[i].style.gridColumn = c === FULL ? '1 / -1' : String(c + 1); items[i].style.gridRow = `${top / UNIT + 1} / span ${height / UNIT}`; give[i] = height - hs[i]; };
    for (const seg of segments(plan.assign)) {
      if (seg.full !== undefined) { const v = up(hs[seg.full]); at(seg.full, FULL, y, v); y += v + GAP; continue; }
      const cols = Array.from({ length: C }, (_, c) => seg.cols[c] || []);
      const sums = cols.map(col => col.reduce((a, i) => a + up(hs[i]) + GAP, -GAP));
      const top = Math.max(...sums);
      cols.forEach((col, c) => {
        // The spare height of a shorter column is shared by its cards, in whole rows.
        const spare = top - sums[c], each = Math.floor(spare / col.length / UNIT) * UNIT;
        if (col.length) worst = Math.max(worst, spare);
        let cy = y;
        col.forEach((i, k) => { const v = up(hs[i]) + (k === col.length - 1 ? spare - each * (col.length - 1) : each); at(i, c, cy, v); cy += v + GAP; });
      });
      y += top + GAP;
    }
  }
  // Charts and lists take up what their card was given.
  g.classList.add('bal-m');
  items.forEach((it, i) => fill(it, give[i] || 0, hs[i]));
  g.classList.remove('bal-m');
  return { worst, sig: hs.map(v => Math.round(v / 24)).join(), sum: hs.reduce((x, y) => x + y, 0) };
}

function build(g, items, plan, C) {
  g._plan = plan;
  g._built = performance.now();
  flat(g, items);
  g.style.gridTemplateColumns = plan.split ? `${plan.split}fr ${1 - plan.split}fr` : `repeat(${C}, minmax(0, 1fr))`;
  if (plan.rows) items.forEach((it, i) => { it.style.gridColumn = i === items.length - 1 && items.length % C === 1 ? '1 / -1' : ''; });
  else {
    g.classList.add('bal');
    plan.assign.forEach((a, i) => items[i].classList.toggle('wide', a === FULL));
  }
  draw(g);
  return place(g, C);
}

// Two columns need not be equally wide: the split that brings their heights closest is kept.
function tune(g, C) {
  const plan = g._plan, items = g._items;
  if (C !== 2 || (plan.rows && items.length !== 2)) return;
  const pairs = plan.rows ? [[[0], [1]]] : segments(plan.assign).filter(s => s.cols).map(s => [s.cols[0] || [], s.cols[1] || []]);
  if (!pairs.length) return;
  let best = null;
  for (const f of SPLITS) {
    g.style.gridTemplateColumns = `${f}fr ${1 - f}fr`;
    draw(g);
    const hs = natural(g), sum = col => col.reduce((a, i) => a + hs[i] + GAP, -GAP);
    const d = Math.max(...pairs.map(([a, b]) => Math.abs(sum(a) - sum(b))));
    if (!best || d < best.d - 20) best = { f, d };
    if (d <= 20) break;
  }
  plan.split = best.f === 0.5 ? undefined : best.f;
  g.style.gridTemplateColumns = `${best.f}fr ${1 - best.f}fr`;
  draw(g);
  plan.worst = place(g, C).worst;
}

// Measured within one frame: nothing is hidden and nothing is seen to move.
function measure(g, items, C, key) {
  flat(g, items);
  for (const it of items) unfill(it);
  g.classList.add('bal-m');
  g.style.gridTemplateColumns = `repeat(${C}, minmax(0, 1fr))`;
  draw(g, true);
  const hCol = items.map(it => it.offsetHeight);
  g.style.gridTemplateColumns = 'minmax(0, 1fr)';
  for (const it of items) it.classList.add('wide');
  draw(g);
  const hFull = items.map(it => it.offsetHeight);
  g.classList.remove('bal-m');
  const plan = solve(hCol, hFull, C);
  plans.set(key, plan);
  build(g, items, plan, C);
  tune(g, C);
}

// A card may go on changing for a few frames (data arriving, a table opening); the arrangement is
// judged once it has settled.
const SETTLE = 400;
function check(g, C, key) {
  if (g._checking) return;
  g._checking = true;
  setTimeout(() => {
    g._checking = false;
    if (!g.isConnected || !g._plan || g._key !== key) return;
    if (performance.now() - g._built < SETTLE) return check(g, C, key);
    // Chosen again only when the cards have changed height since the arrangement was chosen (a table
    // opened, new data), so a difference that cannot be removed is not chased.
    const plan = g._plan, now = place(g, C);
    if (plan.sig === undefined) { plan.sig = now.sig; plan.sum = now.sum; plan.worst = Math.min(Math.max(plan.worst, now.worst), plan.worst + 2 * EVEN); }
    // …or have become much shorter or longer altogether (a table closed again): a better arrangement may exist.
    else if (now.sig !== plan.sig && (now.worst > plan.worst + EVEN || Math.abs(now.sum - plan.sum) > 0.2 * plan.sum)) measure(g, g._items, C, key);
  }, Math.max(50, SETTLE - (performance.now() - g._built) + 20));
}

// A card that changes height (a table view opened, a chart redrawn) is given its new place at once.
const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
  for (const g of new Set(entries.map(e => e.target.closest(PAIRS)))) if (g) arrange(g);
}) : null;

export function arrange(root = document) {
  const el = root.nodeType === 1 ? root : document.documentElement;
  const grids = new Set(el.querySelectorAll(PAIRS));
  const own = el.closest(PAIRS);
  if (own) grids.add(own);
  for (const g of grids) {
    if (g.closest('.card')) continue;
    if (!g._items) {
      // A stack of cards is laid out with the rest: its cards join the grid in reading order.
      for (const c of [...g.children]) if (c.classList.contains('stack')) c.replaceWith(...c.children);
      g._items = [...g.children];
      // A card stretched to its place keeps its size when its content changes: its parts are watched too.
      for (const it of g._items) { watch?.observe(it); for (const part of it.children) watch?.observe(part); }
    }
    const items = g._items, C = columnsFor(g);
    if (items.length < 2 || items.length > 9 || !g.clientWidth) continue;
    if (C === 1) { if (g._key !== 'flat') { g._key = 'flat'; g._plan = null; flat(g, items); for (const it of items) unfill(it); g.style.gridTemplateColumns = ''; } continue; }
    const key = [location.hash.split('?')[0], C, Math.round(g.clientWidth / 24), ...items.map(titleOf)].join('|');
    if (g._key !== key) {
      g._key = key;
      const plan = plans.get(key);
      if (plan) build(g, items, plan, C); else measure(g, items, C, key);
    } else if (g._plan && natural(g).join() !== g._nat) place(g, C);
    check(g, C, key);
  }
}
