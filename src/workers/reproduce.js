// Reproduces the paper's results in the browser (§9.6): fetches the archived data of 4 October 2026,
// runs the same reproduction function as paper/compute.mjs, and compares every number with the
// published results.
import { reproduceCore } from '../model/reproduce.js';
import { compareResults, HEADLINES } from '../model/compare.js';

const FILES = ['vintage-2026-10-04.json', 'weo-vintages.json', 'results-2026-10-04.json'];
self.onmessage = async ({ data: { base, embedded } }) => {
  try {
    self.postMessage({ progress: 'Loading the archived data' });
    // The offline edition passes the archived data in; otherwise it is fetched from the host.
    const [snap, weo, published] = embedded ? [embedded.vintage, embedded.weo, embedded.results]
      : await Promise.all(FILES.map(f => fetch(new URL(`data/paper/${f}`, base)).then(r => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); })));
    const data = Object.fromEntries(Object.entries(snap.sources).map(([k, v]) => [k, v.data]));
    data.weoVintages = weo.vintages;
    const t0 = Date.now();
    const { out } = reproduceCore(data, { log: m => self.postMessage({ progress: m }) });
    const cmp = compareResults(out, published);
    const headlines = HEADLINES.map(([label, f, where]) => { let got = null, want = null; try { got = f(out); want = f(published); } catch {} return { label, where, got, want }; });
    self.postMessage({ done: true, seconds: (Date.now() - t0) / 1000, builtAt: snap.builtAt, ...cmp, mismatches: cmp.mismatches.slice(0, 50), headlines });
  } catch (e) {
    self.postMessage({ error: String(e?.message || e) });
  }
};
