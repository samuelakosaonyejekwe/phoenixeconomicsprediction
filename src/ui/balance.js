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
  }
}

// Cards side by side. A grid row makes its cards equally tall, which leaves a short card hollow next
// to a long one. Instead the cards are measured at column width and at full width and arranged so
// that the least area is left empty: each card goes into a column or across the whole row, columns
// are filled independently, and what little difference remains is taken up by the last card of the
// shorter column. Rows of similar cards are left as they are.
const PAIRS = '.grid-2, .grid-3';
const GAP = 16, FULL = -1, SPAN_COST = 55, EVEN = 48;
const SPLITS = [0.5, 0.46, 0.54, 0.42, 0.58, 0.38, 0.62];
const plans = new Map();
const frames = n => new Promise(done => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : done()); step(); });
const columnsFor = g => (matchMedia('(max-width: 1100px)').matches ? 1 : g.classList.contains('grid-3') && matchMedia('(min-width: 1400px)').matches ? 3 : 2);
const titleOf = el => el.querySelector('h3')?.firstChild?.textContent || el.className;

function flat(g, items) {
  g.classList.remove('bal', 'bal-m');
  for (const it of items) it.classList.remove('wide');
  if (g.children.length !== items.length || items.some((it, i) => g.children[i] !== it)) g.replaceChildren(...items);
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

function build(g, items, plan, C) {
  g._plan = plan;
  g._built = performance.now();
  if (plan.rows) {
    flat(g, items);
    g.style.gridTemplateColumns = plan.split?.[0] ? `${plan.split[0]}fr ${1 - plan.split[0]}fr` : `repeat(${C}, minmax(0, 1fr))`;
    items.forEach((it, i) => { it.style.gridColumn = i === items.length - 1 && items.length % C === 1 ? '1 / -1' : ''; });
    return;
  }
  g.style.gridTemplateColumns = '';
  let r = 0;
  const nodes = segments(plan.assign).map(seg => {
    if (seg.full !== undefined) { items[seg.full].classList.add('wide'); return items[seg.full]; }
    const row = document.createElement('div'), f = plan.split?.[r++];
    row.className = 'bal-row';
    row.style.gridTemplateColumns = f ? `${f}fr ${1 - f}fr` : `repeat(${C}, minmax(0, 1fr))`;
    for (let c = 0; c < C; c++) {
      const col = document.createElement('div');
      col.className = 'bal-col';
      for (const i of seg.cols[c] || []) { items[i].classList.remove('wide'); col.append(items[i]); }
      row.append(col);
    }
    return row;
  });
  for (const it of items) it.style.gridColumn = '';
  g.classList.add('bal');
  g.replaceChildren(...nodes);
}

// Two columns need not be equally wide: the split that brings their heights closest is kept.
function tune(g, C) {
  const plan = g._plan;
  const rows = plan.rows ? (g._items.length === 2 ? [g] : []) : [...g.querySelectorAll(':scope > .bal-row')];
  if (C !== 2 || !rows.length) return;
  g.classList.add('bal-m');
  plan.split = rows.map(row => {
    let best = null;
    for (const f of SPLITS) {
      row.style.gridTemplateColumns = `${f}fr ${1 - f}fr`;
      const d = Math.abs(row.children[0].offsetHeight - row.children[1].offsetHeight);
      if (!best || d < best.d - 20) best = { f, d };
      if (d <= 20) break;
    }
    row.style.gridTemplateColumns = `${best.f}fr ${1 - best.f}fr`;
    return best.f;
  });
  g.classList.remove('bal-m');
  plan.worst = drawn(g, C).worst;
}

// The largest hollow left in the arrangement as drawn, and the heights of its cards.
function drawn(g, C) {
  g.classList.add('bal-m');
  let worst = 0;
  const hs = g._items.map(it => it.offsetHeight);
  if (g._plan.rows) for (let i = 0; i + C <= hs.length; i += C) worst = Math.max(worst, Math.max(...hs.slice(i, i + C)) - Math.min(...hs.slice(i, i + C)));
  else for (const row of g.querySelectorAll(':scope > .bal-row')) {
    const cols = [...row.children].map(c => c.offsetHeight);
    worst = Math.max(worst, Math.max(...cols) - Math.min(...cols));
  }
  g.classList.remove('bal-m');
  return { worst, sig: hs.map(v => Math.round(v / 24)).join() };
}

async function measure(g, items, C, key) {
  const run = g._run = (g._run || 0) + 1;
  const stale = () => !g.isConnected || g._run !== run;
  g.style.visibility = 'hidden';
  try {
    flat(g, items);
    for (const it of items) it.style.gridColumn = '';
    g.classList.add('bal-m');
    g.style.gridTemplateColumns = `repeat(${C}, minmax(0, 1fr))`;
    await frames(3); if (stale()) return;
    const hCol = items.map(it => it.offsetHeight);
    g.style.gridTemplateColumns = 'minmax(0, 1fr)';
    for (const it of items) it.classList.add('wide');
    await frames(3); if (stale()) return;
    const hFull = items.map(it => it.offsetHeight);
    const plan = solve(hCol, hFull, C);
    plans.set(key, plan);
    g.classList.remove('bal-m');
    build(g, items, plan, C);
    tune(g, C);
  } finally { if (g._run === run) g.style.visibility = ''; }
}

// Charts draw a few frames after their card is placed, so the arrangement is judged once it has settled.
const SETTLE = 500;
function check(g, C, key) {
  if (g._checking) return;
  g._checking = true;
  setTimeout(() => {
    g._checking = false;
    if (!g.isConnected || !g._plan || g._key !== key || g.style.visibility) return;
    if (performance.now() - g._built < SETTLE) return check(g, C, key);
    // Measured again only when the cards have changed height since the arrangement was chosen (a table
    // opened, new data), so a difference that cannot be removed is not chased.
    const plan = g._plan, now = drawn(g, C);
    if (plan.sig === undefined) {
      // A card that changed while it was being measured: once more, and only once.
      if (now.worst > plan.worst + 2 * EVEN && !g._again) { g._again = true; return measure(g, g._items, C, key); }
      plan.sig = now.sig; plan.worst = Math.min(Math.max(plan.worst, now.worst), plan.worst + 2 * EVEN);
    } else if (now.sig !== plan.sig && now.worst > plan.worst + EVEN) { g._again = false; measure(g, g._items, C, key); }
  }, Math.max(50, SETTLE - (performance.now() - g._built) + 20));
}

// A card that changes height (a table view opened, a chart redrawn) has its group looked at again.
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
    // The cards of the grid in reading order; a stack of cards is laid out with the rest.
    if (!g._items) { g._items = [...g.children].flatMap(c => (c.classList.contains('stack') ? [...c.children] : [c])); for (const it of g._items) watch?.observe(it); }
    const items = g._items, C = columnsFor(g);
    if (items.length < 2 || items.length > 9 || !g.clientWidth) continue;
    if (C === 1) { if (g._key !== 'flat') { g._key = 'flat'; g._run = (g._run || 0) + 1; g._plan = null; flat(g, items); g.style.gridTemplateColumns = ''; for (const it of items) it.style.gridColumn = ''; } continue; }
    const key = [location.hash.split('?')[0], C, Math.round(g.clientWidth / 24), ...items.map(titleOf)].join('|');
    if (g._key !== key) {
      g._key = key;
      const plan = plans.get(key);
      if (plan) build(g, items, plan, C); else { measure(g, items, C, key); continue; }
    }
    check(g, C, key);
  }
}
