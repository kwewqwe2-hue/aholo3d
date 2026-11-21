import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { test } from 'node:test';
import { withHostedPage } from './hosted-network.mjs';
import { localCertificate } from './web-origin.mjs';

test('only project GETs reach the two loopback HTTPS servers, including redirect hops', async () => {
  const tls = localCertificate(), received = [], foreign = [];
  async function listen(handler) {
    const server = createServer(tls, handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return server;
  }
  const other = await listen((req, res) => { foreign.push(req.url); res.end('foreign'); });
  const otherUrl = 'https://127.0.0.1:' + other.address().port + '/game/elsewhere';
  const server = await listen((req, res) => {
    received.push(req.method + ' ' + req.url);
    const redirect = { '/game/valid': '/game/ok', '/game/chain': '/game/escape',
      '/game/escape': '/outside', '/game/foreign': otherUrl }[req.url];
    if (redirect) { res.writeHead(302, { Location: redirect }).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<head><link rel="icon" href="data:,"></head><body>ok</body>');
  });
  const site = new URL('https://127.0.0.1:' + server.address().port + '/game/');
  const report = { errors: [] };
  try {
    await withHostedPage(site, report, async page => {
      await page.goto(site.href);
      const results = await page.evaluate(async other => {
        const requests = [['valid', 'GET'], ['chain', 'GET'], ['foreign', 'GET'], ['/game-other/no', 'GET'],
          ['/%2e%2e/outside', 'GET'], ['mutate', 'POST'], ['ok', 'HEAD'], [other, 'GET']];
        const statuses = [];
        for (const [url, method] of requests) {
          try { statuses.push((await fetch(url, { method })).status); } catch { statuses.push('blocked'); }
        }
        await new Promise(resolve => {
          const ws = new WebSocket(location.origin.replace('https:', 'wss:') + '/game/ws');
          ws.onclose = ws.onerror = resolve;
        });
        addEventListener('pagehide', () => {
          navigator.sendBeacon('/game/exit', 'local test');
          void fetch('/game/last', { keepalive: true, method: 'POST' }).catch(() => {});
        }, { once: true });
        return statuses;
      }, otherUrl);
      assert.deepEqual(results, [200, ...Array(7).fill('blocked')]);
    }, tls.cert);
    assert.deepEqual(foreign, []);
    assert.deepEqual(received, ['GET /game/', 'GET /game/valid', 'GET /game/ok', 'GET /game/chain',
      'GET /game/escape', 'GET /game/foreign']);
    assert.ok(report.network.blocked.some(r => r.method === 'POST'));
    assert.ok(report.network.blocked.some(r => r.method === 'POST' && r.url.endsWith('/game/exit')), JSON.stringify(report));
    assert.ok(report.network.blocked.some(r => r.method === 'POST' && r.url.endsWith('/game/last')));
    assert.ok(report.network.blocked.some(r => r.method === 'HEAD'));
    assert.ok(report.network.blocked.some(r => r.method === 'WS'));
    assert.equal(report.network.blocked.filter(r => r.reason.startsWith('redirect')).length, 2);
    assert.deepEqual(report.network.errors, []);
  } finally {
    await Promise.all([server, other].map(s => new Promise(resolve => s.close(resolve))));
  }
});
