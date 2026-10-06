// Unit tests of the mechanisms the paper relies on: real-time cuts, money conservation, the ledger and
// the independent verification of transparency-log entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { qPub } from '../src/model/inputs.js';
import { simulate } from '../src/model/engine.js';
import { DEFAULTS, SCENARIOS } from '../src/model/params.js';
import { rootFromInclusion, derToP1363 } from '../src/model/rekor.js';
import { append, verify } from '../src/model/ledger.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('quarterly accounts are cut at what was published by the end of a month (§7.2)', () => {
  assert.equal(qPub('2021-11'), '2021-Q2');
  assert.equal(qPub('2021-12'), '2021-Q2');
  assert.equal(qPub('2022-01'), '2021-Q3');
  assert.equal(qPub('2026-10'), '2026-Q2');
});

test('money is conserved in every run (§4.13)', () => {
  const cell = { id: 'X', name: 'Test', lat: 50, lon: 10, gdp: 1000, pi: 6, piCore: 4, wE: 0.1, drift: 0, x0: 1, i0: 1, area: 'EA', ea: true, eu: true, gPot: 1.5, anchor: 2, aR: 0.07, driftHalf: 3, pop: 1e7,
    sectors: { gov: 30, corp: 40, hh: 100 }, flows: { gov: 5, corp: 5, hh: 10 }, inflowDecay: { hh: 24, corp: 8, gov: 6 }, scritHist: { p90: 5, p75: 3 }, measured: { gov: 'quarterly', corp: 'quarterly', hh: 'quarterly' }, energy: { type: 'oil', elasticity: 0.19 } };
  for (const P of [{ ...DEFAULTS }, { ...DEFAULTS, capPct: 3, kA: 1 }, { ...DEFAULTS, months: 72 }]) {
    const r = simulate([cell], P, SCENARIOS.live, { phx: true });
    assert.ok(r.totals.absorbed > 0);
    assert.ok(Math.abs(r.totals.residual) < 1e-9, `residual ${r.totals.residual}`);
  }
});

const CELL = { id: 'X', name: 'Test', lat: 50, lon: 10, gdp: 1000, pi: 6, piCore: 4, wE: 0.1, drift: 0, x0: 1, i0: 1, area: 'EA', ea: true, eu: true, gPot: 1.5, anchor: 2, aR: 0.07, driftHalf: 3, pop: 1e7,
  sectors: { gov: 30, corp: 40, hh: 100 }, flows: { gov: 5, corp: 5, hh: 10 }, inflowDecay: { hh: 24, corp: 8, gov: 6 }, scritHist: { p90: 5, p75: 3 }, measured: { gov: 'quarterly', corp: 'quarterly', hh: 'quarterly' }, energy: { type: 'oil', elasticity: 0.19 } };

test('the run ends exactly at the horizon whatever the time step (§8)', () => {
  for (const dt of [0.025, 0.02, 0.015, 0.1, 0.25]) {
    const r = simulate([CELL], { ...DEFAULTS, dt }, SCENARIOS.live, { phx: true });
    assert.ok(Math.abs(r.rec.t.at(-1) - 24) < 1e-9, `dt ${dt}: last record at ${r.rec.t.at(-1)}`);
    assert.ok(r.agg.find(a => a.t >= 12 - 1e-9), `dt ${dt}: no record at month 12`);
    assert.equal(r.totals.lossN, Math.round(24 / dt), `dt ${dt}: loss averaged over ${r.totals.lossN} steps`);
  }
});

test('a sector weighted zero is neither counted nor absorbed (§4.2)', () => {
  const cell = { ...CELL, sectors: { gov: 200, corp: 100, hh: 0 }, flows: { gov: 0, corp: 0, hh: 0 } };
  const P = { ...DEFAULTS, lamGov: 0, sdCorp: 0, sdGov: 0, r0: 0.01 };
  const r = simulate([cell], P, SCENARIOS.live, { phx: true });
  assert.ok(r.totals.absorbed > 0);
  // Everything absorbed came out of the corporate stock, the only one counted.
  assert.ok(Math.abs((100 - (r.rec.S.at(-1)[0])) - (r.totals.absorbed - r.totals.matured - r.totals.recallDE - r.totals.recallDeposits)) < 1e-6);
});

test('optional cross-border diffusion moves deposits without creating or destroying them (§4.1)', () => {
  const a = { ...CELL, id: 'A', flows: { gov: 0, corp: 0, hh: 0 } }, b = { ...CELL, id: 'B', lat: 48, lon: 2, gdp: 300, sectors: { gov: 0, corp: 0, hh: 5 }, flows: { gov: 0, corp: 0, hh: 0 } };
  const P = { ...DEFAULTS, d0: 0.1, sdHh: 0, sdCorp: 0, sdGov: 0 };
  const r = simulate([a, b], P, SCENARIOS.live, { phx: false });
  const sum = row => row.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum(r.rec.S.at(-1)) - sum(r.rec.S[0])) < 1e-9, `drift ${sum(r.rec.S.at(-1)) - sum(r.rec.S[0])}`);
  assert.ok(Math.abs(r.rec.S.at(-1)[1] - r.rec.S[0][1]) > 0.01, 'nothing moved');
});

// RFC 6962 Merkle tree for the inclusion-proof test.
const H = (...b) => new Uint8Array(createHash('sha256').update(Buffer.concat(b.map(x => Buffer.from(x)))).digest());
const leafH = d => H([0], d), nodeH = (l, r) => H([1], l, r);
const mth = leaves => { if (leaves.length === 1) return leafH(leaves[0]); const k = 2 ** Math.floor(Math.log2(leaves.length - 1)); return nodeH(mth(leaves.slice(0, k)), mth(leaves.slice(k))); };
const path = (m, leaves) => { if (leaves.length === 1) return []; const k = 2 ** Math.floor(Math.log2(leaves.length - 1)); return m < k ? [...path(m, leaves.slice(0, k)), mth(leaves.slice(k))] : [...path(m - k, leaves.slice(k)), mth(leaves.slice(0, k))]; };

test('Merkle inclusion proofs are verified, including indices beyond 2^31 (§9.4)', async () => {
  for (const n of [1, 2, 3, 7, 8, 13]) {
    const leaves = Array.from({ length: n }, (_, i) => Buffer.from(`entry ${i}`));
    const root = mth(leaves);
    for (let m = 0; m < n; m++) {
      const r = await rootFromInclusion(leafH(leaves[m]), m, n, path(m, leaves));
      assert.deepEqual(Buffer.from(r).toString('hex'), Buffer.from(root).toString('hex'));
    }
    const bad = await rootFromInclusion(leafH(Buffer.from('forged')), 0, n, path(0, leaves));
    if (n > 1) assert.notEqual(Buffer.from(bad).toString('hex'), Buffer.from(root).toString('hex'));
  }
  // A large index must not overflow: a single-step proof in a tree of 2^32 + 2 leaves still terminates correctly.
  assert.equal(await rootFromInclusion(new Uint8Array(32), 2 ** 32 + 1, 2 ** 32 + 2, []), null);
});

test('DER signatures convert to the raw form WebCrypto verifies', async () => {
  const k = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const msg = new TextEncoder().encode('phoenix');
  for (let t = 0; t < 20; t++) {
    const raw = new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, msg));
    const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Uint8Array.from([0, ...b]); return [0x02, b.length, ...b]; };
    const r = int(raw.slice(0, 32)), s = int(raw.slice(32)), der = Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
    assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, derToP1363(der), msg));
  }
});

test('the ledger detects edits and checks Rekor anchors without trusting the anchor service', async () => {
  const store = new Map(), kv = { get: k => store.get(k), set: (k, v) => store.set(k, v) };
  const chain = [];
  await append(chain, { kind: 'AUDIT', cell: 'ALL', type: 'KEY_REGISTERED', cause: 'test', indicators: {} }, kv);
  await append(chain, { kind: 'LIVE', cell: 'DE', type: 'DORMANT→ARMED', cause: 'test', indicators: { pi: 3.2 } }, kv);
  assert.equal((await verify(chain, { rekor: null })).ok, true);
  const head = chain.at(-1);
  await append(chain, { kind: 'AUDIT', cell: 'ALL', type: 'ANCHORED', cause: 'test', indicators: {}, anchor: { hash: head.hash, seq: head.seq, at: 'T', log: 'x', rekor: { uuid: 'u1' } } }, kv);
  let seen = null, service = 0;
  const rekorOk = async (uuid, expect) => { seen = { uuid, expect }; return { ok: true }; };
  const lying = async () => { service++; return { hash: head.hash, at: 'T', rekorVerified: true }; };
  const ok = await verify(chain, { checkAnchors: lying, rekor: rekorOk });
  assert.equal(ok.ok, true);
  assert.equal(seen.uuid, 'u1');
  assert.equal(seen.expect.headHash, head.hash);
  assert.ok(seen.expect.sigB64 && seen.expect.pem.includes('BEGIN PUBLIC KEY'));
  assert.equal(service, 0, 'the anchor service must not be consulted for an anchor entered in Rekor');
  // Rekor says no: verification fails even though the anchor service claims success.
  assert.equal((await verify(chain, { checkAnchors: lying, rekor: async () => ({ ok: false }) })).ok, false);
  // Editing any past entry breaks the chain.
  chain[1].indicators.pi = 9;
  assert.equal((await verify(chain, { rekor: null })).ok, false);
});
