// Independent verification of Sigstore Rekor transparency-log entries in the browser (§9.4). Nothing
// here trusts the Phoenix anchor service: the entry is fetched from Rekor itself and checked against
//  1. the chain entry it should record (SHA-256 of the head hash, signature and public key);
//  2. Rekor's signed entry timestamp (ECDSA P-256 over the canonical JSON of body, time, log and index);
//  3. the Merkle inclusion proof (RFC 6962 hashing) up to the proof's root hash;
//  4. the signed checkpoint that commits Rekor to that root hash and tree size.
export const REKOR = 'https://rekor.sigstore.dev';
// Rekor's public log key (https://rekor.sigstore.dev/api/v1/log/publicKey), pinned so that a forged
// response cannot substitute its own key.
export const REKOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwr
kBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==
-----END PUBLIC KEY-----`;

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const sha = async u8 => new Uint8Array(await subtle().digest('SHA-256', u8));
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };

// ASN.1 DER ECDSA signature → IEEE P1363 (r||s), as WebCrypto expects.
export function derToP1363(der) {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { if (der[i] !== 0x02) throw new Error('bad DER'); const n = der[i + 1]; let v = der.slice(i + 2, i + 2 + n); i += 2 + n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  return cat(read(), read());
}
const pemBody = pem => b64d(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
let logKey = null;
const rekorKey = async () => (logKey ||= await subtle().importKey('spki', pemBody(REKOR_PUBLIC_KEY_PEM), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
const ecdsaOk = async (key, derSig, msg) => subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToP1363(derSig), msg);

// RFC 8785 canonical JSON for the objects Rekor signs (strings and integers only).
const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));

// RFC 6962 / RFC 9162 inclusion proof: root from a leaf hash, its index and the audit path.
export async function rootFromInclusion(leafHash, index, size, path) {
  // BigInt: Rekor's indices exceed 2^31, beyond JavaScript's 32-bit bitwise operators.
  let fn = BigInt(index), sn = BigInt(size) - 1n, r = leafHash;
  for (const p of path) {
    if (sn === 0n) return null;
    if ((fn & 1n) === 1n || fn === sn) {
      r = await sha(cat(Uint8Array.of(1), p, r));
      if ((fn & 1n) === 0n) while (!((fn & 1n) === 1n || fn === 0n)) { fn >>= 1n; sn >>= 1n; }
    } else r = await sha(cat(Uint8Array.of(1), r, p));
    fn >>= 1n; sn >>= 1n;
  }
  return sn === 0n ? r : null;
}

// Signed checkpoint ("signed note"): origin, tree size and base64 root hash, signed by the log key.
async function checkpointOk(note, rootHex, size) {
  const [text, sigs] = note.split('\n\n');
  const lines = text.split('\n');
  if (+lines[1] !== size || hex(b64d(lines[2])) !== rootHex) return false;
  const key = await rekorKey();
  for (const line of (sigs || '').split('\n').filter(Boolean)) {
    const raw = b64d(line.split(' ').at(-1));
    if (await ecdsaOk(key, raw.slice(4), enc.encode(text + '\n')).catch(() => false)) return true;
  }
  return false;
}

// Verifies one Rekor entry against the chain entry it is meant to record. `expect` gives the chain head
// hash (hex string), its DER signature (base64) and its public key PEM; omitted fields are not compared.
export async function verifyRekorEntry(uuid, expect = {}, fetcher = globalThis.fetch) {
  let res;
  try { res = await fetcher(`${REKOR}/api/v1/log/entries/${uuid}`); } catch (e) { return { ok: false, unreachable: true, reason: `Rekor unreachable: ${e?.message || e}` }; }
  if (res.status >= 500) return { ok: false, unreachable: true, reason: `Rekor returned HTTP ${res.status}` };
  if (!res.ok) return { ok: false, reason: `Rekor returned HTTP ${res.status}` };
  const e = Object.values(await res.json())[0];
  const bodyBytes = b64d(e.body), body = JSON.parse(new TextDecoder().decode(bodyBytes));
  const out = { logIndex: e.logIndex, integratedTime: e.integratedTime, contents: null, timestamp: false, inclusion: false, checkpoint: false };
  if (expect.headHash) {
    const digest = hex(await sha(enc.encode(expect.headHash)));
    out.contents = body.kind === 'hashedrekord' && body.spec?.data?.hash?.value === digest
      && (!expect.sigB64 || body.spec.signature?.content === expect.sigB64)
      && (!expect.pem || atob(body.spec.signature?.publicKey?.content || '') === expect.pem);
  }
  const set = e.verification?.signedEntryTimestamp;
  if (set) out.timestamp = await ecdsaOk(await rekorKey(), b64d(set), enc.encode(canon({ body: e.body, integratedTime: e.integratedTime, logID: e.logID, logIndex: e.logIndex }))).catch(() => false);
  const p = e.verification?.inclusionProof;
  if (p) {
    const leaf = await sha(cat(Uint8Array.of(0), bodyBytes));
    const root = await rootFromInclusion(leaf, p.logIndex, p.treeSize, p.hashes.map(unhex));
    out.inclusion = !!root && hex(root) === p.rootHash;
    out.checkpoint = p.checkpoint ? await checkpointOk(p.checkpoint, p.rootHash, p.treeSize).catch(() => false) : false;
  }
  out.ok = out.timestamp && out.inclusion && out.checkpoint && out.contents !== false;
  return out;
}
