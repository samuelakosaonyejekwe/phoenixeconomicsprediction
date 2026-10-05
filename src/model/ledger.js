// Audit ledger (Phoenix Economics Solutions §9.4). Three safeguards:
//  1. Hash chain: each entry carries the SHA-256 of the previous entry, so any partial edit or
//     deletion breaks every later link.
//  2. Signatures: each entry is signed with an ECDSA P-256 key generated on the recording device
//     with a non-extractable private key (NIST FIPS 186-5), so entries cannot be forged or the
//     chain rebuilt without that key.
//  3. Anchoring: the head of the chain is published to an anchor log and, through it, to the public
//     Sigstore Rekor transparency log run by a third party. Verification checks each Rekor entry
//     directly against Rekor (contents, signed timestamp, inclusion proof, checkpoint; rekor.js), so
//     the anchor service is not trusted; a rewritten history no longer matches the published anchors. The first
//     entry of every device key is anchored, so a key replaced later is visible.
import { verifyRekorEntry } from './rekor.js';
const enc = new TextEncoder();
const subtle = () => globalThis.crypto?.subtle;

async function sha256(text) {
  const buf = await subtle().digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

const body = e => JSON.stringify({ seq: e.seq, ts: e.ts, kind: e.kind, cell: e.cell, type: e.type, cause: e.cause, indicators: e.indicators, converted: e.converted ?? null, into: e.into ?? null, anchor: e.anchor ?? null, prev: e.prev });

// Device signing key, kept in IndexedDB as a CryptoKey (the private key never leaves the browser).
let keyPromise = null;
export function deviceKey(store) {
  if (!keyPromise) keyPromise = (async () => {
    if (!subtle()) return null;
    let k = await store?.get?.('ledger:key');
    if (!k) {
      const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      const jwk = await subtle().exportKey('jwk', pair.publicKey);
      k = { privateKey: pair.privateKey, pub: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
      await store?.set?.('ledger:key', k);
    }
    k.kid = (await sha256(JSON.stringify(k.pub))).slice(0, 16);
    return k;
  })();
  return keyPromise;
}

export async function append(chain, entry, store) {
  const prev = chain.length ? chain[chain.length - 1].hash : '0'.repeat(64);
  const e = { seq: chain.length, ts: new Date().toISOString(), ...entry, prev };
  e.hash = await sha256(body(e));
  const k = await deviceKey(store).catch(() => null);
  if (k) {
    const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, enc.encode(e.hash));
    e.sig = b64u(sig); e.pub = k.pub; e.kid = k.kid;
  }
  chain.push(e);
  return e;
}

const pubCache = new Map();
async function importPub(pub) {
  const id = pub.x + pub.y;
  if (!pubCache.has(id)) pubCache.set(id, await subtle().importKey('jwk', { ...pub, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  return pubCache.get(id);
}

// Verifies links, hashes and signatures; optionally checks anchors against the public log.
export async function verify(chain, { checkAnchors = null, rekor = verifyRekorEntry } = {}) {
  // Every entry must be signed, and signed with the key registered in the ledger (§9.4): the first entry
  // registers the device key; a later KEY_REGISTERED entry (for example after the browser's storage was
  // cleared) starts a new key period and is reported, so a key change is always visible.
  let prev = '0'.repeat(64), signed = 0, keyId = null;
  const keyPeriods = [];
  for (const e of chain) {
    if (e.prev !== prev) return { ok: false, at: e.seq, reason: 'Broken link to previous entry' };
    if ((await sha256(body(e))) !== e.hash) return { ok: false, at: e.seq, reason: 'Entry contents altered' };
    if (!(e.sig && e.pub)) return { ok: false, at: e.seq, reason: 'Unsigned entry' };
    const okSig = await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, await importPub(e.pub), unb64u(e.sig), enc.encode(e.hash));
    if (!okSig) return { ok: false, at: e.seq, reason: 'Invalid signature' };
    const kid = e.kid || e.pub.x + e.pub.y;
    if (e.type === 'KEY_REGISTERED') { keyId = kid; keyPeriods.push({ from: e.seq, kid }); }
    else if (keyId === null) return { ok: false, at: e.seq, reason: 'Entry signed before any key was registered' };
    else if (kid !== keyId) return { ok: false, at: e.seq, reason: 'Signed with a key that was not registered' };
    signed++;
    prev = e.hash;
  }
  const anchors = chain.filter(e => e.type === 'ANCHORED' && e.anchor);
  let anchorCheck = null;
  if ((checkAnchors || rekor) && anchors.length) {
    anchorCheck = { checked: 0, matched: 0, rekorVerified: 0, unreachable: 0 };
    for (const a of anchors) {
      anchorCheck.checked++;
      const target = chain[a.anchor.seq];
      if (!target || target.hash !== a.anchor.hash) continue;
      // An anchor entered in Rekor is verified against Rekor directly (entry contents, signed timestamp,
      // inclusion proof and checkpoint), without trusting the anchor service; otherwise the anchor
      // service's own record is compared. A log that cannot be reached leaves the anchor unverified,
      // which is reported separately from a mismatch.
      if (a.anchor.rekor?.uuid && rekor) {
        let r = null;
        try { r = await rekor(a.anchor.rekor.uuid, { headHash: target.hash, sigB64: target.sig ? b64(toDER(unb64u(target.sig))) : undefined, pem: target.pub ? await pemOf(target.pub) : undefined }); } catch { anchorCheck.unreachable++; continue; }
        if (r?.ok) { anchorCheck.matched++; anchorCheck.rekorVerified++; } else if (r?.unreachable) anchorCheck.unreachable++;
      } else if (checkAnchors) {
        let rec;
        try { rec = await checkAnchors(a.anchor.hash); } catch { anchorCheck.unreachable++; continue; }
        if (rec && rec.hash === a.anchor.hash && rec.at === a.anchor.at) anchorCheck.matched++;
      }
    }
    if (anchorCheck.matched + anchorCheck.unreachable < anchorCheck.checked) return { ok: false, at: anchors[0].seq, reason: `Anchors do not match the public logs (${anchorCheck.matched} of ${anchorCheck.checked})`, signed, anchored: anchors.length, anchorCheck, keyPeriods };
  }
  return { ok: true, count: chain.length, head: prev, signed, anchored: anchors.length, anchorCheck, keyPeriods };
}

// ECDSA signature from IEEE P1363 (r||s, WebCrypto) to ASN.1 DER (as transparency logs expect).
function toDER(p1363) {
  const enc = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Uint8Array.from([0, ...b]); return [0x02, b.length, ...b]; };
  const r = enc(p1363.slice(0, 32)), s = enc(p1363.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}
const b64 = u8 => btoa(String.fromCharCode(...u8));
async function pemOf(pub) {
  const k = await subtle().importKey('jwk', { ...pub, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const spki = new Uint8Array(await subtle().exportKey('spki', k));
  return `-----BEGIN PUBLIC KEY-----\n${b64(spki).match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

// Publishes the current head to the anchor log, which records it and enters it in the public Sigstore
// Rekor transparency log (signed hash, public key); the receipt is recorded in the chain.
export async function anchor(chain, endpoint, store) {
  if (!chain.length) throw new Error('Nothing to anchor yet.');
  const head = chain[chain.length - 1];
  let rekor = null;
  if (head.sig && head.pub) {
    const digest = await sha256(head.hash);
    rekor = { apiVersion: '0.0.1', kind: 'hashedrekord', spec: { signature: { content: b64(toDER(unb64u(head.sig))), publicKey: { content: btoa(await pemOf(head.pub)) } }, data: { hash: { algorithm: 'sha256', value: digest } } } };
  }
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: head.hash, seq: head.seq, kid: head.kid ?? null, rekor }) });
  if (!res.ok) throw new Error(`Anchor log returned HTTP ${res.status}`);
  const rec = await res.json();
  return append(chain, { kind: 'AUDIT', cell: 'ALL', type: 'ANCHORED', cause: `Chain head #${head.seq} anchored at ${rec.at}${rec.rekor?.logIndex != null ? `; Rekor transparency log entry ${rec.rekor.logIndex}` : ''}`, indicators: {}, anchor: { hash: rec.hash, seq: rec.seq, at: rec.at, log: endpoint, rekor: rec.rekor ?? null } }, store);
}

export function toCSV(chain) {
  const cols = ['seq', 'ts', 'kind', 'cell', 'type', 'cause', 'pi', 'S', 'Scrit', 'Theta', 'converted', 'into', 'hash', 'kid', 'sig'];
  const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = chain.map(e => [e.seq, e.ts, e.kind, e.cell, e.type, e.cause, e.indicators?.pi, e.indicators?.S, e.indicators?.Scrit, e.indicators?.Theta, e.converted, e.into, e.hash, e.kid, e.sig].map(esc).join(','));
  return [cols.join(','), ...rows].join('\n');
}
