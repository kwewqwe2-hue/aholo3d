import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { launchQaBrowser } from './browser.mjs';

function safePath(pathname) {
  // Reject ambiguous encoded delimiters and double-encoding before a server
  // has the chance to decode a URL differently from Chromium.
  if (/%(?:2f|5c|25|00)/i.test(pathname)) return false;
  try { return !decodeURIComponent(pathname).split('/').some(p => p === '.' || p === '..'); }
  catch { return false; }
}

export function siteDirectory(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.endsWith('/') || !safePath(url.pathname)) {
    throw Error('需要以 / 结尾的 HTTPS 项目目录，不含凭据、查询参数或片段');
  }
  return url;
}

function inScope(target, site) {
  return target.protocol === 'https:' && target.origin === site.origin && !target.username && !target.password &&
    target.pathname.startsWith(site.pathname) && safePath(target.pathname);
}

function printable(raw) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:', 'wss:', 'ws:'].includes(u.protocol)) return u.protocol;
    return u.origin + u.pathname + (u.search ? '?…' : '');
  } catch { return String(raw).slice(0, 100); }
}

export async function withHostedPage(site, report, run, publicTestCert) {
  const args = ['--no-proxy-server', '--no-pings', '--disable-quic', '--dns-prefetch-disable',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ' + site.hostname];
  if (publicTestCert) {
    if (site.hostname !== '127.0.0.1') throw Error('测试证书仅用于本机');
    const spki = new X509Certificate(publicTestCert).publicKey.export({ type: 'spki', format: 'der' });
    args.push('--ignore-certificate-errors-spki-list=' + createHash('sha256').update(spki).digest('base64'));
  }
  const browser = await launchQaBrowser(args);
  const network = report.network = { proxy: 'direct', requests: [], blocked: [], errors: [] };
  const deny = (method, raw, reason) => network.blocked.push({ method, url: printable(raw), reason });
  report.browser = browser.version();
  try {
    const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block', acceptDownloads: false,
      viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const records = new WeakMap();
    context.on('request', req => {
      if (/^(?:data|blob):/.test(req.url())) return;
      const row = { method: req.method(), url: printable(req.url()), type: req.resourceType() };
      records.set(req, row); network.requests.push(row);
    });
    context.on('response', response => {
      const row = records.get(response.request());
      if (row) row.status = response.status();
    });
    context.on('requestfailed', req => {
      const row = records.get(req);
      if (row) row.failure = req.failure()?.errorText ?? 'failed';
    });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text().slice(0, 500)); });
    const cdp = await context.newCDPSession(page);
    const storageKey = 'hosted-delivery-' + randomUUID();
    const seen = new Set();
    const recordBrowserBlock = row => {
      if (!Array.isArray(row) || row.length !== 4 || seen.has(row[0])) return;
      seen.add(row[0]); deny(row[1], row[2], row[3]);
    };
    await cdp.send('Runtime.enable');
    await cdp.send('Runtime.addBinding', { name: 'hostedNetworkBlocked' });
    cdp.on('Runtime.bindingCalled', ({ name, payload }) => {
      if (name === 'hostedNetworkBlocked') {
        try { recordBrowserBlock(JSON.parse(payload)); } catch { network.errors.push('Invalid browser policy record'); }
      }
    });
    await context.addInitScript(({ siteUrl, storageKey }) => {
      const base = new URL(siteUrl);
      const blocked = (method, url, why) => {
        const row = [crypto.randomUUID(), method, String(url), why];
        // A departing document may lose its DevTools binding before delivery.
        // Preserve just the QA events in this disposable tab's session storage.
        try {
          const rows = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
          rows.push(row); sessionStorage.setItem(storageKey, JSON.stringify(rows));
        } catch { /* Browser error pages can have opaque origins. */ }
        try { window.hostedNetworkBlocked(JSON.stringify(row)); } catch { /* Collected on unload. */ }
      };
      document.addEventListener('securitypolicyviolation', e => blocked('CSP', e.blockedURI, e.effectiveDirective));
      // Chromium can dispatch beacons/keepalive requests from the browser
      // process after a document is detached from DevTools interception.
      Object.defineProperty(Navigator.prototype, 'sendBeacon', { value(resource) {
        blocked('POST', new URL(resource, document.baseURI), 'beacon');
        return false;
      } });
      const fetchNormally = window.fetch.bind(window);
      window.fetch = function(input, init) {
        if (!(init?.keepalive ?? (input instanceof Request && input.keepalive))) return fetchNormally(input, init);
        const request = new Request(input, init), target = new URL(request.url);
        if (request.method !== 'GET' || target.origin !== base.origin || !target.pathname.startsWith(base.pathname) ||
            /%(?:2f|5c|25|00)/i.test(target.pathname)) {
          blocked(request.method, target, 'keepalive');
          return Promise.reject(new TypeError('Read-only project scope'));
        }
        return fetchNormally(new Request(request, { keepalive: false }));
      };
      if ('fetchLater' in window) Object.defineProperty(window, 'fetchLater', { value(input, init) {
        const request = new Request(input, init);
        blocked(request.method, request.url, 'deferred request');
        throw new TypeError('Deferred network disabled in delivery QA');
      } });
    }, { siteUrl: site.href, storageKey });
    await context.routeWebSocket(/.*/, ws => {
      deny('WS', ws.url(), 'WebSocket');
      ws.close({ code: 1008, reason: 'GET only' });
    });
    await context.route(/.*/, route => {
      const req = route.request(), target = new URL(req.url());
      if (target.protocol === 'data:' || (target.protocol === 'blob:' && target.origin === site.origin)) return route.continue();
      let mainFrame = false;
      try { mainFrame = req.frame() === page.mainFrame(); } catch { /* No attached document. */ }
      if (mainFrame && req.method() === 'GET' && inScope(target, site)) return route.continue();
      deny(req.method(), target.href, !mainFrame ? 'other frame' : req.method() !== 'GET' ? 'method' : 'outside project');
      return route.abort('blockedbyclient');
    });

    // Playwright routing is called only for the first URL of a redirect.
    // Inspect Chromium's actual response headers before it follows each hop.
    cdp.on('Fetch.requestPaused', async event => {
      const { requestId, request, responseStatusCode: code, responseHeaders: headers = [] } = event;
      try {
        const location = headers.find(h => h.name.toLowerCase() === 'location');
        if ([301, 302, 303, 307, 308].includes(code) && location) {
          const next = new URL(location.value, request.url);
          if (!inScope(next, site)) {
            deny('GET', next.href, 'redirect from ' + printable(request.url));
            await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
            return;
          }
        }
        if (event.resourceType === 'Document' && code === 200) {
          // This game runs in one document. Keep every request on the inspected
          // target, including on a misconfigured host returning a different page.
          await cdp.send('Fetch.continueResponse', { requestId, responseCode: code,
            responsePhrase: event.responseStatusText || 'OK', responseHeaders: [...headers, {
              name: 'Content-Security-Policy', value: "worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'",
            }] });
        } else {
          await cdp.send('Fetch.continueRequest', { requestId });
        }
      } catch (e) {
        network.errors.push(e.message);
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Response' }] });
    try { return await run(page); }
    finally {
      try {
        // Unload while the interception rules are still in force.
        if (!page.isClosed() && new URL(page.url()).origin === site.origin) {
          const blank = await page.evaluate(() => URL.createObjectURL(new Blob(['<link rel="icon" href="data:,">'], { type: 'text/html' })));
          await page.goto(blank, { waitUntil: 'load', timeout: 5000 });
          const rows = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]'), storageKey);
          rows.forEach(recordBrowserBlock);
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
