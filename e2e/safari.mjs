// Compatibility check in Apple's own Safari on macOS, driven through safaridriver (WebDriver): every
// page renders without an error and without sideways scrolling, a label explains itself on hover, the
// audit ledger verifies, and the Evidence page reproduces the paper's core results exactly in Safari's
// JavaScript engine. Run on a Mac after `npm run build` with: node e2e/safari.mjs
// (once beforehand: sudo safaridriver --enable).
import { spawn } from 'node:child_process';
import { serve } from './server.mjs';

const PORT = 4723, WD = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('FAIL', msg); process.exitCode = 1; };
const site = serve();
const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'inherit' });

async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${method} ${path}: ${j.value?.error || r.status} ${j.value?.message || ''}`), { code: j.value?.error });
  return j.value;
}
for (let i = 0; ; i++) {
  try { await wd('GET', '/status'); break; } catch (e) { if (i > 40) throw new Error('safaridriver did not start'); await sleep(250); }
}

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
const S = `/session/${session.sessionId}`;
console.log(`Safari ${session.capabilities.browserVersion} on ${session.capabilities.platformName}`);
const all = async css => (await wd('POST', `${S}/elements`, { using: 'css selector', value: css })).map(e => e[ELEMENT]);
const text = async id => wd('GET', `${S}/element/${id}/text`);
const textOf = async css => { const [id] = await all(css); return id ? text(id) : null; };
const until = async (what, test, ms = 60000) => {
  for (const t0 = Date.now(); ;) {
    const v = await test().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(300);
  }
};
const byText = async (css, re) => { for (const id of await all(css)) if (re.test(await text(id))) return id; return null; };

try {
  await wd('POST', `${S}/window/rect`, { width: 1280, height: 900, x: 0, y: 0 });
  await wd('POST', `${S}/url`, { url: site.base + '#/overview' });
  await until('the first page', async () => (await all('main .kpis')).length, 120000);
  await sleep(6000);

  const PAGES = { overview: null, detect: 'Surplus radar', simulate: 'Simulation lab', redistribute: 'Redistribution & wallets', contracts: 'Smart contracts & audit', forecast: 'Early warning', stability: 'Stability & feedback', pilot: 'Pilot planner', framework: null, signals: null, markets: null, programmes: 'Funds & programmes', governance: 'Design & governance', validate: null, data: null, guide: 'Guide' };
  for (const width of [1280, 390]) {
    await wd('POST', `${S}/window/rect`, { width, height: 900, x: 0, y: 0 });
    for (const [id, title] of Object.entries(PAGES)) {
      await wd('POST', `${S}/url`, { url: site.base + '#/' + id });
      await sleep(id === 'simulate' ? 5000 : 1500);
      const h1 = await until(`the heading of ${id}`, () => textOf('main h1'), 30000).catch(() => null);
      const broken = await textOf('main .empty pre');
      const cards = (await all('main .card')).length;
      // Sideways scrolling: the document is no wider than the window.
      const wide = await wd('POST', `${S}/execute/sync`, { script: 'return document.documentElement.scrollWidth - document.documentElement.clientWidth;', args: [] }).catch(() => null);
      // A chart that did not draw has no size.
      const flat = await wd('POST', `${S}/execute/sync`, { script: 'return [...document.querySelectorAll("main .chart svg")].filter(s => s.getBoundingClientRect().height < 2).length;', args: [] }).catch(() => null);
      if (!h1 || (title && h1 !== title)) fail(`${id} at ${width}px: heading is ${JSON.stringify(h1)}`);
      else if (broken) fail(`${id} at ${width}px could not be drawn: ${broken}`);
      else if (!cards) fail(`${id} at ${width}px shows no cards`);
      else if (wide > 1) fail(`${id} at ${width}px scrolls sideways by ${wide}px`);
      else if (flat) fail(`${id} at ${width}px has ${flat} chart(s) without height`);
      else console.log(`ok ${id} at ${width}px: "${h1}", ${cards} cards${wide === null ? ' (script checks unavailable)' : ''}`);
    }
  }
  await wd('POST', `${S}/window/rect`, { width: 1280, height: 900, x: 0, y: 0 });

  // A label explains itself on hover.
  await wd('POST', `${S}/url`, { url: site.base + '#/overview' });
  await sleep(2500);
  const [tile] = await all('main .kpi');
  await wd('POST', `${S}/actions`, { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [ELEMENT]: tile }, x: 0, y: 0, duration: 100 }, { type: 'pause', duration: 600 }] }] });
  const tip = await until('the hover explanation', () => textOf('.tip'), 5000).catch(() => null);
  if (!tip || tip.length < 20) fail(`hovering a headline figure explained nothing: ${JSON.stringify(tip)}`); else console.log('ok hover explanation');
  await wd('DELETE', `${S}/actions`);

  // The audit ledger verifies with its anchor (Web Crypto signatures in Safari).
  await wd('POST', `${S}/url`, { url: site.base + '#/contracts' });
  await sleep(2500);
  const verify = await byText('main button', /^Verify$/);
  if (!verify) fail('no Verify button on the contracts page');
  else {
    await wd('POST', `${S}/element/${verify}/click`, {});
    const said = await until('the ledger verdict', async () => { const t = await textOf('main'); return /anchors verified|intact|broken|invalid/i.test(t) ? t : null; }, 60000).catch(() => '');
    const m = said.match(/(\d+)\/(\d+) anchors verified/);
    if (!m || m[1] !== m[2] || m[1] === '0') fail(`the ledger did not verify in Safari: ${(said.match(/[^\n]*(anchors|intact|broken|invalid)[^\n]*/i) || [said.slice(0, 300)])[0]}`);
    else console.log(`ok ledger verified, ${m[0]}`);
  }

  // The paper's core results, recomputed by Safari.
  await wd('POST', `${S}/url`, { url: site.base + '#/validate' });
  await sleep(2500);
  const run = await byText('main button', /Reproduce/);
  if (!run) fail('no Reproduce button on the Evidence page');
  else {
    await wd('POST', `${S}/element/${run}/click`, {});
    const ev = await until('the reproduction', async () => { const t = await textOf('main'); return /Exact match|differences|HTTP|failed/i.test(t) ? t : null; }, 30 * 60 * 1000);
    const m = ev.match(/([\d,]+) of ([\d,]+) published values of the core results reproduced/);
    if (!/Exact match/.test(ev) || !m || m[1] !== m[2]) fail(`reproduction did not match in Safari: ${ev.slice(0, 600)}`);
    else console.log(`ok reproduction in Safari: ${m[1]} of ${m[2]} values`);
  }
} catch (e) { fail(e.message); } finally {
  await wd('DELETE', S).catch(() => {});
  driver.kill();
  site.server.close();
}
console.log(process.exitCode ? 'SAFARI CHECK FAILED' : 'SAFARI CHECK PASSED');
