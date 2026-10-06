// Unit tests of the stabilisation programmes that run beside the core model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInsee } from '../src/data/sources.js';
import { checkSource } from '../src/data/check.js';
import { DEFAULTS } from '../src/model/params.js';
import { PROG_DEFAULTS, sanitizeProg, triggerBoard, realisedVol, cashReward, commodityBasket, basketWeights, bubbleMonitor, devaluationMonitor, debtSwap, stabilityFund, recallLadder, themeFunds, saturationSinks, programmes, programmeStates } from '../src/model/programmes.js';

const S = PROG_DEFAULTS, P = DEFAULTS;
const cell = (id, o = {}) => ({ id, name: id, eu: true, ea: true, iso3: id, gdp: 100, pi: 2, piPeriod: '2026-08', unemp: 6, uBar: 6, x0: 0, govPct: -1, ca: 0, gPot: 1.5, refYear: 2026, ...o });
const months = n => Array.from({ length: n }, (_, i) => `${2005 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);

test('commodity prices are read from the publisher’s SDMX reply', () => {
  const xml = '<Series IDBANK="010002077" FREQ="M" TITLE_EN="x"><Obs TIME_PERIOD="2026-08" OBS_VALUE="88.0" OBS_STATUS="A"/><Obs TIME_PERIOD="2026-07" OBS_VALUE="83.9"/><Obs TIME_PERIOD="2026-06" OBS_STATUS="O"/></Series><Series IDBANK="010002061"><Obs TIME_PERIOD="2026-08" OBS_VALUE="4417.2"/></Series>';
  assert.deepEqual(parseInsee(xml), { '010002077': [['2026-07', 83.9], ['2026-08', 88]], '010002061': [['2026-08', 4417.2]] });
});

test('stale data are refused for the new sources', () => {
  assert.equal(checkSource('commod', { series: { brent: [['2026-08', 88]] } }, new Date('2026-10-06')), null);
  assert.match(checkSource('commod', { series: { brent: [['2025-06', 70]] } }, new Date('2026-10-06')), /months old/);
  assert.match(checkSource('fxh', { rates: { USD: [['2026-01-05', 1.1]] } }, new Date('2026-10-06')), /months old/);
});

test('settings are bounded and unknown keys dropped', () => {
  const s = sanitizeProg({ m3Th: 999, bandPct: 'x', nope: 1 });
  assert.equal(s.m3Th, 12); assert.equal(s.bandPct, 25); assert.equal('nope' in s, false);
});

test('inflation alone does not confirm a trigger; a monetary aggregate must agree', () => {
  const money = v => ({ m3: [['2026-08', v]], m1: [['2026-08', 2]], hhLoans: [['2026-08', 3]], nfcLoans: [['2026-08', 3]] });
  const hot = [cell('A', { pi: 4 })];
  assert.equal(triggerBoard({ money: money(3) }, hot, P, S).state, 'UNCONFIRMED');
  assert.equal(triggerBoard({ money: money(6) }, hot, P, S).state, 'CONFIRMED');
  assert.equal(triggerBoard({ money: money(6) }, [cell('A', { pi: 2 })], P, S).state, 'CLEAR');
  assert.equal(triggerBoard({ money: money(3) }, [cell('A', { pi: 0.1 })], P, S).state, 'INJECT');
  // With no monetary data at all the inflation trigger is not held back.
  assert.equal(triggerBoard({}, hot, P, S).state, 'CONFIRMED');
});

test('realised volatility is annualised and zero for a constant series', () => {
  assert.equal(realisedVol(Array.from({ length: 30 }, (_, i) => [i, 5]), 20), 0);
  const alt = Array.from({ length: 40 }, (_, i) => [i, i % 2 ? 101 : 100]);
  assert.ok(Math.abs(realisedVol(alt, 20) - Math.log(1.01) * Math.sqrt(252) * 100) < 1);
});

test('the cash premium is tiered', () => {
  assert.equal(cashReward(1000), 1);
  assert.equal(cashReward(10000), 1 + 9000 * 0.002);
  assert.ok(cashReward(200000) / 200000 > cashReward(1000) / 1000);
});

test('basket weights sum to one and the band flags a price outside it', () => {
  const w = basketWeights(S, ['brent', 'gold', 'wheat', 'maize', 'copper']);
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(w.brent, 0.4);
  const m = months(120), flat = v => m.map(p => [p, v]);
  const gold = m.map((p, i) => [p, i === 119 ? 200 : 100]);
  const b = commodityBasket({ commod: { series: { brent: flat(80), gold, wheat: flat(600), maize: flat(400), copper: flat(9000) }, eurPerUsd: flat(0.9) } }, S);
  assert.equal(b.items.find(i => i.k === 'gold').state, 'ABOVE');
  assert.ok(b.items.find(i => i.k === 'gold').capPay > 0);
  assert.equal(b.items.find(i => i.k === 'brent').state, 'INSIDE');
  assert.ok(Math.abs(b.items.find(i => i.k === 'brent').price - 72) < 1e-9);
  assert.ok(b.level > 100 && b.credit > 100);
});

test('housing signals are counted and scale the diversion offer', () => {
  const q = Array.from({ length: 44 }, (_, i) => `${2015 + Math.floor(i / 4)}-Q${i % 4 + 1}`);
  const flat = q.map((p, i) => [p, 100 * 1.005 ** i]);
  const boom = q.map((p, i) => [p, 100 * 1.005 ** i * (i > 39 ? 1.3 : 1)]);
  const data = { house: { rch: { A: [['2025-Q4', 12]], B: [['2025-Q4', 3]] }, idx: { A: boom, B: flat } }, money: { hhLoans: [['2026-08', 7]] } };
  const r = bubbleMonitor(data, [cell('A'), cell('B')], S).rows;
  assert.equal(r[0].c.id, 'A'); assert.equal(r[0].n, 3); assert.equal(r[0].state, 'SIGNAL'); assert.equal(r[0].divert, S.divertMax);
  assert.equal(r[1].n, 1); assert.ok(Math.abs(r[1].divert - S.divertMax / 3) < 1e-9);
});

test('a depreciation beyond the trigger opens the swap line and raises the reserve share', () => {
  const days = Array.from({ length: 280 }, (_, i) => new Date(Date.UTC(2025, 9, 1) + i * 864e5).toISOString().slice(0, 10));
  const data = { fxh: { rates: { USD: days.map(d => [d, 1.1]), TRY: days.map((d, i) => [d, 40 * (1 + 0.3 * i / 279)]), CHF: days.map(d => [d, 0.95]) } } };
  const fx = devaluationMonitor(data, S);
  const t = fx.rows.find(r => r.ccy === 'TRY'), c = fx.rows.find(r => r.ccy === 'CHF');
  assert.equal(t.state, 'SWAP'); assert.ok(t.dep > 20 && t.dep < 25); assert.ok(t.share > 5 && t.share <= S.reserveMax);
  assert.equal(c.state, 'STABLE'); assert.equal(c.share, 5);
});

test('debt exchange saves only above the reference yield plus the margin', () => {
  const data = { debt: { yields: { A: [['2026-08', 2.5]], B: [['2026-08', 4.5]] }, debt: { A: [['2026-Q1', 60]], B: [['2026-Q1', 140]] } }, imf: { countries: { B: { growth: [['2026', -0.5]] } } } };
  const sw = debtSwap(data, [cell('A'), cell('B')], S);
  const a = sw.rows.find(r => r.c.id === 'A'), b = sw.rows.find(r => r.c.id === 'B');
  assert.equal(sw.ref, 2.5); assert.equal(a.saving, 0);
  assert.ok(Math.abs(b.saving - 0.2 * 140 * (4.5 - 2.75) / 100) < 1e-9);
  assert.ok(Math.abs(b.savingY1 - b.saving / S.swapMaturity) < 1e-12);
  assert.equal(b.payFactor, 0.5); assert.equal(a.payFactor, 1);
});

test('the stability fund is fully allocated to eligible economies only', () => {
  const f = stabilityFund([cell('A', { gdp: 500 }), cell('B', { unemp: 14, uBar: 8 }), cell('C', { unemp: 12, uBar: 8, gdp: 50 })], P, S);
  assert.equal(f.eligible, 2);
  assert.equal(f.rows.find(r => r.c.id === 'A').alloc, 0);
  assert.ok(Math.abs(f.rows.reduce((s, r) => s + r.alloc, 0) - S.fundSize) < 1e-9);
  assert.equal(stabilityFund([cell('A'), cell('B')], P, S).eligible, 0);
});

test('recall is proportional to the breach and its channels add up', () => {
  const base = { phx: 100, P, S, m3: 17000 };
  assert.equal(recallLadder({ ...base, pi: 3.9 }).share, 0);
  assert.equal(recallLadder({ ...base, pi: 4 }).share, 2);
  assert.equal(recallLadder({ ...base, pi: 5.5 }).share, 3.5);
  assert.equal(recallLadder({ ...base, pi: 40 }).share, S.recallMax);
  const crisis = recallLadder({ ...base, pi: 7, vol: { state: 'RELEASE' } });
  assert.equal(crisis.dragon, 5);
  assert.ok(Math.abs(crisis.dragon + crisis.cash + crisis.digitalEuro - crisis.amount) < 1e-12);
  assert.ok(Math.abs(crisis.wPhx + crisis.wEur - 100) < 1e-12);
  assert.equal(recallLadder({ ...base, pi: 4.5 }).dragon, 0);
});

test('thematic funds and sinks distribute exactly what they hold', () => {
  const cells = [cell('A', { ca: -5 }), cell('B', { ca: 2 }), cell('C', { ca: -3, gdp: 300 })];
  const ex = themeFunds({}, cells, S).find(f => f.k === 'export');
  assert.equal(ex.eligible, 2);
  assert.ok(Math.abs(ex.rows.reduce((s, r) => s + r.alloc, 0) - S.themeSize) < 1e-9);
  assert.equal(themeFunds({}, cells, S).find(f => f.k === 'ageing').covered, 0);
  for (const crisis of [false, true]) {
    const k = saturationSinks(10, 100, S, crisis);
    assert.ok(Math.abs(k.rows.reduce((s, r) => s + r.amount, 0) - 10) < 1e-9);
    assert.equal(k.dragon, crisis ? 5 : 0);
  }
});

test('programmes run with no data at all and report quiet states', () => {
  const pr = programmes({}, [cell('A'), cell('B')], P, S);
  const st = programmeStates(pr);
  assert.equal(st.trigger, 'CLEAR'); assert.equal(st.recall, 'NONE');
  assert.equal(pr.basket, null); assert.equal(pr.swap, null);
});
