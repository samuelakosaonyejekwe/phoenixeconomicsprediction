// Data orchestration in the visitor's browser:
//   1. render instantly from the IndexedDB cache (works offline / airplane mode),
//   2. fall back to the bundled snapshot (same origin, then any mirror),
//   3. refresh every connector live from the publishers and persist the result,
//   4. at every refresh, take any newer copy from the baseline snapshots (the only route for the sources
//      browsers cannot fetch, and a second route for a connector that failed).
import { CONNECTORS, SERVER_SOURCES } from './sources.js';
import { checkSource } from './check.js';

const DB = 'phoenix', STORE = 'kv';
let dbp;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    // A database that never opens (blocked by another tab, private mode) must not hold up the start.
    setTimeout(() => reject(new Error('IndexedDB did not open')), 4000);
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
    return j && typeof j.builtAt === 'string' && j.sources && typeof j.sources === 'object' && !Array.isArray(j.sources) && Object.keys(j.sources).length ? { ...j, from: url } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// Baseline snapshots from every independent publisher at once: this host (rebuilt by GitHub)
// and the Cloudflare refresh worker. Sources are merged newest-first, so either can be down.
async function fetchSnapshots() {
  if (globalThis.PHX_EMBED_SNAPSHOT) return [{ ...globalThis.PHX_EMBED_SNAPSHOT, from: 'embedded' }, ...(location.protocol === 'file:' ? (await Promise.all(DATA_ENDPOINTS.map(getSnap))).filter(Boolean) : [])];
  if (location.protocol === 'file:') return [];
  // On the Cloudflare host this host's snapshot already is the refresh worker's: it is not fetched twice.
  const own = await getSnap(new URL('data/snapshot.json', location.href).href);
  let got = [own, ...(own?.origin === 'cloudflare-worker' ? [] : await Promise.all(DATA_ENDPOINTS.map(getSnap)))].filter(Boolean);
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
  const SERVER_IDS = Object.keys(SERVER_SOURCES), KNOWN = new Set([...CONNECTORS.map(c => c.id), ...SERVER_IDS]);
  const status = Object.fromEntries([...KNOWN].map(id => [id, { state: 'idle' }]));
  let snapshotInfo = null, refreshing = false;

  // A copy is newer if fetched later. A fetch time ahead of this device's clock (a slow clock, or a
  // wrong stamp) is read as "now", and a snapshot wins a tie against a stored copy, so neither a wrong
  // clock nor a wrong stamp can pin a copy.
  const newer = (a, b) => {
    if (!b) return true;
    const now = new Date().toISOString(), at = v => (typeof v?.fetchedAt === 'string' ? (v.fetchedAt < now ? v.fetchedAt : now) : '');
    return at(a) > at(b) || (at(a) === at(b) && a.fetchedAt !== b.fetchedAt && b.origin !== 'live');
  };
  const emit = () => onChange({ sources, status, snapshotInfo, refreshing });
  // Only known sources with data that pass the plausibility check are taken from a snapshot or from storage.
  const usable = (k, v) => KNOWN.has(k) && v && typeof v === 'object' && typeof v.fetchedAt === 'string' && !checkSource(k, v.data);

  // The snapshots change about once an hour, so they are re-read at most every 50 minutes.
  let snapAt = 0;
  async function mergeSnapshots() {
    if (Date.now() - snapAt < 50 * 60e3) return false;
    let snaps = [];
    try { snaps = await fetchSnapshots(); } catch {}
    if (!snaps.length) return false;
    snapAt = Date.now();
    snaps.sort((a, b) => (a.builtAt < b.builtAt ? 1 : -1));
    snapshotInfo = { builtAt: snaps[0].builtAt, from: snaps[0].from, all: snaps.map(x => ({ from: x.from, builtAt: x.builtAt })) };
    let changed = false;
    for (const snap of snaps) {
      for (const [k, v] of Object.entries(snap.sources)) {
        if (usable(k, v) && newer(v, sources[k])) { sources[k] = { data: v.data, fetchedAt: v.fetchedAt, origin: 'snapshot' }; status[k] = { state: 'snapshot', at: v.fetchedAt }; changed = true; }
      }
    }
    return changed;
  }

  async function boot() {
    // Stored copies are kept even when old: offline, old data are better than none.
    const cached = await kvGet('sources');
    if (cached && typeof cached === 'object') for (const [k, v] of Object.entries(cached)) if (KNOWN.has(k) && v?.data && typeof v.fetchedAt === 'string') { sources[k] = { data: v.data, fetchedAt: v.fetchedAt, origin: 'cache' }; status[k] = { state: 'cached', at: v.fetchedAt }; }
    if (Object.keys(sources).length) emit();
    if (await mergeSnapshots()) await persist();
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
    // Newer copies from the baseline snapshots: the sources browsers cannot fetch, and any connector that
    // failed here but succeeded at the refresh services.
    await mergeSnapshots();
    for (const k of SERVER_IDS) status[k] = sources[k] ? { state: 'snapshot', at: sources[k].fetchedAt } : { state: 'error', error: 'not in any baseline snapshot yet' };
    for (const c of CONNECTORS) if (status[c.id].state !== 'live' && sources[c.id]?.origin === 'snapshot' && (!status[c.id].at || sources[c.id].fetchedAt > status[c.id].at)) status[c.id] = { ...status[c.id], state: 'snapshot', at: sources[c.id].fetchedAt };
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
