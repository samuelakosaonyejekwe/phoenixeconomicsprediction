// Full regression check (npm run test:full, about ten minutes): recomputes every published result of the
// paper from the archived data — including the forecast backtest, the optimisation frontier, the stress
// tests, the trial simulations and the stability analysis — and requires all of it to equal
// paper/results-2026-10-04.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareResults } from '../src/model/compare.js';

const root = new URL('..', import.meta.url).pathname; // repository root
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phx-')), 'results.json');
execFileSync('node', [path.join(root, 'paper/compute.mjs'), path.join(root, 'paper/vintage-2026-10-04.json'), out], { stdio: 'inherit' });
execFileSync('python3', [path.join(root, 'paper/stability.py'), out], { stdio: 'ignore' });
const got = JSON.parse(fs.readFileSync(out)), want = JSON.parse(fs.readFileSync(path.join(root, 'paper/results-2026-10-04.json')));
const cmp = compareResults(got, want, { only: [...new Set([...Object.keys(got), ...Object.keys(want)])] });
if (cmp.mismatches.length) {
  console.error(`FAILED: ${cmp.mismatches.length} of ${cmp.checked} published values differ`);
  for (const m of cmp.mismatches.slice(0, 30)) console.error(`  ${m.path}: recomputed ${m.got}, published ${m.want}`);
  process.exit(1);
}
console.log(`PASSED: all ${cmp.checked} published values reproduced`);
