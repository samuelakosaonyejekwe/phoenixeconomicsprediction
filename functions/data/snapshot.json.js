// Cloudflare Pages function: on the Cloudflare host, data/snapshot.json always comes from the
// refresh worker's latest data (independent of GitHub), falling back to the built file.
const WORKER = 'https://phoenix-refresh.flame-in-freefall.workers.dev/snapshot.json';

export async function onRequest({ request, env }) {
  try {
    const ctl = new AbortController();
    // Shorter than the 5 s the app's service worker waits, so the fallback below can still answer in time.
    const t = setTimeout(() => ctl.abort(), 3500);
    const res = await fetch(WORKER, { signal: ctl.signal });
    clearTimeout(t);
    // Served only if it is a real snapshot; otherwise the file built with the site is used.
    const text = res.ok ? await res.text() : '';
    const good = text.startsWith('{"builtAt":"') && text.includes('"sources":{"') && text.endsWith('}}}');
    if (good) {
      return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'x-snapshot-source': 'cloudflare-worker' } });
    }
  } catch {}
  return env.ASSETS.fetch(request);
}
