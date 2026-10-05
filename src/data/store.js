// Data orchestration in the visitor's browser:
//   1. render instantly from the IndexedDB cache (works offline / airplane mode),
//   2. fall back to the bundled snapshot (same origin, then any mirror),
//   3. refresh every connector live from the publishers and persist the result.
import { CONNECTORS } from './sources.js';
import { checkSource } from './check.js';

const DB = 'phoenix', STORE = 'kv';
let dbp;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
export async function kvGet(key) {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  } catch { return undefined; }
}
export async function kvSet(key, val) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch {}
}

export const MIRRORS = (globalThis.PHX_MIRRORS || []);

const DATA_ENDPOINTS = (globalThis.PHX_DATA_ENDPOINTS || []);

async function getSnap(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    // Only a real snapshot counts: anything else lets the next mirror be tried.
    return j && j.builtAt && j.sources && Object.keys(j.sources).length ? { ...j, from: url } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// Baseline snapshots from every independent publisher at once: this host (rebuilt by GitHub)
// and the Cloudflare refresh worker. Sources are merged newest-first, so either can be down.
async function fetchSnapshots() {
  if (globalThis.PHX_EMBED_SNAPSHOT) return [{ ...globalThis.PHX_EMBED_SNAPSHOT, from: 'embedded' }, ...(location.protocol === 'file:' ? (await Promise.all(DATA_ENDPOINTS.map(getSnap))).filter(Boolean) : [])];
  if (location.protocol === 'file:') return [];
  const primary = [new URL('data/snapshot.json', location.href).href, ...DATA_ENDPOINTS];
  let got = (await Promise.all(primary.map(getSnap))).filter(Boolean);
  if (!got.length) {
    for (const m of MIRRORS.filter(m => !location.href.startsWith(m))) {
      const s = await getSnap(new URL('data/snapshot.json', m).href);
      if (s) { got = [s]; break; }
    }
  }
  return got;
}

// sources: { id: { data, fetchedAt, origin: 'live'|'cache'|'snapshot' } }
export function createDataStore(onChange) {
  const sources = {};
  const status = Object.fromEntries(CONNECTORS.map(c => [c.id, { state: 'idle' }]));
  status.imf = { state: 'idle' }; status.oilm = { state: 'idle' }; status.rates = { state: 'idle' };
  status.brent = { state: 'idle' };
  let snapshotInfo = null, refreshing = false;

  // A copy is newer if fetched later, with fetch times capped at now so a wrong clock can never pin a copy.
  const at = v => (v?.fetchedAt && v.fetchedAt < new Date().toISOString() ? v.fetchedAt : v?.fetchedAt ? new Date(0).toISOString() : '');
  const newer = (a, b) => !b || (a && at(a) > at(b));
  const emit = () => onChange({ sources, status, snapshotInfo, refreshing });

  async function boot() {
    const cached = await kvGet('sources');
    if (cached) for (const [k, v] of Object.entries(cached)) { sources[k] = { ...v, origin: 'cache' }; status[k] = { state: 'cached', at: v.fetchedAt }; }
    if (Object.keys(sources).length) emit();
    const snaps = await fetchSnapshots();
    if (snaps.length) {
      snaps.sort((a, b) => (a.builtAt < b.builtAt ? 1 : -1));
      snapshotInfo = { builtAt: snaps[0].builtAt, from: snaps[0].from, all: snaps.map(x => ({ from: x.from, builtAt: x.builtAt })) };
      for (const snap of snaps) {
        for (const [k, v] of Object.entries(snap.sources || {})) {
          if (newer(v, sources[k])) { sources[k] = { ...v, origin: 'snapshot' }; status[k] = { state: 'snapshot', at: v.fetchedAt }; }
        }
      }
      await persist();
    }
    emit();
    return refresh();
  }

  async function persist() {
    const plain = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { data: v.data, fetchedAt: v.fetchedAt }]));
    await kvSet('sources', plain);
  }

  async function refresh() {
    if (refreshing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { emit(); return; }
    refreshing = true; emit();
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(emit, 250); };
    await Promise.all(CONNECTORS.map(async c => {
      const t0 = performance.now();
      status[c.id] = { ...status[c.id], state: 'loading' }; soon();
      try {
        const data = await c.run();
        const bad = checkSource(c.id, data);
        if (bad) throw new Error(`implausible data (${bad}); keeping the previous copy`);
        sources[c.id] = { data, fetchedAt: new Date().toISOString(), origin: 'live' };
        status[c.id] = { state: 'live', at: sources[c.id].fetchedAt, ms: Math.round(performance.now() - t0) };
      } catch (e) {
        status[c.id] = { state: sources[c.id] ? 'stale' : 'error', at: sources[c.id]?.fetchedAt, error: String(e.message || e) };
      }
      soon();
    }));
    for (const k of ['imf', 'brent', 'oilm', 'rates']) if (sources[k]) status[k] = { state: 'snapshot', at: sources[k].fetchedAt };
    refreshing = false;
    await persist();
    clearTimeout(timer);
    emit();
  }

  const dataView = () => Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.data]));
  // Changes whenever any source's data is replaced; status-only updates leave it unchanged.
  const fingerprint = () => Object.entries(sources).map(([k, v]) => `${k}@${v.fetchedAt}`).sort().join('|');
  return { boot, refresh, dataView, fingerprint, get sources() { return sources; }, get status() { return status; } };
}
