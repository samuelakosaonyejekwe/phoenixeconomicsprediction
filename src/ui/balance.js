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
