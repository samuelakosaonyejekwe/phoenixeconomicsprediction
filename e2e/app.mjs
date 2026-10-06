// End-to-end check of the built application (dist/) in a headless browser: every page renders without
// errors and every label explains itself on hover, the December 2021 scenario runs, and the Evidence page reproduces the paper's published
// results exactly. Run after `npm run build` with: npm run test:e2e
// Runs under the application's own Content Security Policy and fails on any violation. Needs a
// Playwright browser (npx playwright-core install chromium).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST = new URL('../dist/', import.meta.url).pathname;
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Network failures of the publishers are tolerated (the app falls back to stored data); any other error,
// including a Content Security Policy violation, fails the test.
const PUBLISHERS = /ec\.europa\.eu|data-api\.ecb\.europa\.eu|api\.worldbank\.org|api\.db\.nomics\.world|api\.frankfurter\.dev|bdm\.insee\.fr|rekor\.sigstore\.dev|workers\.dev|pages\.dev|github\.io/;
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(t) && !(/blocked by CORS policy/.test(t) && PUBLISHERS.test(t))) errors.push(t); });

await page.goto(base + '#/overview');
await page.waitForSelector('.kpis', { timeout: 120000 });
for (const r of ['overview', 'detect', 'simulate', 'redistribute', 'contracts', 'forecast', 'stability', 'pilot', 'framework', 'signals', 'markets', 'programmes', 'governance', 'validate', 'data', 'guide']) {
  await page.goto(base + '#/' + r);
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText();
  if (text.length < 200) fail(`page ${r} is nearly empty`);
  if (/\bNaN\b|undefined/.test(text)) fail(`page ${r} shows NaN or undefined`);
  // Every visible label explains itself on hover (src/ui/annotate.js); map tiles, bars and chart points
  // show their own values.
  const bare = await page.evaluate(() => [...document.querySelectorAll('main :is(h3, .kpi-l, th[scope=col], .legend li, .badge, button, .chip, summary, label, .ctrl-l), nav a, #top button, #top select')]
    .filter(e => !e.closest('.tile, .dotg, .bar-row, .bar-seg, .cell') && e.textContent.trim() && e.offsetParent !== null && !e.closest('[data-tip]'))
    .map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)));
  if (bare.length) fail(`page ${r}: labels without an explanation: ${bare.join(' | ')}`);
  const first = page.locator('main h3[data-tip]').first();
  if (await first.count()) {
    await first.hover();
    const shown = await page.locator('.tip.tip-note').evaluate(e => getComputedStyle(e).display !== 'none' && e.textContent.length > 10).catch(() => false);
    if (!shown) fail(`page ${r}: hovering a card title shows no explanation`);
  }
  console.log('ok page', r);
}

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
const m = ev.match(/([\d,]+) of ([\d,]+) published values reproduced/);
if (!/Exact match/.test(ev) || !m || m[1] !== m[2]) fail(`reproduction did not match: ${ev.slice(0, 600)}`);
else console.log(`ok reproduction: ${m[1]} of ${m[2]} values`);

// The paper's risk register (Table 20) is shown with all its rows.
await page.getByText('Show the full register').click();
const regRows = await page.locator('table', { hasText: 'Resolution' }).locator('tbody tr').count();
if (regRows !== 55) fail(`risk register shows ${regRows} rows, expected 55`); else console.log('ok risk register: 55 rows');

if (errors.length) fail(`browser errors:\n${errors.slice(0, 10).join('\n')}`);
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
