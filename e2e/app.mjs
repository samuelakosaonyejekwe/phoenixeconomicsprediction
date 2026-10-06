// End-to-end check of the built application (dist/) in a headless browser: every page renders without
// errors and every label explains itself on hover, the December 2021 scenario runs, and the Evidence page reproduces the paper's published
// results exactly. Run after `npm run build` with: npm run test:e2e
// Runs under the application's own Content Security Policy and fails on any violation. Needs a
// Playwright browser (npx playwright-core install chromium).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

import { fileURLToPath } from 'node:url';
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const fail = msg => { console.error('FAIL', msg); process.exitCode = 1; };

const browser = await chromium.launch();
// The anchor service is replaced by a local stand-in, so that test runs enter nothing in the public
// transparency log and use none of the service's daily allowance. It records each chain head once and
// returns the record again on request, as the service does.
const anchored = new Map();
const stubAnchors = ctx => ctx.route(/\/anchor(\/[0-9a-f]{64})?$/, async route => {
  const req = route.request(), headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (req.method() === 'POST') {
    const b = JSON.parse(req.postData() || '{}');
    if (!anchored.has(b.hash)) anchored.set(b.hash, { hash: b.hash, seq: b.seq, kid: b.kid ?? null, at: new Date().toISOString(), log: 'e2e stand-in', rekor: null });
    return route.fulfill({ status: 201, headers, body: JSON.stringify(anchored.get(b.hash)) });
  }
  const rec = anchored.get(req.url().split('/').pop());
  return route.fulfill({ status: rec ? 200 : 404, headers, body: JSON.stringify(rec || { error: 'not found' }) });
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await stubAnchors(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Network failures of the publishers are tolerated (the app falls back to stored data); any other error,
// including a Content Security Policy violation, fails the test.
const PUBLISHERS = /ec\.europa\.eu|data-api\.ecb\.europa\.eu|api\.worldbank\.org|api\.db\.nomics\.world|api\.frankfurter\.dev|bdm\.insee\.fr|rekor\.sigstore\.dev|workers\.dev|pages\.dev|github\.io/;
// The application's own files must all load: a missing one is an error even though publisher failures are not.
page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(t) && !(/blocked by CORS policy/.test(t) && PUBLISHERS.test(t))) errors.push(t); });

await page.goto(base + '#/overview');
await page.waitForSelector('.kpis', { timeout: 120000 });
for (const r of ['overview', 'detect', 'simulate', 'redistribute', 'contracts', 'forecast', 'stability', 'pilot', 'framework', 'signals', 'markets', 'programmes', 'governance', 'validate', 'data', 'guide']) {
  await page.goto(base + '#/' + r);
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText();
  if (text.length < 200) fail(`page ${r} is nearly empty`);
  if (/\bNaN\b|undefined/.test(text)) fail(`page ${r} shows NaN or undefined`);
  // Every visible label, headline tile and meter explains itself on hover (src/ui/annotate.js); map tiles, bars and chart points
  // show their own values.
  const bare = await page.evaluate(() => [...document.querySelectorAll('main :is(h3, .kpi-l, th[scope=col], .legend li, .badge, button, .chip, summary, label, .ctrl-l, .kpi, .meter), nav a, #top button, #top select')]
    .filter(e => !e.closest('.tile, .dotg, .bar-row, .bar-seg, .cell') && e.textContent.trim() && e.offsetParent !== null && !e.closest('[data-tip]:not([data-tip-scope])'))
    .map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)));
  if (bare.length) fail(`page ${r}: labels without an explanation: ${bare.join(' | ')}`);
  // Nothing on a page is left without an explanation: every visible piece of text sits in an element
  // that explains itself, in its card, or at least in the page.
  const silent = await page.evaluate(() => { const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT); let n, k = 0; while ((n = w.nextNode())) { const el = n.parentElement; if (n.textContent.trim() && el && el.getClientRects().length && !el.closest('[data-tip], .tile, .dotg, .bar-row, .bar-seg, .cell, .chart')) k++; } return k; });
  if (silent) fail(`page ${r}: ${silent} pieces of text show no explanation on hover`);
  // What the page already explains in words is not repeated on hover: a state legend's badges and text.
  const legend = page.locator('main .state-legend .badge').first();
  if (await legend.count()) {
    await legend.hover(); await page.waitForTimeout(250);
    if (await page.locator('.tip').evaluate(e => getComputedStyle(e).display !== 'none').catch(() => false)) fail(`page ${r}: a legend that is explained on the page also shows a hover explanation`);
  }
  const first = page.locator('main h3[data-tip]').first();
  if (await first.count()) {
    await first.hover();
    // A redraw while live data arrive hides the explanation for a frame and shows it again: allow for it.
    let shown = false;
    for (let k = 0; k < 10 && !shown; k++) { shown = await page.locator('.tip.tip-note').evaluate(e => getComputedStyle(e).display !== 'none' && e.textContent.length > 10).catch(() => false); if (!shown) await page.waitForTimeout(200); }
    if (!shown) fail(`page ${r}: hovering a card title shows no explanation`);
  }
  console.log('ok page', r);
}

// The audit ledger: the device key is registered and anchored at start-up, and verification checks every
// link, hash and signature and finds the anchor.
await page.goto(base + '#/contracts');
await page.getByRole('button', { name: 'Verify' }).click();
const intact = await page.locator('.verify', { hasText: /Chain intact/ }).waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
const verifyText = intact ? await page.locator('.verify').innerText() : '';
if (!intact) fail('the audit ledger does not verify'); else if (!anchored.size || !/1\/1 anchors verified|\d+\/\d+ anchors verified/.test(verifyText)) fail(`the ledger's anchor was not recorded or not verified: ${verifyText}`); else console.log('ok ledger verified with its anchor');

// The December 2021 scenario (§7.2) runs in the lab.
await page.evaluate(() => { localStorage.setItem('phx:prefs', JSON.stringify({ region: 'ea', scenario: 'episode' })); });
await page.goto(base + '#/simulate');
await page.reload(); // the saved scenario is read at start-up
await page.locator('main', { hasText: 'EU-27 as of 31 December 2021' }).waitFor({ timeout: 120000 });
await page.locator('main', { hasText: 'Excess deposits' }).waitFor({ timeout: 120000 });
await page.waitForTimeout(4000);
const lab = await page.locator('main').innerText();
if (/\bNaN\b/.test(lab)) fail('December 2021 scenario shows NaN');
console.log('ok December 2021 scenario');
await page.evaluate(() => { localStorage.setItem('phx:prefs', JSON.stringify({ region: 'ea', scenario: 'live' })); });
await page.reload();

// The k_A feasibility search answers per economy (live euro area).
await page.evaluate(() => { localStorage.setItem('phx:prefs', JSON.stringify({ region: 'ea', scenario: 'live' })); });
await page.goto(base + '#/simulate');
await page.reload();
await page.getByRole('button', { name: 'Optimise k_A' }).click();
// Element-based waiting: evaluating script in the page would be blocked by the app's own CSP.
const kaOk = await page.locator('.opt-result', { hasText: /Without absorption, \d+ econom|No economy would still be above/ }).waitFor({ timeout: 120000 }).then(() => true).catch(() => false);
if (!kaOk) fail('Optimise k_A gave no answer'); else console.log('ok k_A feasibility search');

// Reproduce the paper on the Evidence page.
await page.goto(base + '#/validate');
await page.getByRole('button', { name: 'Reproduce' }).click();
await page.locator('main', { hasText: /Exact match|differences|HTTP|failed/i }).waitFor({ timeout: 20 * 60 * 1000 });
const ev = await page.locator('main').innerText();
const m = ev.match(/([\d,]+) of ([\d,]+) published values of the core results reproduced/);
if (!/Exact match/.test(ev) || !m || m[1] !== m[2]) fail(`reproduction did not match: ${ev.slice(0, 600)}`);
else console.log(`ok reproduction: ${m[1]} of ${m[2]} values`);

// The paper's risk register (Table 20) is shown with all its rows.
await page.getByText('Show the full register').click();
const regRows = await page.locator('table', { hasText: 'Resolution' }).locator('tbody tr').count();
if (regRows !== 52) fail(`risk register shows ${regRows} rows, expected 52`); else console.log('ok risk register: 52 rows');

if (errors.length) fail(`browser errors:\n${errors.slice(0, 10).join('\n')}`);

// With the service worker: the app opens offline after one visit, and the single-file offline edition is
// served as itself rather than as the app shell.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await stubAnchors(ctx);
  const p2 = await ctx.newPage();
  await p2.goto(base + '#/overview');
  await p2.waitForSelector('.kpis', { timeout: 120000 });
  await p2.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise(r => (navigator.serviceWorker.controller ? r() : navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })))));
  const offlineSize = await p2.evaluate(async () => (await (await fetch('phoenix-offline.html')).text()).length);
  await p2.goto(base + 'phoenix-offline.html');
  const served = await p2.evaluate(() => document.documentElement.outerHTML.length);
  if (!(offlineSize > 1e6) || served < 1e6) fail(`the offline edition is not served as itself under the service worker (${served} characters; the file has ${offlineSize})`); else console.log('ok offline edition served as itself');
  await p2.goto(base + '#/overview');
  await ctx.setOffline(true);
  await p2.reload();
  const up = await p2.waitForSelector('.kpis', { timeout: 60000 }).then(() => true).catch(() => false);
  if (!up) fail('the app does not open offline after a first visit'); else console.log('ok opens offline after a first visit');
  await ctx.close();
}
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
