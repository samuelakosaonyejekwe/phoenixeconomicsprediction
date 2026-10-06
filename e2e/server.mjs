// The built application (dist/) on a local port, for the compatibility checks that drive a real browser
// which cannot intercept requests. The page is configured to use this server for the published snapshot
// and for anchoring, so that a run enters nothing in the public transparency log.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

export function serve() {
  const anchored = new Map();
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(`self.PHX_MIRRORS=[];self.PHX_DATA_ENDPOINTS=["http://127.0.0.1:${server.address().port}/data/snapshot.json"];`);
    }
    if (p === '/anchor' && req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; });
      return req.on('end', () => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'bad request' }); }
        if (!anchored.has(b.hash)) anchored.set(b.hash, { hash: b.hash, seq: b.seq, kid: b.kid ?? null, at: new Date().toISOString(), log: 'local stand-in', rekor: null });
        json(res, 201, anchored.get(b.hash));
      });
    }
    if (p.startsWith('/anchor/')) { const rec = anchored.get(p.split('/').pop()); return json(res, rec ? 200 : 404, rec || { error: 'not found' }); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1');
  return { server, anchored, get base() { return `http://127.0.0.1:${server.address().port}/`; } };
}
