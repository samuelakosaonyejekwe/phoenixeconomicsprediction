// Compatibility check with Apple's VoiceOver screen reader reading the application in Safari on macOS,
// driven through Guidepup, on every page: each heading the page has is announced, in order and at its
// level, and no control is announced without a name. What the page's headings are is first read from
// the page itself (through safaridriver), so the check follows the application as it changes.
// Run on a Mac after `npm run build`: npx @guidepup/setup setup, npm install --no-save @guidepup/guidepup, npx @guidepup/setup install,
// then node e2e/voiceover.mjs
import { execFileSync, spawn } from 'node:child_process';
import { serve } from './server.mjs';

const { voiceOver, macOSActivate } = await import('@guidepup/guidepup');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('FAIL', msg); process.exitCode = 1; };
const site = serve();
const ROUTES = (process.env.PHX_PAGES || 'overview,detect,simulate,redistribute,contracts,forecast,stability,pilot,framework,signals,markets,programmes,governance,validate,data,guide').split(',');

// The headings each page shows, read from the page in Safari before VoiceOver is started.
async function headingsOfPages() {
  const port = 4724, driver = spawn('safaridriver', ['-p', String(port)], { stdio: 'inherit' });
  const wd = async (method, path, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path}: ${j.value?.message || r.status}`);
    return j.value;
  };
  for (let i = 0; ; i++) { try { await wd('GET', '/status'); break; } catch (e) { if (i > 40) throw new Error('safaridriver did not start'); await sleep(250); } }
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }), S = `/session/${session.sessionId}`;
  const out = {};
  try {
    await wd('POST', `${S}/url`, { url: site.base + '#/overview' });
    await sleep(9000);
    for (const route of ROUTES) {
      await wd('POST', `${S}/url`, { url: site.base + '#/' + route });
      await sleep(route === 'simulate' ? 6000 : 2500);
      out[route] = await wd('POST', `${S}/execute/sync`, { args: [], script: `
        return [...document.querySelectorAll('main h1, main h2, main h3, main h4, main [role="heading"]')]
          .filter(e => e.getClientRects().length && !e.closest('[hidden], [aria-hidden="true"], details:not([open]) > :not(summary)'))
          .map(e => [Number(e.getAttribute('aria-level') || e.tagName.slice(1)) || 2, (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim()]);` });
    }
  } finally { await wd('DELETE', S).catch(() => {}); driver.kill(); }
  return out;
}

// The words of a heading that a screen reader will say as written: letters only, three or more.
const words = t => (t.toLowerCase().normalize('NFKD').match(/[a-z]{3,}/g) || []);
const says = (phrase, level, text) => {
  const want = words(text), got = new Set(words(phrase));
  return new RegExp(`heading level ${level}\\b`, 'i').test(phrase) && (!want.length || want.filter(w => got.has(w)).length >= Math.ceil(want.length * 0.6));
};

async function read(route, expected) {
  try { execFileSync('osascript', ['-e', 'tell application "Safari" to quit']); } catch { /* not open */ }
  await sleep(1500);
  execFileSync('open', ['-a', 'Safari', site.base + '#/' + route]);
  await sleep(route === 'simulate' ? 12000 : 8000);
  await macOSActivate('/Applications/Safari.app');
  await sleep(1000);
  // Into the web content: the cursor rests on the web area as a whole until it is entered.
  const spoken = [];
  for (let i = 0; i < 12; i++) {
    await voiceOver.next();
    const phrase = await voiceOver.lastSpokenPhrase();
    if (/web content/i.test(phrase) && spoken.filter(p => /web content/i.test(p)).length < 3) await voiceOver.interact();
    spoken.push(phrase);
  }
  // Every heading, by heading navigation, until VoiceOver says there is no further one.
  const headings = [];
  for (let i = 0, last = 0; i < expected.length + 8 && last < 2; i++) {
    await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
    const phrase = await voiceOver.lastSpokenPhrase();
    last = /^Last heading|not found/i.test(phrase) || phrase === headings[headings.length - 1] ? last + 1 : 0;
    headings.push(phrase);
  }
  // Controls, by control navigation.
  const controls = [];
  for (let i = 0, same = 0; i < 30 && same < 2; i++) {
    await voiceOver.perform(voiceOver.keyboardCommands.findNextControl);
    const phrase = await voiceOver.lastSpokenPhrase();
    same = phrase === controls[controls.length - 1] || /not found/i.test(phrase) ? same + 1 : 0;
    controls.push(phrase);
  }
  let at = 0;
  const missing = [];
  for (const [level, text] of expected) {
    const k = headings.findIndex((p, i) => i >= at && says(p, level, text));
    if (k < 0) missing.push(`level ${level} "${text}"`); else at = k;
  }
  return { spoken, headings, controls, missing };
}

try {
  const expected = await headingsOfPages();
  await sleep(2000);
  await voiceOver.start();
  let pages = 0, total = 0;
  for (const route of ROUTES) {
    const want = expected[route] || [];
    if (!want.length) { fail(`${route}: the page shows no headings`); continue; }
    // VoiceOver's cursor sometimes stays outside the page on a first pass: a page is read up to three times.
    let r = null;
    for (let pass = 0; pass < 3; pass++) {
      r = await read(route, want);
      if (!r.missing.length) break;
      console.log(`${route}: pass ${pass + 1} missed ${r.missing.length} of ${want.length} headings`);
    }
    console.log(`--- ${route}: headings announced\n${[...new Set(r.headings)].join('\n')}\n--- ${route}: controls announced\n${[...new Set(r.controls)].join('\n')}`);
    if (r.missing.length) fail(`${route}: not announced as headings, or out of order: ${r.missing.join('; ')}`);
    const unnamed = r.controls.concat(r.spoken).filter(p => /^(button|link|image|group|pop ?up button|slider|text field|checkbox|menu button)\.?$/i.test(p.trim()));
    if (unnamed.length) fail(`${route}: announced without a name: ${[...new Set(unnamed)].join(', ')}`);
    if (!r.missing.length && !unnamed.length) { pages++; total += want.length; console.log(`ok ${route}: all ${want.length} headings announced in order at their levels; ${new Set(r.controls).size} controls read, all named`); }
  }
  console.log(`${pages} of ${ROUTES.length} pages read by VoiceOver, ${total} headings`);
} catch (e) { fail(`${e.message}${e.cause ? ` (${e.cause.message || e.cause})` : ''}`); } finally {
  await voiceOver.stop().catch(() => {});
  try { execFileSync('osascript', ['-e', 'tell application "Safari" to quit']); } catch { /* Safari was not opened */ }
  site.server.close();
}
console.log(process.exitCode ? 'VOICEOVER CHECK FAILED' : 'VOICEOVER CHECK PASSED');
