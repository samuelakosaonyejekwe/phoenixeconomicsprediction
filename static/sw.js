// Phoenix service worker: the whole app is stored on the device so it opens instantly
// and runs offline / in airplane mode. Data refreshes are done by the page itself.
const VERSION = '__VERSION__';
const SHELL = `phx-shell-${VERSION}`;
const DATA = 'phx-data';
const PRECACHE = __PRECACHE__;

// Some hosts redirect (e.g. /index.html → /). Browsers refuse redirected responses for page
// loads, so store a clean copy of every precached file.
async function precache() {
  const cache = await caches.open(SHELL);
  await Promise.all(PRECACHE.map(async url => {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const clean = res.redirected ? new Response(await res.blob(), { status: 200, headers: res.headers }) : res;
    await cache.put(url, clean);
  }));
}

self.addEventListener('install', e => {
  // New versions take over at once; the page switches to them at the next navigation.
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('phx-shell-') && k !== SHELL) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

async function snapshot(req) {
  const cache = await caches.open(DATA);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(req, { signal: ctl.signal, cache: 'no-cache' });
    clearTimeout(t);
    if (res.ok) { await cache.put('data/snapshot.json', res.clone()); return res; }
    throw new Error(res.status);
  } catch {
    // No copy at all: report failure so the page falls back to its mirrors.
    return (await cache.match('data/snapshot.json')) || (await caches.match('data/snapshot.json', { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // publisher APIs go straight to the network
  if (url.pathname.endsWith('/data/snapshot.json')) { e.respondWith(snapshot(req)); return; }
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const shell = (await caches.match('./')) || (await caches.match('index.html'));
      if (shell) return shell;
      return fetch(req);
    })().catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return res;
  })));
});

// Background refresh of the baseline snapshot where the platform supports it.
self.addEventListener('periodicsync', e => {
  if (e.tag === 'phx-refresh') e.waitUntil(snapshot(new Request('data/snapshot.json')));
});
