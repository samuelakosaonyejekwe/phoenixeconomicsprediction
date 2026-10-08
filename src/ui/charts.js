// Dependency-free SVG/HTML charts: line (with bands and crosshair), stacked bars,
// heat matrix, tile map, dot map, sparkline and meter. Charts of series and bars offer a table view.
import { h, s, clear, showTip, hideTip, num, small } from './dom.js';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const RED = ['#f8dcdb', '#f0a9a8', '#e66767', '#d03b3b', '#9e2626'];
const BLUE = ['#d6e6fb', '#9ec5f4', '#5598e7', '#256abf', '#104281'];
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}
export const seqColor = t => ramp(dark() ? [...SEQ].reverse() : SEQ, t);
export function divColor(v, max) {
  const mid = dark() ? '#383835' : '#f0efec';
  if (!max || Math.abs(v) < 1e-12) return mid;
  const t = Math.min(1, Math.abs(v) / max);
  return v > 0 ? ramp([mid, ...RED.slice(1)], t) : ramp([mid, ...BLUE.slice(1)], t);
}
export const inkOn = c => {
  let r, g, b;
  if (/^#[0-9a-f]{6}$/i.test(c)) [r, g, b] = hex(c);
  else { const m = c.match(/\d+/g); if (!m) return '#0b0b0b'; [r, g, b] = m.map(Number); }
  // Whichever of near-black and white has the higher contrast ratio against the colour (WCAG 2 relative luminance).
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (L + 0.05) / 0.053 >= 1.05 / (L + 0.05) ? '#0b0b0b' : '#ffffff';
};

function niceTicks(min, max, n = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(x => span / x <= n) || mag * 10;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(+v.toPrecision(12));
  return out;
}

// Charts draw to the width of their host and again when it changes. The layout (ui/balance.js) may ask
// for a drawing at once, before the next frame, and may give a chart spare height to fill.
function onResize(el, draw, { byWidth = false, tall = false } = {}) {
  let w = 0, extra = 0;
  el.setAttribute('data-fit', byWidth ? 'w' : 'h');
  el._fit = {
    byWidth, tall,
    redraw() { const nw = Math.round(el.clientWidth); if (nw) { w = nw; draw(nw, extra); } },
    grow(px) { px = Math.max(0, Math.round(px)); if (px !== extra) { extra = px; if (w) draw(w, extra); } },
  };
  const ro = new ResizeObserver(entries => {
    const nw = Math.round(entries[0].contentRect.width);
    if (nw && Math.abs(nw - w) > 2) { w = nw; requestAnimationFrame(() => draw(nw, extra)); }
  });
  ro.observe(el);
}

// Card with title, subtitle, optional legend and a table-view toggle.
export function card({ title, sub, legend, body, table, actions, cls }) {
  const tableHost = h('div', { class: 'tbl-host', hidden: true });
  let tableOn = false;
  const btn = table ? h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => {
    tableOn = !tableOn; btn.setAttribute('aria-pressed', String(tableOn));
    tableHost.hidden = !tableOn; bodyHost.hidden = tableOn;
    if (tableOn && !tableHost.firstChild) tableHost.append(dataTable(table()));
  } }, 'Table') : null;
  const bodyHost = h('div', { class: 'card-body' }, body);
  return h('section', { class: ['card', cls] },
    h('header', { class: 'card-h' },
      // Card titles follow the page heading directly: they are second-level headings to assistive technology.
      h('div', null, h('h3', { 'aria-level': 2 }, title), sub ? h('p', { class: 'sub' }, sub) : null),
      h('div', { class: 'card-a' }, actions, btn)),
    legend ? legendEl(legend) : null, bodyHost, tableHost);
}

export function legendEl(items) {
  return h('ul', { class: 'legend' }, items.map(it => h('li', { 'data-tip': it.tip },
    h('span', { class: it.line ? 'lg-line' : 'lg-box', style: { background: it.color, ...(it.dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`, background: 'none' } : {}) } }),
    it.label)));
}

export function dataTable({ cols, rows }) {
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, cols.map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', null, rows.map(r => h('tr', null, r.map((v, i) => (i ? h('td', null, v) : h('th', { scope: 'row' }, v))))))));
}

// Multi-series line chart with optional uncertainty bands, reference lines and crosshair.
export function lineChart({ series, bands = [], height = 220, yFmt = v => num(v, 1), xFmt = v => num(v, 0), refs = [], vlines = [], yMin, yMax, xLabel, gap = false }) {
  // gap: the chart compares two paths that may coincide at its scale; their difference is then stated
  // in figures, under the chart and beside the pointer.
  // A difference a thousand-millionth the size of the values is the rounding error of the arithmetic, not an effect.
  const gapAt = xv => { const [p, q] = series.map(se => se.values.find(v => v[0] === xv)); if (!p || !q) return null; const d = p[1] - q[1]; return Math.abs(d) <= 1e-9 * Math.max(1, Math.abs(p[1]), Math.abs(q[1])) ? 0 : d; };
  const host = h('div', { class: 'chart', tabindex: 0, role: 'img', 'aria-label': series.map(s => s.name).join(', ') });
  const all = series.flatMap(s => s.values);
  const xs = [...new Set(all.map(v => v[0]))].sort((a, b) => a - b);
  const ys = [...all.map(v => v[1]), ...bands.flatMap(b => b.values.flatMap(v => [v[1], v[2]])), ...refs.map(r => r.y)].filter(Number.isFinite);
  let lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
  // A flat series gets room above it only when it is not negative, so a quantity that cannot be
  // negative is never drawn on a negative axis.
  const nonNeg = lo >= 0;
  if (lo === hi) { const span = Math.abs(lo) || 1; hi += span; if (!nonNeg) lo -= span; }
  const pad = (hi - lo) * 0.08; if (yMin === undefined) lo = nonNeg ? Math.max(0, lo - pad) : lo - pad; if (yMax === undefined) hi += pad;
  const ticks = niceTicks(lo, hi, 4);
  lo = nonNeg && yMin === undefined ? Math.max(0, Math.min(lo, ticks[0])) : Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];

  onResize(host, (W, extra = 0) => {
    clear(host);
    // The margins are as wide as the labels that stand in them: the longest figure of the scale on the
    // left, half of the last label of the horizontal axis on the right.
    const m = { l: Math.max(46, Math.max(...ticks.map(t => String(yFmt(t)).length)) * 6.7 + 12), r: Math.max(12, String(xFmt(x1)).length * 3.4 + 4), t: 10, b: 24 }, H = height + extra;
    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'svg' });
    // A label is printed once: where rounding gives two ticks the same text, the second is left blank.
    let lastLabel = null;
    for (const t of ticks) {
      const label = yFmt(t);
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid' }));
      svg.append(s('text', { x: m.l - 6, y: Y(t) + 4, class: 'tick', 'text-anchor': 'end' }, label === lastLabel ? '' : label));
      lastLabel = label;
    }
    const xt = niceTicks(x0, x1, Math.max(2, Math.floor((W - m.l) / 70)));
    for (const t of xt) if (t >= x0 && t <= x1) svg.append(s('text', { x: X(t), y: H - m.b + 16, class: 'tick', 'text-anchor': 'middle' }, xFmt(t)));
    for (const b of bands) {
      const top = b.values.map(v => `${X(v[0])},${Y(v[2])}`), bot = b.values.slice().reverse().map(v => `${X(v[0])},${Y(v[1])}`);
      svg.append(s('polygon', { points: [...top, ...bot].join(' '), style: { fill: b.color, opacity: b.opacity ?? 0.14 } }));
    }
    // A label is written where no curve passes: each place it could go is tried against the drawn paths
    // (and the labels already written), and the first free one is taken.
    const paths = [...series.map(se => se.values.map(v => [X(v[0]), Y(v[1])])), ...bands.flatMap(b => [b.values.map(v => [X(v[0]), Y(v[1])]), b.values.map(v => [X(v[0]), Y(v[2])])])];
    const taken = [];
    const free = (xa, ya, xb, yb) => xa >= m.l - 1 && xb <= W - 2 && ya >= 0 && yb <= H - m.b + 1
      && !taken.some(t => xa < t[2] && xb > t[0] && ya < t[3] && yb > t[1])
      && !paths.some(pts => pts.some((p, k) => {
        if (p[0] >= xa && p[0] <= xb && p[1] >= ya && p[1] <= yb) return true;
        const q = pts[k + 1];
        if (!q || Math.max(p[0], q[0]) < xa || Math.min(p[0], q[0]) > xb) return false;
        // The segment, sampled across the box: a steep line can cross it between two points.
        for (let f = 0.1; f < 1; f += 0.1) { const x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f; if (x >= xa && x <= xb && y >= ya && y <= yb) return true; }
        return false;
      }));
    const label = (text, places) => {
      const w = String(text).length * 6.4 + 6;
      const spot = places.map(([x, y, anchor]) => ({ x, y, anchor, box: anchor === 'end' ? [x - w, y - 11, x + 2, y + 3] : [x - 2, y - 11, x + w, y + 3] })).find(c => free(...c.box));
      if (!spot) return;   // nowhere free: the value is in the tooltip and the table
      taken.push(spot.box);
      svg.append(s('text', { x: spot.x, y: spot.y, class: 'ref-t', 'text-anchor': spot.anchor }, text));
    };
    for (const r of refs) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), class: 'ref' }));
      const y = Y(r.y), xs3 = [[W - m.r - 4, 'end'], [m.l + 6, 'start'], [(m.l + W - m.r) / 2 + 40, 'end'], [(m.l + W - m.r) / 2 - 40, 'start']];
      if (r.label) label(r.label, xs3.flatMap(([x, anchor]) => [[x, y - 5, anchor], [x, y + 13, anchor]]));
    }
    for (const v of vlines) {
      if (v.x < x0 || v.x > x1) continue;
      svg.append(s('line', { x1: X(v.x), x2: X(v.x), y1: m.t, y2: H - m.b, class: 'ref' }));
      const x = X(v.x), ys = [m.t + 10, H - m.b - 6, (m.t + H - m.b) / 2];
      if (v.label) label(v.label, ys.flatMap(y => [[x + 4, y, 'start'], [x - 4, y, 'end']]));
    }
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
    for (const se of series) {
      if (!se.values.length) continue;
      const d = se.values.map((v, i) => `${i ? 'L' : 'M'}${X(v[0]).toFixed(1)},${Y(v[1]).toFixed(1)}`).join('');
      if (se.area) svg.append(s('path', { d: `${d}L${X(se.values[se.values.length - 1][0])},${Y(Math.max(lo, 0))}L${X(se.values[0][0])},${Y(Math.max(lo, 0))}Z`, style: { fill: se.color, opacity: 0.1 } }));
      svg.append(s('path', { d, class: 'line', style: { stroke: se.color, strokeDasharray: se.dash ? '5 4' : null, strokeWidth: se.width || 2 } }));
      const lv = se.values[se.values.length - 1];
      svg.append(s('circle', { cx: X(lv[0]), cy: Y(lv[1]), r: 4, class: 'dot', style: { fill: se.color } }));
    }
    const cross = s('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' });
    const dots = series.map(se => s('circle', { r: 4.5, class: 'dot', style: { fill: se.color }, visibility: 'hidden' }));
    svg.append(cross, ...dots);
    let idx = -1;
    const place = (i, cx, cy) => {
      idx = Math.max(0, Math.min(xs.length - 1, i));
      const xv = xs[idx];
      cross.setAttribute('x1', X(xv)); cross.setAttribute('x2', X(xv)); cross.setAttribute('visibility', 'visible');
      const rows = [];
      series.forEach((se, k) => {
        const p = se.values.find(v => v[0] === xv) || se.values.reduce((a, b) => (Math.abs(b[0] - xv) < Math.abs(a[0] - xv) ? b : a), se.values[0]);
        if (!p) return;
        dots[k].setAttribute('cx', X(p[0])); dots[k].setAttribute('cy', Y(p[1])); dots[k].setAttribute('visibility', 'visible');
        rows.push({ color: se.color, value: yFmt(p[1]), label: se.name });
      });
      if (gap && gapAt(xv) !== null) rows.push({ value: small(gapAt(xv), 4), label: 'Difference' });
      const r = host.getBoundingClientRect();
      showTip(cx ?? r.left + X(xv), cy ?? r.top + m.t, rows, xFmt(xv));
    };
    const hit = s('rect', { x: m.l, y: 0, width: Math.max(1, W - m.l - m.r), height: H, fill: 'transparent' });
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(), xv = x0 + (e.clientX - r.left - m.l) / (W - m.l - m.r) * (x1 - x0);
      let best = 0; xs.forEach((x, i) => { if (Math.abs(x - xv) < Math.abs(xs[best] - xv)) best = i; });
      place(best, e.clientX, e.clientY);
    });
    const leave = () => { hideTip(); cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); };
    hit.addEventListener('pointerleave', leave);
    host.onkeydown = e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); place(idx < 0 ? xs.length - 1 : idx + (e.key === 'ArrowRight' ? 1 : -1)); }
      if (e.key === 'Escape') leave();
    };
    host.onblur = leave;
    svg.append(hit);
    host.append(svg);
    // The axis caption is ordinary text below the plot, so a long one wraps instead of being cut off.
    if (xLabel) host.append(h('p', { class: 'chart-cap' }, xLabel));
    if (gap) {
      const far = xs.reduce((best, xv) => { const d = gapAt(xv); return d !== null && Math.abs(d) > Math.abs(best[1]) ? [xv, d] : best; }, [xs[0], 0]);
      host.append(h('p', { class: 'chart-cap gap' }, far[1] === 0 ? 'The two paths are the same: no difference beyond rounding error.' : `Largest difference (first minus second): ${small(far[1], 4)} at ${xFmt(far[0])}; at the end ${small(gapAt(xs[xs.length - 1]) ?? 0, 4)}.`));
      // The difference itself, on its own scale: the two paths cannot be told apart at the chart's.
      const ds = xs.map(xv => [xv, gapAt(xv)]).filter(p => p[1] !== null), dLo = Math.min(0, ...ds.map(p => p[1])), dHi = Math.max(0, ...ds.map(p => p[1]));
      if (dHi - dLo > 0) {
        const h2 = 60, Y2 = v => 8 + (1 - (v - dLo) / (dHi - dLo)) * (h2 - 16);
        const strip = s('svg', { width: W, height: h2, class: 'svg gap-svg', 'aria-hidden': 'true' });
        strip.append(s('line', { x1: m.l, x2: W - m.r, y1: Y2(0), y2: Y2(0), class: 'grid' }),
          s('path', { d: ds.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y2(p[1]).toFixed(1)}`).join(''), class: 'line' }),
          // The scale is written in the margin left of the strip, beside it and never on it; a long figure is
          // fitted to the margin, so it cannot reach outside the card either.
          ...[dHi, dLo].map(v => { const t = v === 0 ? '0' : small(v, 4); return s('text', { x: m.l - 6, y: Y2(v) + 4, class: 'tick', 'text-anchor': 'end', ...(t.length > 6 ? { textLength: m.l - 10, lengthAdjust: 'spacingAndGlyphs' } : {}) }, t); }));
        host.append(h('p', { class: 'chart-cap' }, 'The difference on its own scale'), strip);
      }
    }
  }, { tall: true });
  return host;
}

// Horizontal stacked bars (HTML) — rows: [{label, sub, segments:[{name,value,color}], marker, onClick}]
export function stackedBars({ rows, fmt, max, markerLabel }) {
  const M = max ?? Math.max(1e-9, ...rows.map(r => Math.max(r.segments.reduce((a, b) => a + Math.max(0, b.value), 0), r.marker ?? 0)));
  return h('div', { class: 'bars' }, rows.map(r => {
    const total = r.segments.reduce((a, b) => a + Math.max(0, b.value), 0);
    const track = h('div', { class: 'bar-track' },
      r.segments.filter(sg => sg.value > 0).map(sg => {
        const seg = h('span', { class: 'bar-seg', style: { width: `${sg.value / M * 100}%`, background: sg.color }, tabindex: -1 });
        seg.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, [{ color: sg.color, value: fmt(sg.value), label: sg.name }], r.label));
        seg.addEventListener('pointerleave', hideTip);
        return seg;
      }),
      r.marker !== undefined ? h('span', { class: 'bar-mark', style: { left: `${Math.min(100, r.marker / M * 100)}%` }, title: markerLabel }) : null);
    return h(r.onClick ? 'button' : 'div', { class: 'bar-row', onclick: r.onClick, type: r.onClick ? 'button' : null },
      h('span', { class: 'bar-l' }, r.label, r.sub ? h('small', null, r.sub) : null), track, h('span', { class: 'bar-v' }, fmt(total)));
  }));
}

// Matrix heatmap with diverging colour (e.g. the ACK kernel K(x, y)).
export function heatMatrix({ matrix, labels, fmt = v => num(v, 3), title = '' }) {
  // One tab stop for the whole matrix; the arrow keys move from cell to cell and read out each value.
  const host = h('div', { class: 'chart', tabindex: 0, role: 'group', 'aria-label': `${title ? `${title}: ` : ''}matrix of ${labels.length} by ${labels.length}; use the arrow keys to read each cell` });
  const live = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const max = Math.max(1e-12, ...matrix.flat().map(Math.abs));
  let rects = [], at = [0, 0];
  const read = () => {
    const r = rects[at[0]]?.[at[1]]; if (!r) return;
    for (const row of rects) for (const c of row) c.classList.remove('kb');
    r.classList.add('kb');
    const b = r.getBoundingClientRect(), text = `${labels[at[0]]} → ${labels[at[1]]}`;
    showTip(b.right, b.bottom, [{ value: fmt(matrix[at[0]][at[1]]), label: text }], title);
    live.textContent = `${text}: ${fmt(matrix[at[0]][at[1]])}`;
  };
  host.addEventListener('keydown', e => {
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    at = [Math.min(labels.length - 1, Math.max(0, at[0] + d[0])), Math.min(labels.length - 1, Math.max(0, at[1] + d[1]))];
    read();
  });
  host.addEventListener('focus', read);
  host.addEventListener('blur', () => { hideTip(); for (const row of rects) for (const c of row) c.classList.remove('kb'); });
  onResize(host, W => {
    clear(host);
    const n = labels.length, lab = 30, cell = Math.max(6, Math.min(26, (W - lab - 4) / n));
    const size = lab + cell * n;
    const svg = s('svg', { width: size, height: size, class: 'svg' });
    labels.forEach((l, i) => {
      svg.append(s('text', { x: lab - 4, y: lab + cell * i + cell / 2 + 3, class: 'tick', 'text-anchor': 'end' }, l));
      // Column labels only where they fit beside each other; every cell names its pair on hover.
      svg.append(s('text', { x: lab + cell * i + cell / 2, y: lab - 6, class: 'tick', 'text-anchor': 'middle' }, cell >= 7 * String(l).length + 2 ? l : ''));
    });
    rects = matrix.map(() => []);
    matrix.forEach((row, i) => row.forEach((v, j) => {
      const r = s('rect', { x: lab + cell * j + 1, y: lab + cell * i + 1, width: cell - 2, height: cell - 2, rx: 2, style: { fill: divColor(v, max) }, class: 'cell' });
      r.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, [{ value: fmt(v), label: `${labels[i]} → ${labels[j]}` }], title));
      r.addEventListener('pointerleave', hideTip);
      rects[i][j] = r;
      svg.append(r);
    }));
    host.append(svg, live);
  }, { byWidth: true });
  return host;
}

// Tile-grid map of Europe; cells need col/row.
export function tileMap({ cells, value, color, fmt, onSelect, selected, label = c => c.id }) {
  const cols = Math.max(...cells.map(c => c.col)) + 1, rows = Math.max(...cells.map(c => c.row)) + 1;
  return h('div', { class: 'tiles', style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` } },
    cells.map(c => {
      const v = value(c), bg = color(v, c);
      const b = h('button', { class: ['tile', selected === c.id && 'sel'], type: 'button', style: { gridColumn: c.col + 1, gridRow: c.row + 1, background: bg, color: inkOn(bg) }, onclick: () => onSelect?.(c) },
        // Named by its own text, with the economy's full name added for assistive technology.
        h('b', null, label(c)), ' ', h('small', null, fmt(v)), h('span', { class: 'sr-only' }, `, ${c.name}`));
      b.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, [{ value: fmt(v), label: c.name }]));
      b.addEventListener('pointerleave', hideTip);
      return b;
    }));
}

// Equirectangular dot map for the global panel (no geometry download required).
export function dotMap({ cells, value, color, fmt, size = c => c.gdp, onSelect }) {
  const host = h('div', { class: 'chart' });
  const maxS = Math.max(...cells.map(size));
  onResize(host, W => {
    clear(host);
    const H = Math.round(W * 0.46);
    const X = lon => (lon + 170) / 340 * W, Y = lat => (75 - lat) / 125 * H;
    const svg = s('svg', { width: W, height: H, class: 'svg' });
    for (let lat = -40; lat <= 60; lat += 20) svg.append(s('line', { x1: 0, x2: W, y1: Y(lat), y2: Y(lat), class: 'grid' }));
    for (let lon = -150; lon <= 150; lon += 30) svg.append(s('line', { x1: X(lon), x2: X(lon), y1: 0, y2: H, class: 'grid' }));
    svg.append(s('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), class: 'axis' }));
    const sorted = [...cells].sort((a, b) => size(b) - size(a));
    // A name is written under its economy only where it does not fall on a name already written (the
    // largest economies first); every economy names itself on hover and focus.
    const names = [];
    const room = (x, y, text) => { const w = String(text).length * 6.6 + 4, box = [x - w / 2, y - 10, x + w / 2, y + 2]; if (names.some(t => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) return false; names.push(box); return true; };
    for (const c of sorted) {
      const v = value(c), r = 4 + 16 * Math.sqrt(size(c) / maxS);
      const g = s('g', { class: 'dotg', tabindex: 0, role: 'button', 'aria-label': `${c.name}: ${fmt(v)}` },
        s('circle', { cx: X(c.lon), cy: Y(c.lat), r: Math.max(8, r), fill: 'transparent' }),
        s('circle', { cx: X(c.lon), cy: Y(c.lat), r, class: 'bubble', style: { fill: color(v, c) } }),
        W > 380 && room(X(c.lon), Y(c.lat) + r + 11, c.id) ? s('text', { x: X(c.lon), y: Y(c.lat) + r + 11, class: 'tick', 'text-anchor': 'middle' }, c.id) : null);
      g.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, [{ value: fmt(v), label: c.name }]));
      g.addEventListener('pointerleave', hideTip);
      g.addEventListener('click', () => onSelect?.(c));
      g.addEventListener('keydown', e => { if (e.key === 'Enter') onSelect?.(c); });
      svg.append(g);
    }
    host.append(svg);
  }, { byWidth: true });
  return host;
}

export function sparkline(values, { w = 96, h: H = 28, color = 'var(--s1)' } = {}) {
  if (!values.length) return h('span');
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (w - 4) + 2},${H - 3 - (v - lo) / span * (H - 6)}`);
  const last = pts[pts.length - 1].split(',');
  return s('svg', { width: w, height: H, class: 'spark', 'aria-hidden': 'true' },
    s('polyline', { points: pts.join(' '), style: { stroke: color, fill: 'none', strokeWidth: 1.6 } }),
    s('circle', { cx: last[0], cy: last[1], r: 2.5, style: { fill: color } }));
}

export function meter(value, { max = 1, label, fmt = v => num(v, 2), warn = 0.7, crit = 0.9 } = {}) {
  const t = Math.max(0, Math.min(1, value / max));
  const tone = t >= crit ? 'crit' : t >= warn ? 'warn' : 'ok';
  return h('div', { class: 'meter', role: 'meter', 'aria-valuenow': Math.min(max, Math.max(0, value)), 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-label': label },
    h('div', { class: 'meter-top' }, h('span', null, label), h('b', null, fmt(value))),
    h('div', { class: ['meter-track', tone] }, h('span', { style: { width: `${t * 100}%` } })));
}
