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
  // A dropped connection to the driver is retried; a command the driver answers with an error is not.
  let r;
  for (let i = 0; ; i++) {
    try { r = await fetch(WD + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); break; }
    catch (e) { if (i >= 3) throw new Error(`${method} ${path.replace(/^\/session\/[^/]+/, '')}: ${e.cause?.code || e.message}`); await sleep(3000); }
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${method} ${path}: ${j.value?.error || r.status} ${j.value?.message || ''}`), { code: j.value?.error });
  return j.value;
}
for (let i = 0; ; i++) {
  try { await wd('GET', '/status'); break; } catch (e) { if (i > 40) throw new Error('safaridriver did not start'); await sleep(250); }
}

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
// PHX_IOS=1: Safari on iOS in Apple's iOS Simulator (a booted iPhone), instead of Safari on the Mac.
const IOS = !!process.env.PHX_IOS;
const connect = async body => { for (let i = 0; ; i++) { try { return await wd('POST', '/session', body); } catch (e) { if (!IOS || i >= 3) throw e; console.log(`waiting for Safari in the simulator (${e.message.slice(0, 90)})`); await sleep(20000); } } };
const session = await connect({ capabilities: { alwaysMatch: IOS ? { browserName: 'safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceType': 'iPhone' } : { browserName: 'safari' } } });
const S = `/session/${session.sessionId}`;
console.log(`Safari ${session.capabilities.browserVersion} on ${session.capabilities.platformName}${session.capabilities['safari:deviceName'] ? ` (${session.capabilities['safari:deviceName']})` : ''}`);
const resize = (width, height = 900) => (IOS ? null : wd('POST', `${S}/window/rect`, { width, height, x: 0, y: 0 }));
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
// A button is brought to the middle of the screen before it is pressed: at the edge it can lie under
// the phone's fixed tab bar, where a tap would land on the bar.
const click = async id => {
  await wd('POST', `${S}/execute/sync`, { script: 'arguments[0].scrollIntoView({ block: "center" });', args: [{ [ELEMENT]: id }] }).catch(() => {});
  await sleep(400);
  await wd('POST', `${S}/element/${id}/click`, {});
};
// Presses a control and waits for its effect. The simulator's driver does not always deliver a WebDriver
// click, so a press is tried as a click, then as a touch, then by calling the control; which one worked
// is reported.
const act = async (id, what, done, ms) => {
  const ways = [
    ['click', () => click(id)],
    ['touch', () => wd('POST', `${S}/actions`, { actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', origin: { [ELEMENT]: id }, x: 0, y: 0, duration: 0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 80 }, { type: 'pointerUp', button: 0 }] }] }).then(() => wd('DELETE', `${S}/actions`))],
    ['script', () => wd('POST', `${S}/execute/sync`, { script: 'arguments[0].click();', args: [{ [ELEMENT]: id }] })],
  ];
  for (const [i, [name, press]] of ways.entries()) {
    await press().catch(e => console.log(`  ${what}: ${name} press was refused (${e.message.slice(0, 80)})`));
    const last = i === ways.length - 1;
    const v = await until(what, done, last || !IOS ? ms : 12000).catch(e => { if (last || !IOS) throw e; return null; });
    if (v) { if (name !== 'click') console.log(`  ${what}: the control answered a ${name} press, not a WebDriver click`); return v; }
  }
};
const where = async () => `on "${await textOf('main h1').catch(() => '?')}", dialog: ${JSON.stringify((await textOf('dialog[open]').catch(() => null))?.slice(0, 80) ?? null)}`;
const part = async (name, fn) => { try { await fn(); } catch (e) { fail(`${name}: ${e.message}`); } };
const byText = async (css, re) => { for (const id of await all(css)) if (re.test(await text(id))) return id; return null; };

try {
  await resize(1280);
  await wd('POST', `${S}/url`, { url: site.base + '#/overview' });
  await until('the first page', async () => (await all('main .kpis')).length, 120000);
  await sleep(6000);

  const PAGES = { overview: null, detect: 'Surplus radar', simulate: 'Simulation lab', redistribute: 'Redistribution & wallets', contracts: 'Smart contracts & audit', forecast: 'Early warning', stability: 'Stability & feedback', pilot: 'Pilot planner', framework: null, signals: null, markets: null, programmes: 'Funds & programmes', governance: 'Design & governance', validate: null, data: null, guide: 'Guide' };
  for (const width of IOS ? ['iPhone'] : [1280, 390]) {
    await resize(width);
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
      if (!h1 || (title && h1 !== title)) fail(`${id} at ${width}${IOS ? '' : 'px'}: heading is ${JSON.stringify(h1)}`);
      else if (broken) fail(`${id} at ${width}${IOS ? '' : 'px'} could not be drawn: ${broken}`);
      else if (!cards) fail(`${id} at ${width}${IOS ? '' : 'px'} shows no cards`);
      else if (wide > 1) fail(`${id} at ${width}${IOS ? '' : 'px'} scrolls sideways by ${wide}px`);
      else if (flat) fail(`${id} at ${width}${IOS ? '' : 'px'} has ${flat} chart(s) without height`);
      else console.log(`ok ${id} at ${width}${IOS ? '' : 'px'}: "${h1}", ${cards} cards${wide === null ? ' (script checks unavailable)' : ''}`);
    }
  }
  await resize(1280);

  // A label explains itself on hover (a pointer: not on a phone).
  if (!IOS) {
  await wd('POST', `${S}/url`, { url: site.base + '#/overview' });
  await sleep(2500);
  const [tile] = await all('main .kpi');
  await wd('POST', `${S}/actions`, { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [ELEMENT]: tile }, x: 0, y: 0, duration: 100 }, { type: 'pause', duration: 600 }] }] });
  const tip = await until('the hover explanation', () => textOf('.tip'), 5000).catch(() => null);
  if (!tip || tip.length < 20) fail(`hovering a headline figure explained nothing: ${JSON.stringify(tip)}`); else console.log('ok hover explanation');
  await wd('DELETE', `${S}/actions`);
  }

  // The application's own check of the device passes: storage, signatures, the background worker.
  await part('on-device check', async () => {
  await wd('POST', `${S}/url`, { url: site.base + '#/data' });
  await sleep(2500);
  const self = await byText('main button', /Run the checks/);
  if (!self) fail('no on-device check on the Data page');
  else {
    const report = await act(self, 'the on-device check', () => textOf('.device-report'), 120000).catch(() => '');
    if (!/All checks passed/.test(report)) fail(`on-device check: ${report.slice(0, 700) || await where()}`); else console.log(`ok on-device check: ${(report.match(/Pass/g) || []).length} checks passed`);
  }

  });

  // The audit ledger verifies with its anchor (Web Crypto signatures in Safari).
  await part('ledger', async () => {
  await wd('POST', `${S}/url`, { url: site.base + '#/contracts' });
  await sleep(2500);
  const verify = await byText('main button', /^Verify$/);
  if (!verify) fail('no Verify button on the contracts page');
  else {
    const said = await act(verify, 'the ledger verdict', async () => { const t = await textOf('main'); return /anchors verified|intact|broken|invalid/i.test(t) ? t : null; }, 60000).catch(() => '');
    const m = said.match(/(\d+)\/(\d+) anchors verified/);
    if (!m || m[1] !== m[2] || m[1] === '0') fail(`the ledger did not verify in Safari: ${(said.match(/[^\n]*(anchors|intact|broken|invalid)[^\n]*/i) || [said.slice(0, 300) || await where()])[0]}`);
    else console.log(`ok ledger verified, ${m[0]}`);
  }

  });

  // The paper's core results, recomputed by Safari.
  await part('reproduction', async () => {
  await wd('POST', `${S}/url`, { url: site.base + '#/validate' });
  await sleep(2500);
  const run = await byText('main button', /Reproduce/);
  if (!run) fail('no Reproduce button on the Evidence page');
  else {
    // Started first (the page says it is computing), then awaited.
    await act(run, 'the reproduction to start', async () => { const t = await textOf('main'); return /Exact match|differences|HTTP|failed|Recomput|Computing|Reproducing|%/i.test(t) && !(await byText('main button', /^Reproduce$/)) ? t : null; }, 60000);
    const ev = await until('the reproduction', async () => { const t = await textOf('main'); return /Exact match|differences|HTTP|failed/i.test(t) ? t : null; }, 40 * 60 * 1000);
    const m = ev.match(/([\d,]+) of ([\d,]+) published values of the core results reproduced/);
    if (!/Exact match/.test(ev) || !m || m[1] !== m[2]) fail(`reproduction did not match in Safari: ${ev.slice(0, 600)}`);
    else console.log(`ok reproduction in Safari: ${m[1]} of ${m[2]} values`);
  }
  });
} catch (e) { fail(e.message); } finally {
  await wd('DELETE', S).catch(() => {});
  driver.kill();
  site.server.close();
}
console.log(process.exitCode ? 'SAFARI CHECK FAILED' : 'SAFARI CHECK PASSED');
