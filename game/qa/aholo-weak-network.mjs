// node qa/aholo-weak-network.mjs — production builds stay in memory. The only
// origins used by Chromium are the two disposable loopback HTTPS fixtures.
import assert from 'node:assert/strict';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { constants as http2 } from 'node:http2';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { launchQaBrowser } from './browser.mjs';
import { action, screen } from './doorstep-driver.mjs';
import { project, sha256 } from './doorstep-source.mjs';
import { touchDriver } from './doorstep-touch.mjs';
import { localCertificate, serveBuild } from './web-origin.mjs';

const profiles = {
  weak: { latency: 180, downloadThroughput: 375000, uploadThroughput: 93750 },
  original: { latency: 80, downloadThroughput: 1000000, uploadThroughput: 250000 },
};
const testEntry = path.join(project, 'qa', 'aholo-transfer-fixture.js');
const root = path.join(project, 'artifacts', '弱网模型验收');
await mkdir(root, { recursive: true });
const out = await mkdtemp(path.join(root, 'local-'));
const runtime = path.join(project, 'src', 'aholo-assets.js');
const courier = await readFile(path.join(project, 'src', 'assets', 'aholo', 'courier.glb'));
const report = { started: new Date().toISOString(), runtimeSha256: sha256(await readFile(runtime)),
  courierSha256: sha256(courier), profiles, ordinaryEntry: {}, transport: {}, passed: false };

function bounded(promise, ms, subject) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(subject)), ms); })])
    .finally(() => clearTimeout(timer));
}

async function bundle(mode, fixture) {
  const result = await build({ root: project, mode, logLevel: 'error', build: { write: false,
    ...(fixture && { rolldownOptions: { input: testEntry } }) } });
  const files = new Map();
  for (const item of result.output) files.set(item.fileName, Buffer.from(item.type === 'chunk' ? item.code : item.source));
  if (fixture) {
    const entry = result.output.find(f => f.isEntry);
    if (mode === 'production') return entry.code;
    files.set('index.html', Buffer.from('<!doctype html><link rel="icon" href="data:,"><script type="module" src="./' + entry.fileName + '"></script>'));
  }
  const model = [...files.keys()].find(f => /^assets\/courier-[\w-]+\.glb$/.test(f));
  assert.ok(files.get(model).equals(courier));
  return { files, model };
}

function track(page, modelURL) {
  const rows = [], byRequest = new WeakMap();
  page.on('request', req => {
    if (req.url() !== modelURL) return;
    const row = { method: req.method(), at: Date.now() };
    byRequest.set(req, row); rows.push(row);
  });
  page.on('response', res => {
    const row = byRequest.get(res.request());
    if (row) row.http = res.status();
  });
  page.on('requestfailed', req => {
    const row = byRequest.get(req);
    if (row) row.failed = req.failure()?.errorText;
  });
  return rows;
}

// Three's existing DevTools observe event exposes the actual rendered scene
// to this test tab, independent of the game's development-only QA API.
function observePlayer() {
  const scenes = [];
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', e => { if (e.detail.isScene) scenes.push(e.detail); });
  window.readWeakNetworkPlayer = () => {
    const world = scenes.find(s => s.getObjectByName('courierPerformer') && s.getObjectByName('estate-shell-northFlats'));
    const socket = world?.getObjectByName('courierPerformer');
    const suit = socket?.getObjectByName('CourierPerformanceScene');
    const skins = [];
    suit?.traverse(m => { if (m.isSkinnedMesh) skins.push(m); });
    const skin = skins.sort((a,b) => b.material.map.image.width - a.material.map.image.width)[0];
    function drawn(node) {
      for (let p = node; p; p = p.parent) { if (!p.visible) return false; if (p === world) return true; }
      return false;
    }
    return { modelStatus: document.documentElement.dataset.models ?? 'loading', socket: socket?.name,
      fallbackVisible: drawn(world?.getObjectByName('rider')), skinVisible: drawn(skin),
      joints: skin?.skeleton.bones.length ?? 0, source: skin?.userData.sourceMesh ?? null,
      albedoWidth: skin?.material.map?.image.width ?? 0, roughnessWidth: skin?.material.roughnessMap?.image.width ?? 0 };
  };
}

async function ordinary(context, host, model, name, profile, injected, warm = false) {
  const page = await context.newPage(), url = new URL(model, host.url).href, rows = track(page, url);
  const errors = [], external = [], offset = host.requests.length;
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== host.url.origin) external.push(req.url()); });
  await page.addInitScript(observePlayer);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile) await cdp.send('Network.emulateNetworkConditions', { offline: false, connectionType: 'cellular4g', ...profiles[profile] });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let intercepted = 0;
  if (injected) await page.route(url, async route => {
    if (++intercepted === 1) return route.fulfill({ status: injected, contentType: 'text/plain', body: 'test response' });
    await gate;
    return route.continue();
  });
  const proof = report.ordinaryEntry[name] = { path: host.url.pathname, profile, warm, courierRequests: rows };
  try {
    await page.goto(host.url.href, { waitUntil: 'commit' });
    await screen(page, 'intro').getByRole('heading', { name: '我的工位，先下班了。' }).waitFor({ timeout: 60000 });
    proof.comicMs = Math.round(await page.evaluate(() => performance.now()));
    for (let i = 0; i < 3; i++) await action(page, 'next').tap();
    await action(page, 'selectDay').tap(); await action(page, 'accept').tap();
    await screen(page, 'ride').waitFor();
    if (injected === 503) {
      await page.waitForFunction(() => window.readWeakNetworkPlayer().fallbackVisible);
      proof.beforeRecovery = await page.evaluate(() => window.readWeakNetworkPlayer());
      assert.equal(proof.beforeRecovery.joints, 0);
      await page.screenshot({ path: path.join(out, '503-fallback.png'), scale: 'css' });
    }
    release();
    const recover = injected !== 404;
    await page.waitForFunction(ok => {
      const p = window.readWeakNetworkPlayer();
      return ok ? p.modelStatus === 'ready' && p.skinVisible && !p.fallbackVisible :
        p.modelStatus === 'partial' && !p.skinVisible && p.fallbackVisible;
    }, recover, { timeout: 140000 });
    proof.readyMs = Math.round(await page.evaluate(() => performance.now()));
    proof.player = await page.evaluate(() => window.readWeakNetworkPlayer());
    if (recover) {
      assert.equal(proof.player.joints, 21);
      assert.equal(proof.player.source, 'CourierStanding');
      assert.equal(proof.player.albedoWidth, 2048);
      assert.ok(proof.player.roughnessWidth > 0);
    } else assert.equal(proof.player.joints, 0);
    const driver = await touchDriver(page);
    await driver.keys(['KeyW']);
    try {
      await page.waitForFunction(() => Number(document.querySelector('[data-field="speed"]')?.textContent) >= 8);
      proof.speedKph = Number(await page.locator('[data-field="speed"]').innerText());
    } finally { await driver.keys([]); }
    if (injected === 503) await page.screenshot({ path: path.join(out, '503-recovered.png'), scale: 'css' });
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    const glbs = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname.endsWith('.glb'))
      .map(e => ({ path: new URL(e.name).pathname, transferBytes: e.transferSize, encodedBytes: e.encodedBodySize })));
    proof.glbs = glbs;
    proof.originGlbRequests = host.requests.slice(offset).filter(r => r.path.endsWith('.glb')).length;
    if (warm) {
      assert.equal(proof.originGlbRequests, 0);
      assert.equal(glbs.length, 3); assert.ok(glbs.every(e => e.transferBytes === 0 && e.encodedBytes > 0));
    } else {
      assert.deepEqual(rows.map(r => r.http), injected === 503 ? [503, 200] : [injected || 200]);
      assert.equal(proof.originGlbRequests, injected === 404 ? 2 : 3);
    }
    assert.deepEqual([errors, external], [[], []]);
    assert.equal(page.url(), host.url.href);
    assert.ok(await page.evaluate(() => !('campaignQA' in window) && performance.getEntriesByType('navigation').length === 1));
    console.log(name, proof.comicMs, proof.readyMs, proof.player.joints, 'bones');
  } finally { release(); await page.close(); }
}

// Only the transfer fixture's origin can send an incomplete response. Flush
// genuine successful headers and bytes, then reset or hold this one stream.
let streamFault;
function interceptBody(name, raw, res) {
  if (!streamFault || name !== streamFault.model) return false;
  const fault = streamFault;
  streamFault = null;
  res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': raw.length, 'Cache-Control': 'no-store' });
  res.write(raw.subarray(0, 65536));
  res.once('close', fault.closed);
  if (fault.cut) setTimeout(() => {
    if (!res.destroyed) {
      if (res.stream) res.stream.close(http2.NGHTTP2_CANCEL);
      else res.destroy();
    }
  }, 200);
  return true;
}

async function transportCase(browser, host, model, spec) {
  const context = await browser.newContext(), page = await context.newPage();
  const url = new URL(model, host.url).href, rows = track(page, url);
  const proof = report.transport[spec.name] = { courierRequests: rows };
  let attempt = 0, closed;
  const closedPromise = new Promise(resolve => { closed = resolve; });
  try {
    if (spec.deadline) await page.clock.install();
    if (spec.stream) streamFault = { model, cut: spec.stream === 'cut', closed };
    await page.route(url, route => {
      const fault = spec.faults?.[attempt];
      attempt++;
      if (fault === 'reset') return route.abort('connectionreset');
      if (fault === 'invalid') return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'invalid GLB' });
      if (fault) return route.fulfill({ status: fault, body: 'test response' });
      return route.continue();
    });
    await page.goto(host.url.href);
    await page.waitForFunction(() => !!window.transferFixture);
    const pendingResponse = (spec.cancel || spec.deadline) && page.waitForResponse(r => r.url() === url &&
      r.status() === (spec.cancel === 'backoff' ? 503 : 200));
    assert.ok(await page.evaluate(() => window.transferFixture.start()));
    if (pendingResponse) {
      await pendingResponse;
      await page.waitForTimeout(60);
      if (spec.deadline) await page.clock.fastForward(91000);
      else await page.evaluate(() => window.transferFixture.dispose());
    }
    const result = await bounded(page.evaluate(() => window.transferFixture.ready()), 15000, 'Attachment did not settle: ' + spec.name);
    proof.status = result.status; proof.courier = result.assets.courier;
    assert.equal(result.status, spec.status ?? 'ready', JSON.stringify(result));
    if (spec.cancel) {
      assert.ok(Object.values(result.assets).every(r => r.status === 'disposed'));
      assert.ok(await page.evaluate(() => window.transferFixture.restored()));
    }
    if (spec.stream === 'hold') {
      await bounded(closedPromise, 3000, 'Cancelled body remained open on the origin');
      proof.originStreamClosed = true;
    }
    if (spec.stream === 'cut') assert.ok(rows[0].http === 200 && rows[0].failed, JSON.stringify(rows));
    if (spec.deadline) proof.virtualElapsedMs = 91000;
    if (result.status === 'ready') assert.equal(result.assets.courier.performer.joints, 21);
    if (result.status !== 'ready') await page.waitForTimeout(650);
    assert.equal(rows.length, spec.attempts);
    proof.courierRequests = rows.slice();
    if (spec.lifetime) {
      proof.disposed = await page.evaluate(() => window.transferFixture.disposeMounted());
      assert.ok(proof.disposed.restored && proof.disposed.boneTextureReleased && proof.disposed.bitmapClosed !== false);
      assert.ok(Object.values(proof.disposed.disposals).every(n => n === 1));
      assert.ok(await page.evaluate(() => window.transferFixture.start()));
      const remount = await page.evaluate(() => window.transferFixture.ready());
      proof.remountedJoints = remount.assets.courier.performer.joints;
      assert.equal(proof.remountedJoints, 21); assert.equal(rows.length, spec.attempts + 1);
      proof.remountRequests = rows.slice(spec.attempts);
    }
    await page.evaluate(() => window.transferFixture.dispose());
    console.log(spec.name, proof.status, spec.attempts, 'attempts');
  } finally { streamFault = null; await context.close(); }
}

async function embedded(browser, source, broken) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aholo-inline-')), file = path.join(dir, 'index.html');
  const original = courier.toString('base64');
  assert.ok(source.includes(original));
  const code = broken ? source.replace(original, Buffer.from('invalid GLB').toString('base64')) : source;
  const context = await browser.newContext({ offline: true });
  try {
    await writeFile(file, '<script type="module">' + code.replace(/<\/script/gi, '<\\/script') + '</script>');
    const page = await context.newPage(), network = [];
    page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
    await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => !!window.transferFixture);
    await page.evaluate(() => window.transferFixture.start());
    const r = await page.evaluate(() => window.transferFixture.ready());
    assert.equal(r.status, broken ? 'partial' : 'ready');
    if (!broken) assert.equal(r.assets.courier.performer.joints, 21);
    assert.deepEqual(network, []);
    report.transport[broken ? 'inlineInvalid' : 'inline'] = { status: r.status, courier: r.assets.courier, network };
  } finally { await context.close(); await unlink(file); await rmdir(dir); }
}

let browser, gameHost, fixtureHost;
try {
  const game = await bundle('web', false), fixture = await bundle('web', true), cert = localCertificate();
  gameHost = await serveBuild(game.files, '/aholo3d/', false, cert);
  fixtureHost = await serveBuild(fixture.files, '/lifetime/', false, cert, interceptBody);
  const spki = new X509Certificate(cert.cert).publicKey.export({ type: 'spki', format: 'der' });
  browser = await launchQaBrowser(['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--ignore-certificate-errors-spki-list=' + createHash('sha256').update(spki).digest('base64')]);
  report.browser = browser.version();
  report.testEntrySha256 = sha256(game.files.get('index.html'));
  for (const [name, profile, injected] of [['recover503', 'weak', 503], ['notFound404', null, 404], ['healthyCold', 'original', null]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      locale: 'zh-CN', isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    try {
      await ordinary(ctx, gameHost, game.model, name, profile, injected);
      if (name === 'healthyCold') await ordinary(ctx, gameHost, game.model, 'healthyWarm', profile, null, true);
    } finally { await ctx.close(); }
  }
  for (const spec of [
    { name: 'fetchReset', faults: ['reset'], attempts: 2 },
    { name: 'truncatedBody', stream: 'cut', attempts: 2, lifetime: true },
    { name: 'http408', faults: [408], attempts: 2 }, { name: 'http429', faults: [429], attempts: 2 },
    { name: 'exhausted', faults: [599, 503], attempts: 2, status: 'partial' },
    { name: 'invalidGlb', faults: ['invalid'], attempts: 1, status: 'partial' },
    { name: 'disposeFirstBody', stream: 'hold', cancel: 'body', attempts: 1, status: 'disposed' },
    { name: 'disposeBackoff', faults: [503], cancel: 'backoff', attempts: 1, status: 'disposed' },
    { name: 'disposeRetryBody', faults: [503], stream: 'hold', cancel: 'body', attempts: 2, status: 'disposed' },
    { name: 'retryDeadline', faults: [503], stream: 'hold', deadline: true, attempts: 2, status: 'partial' },
  ]) await transportCase(browser, fixtureHost, fixture.model, spec);
  const inline = await bundle('production', true);
  await embedded(browser, inline, false); await embedded(browser, inline, true);
  assert.equal(sha256(await readFile(runtime)), report.runtimeSha256);
  report.passed = true;
} catch (e) {
  report.failure = e.stack; process.exitCode = 1; console.error(e);
} finally {
  await browser?.close(); await fixtureHost?.close(); await gameHost?.close();
  report.finished = new Date().toISOString();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('弱网模型验收', path.join(out, 'report.json'));
}
