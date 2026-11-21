import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg',
};

// Generate a one-day loopback identity in process pipes. Nothing is installed
// in the system trust store and no certificate or key file is opened or saved.
export function localCertificate() {
  let openssl = 'openssl';
  if (process.platform === 'win32') {
    try {
      const gitExec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
      const bundled = path.resolve(gitExec, '../../../usr/bin/openssl.exe');
      if (existsSync(bundled)) openssl = bundled;
    } catch { /* OpenSSL on PATH also works without Git. */ }
  }
  const pem = execFileSync(openssl, [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', '-', '-out', '-', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return {
    key: pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)[0],
    cert: pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0],
  };
}

// Each origin serves exactly one mount. A root-absolute URL in a project site
// must genuinely 404. In-memory files are exclusively the verified web build.
export async function serveBuild(files, prefix, holdFirstLoad, certificate, intercept) {
  const requests = [];
  const sessions = new Set();
  const encoded = new Map();
  let releaseScripts, releaseModels;
  const scripts = new Promise(resolve => { releaseScripts = resolve; });
  const gate = new Promise(resolve => { releaseModels = resolve; });
  if (!holdFirstLoad) { releaseScripts(); releaseModels(); }
  const server = createSecureServer({ ...certificate, allowHTTP1: true }, async (req, res) => {
    const pathname = new URL(req.url, 'https://localhost').pathname;
    const name = pathname === prefix ? 'index.html' : pathname.slice(prefix.length);
    const raw = files.get(name);
    const log = { path: pathname, status: 404, bodyBytes: 0 };
    requests.push(log);
    if (req.method !== 'GET' || !pathname.startsWith(prefix) || !raw || !types[path.extname(name)]) {
      res.writeHead(404).end();
      return;
    }
    if (intercept?.(name, raw, res)) { log.status = res.statusCode; return; }
    if (name.endsWith('.js')) await scripts;
    if (name.endsWith('.glb')) await gate;
    if (res.destroyed) return;
    const accept = req.headers['accept-encoding'] ?? '';
    const text = /\.(?:html|css|js)$/.test(name);
    const coding = text && /\bbr\b/.test(accept) ? 'br' : text && /\bgzip\b/.test(accept) ? 'gzip' : 'identity';
    const key = name + ':' + coding;
    if (!encoded.has(key)) {
      let body = raw;
      if (coding === 'br') body = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
      if (coding === 'gzip') body = gzipSync(raw);
      encoded.set(key, { body, etag: '"' + createHash('sha256').update(body).digest('hex') + '"' });
    }
    const { body, etag } = encoded.get(key);
    const headers = {
      'Content-Type': types[path.extname(name)],
      'Cache-Control': name === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; base-uri 'self'",
      'Vary': 'Accept-Encoding', 'ETag': etag,
    };
    if (coding !== 'identity') headers['Content-Encoding'] = coding;
    if (req.headers['if-none-match'] === etag) {
      log.status = 304;
      res.writeHead(304, headers).end();
    } else {
      Object.assign(log, { status: 200, bodyBytes: body.length, coding });
      res.writeHead(200, { ...headers, 'Content-Length': body.length }).end(body);
    }
  });
  server.on('session', session => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: new URL(prefix, 'https://127.0.0.1:' + server.address().port),
    requests, releaseScripts, releaseModels,
    close: () => {
      releaseScripts(); releaseModels();
      for (const session of sessions) session.destroy();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
