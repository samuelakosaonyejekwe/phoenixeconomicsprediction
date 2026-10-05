// Regression test: the model in src/ reproduces the published results of Phoenix Economics Solutions
// (paper/results-2026-10-04.json) from the archived data, and the application uses the paper's settings.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reproduceCore, AS_OF } from '../src/model/reproduce.js';
import { compareResults, HEADLINES } from '../src/model/compare.js';
import { DEFAULTS, SCENARIOS } from '../src/model/params.js';
import { IMF_INFL_RMSE } from '../src/model/imf-errors.js';
import { targetAt } from '../src/model/targets.js';

const read = f => JSON.parse(fs.readFileSync(new URL(`../paper/${f}`, import.meta.url)));
const published = read('results-2026-10-04.json');

test('application defaults are the paper’s parameters (Table 6)', () => {
  assert.deepEqual(DEFAULTS, published.params);
});

test('the global monitor uses the published IMF forecast errors (§6.1)', () => {
  const r = published.globalForecastError.rmse;
  assert.deepEqual(Object.keys(IMF_INFL_RMSE).sort(), Object.keys(r).sort());
  for (const [k, v] of Object.entries(r)) assert.ok(Math.abs(IMF_INFL_RMSE[k] - v) < 0.0051, k);
});

test('inflation targets in force match the central banks’ records (§5.1)', () => {
  const cases = [['CZ', '2000-12', 4.5], ['CZ', '2001-12', 3], ['CZ', '2002-01', 4], ['CZ', '2005-12', 3], ['CZ', '2009-12', 3], ['CZ', '2010-01', 2],
    ['HU', '2001-12', 7], ['HU', '2002-12', 4.5], ['HU', '2005-12', 4], ['HU', '2006-12', 3.5], ['HU', '2007-01', 3],
    ['PL', '2000-12', 6.1], ['PL', '2001-12', 7], ['PL', '2002-05', 5], ['PL', '2002-06', 3], ['PL', '2003-12', 3], ['PL', '2004-01', 2.5],
    ['RO', '2005-12', 7.5], ['RO', '2008-12', 3.8], ['RO', '2012-12', 3], ['RO', '2013-01', 2.5], ['SE', '2001-01', 2], ['DE', '2001-01', 2]];
  for (const [eu, m, want] of cases) assert.ok(Math.abs(targetAt(eu, m) - want) < 1e-9, `${eu} ${m}: ${targetAt(eu, m)}`);
});

test('the December 2021 scenario uses the paper’s real-time cut', () => {
  assert.equal(SCENARIOS.episode.asOf, AS_OF);
});

test('every published core result is reproduced from the archived data', { timeout: 30 * 60 * 1000 }, () => {
  const snap = read('vintage-2026-10-04.json');
  const data = Object.fromEntries(Object.entries(snap.sources).map(([k, v]) => [k, v.data]));
  data.weoVintages = read('weo-vintages.json').vintages;
  const { out } = reproduceCore(data);
  const cmp = compareResults(out, published);
  assert.ok(cmp.checked > 5000, `only ${cmp.checked} values compared`);
  assert.equal(cmp.mismatches.length, 0, `mismatches:\n${cmp.mismatches.slice(0, 20).map(m => `${m.path}: got ${m.got}, published ${m.want}`).join('\n')}`);
  for (const [label, f] of HEADLINES) assert.ok(Number.isFinite(f(out)), label);
});
