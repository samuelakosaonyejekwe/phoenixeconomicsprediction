// Compatibility check with Apple's VoiceOver screen reader reading the application in Safari on macOS,
// driven through Guidepup, on every page: each heading the page has is announced, in order and at its
// level, and every control and link is announced by its name. What the page's headings are is first read from
// the page itself (through safaridriver), so the check follows the application as it changes.
// Run on a Mac after `npm run build`: npx @guidepup/setup setup, npm install --no-save @guidepup/guidepup, npx @guidepup/setup install,
// then node e2e/voiceover.mjs
import { execFileSync, spawn } from 'node:child_process';
import { serve } from './server.mjs';

const { voiceOver, macOSActivate } = await import('@guidepup/guidepup');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('FAIL', msg); process.exitCode = 1; };
const site = serve();
const ROUTES = (process.env.PHX_PAGES?.trim() || 'overview,detect,simulate,redistribute,contracts,forecast,stability,pilot,framework,signals,markets,programmes,governance,validate,data,guide').split(',');

// The headings, controls and links each page shows, with the names they carry, read from the page in
// Safari before VoiceOver is started.
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
        const shown = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden], [aria-hidden="true"], [inert], dialog:not([open])') && ![...document.querySelectorAll('details:not([open])')].some(d => d.contains(e) && !e.closest('summary'));
        const text = id => (document.getElementById(id) || {}).textContent || '';
        const name = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(text).join(' ') || (e.labels ? [...e.labels].map(l => l.innerText || l.textContent).join(' ') : '') || e.getAttribute('title') || e.innerText || e.textContent || e.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim();
        const list = sel => [...document.querySelectorAll(sel)].filter(shown).map(name);
        return {
          headings: [...document.querySelectorAll('main h1, main h2, main h3, main h4, main [role="heading"]')].filter(shown)
            .map(e => [Number(e.getAttribute('aria-level') || e.tagName.slice(1)) || 2, (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim()]),
          controls: list('button, input:not([type="hidden"]), select, textarea, [role="button"], [role="slider"], [role="checkbox"], [role="switch"], [role="combobox"]'),
          links: list('a[href]'),
        };` });
    }
  } finally { await wd('DELETE', S).catch(() => {}); driver.kill(); }
  return out;
}

// The connection pill and the refresh button change their wording while the page is open: one name for each.
const pill = t => t.replace(/Updating|Live · [^,]*|Stored data|Offline/, 'connection status').replace(/Refresh now|Refreshing…/, 'refresh');
// The words of a heading that a screen reader will say as written: letters only, three or more.
const words = t => (t.toLowerCase().normalize('NFKD').match(/[a-z]{3,}/g) || []);
const says = (phrase, level, text) => {
  const want = words(text), got = new Set(words(phrase));
  return new RegExp(`heading level ${level}\\b`, 'i').test(phrase) && (!want.length || want.filter(w => got.has(w)).length >= Math.ceil(want.length * 0.6));
};

// One VoiceOver command, and what the cursor then rests on: the item's own text and what was spoken.
// Sending a key to VoiceOver fails now and then on a busy machine, and speech can lag the cursor: the
// command is retried and the reading is waited for.
async function step(command, before = '') {
  for (let t = 0; ; t++) { try { await voiceOver.perform(command); break; } catch (e) { if (t >= 4) throw e; await sleep(800); } }
  let text = '';
  for (let i = 0; i < 6; i++) {
    const item = await voiceOver.itemText().catch(() => ''), phrase = await voiceOver.lastSpokenPhrase().catch(() => '');
    text = `${phrase} ${phrase.includes(item) ? '' : item}`.trim();
    if (text && text !== before) break;
    await sleep(250);
  }
  return text;
}

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
    // Entered once: a second "interact" would step into the first item of the page and shut the rest out.
    if (/web content/i.test(phrase) && !spoken.some(p => p && !/web content/i.test(p)) && spoken.filter(p => /web content/i.test(p)).length % 4 === 0) await voiceOver.interact();
    spoken.push(phrase);
  }
  // Every heading, control and link, each by its own navigation command: back to the first one, then
  // forward through all of them. Neighbouring controls may share a name (the table view of each chart),
  // so a sweep is not stopped by a repeated reading: it runs for half as many steps again as the page has
  // items, and ends when VoiceOver says twice running that it is at the end.
  const K = voiceOver.keyboardCommands, END = /^(Last|First) |not found|no (more|further|next|previous)/i;
  const stuck = new Set();
  const sweep = async (next, prev, names) => {
    const count = names.length, budget = Math.ceil(count * 1.5) + 10;
    // The longest run of neighbours with one name: that many equal readings in a row are expected.
    let run = 1, longest = 1;
    for (let i = 1; i < count; i++) { run = names[i] === names[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
    const limit = longest + 2;
    // One direction of the sweep. Equal readings beyond the expected run mean either the end of the list or
    // that VoiceOver has come to rest on an item: it is stepped over once; if the list goes on from there,
    // it had come to rest, otherwise this was the end.
    const walk = async (command, hop, from, collect) => {
      let at = from;
      for (let i = 0, ended = 0, same = 0; i < budget && ended < 2; i++) {
        let p = await step(command, at);
        same = p === at ? same + 1 : 0;
        if (same >= limit) {
          await step(hop, at);
          p = await step(command, at);
          if (p === at || END.test(p)) break;
          stuck.add(at); same = 0;
        }
        ended = END.test(p) ? ended + 1 : 0;
        at = p;
        collect?.push(p);
      }
      return at;
    };
    const first = await walk(prev, K.moveToPrevious, '');
    const said = [first];
    await walk(next, K.moveToNext, first, said);
    return said.map(p => p.replace(/^(Last|First) (form element|control|link|heading|item)\s*/i, ''));
  };
  // Each kind is read up to three times, from differently placed cursors (as left, let out of the item it
  // is in, taken to the top of the page): VoiceOver's cursor does not always start where it was put.
  const heard = (names, said) => names.filter(n => { const want = words(pill(n)); return want.length && !said.some(p => { const got = new Set(words(pill(p))); return want.filter(w => got.has(w)).length >= Math.ceil(want.length * 0.6); }); });
  const inOrder = said => { let at = 0; const miss = []; for (const [level, text] of expected.headings) { const k = said.findIndex((p, i) => i >= at && says(p, level, text)); if (k < 0) miss.push(`level ${level} "${text}"`); else at = k; } return miss; };
  const moves = [async () => {}, () => voiceOver.stopInteracting().catch(() => {}), () => step(K.jumpToTopEdge).catch(() => {})];
  let headings = [], missing = expected.headings.map(h => `level ${h[0]} "${h[1]}"`);
  for (const move of moves) {
    await move();
    const said = await sweep(K.findNextHeading, K.findPreviousHeading, expected.headings.map(h => h[1])), miss = inOrder(said);
    if (miss.length < missing.length || !headings.length) { headings = said; missing = miss; }
    if (!missing.length) break;
  }
  const all = async (next, prev, names) => {
    const said = [];
    for (const move of moves) { await move(); said.push(...await sweep(next, prev, names)); if (!heard(names, said).length) break; }
    return said;
  };
  const controls = await all(K.findNextControl, K.findPreviousControl, expected.controls);
  const links = await all(K.findNextLink, K.findPreviousLink, expected.links);
  const silent = [...heard(expected.controls, controls).map(n => `control "${n.slice(0, 50)}"`), ...heard(expected.links, links).map(n => `link "${n.slice(0, 50)}"`)];
  return { spoken, headings, controls, links, missing, silent, stuck: [...stuck] };
}

try {
  const expected = await headingsOfPages();
  await sleep(2000);
  await voiceOver.start();
  let pages = 0, total = 0, things = 0;
  for (const route of ROUTES) {
    const want = expected[route];
    if (!want?.headings.length) { fail(`${route}: the page shows no headings`); continue; }
    // A control that carries no name in the page cannot be announced with one.
    const nameless = want.controls.concat(want.links).filter(n => !n).length;
    if (nameless) fail(`${route}: ${nameless} controls or links carry no name in the page`);
    // VoiceOver's cursor sometimes stays outside the page on a first pass: a page is read a second time if anything was missed.
    let r = null;
    for (let pass = 0; pass < 2; pass++) {
      r = await read(route, want);
      if (!r.missing.length && !r.silent.length) break;
      console.log(`${route}: pass ${pass + 1} missed ${r.missing.length} of ${want.headings.length} headings and ${r.silent.length} of ${want.controls.length + want.links.length} controls and links`);
    }
    console.log(`--- ${route}: headings announced\n${[...new Set(r.headings)].join('\n')}\n--- ${route}: controls announced (${r.controls.length})\n${r.controls.join('\n')}\n--- ${route}: links announced (${r.links.length})\n${r.links.join('\n')}`);
    if (r.missing.length) fail(`${route}: not announced as headings, or out of order: ${r.missing.join('; ')}`);
    if (r.silent.length) fail(`${route}: not announced by name: ${r.silent.join('; ')}`);
    if (r.stuck.length) console.log(`note ${route}: navigation paused on ${[...new Set(r.stuck.map(x => x.slice(0, 50)))].join('; ')} and went on`);
    const unnamed = r.controls.concat(r.links, r.spoken).filter(p => /^(dimmed )?(toggle )?(button|link|image|group|pop ?up button|slider|value indicator|text field|edit text|checkbox|menu button|stepper|incrementor)\.?$/i.test(p.trim()));
    if (unnamed.length) fail(`${route}: announced without a name: ${[...new Set(unnamed)].join(', ')}`);
    if (!r.missing.length && !r.silent.length && !unnamed.length && !nameless) { pages++; total += want.headings.length; things += want.controls.length + want.links.length; console.log(`ok ${route}: all ${want.headings.length} headings in order at their levels; all ${want.controls.length} controls and ${want.links.length} links announced by name`); }
  }
  console.log(`${pages} of ${ROUTES.length} pages read by VoiceOver: ${total} headings, ${things} controls and links`);
} catch (e) { fail(`${e.message}${e.cause ? ` (${e.cause.message || e.cause})` : ''}`); } finally {
  await voiceOver.stop().catch(() => {});
  try { execFileSync('osascript', ['-e', 'tell application "Safari" to quit']); } catch { /* Safari was not opened */ }
  site.server.close();
}
console.log(process.exitCode ? 'VOICEOVER CHECK FAILED' : 'VOICEOVER CHECK PASSED');
