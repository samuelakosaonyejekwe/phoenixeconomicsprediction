// Cloudflare Pages function: on the Cloudflare host, data/snapshot.json always comes from the
// refresh worker's latest data (independent of GitHub), falling back to the built file.
const WORKER = 'https://phoenix-refresh.flame-in-freefall.workers.dev/snapshot.json';

export async function onRequest({ request, env }) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(WORKER, { signal: ctl.signal });
    clearTimeout(t);
    // Served only if it is a real snapshot; otherwise the file built with the site is used.
    const text = res.ok ? await res.text() : '';
    let good = false; try { const j = JSON.parse(text); good = !!(j.builtAt && j.sources && Object.keys(j.sources).length); } catch {}
    if (good) {
      return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'x-snapshot-source': 'cloudflare-worker' } });
    }
  } catch {}
  return env.ASSETS.fetch(request);
}
