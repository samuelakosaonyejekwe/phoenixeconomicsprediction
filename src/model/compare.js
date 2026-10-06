// Compares reproduced results with the published ones (paper/results-2026-10-04.json). Both sides are
// taken through JSON; within each section compared, every key on either side is compared, and numbers
// must agree to a relative tolerance of 1e-9 (the same code on the same data gives identical
// floating-point results; the tolerance allows for a different arithmetic library).
const canon = v => JSON.parse(JSON.stringify(v));

export function compareResults(reproduced, published, { rel = 1e-9, abs = 1e-12, only = null } = {}) {
  const got = canon(reproduced), mismatches = [];
  let checked = 0;
  const walk = (a, b, path) => {
    if (typeof a === 'number' || typeof b === 'number') {
      checked++;
      if (!(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b)))) mismatches.push({ path, got: a, want: b });
      return;
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      checked++;
      if (a !== b) mismatches.push({ path, got: a, want: b });
      return;
    }
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b?.length ?? 0)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b || {})])];
    for (const k of keys) walk(a[k], b?.[k], path ? `${path}.${k}` : String(k));
  };
  // Sections: those reproduced, or those named in `only`. Within a section every key either side holds
  // is compared, so nothing published in it can be skipped silently.
  for (const k of only || Object.keys(got)) walk(got[k], published[k], k);
  return { checked, matched: checked - mismatches.length, mismatches };
}

// Headline figures shown on the Evidence page, each with its place in the paper.
export const HEADLINES = [
  ['Excess deposits, EU-27 today (€bn)', o => o.refCell.today.sectors.hh + o.refCell.today.sectors.corp + o.refCell.today.sectors.gov, '§3.2'],
  ['Threshold S_crit, % of GDP (90th percentile)', o => o.measure.crit.p90, '§3.3'],
  ['Phillips slope κ (IV)', o => o.phillips.full.iv.kappa, 'Table 4'],
  ['Reversion a (IV)', o => o.phillips.full.iv.aAnnual, 'Table 4'],
  ['Energy pass-through γ_E (IV)', o => o.phillips.full.iv.gammaE, 'Table 4'],
  ['Real-time error, model given energy (pp)', o => o.phillipsRealTime.iv.cond, 'Table 5'],
  ['Homogeneity of persistence, F', o => o.homogeneity.F, '§3.6'],
  ['December 2021: absorbed over 24 months (€bn)', o => o.ref2021.totals.absorbed, 'Table 11'],
  ['December 2021: effect on inflation at month 24 (pp)', o => o.ref2021.rows.at(-1).on.pi - o.ref2021.rows.at(-1).off.pi, 'Table 11'],
  ['Validation RMSE, realised energy (pp)', o => o.validation['actual rates, realised energy'].rmse, '§7.2'],
  ['Euro area live: absorbed over 24 months (€bn)', o => o.live.ea.totals.absorbed, 'Table 9'],
  ['Policy-rate equivalent (basis points)', o => o.instruments.rateEquivBp, '§7.8'],
];
