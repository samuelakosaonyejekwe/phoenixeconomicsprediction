// Builds public/data/snapshot.json from every connector plus the server-only sources (IMF DataMapper,
// Brent, BIS). Run by CI every hour so a fresh baseline ships with every deployment. A source that fails
// or returns implausible data keeps its copy from the last deployed snapshot (or, failing that, the
// snapshot in the repository), and the failure is reported as a CI warning.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { CONNECTORS, SERVER_SOURCES } from '../src/data/sources.js';
import { checkSource, compact } from '../src/data/check.js';

const OUT = new URL('../public/data/snapshot.json', import.meta.url);
const mirrors = JSON.parse(await readFile(new URL('../mirrors.json', import.meta.url), 'utf8'));
const warn = msg => console.log(process.env.GITHUB_ACTIONS ? `::warning title=Data source::${msg}` : `warning: ${msg}`);

async function deployed() {
  for (const base of [mirrors.primary, ...(mirrors.dataEndpoints || [])]) {
    try {
      const url = base.endsWith('.json') ? base : new URL('data/snapshot.json', base).href;
      const r = await fetch(url, { headers: { 'user-agent': 'PhoenixEconomics-build' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) { const j = await r.json(); if (j?.sources) return j; }
    } catch {}
  }
  return null;
}
let previous = await deployed();
if (!previous) { try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { previous = {}; } }

const sources = {};
async function take(id, run) {
  const t0 = Date.now();
  try {
    const data = await run();
    const bad = checkSource(id, data);
    if (bad) throw new Error(`implausible: ${bad}`);
    sources[id] = { data, fetchedAt: new Date().toISOString() };
    console.log(`ok   ${id} ${Date.now() - t0}ms`);
  } catch (e) {
    const prev = previous.sources?.[id];
    warn(`${id}: ${e.message}${prev ? ` (keeping the copy fetched ${prev.fetchedAt})` : ' (no previous copy)'}`);
    if (prev) sources[id] = prev;
  }
}
await Promise.all([...CONNECTORS.map(c => take(c.id, c.run)), ...Object.entries(SERVER_SOURCES).map(([id, run]) => take(id, run))]);

if (!Object.keys(sources).length) {
  console.error('No sources reachable and no previous snapshot.');
  process.exit(1);
}
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ builtAt: new Date().toISOString(), sources }, compact));
console.log('snapshot written');
