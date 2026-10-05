// Phoenix data refresh on Cloudflare: independent of GitHub and of any personal machine.
// A cron trigger runs every 10 minutes and refreshes one group of sources in rotation, so every
// source is refreshed hourly while each run stays within the free plan's CPU budget. Results are
// stored in KV and served as one snapshot (same format as data/snapshot.json) with open CORS.
import { CONNECTORS, SERVER_SOURCES } from '../src/data/sources.js';
import { checkSource, latestPeriod } from '../src/data/check.js';

// Sources that publishers revise after first release: each new release is archived once under its latest
// period, so first-release (real-time) data accumulate from now on and can be retrieved at /archive.
const ARCHIVED = ['finacc', 'gdp', 'gov', 'hhsave', 'profit', 'hhinc', 'nfcgva'];

// Workers do not accept browser-only fetch options; keep only the abort signal.
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, init = {}) => nativeFetch(url, { signal: init.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; PhoenixEconomics/1.0; +https://phoenixeconomics.pages.dev)' } });

// GitHub watchdog: GitHub's own scheduler can be late or silent, so once an hour this worker
// checks when the build-and-deploy workflow last succeeded and starts it if it is overdue.
// Needs a fine-grained token (Actions: read and write on this repository) in the secret GH_TOKEN.
const REPO = 'samuelakosaonyejekwe/phoenixeconomicsprediction';
const WORKFLOW = 'deploy.yml';
const OVERDUE_MIN = 75;

async function github(env, path, init = {}) {
  return nativeFetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'phoenix-economics-watchdog', ...(init.headers || {}) },
  });
}

async function watchdog(env) {
  const out = { checkedAt: new Date().toISOString() };
  if (!env.GH_TOKEN) { out.status = 'no token configured'; await env.DATA.put('watchdog', JSON.stringify(out)); return out; }
  try {
    const runs = await github(env, `/actions/workflows/${WORKFLOW}/runs?per_page=5`);
    if (!runs.ok) throw new Error(`runs HTTP ${runs.status}`);
    const list = (await runs.json()).workflow_runs || [];
    const inProgress = list.find(r => r.status === 'queued' || r.status === 'in_progress');
    const lastOk = list.find(r => r.conclusion === 'success');
    out.lastSuccess = lastOk?.created_at || null;
    const ageMin = lastOk ? (Date.now() - Date.parse(lastOk.created_at)) / 60000 : Infinity;
    if (inProgress) out.status = 'run in progress';
    else if (ageMin < OVERDUE_MIN) out.status = `on time (last success ${Math.round(ageMin)} min ago)`;
    else {
      const d = await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }), headers: { 'content-type': 'application/json' } });
      out.status = d.status === 204 ? `overdue (${Number.isFinite(ageMin) ? Math.round(ageMin) + ' min' : 'never'}): run started` : `dispatch failed HTTP ${d.status}`;
    }
  } catch (e) { out.status = `error: ${e.message || e}`; }
  await env.DATA.put('watchdog', JSON.stringify(out));
  return out;
}

const byId = Object.fromEntries(CONNECTORS.map(c => [c.id, c.run]));
Object.assign(byId, SERVER_SOURCES);
const GROUPS = [['hicp', 'gov', 'hhsave', 'oilm'], ['profit', 'unemp', 'gdp', 'energyw', 'rates'], ['ecb', 'markets', 'fx', 'expect', 'hicpx'], ['wb', 'hhinc', 'sectA'], ['weo', 'brent', 'nfcgva'], ['imf', 'finacc']];
// Any source not assigned to a group joins the last one, so a new connector can never be left unrefreshed.
for (const id of Object.keys(byId)) if (!GROUPS.flat().includes(id)) GROUPS[GROUPS.length - 1].push(id);
const IDS = GROUPS.flat();

async function refreshGroup(env, g) {
  // New data replace the stored copy only if they pass the plausibility check; otherwise the previous
  // copy stays and the failure is recorded.
  const results = await Promise.allSettled(GROUPS[g].map(async id => {
    const data = await byId[id]();
    const bad = checkSource(id, data);
    if (bad) throw new Error(`implausible: ${bad}`);
    const fetchedAt = new Date().toISOString();
    await env.DATA.put(`src:${id}`, JSON.stringify({ data, fetchedAt }));
    if (ARCHIVED.includes(id)) {
      const lp = latestPeriod(data), key = `vin:${id}:${lp === null ? 'none' : `${Math.floor(lp / 12)}-${String(lp % 12 + 1).padStart(2, '0')}`}`;
      if (!(await env.DATA.get(key, { type: 'stream' }))) await env.DATA.put(key, JSON.stringify({ data, firstSeen: fetchedAt }));
    }
    return { id, fetchedAt };
  }));
  const prev = JSON.parse((await env.DATA.get('meta')) || '{}');
  const status = prev.sources || {};
  results.forEach((r, i) => { const id = GROUPS[g][i]; status[id] = r.status === 'fulfilled' ? { ok: true, at: r.value.fetchedAt } : { ok: false, at: status[id]?.at || null, error: String(r.reason?.message || r.reason).slice(0, 200), failedAt: new Date().toISOString() }; });
  const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value.id);
  const failed = results.map((r, i) => (r.status === 'rejected' ? `${GROUPS[g][i]}: ${r.reason?.message || r.reason}` : null)).filter(Boolean);
  await env.DATA.put('meta', JSON.stringify({ lastRun: new Date().toISOString(), group: g, ok, failed, sources: status }));
  return { ok, failed };
}

async function snapshot(env) {
  const parts = await Promise.all(IDS.map(async id => [id, await env.DATA.get(`src:${id}`)]));
  const present = parts.filter(([, v]) => v);
  // Build time = the newest fetch among stored sources; the oldest fetch and any failing sources are
  // published alongside, so the snapshot never looks fresher than its stalest part.
  const times = present.map(([, v]) => v.slice(v.lastIndexOf('"fetchedAt":"') + 13, v.lastIndexOf('"fetchedAt":"') + 37)).sort();
  const meta = JSON.parse((await env.DATA.get('meta')) || '{}');
  const failing = Object.entries(meta.sources || {}).filter(([, v]) => !v.ok).map(([k]) => k);
  return `{"builtAt":"${times.at(-1) || new Date().toISOString()}","oldestSource":"${times[0] || ''}","failing":${JSON.stringify(failing)},"origin":"cloudflare-worker","sources":{${present.map(([id, v]) => `"${id}":${v}`).join(',')}}}`;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'x-content-type-options': 'nosniff' };

// Append-only anchor log for audit-ledger chain heads (Phoenix Economics Solutions §9.4).
// POST {hash, seq, kid} records the hash once, with the server's timestamp; later posts of the same
// hash return the original record unchanged. GET /anchor/<hash> returns the record.
const HEX64 = /^[0-9a-f]{64}$/;
async function anchorPost(request, env) {
  if (+(request.headers.get('content-length') || 0) > 6000) return json({ error: 'too large' }, 413);
  const text = await request.text();
  if (text.length > 6000) return json({ error: 'too large' }, 413);
  let b; try { b = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  if (!HEX64.test(b.hash || '') || !Number.isInteger(b.seq) || b.seq < 0) return json({ error: 'hash (64 hex) and seq (integer) required' }, 400);
  const key = `anchor:${b.hash}`;
  const existing = await env.DATA.get(key);
  if (existing) return json(JSON.parse(existing));
  // A transparency-log entry must commit to this hash: a SHA-256 hashedrekord whose data hash is the SHA-256
  // of the chain-head hash, so the service cannot be used to relay unrelated entries.
  if (b.rekor) {
    const v = b.rekor?.spec?.data?.hash;
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b.hash)))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (b.rekor.kind !== 'hashedrekord' || v?.algorithm !== 'sha256' || v?.value !== digest) return json({ error: 'transparency-log entry does not commit to this hash' }, 400);
  }
  // Limits: 10 new anchors per client address per hour and 200 per day overall, so anchors (with the
  // hourly data refresh, about 700 writes a day) stay within the 1,000 daily key-value writes of the
  // free plan. The counters are kept per data centre, so the limits are approximate.
  const cache = caches.default, ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13), day = hour.slice(0, 10);
  const ipKey = new Request(`https://cap.local/ip/${encodeURIComponent(ip)}/${hour}`), dayKey = new Request(`https://cap.local/day/${day}`);
  const [ipHit, dayHit] = await Promise.all([cache.match(ipKey), cache.match(dayKey)]);
  const ipUsed = ipHit ? +(await ipHit.text()) : 0, dayUsed = dayHit ? +(await dayHit.text()) : 0;
  if (ipUsed >= 10) return json({ error: 'hourly anchor limit for this client reached' }, 429);
  if (dayUsed >= 200) return json({ error: 'daily anchor limit reached' }, 429);
  await Promise.all([cache.put(ipKey, new Response(String(ipUsed + 1), { headers: { 'cache-control': 'max-age=3600' } })), cache.put(dayKey, new Response(String(dayUsed + 1), { headers: { 'cache-control': 'max-age=86400' } }))]);
  // Public transparency log (Sigstore Rekor): independent, append-only, signed inclusion records.
  let rekor = null;
  if (b.rekor && b.rekor.kind === 'hashedrekord') {
    try {
      const r = await nativeFetch('https://rekor.sigstore.dev/api/v1/log/entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b.rekor) });
      const j = await r.json();
      const uuid = Object.keys(j)[0], e = j[uuid];
      if (r.status === 201 || r.status === 409) rekor = { uuid, logIndex: e?.logIndex ?? null, integratedTime: e?.integratedTime ?? null, signedEntryTimestamp: e?.verification?.signedEntryTimestamp ?? null, log: 'rekor.sigstore.dev' };
    } catch {}
  }
  const rec = { hash: b.hash, seq: b.seq, kid: typeof b.kid === 'string' ? b.kid.slice(0, 32) : null, at: new Date().toISOString(), log: 'phoenix-refresh/anchor', rekor };
  await env.DATA.put(key, JSON.stringify(rec));
  return json(rec, 201);
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const g = Math.floor(minute / 10) % GROUPS.length;
    ctx.waitUntil(refreshGroup(env, g));
    if (minute >= 20 && minute < 30) ctx.waitUntil(watchdog(env)); // once an hour
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/snapshot.json' || url.pathname === '/data/snapshot.json') {
      const cache = caches.default;
      const key = new Request(url.origin + '/snapshot.json');
      let res = await cache.match(key);
      if (!res) {
        res = new Response(await snapshot(env), { headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
        ctx.waitUntil(cache.put(key, res.clone()));
      }
      return res;
    }
    if (url.pathname === '/anchor' && request.method === 'POST') return anchorPost(request, env);
    if (url.pathname.startsWith('/anchor/') && request.method === 'GET') {
      const h = url.pathname.slice(8);
      if (!HEX64.test(h)) return json({ error: 'bad hash' }, 400);
      const v = await env.DATA.get(`anchor:${h}`);
      if (!v) return json({ error: 'not found' }, 404);
      const rec = JSON.parse(v);
      // Confirm that the entry is present in the public transparency log (cached for a day). Clients
      // verify the entry itself against Rekor; this flag is informational only.
      if (rec.rekor?.uuid) {
        const ck = new Request(`https://cap.local/rekor/${rec.rekor.uuid}`), hit = await caches.default.match(ck);
        if (hit) rec.rekorVerified = (await hit.text()) === '1';
        else { try { const g = await nativeFetch(`https://rekor.sigstore.dev/api/v1/log/entries/${rec.rekor.uuid}`); rec.rekorVerified = g.ok; } catch { rec.rekorVerified = false; } ctx.waitUntil(caches.default.put(ck, new Response(rec.rekorVerified ? '1' : '0', { headers: { 'cache-control': 'max-age=86400' } }))); }
      }
      return json(rec);
    }
    if (url.pathname === '/archive') {
      const keys = []; let cursor;
      do { const l = await env.DATA.list({ prefix: 'vin:', cursor }); keys.push(...l.keys.map(k => k.name.slice(4))); cursor = l.list_complete ? null : l.cursor; } while (cursor);
      return json({ releases: keys.sort() });
    }
    if (url.pathname.startsWith('/archive/')) {
      const v = await env.DATA.get(`vin:${decodeURIComponent(url.pathname.slice(9))}`);
      return v ? new Response(v, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }) : json({ error: 'not found' }, 404);
    }
    if (url.pathname === '/health') {
      const [meta, wd] = await Promise.all([env.DATA.get('meta'), env.DATA.get('watchdog')]);
      return new Response(JSON.stringify({ refresh: JSON.parse(meta || '{}'), groups: GROUPS, githubWatchdog: JSON.parse(wd || '{}') }), { headers: { ...cors, 'content-type': 'application/json' } });
    }
    return new Response('Phoenix Economics data service. GET /snapshot.json, /health, /anchor/<hash>, /archive, /archive/<source>:<period>; POST /anchor.', { headers: { ...cors, 'content-type': 'text/plain; charset=utf-8' } });
  },
};
