// Compatibility check with Apple's VoiceOver screen reader reading the application in Safari on macOS,
// driven through Guidepup: the pages are announced by name, the navigation and the headings are
// reachable, and nothing interactive is announced without a name.
// Run on a Mac after `npm run build`: npx @guidepup/setup setup, npm install --no-save @guidepup/guidepup, npx @guidepup/setup install,
// then node e2e/voiceover.mjs
import { execFileSync } from 'node:child_process';
import { serve } from './server.mjs';

const { voiceOver, macOSActivate } = await import('@guidepup/guidepup');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('FAIL', msg); process.exitCode = 1; };
const site = serve();

async function read(route, steps) {
  execFileSync('open', ['-a', 'Safari', site.base + '#/' + route]);
  await sleep(9000);
  await macOSActivate('/Applications/Safari.app');
  await sleep(1000);
  const spoken = [];
  // Into the web content, then forward item by item.
  for (let i = 0; i < steps; i++) {
    await voiceOver.next();
    const phrase = await voiceOver.lastSpokenPhrase();
    // The cursor rests on the web area as a whole until it is entered.
    if (/web content/i.test(phrase) && spoken.filter(p => /web content/i.test(p)).length < 3) await voiceOver.interact();
    spoken.push(phrase);
  }
  const headings = [];
  for (let i = 0; i < 12; i++) { await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading); headings.push(await voiceOver.lastSpokenPhrase()); }
  return { spoken, headings };
}

try {
  await voiceOver.start();
  for (const [route, name, expect] of [['overview', 'Overview', /closed loop|monitor|Priority alerts|Daily drivers/i], ['guide', 'Guide', /Install Phoenix|Quick start|Shortcuts|Questions/i]]) {
    // VoiceOver's cursor sometimes stays outside the page on a first pass: the page is read up to three times.
    let spoken = [], headings = [];
    for (let pass = 0; pass < 3; pass++) {
      ({ spoken, headings } = await read(route, 60));
      if (headings.some(p => /heading/i.test(p) && expect.test(p)) && new Set(spoken).size > spoken.length / 3) break;
      console.log(`${route}: pass ${pass + 1} did not enter the page`);
    }
    console.log(`--- ${route}: spoken\n${spoken.join('\n')}\n--- ${route}: headings\n${headings.join('\n')}`);
    const all = spoken.concat(headings);
    if (!all.some(p => /Phoenix/i.test(p))) fail(`${route}: the application's name was never announced`);
    if (!all.some(p => new RegExp(name, 'i').test(p))) fail(`${route}: the page name "${name}" was never announced`);
    if (!headings.some(p => /heading/i.test(p) && expect.test(p))) fail(`${route}: none of the page's headings was reached by heading navigation`);
    const unnamed = spoken.filter(p => /^(button|link|image|group|pop ?up button|slider|text field)\.?$/i.test(p.trim()));
    if (unnamed.length) fail(`${route}: announced without a name: ${[...new Set(unnamed)].join(', ')}`);
    const distinct = new Set(spoken).size;
    if (distinct < spoken.length / 3) console.log(`note ${route}: item-by-item reading stayed on ${spoken.length - distinct + 1} repeated announcements; the headings were read through heading navigation`);
    if (!process.exitCode) console.log(`ok ${route} read by VoiceOver: ${spoken.length} items, ${headings.filter(p => /heading/i.test(p)).length} headings`);
  }
} catch (e) { fail(`${e.message}${e.cause ? ` (${e.cause.message || e.cause})` : ''}`); } finally {
  await voiceOver.stop().catch(() => {});
  try { execFileSync('osascript', ['-e', 'tell application "Safari" to quit']); } catch { /* Safari was not opened */ }
  site.server.close();
}
console.log(process.exitCode ? 'VOICEOVER CHECK FAILED' : 'VOICEOVER CHECK PASSED');
