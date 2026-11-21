// Run after npm run build:web and npm run build. All browser traffic is local.
import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { campaignDistrict } from '../src/campaign-course.js';
import { action, distance, field, keyboard, screen } from './doorstep-driver.mjs';
import { readPocket } from './doorstep-phone.mjs';
import { touchDriver } from './doorstep-touch.mjs';
import { probeWeb } from './probe-web.mjs';
import { localCertificate, serveBuild } from './web-origin.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'artifacts', '线上包核验');
const singleFile = path.join(project, 'dist', '牛逼外卖-第一天.html');
const mobileLink = { latency: 80, downloadThroughput: 1_000_000, uploadThroughput: 250_000 };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { started: new Date().toISOString(), mobileLink, runs: {} };

async function launchBrowser(certificate) {
  const require = createRequire(import.meta.url);
  const paths = [project, path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node')];
  let entry = process.env.QA_PLAYWRIGHT;
  if (!entry) {
    try { entry = require.resolve('playwright', { paths }); }
    catch { entry = require.resolve('playwright-core', { paths }); }
  }
  const { chromium } = require(entry);
  const executables = [process.env.QA_BROWSER, chromium.executablePath()];
  for (const dir of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
    executables.push(path.join(dir, 'Google/Chrome/Application/chrome.exe'), path.join(dir, 'Microsoft/Edge/Application/msedge.exe'));
  }
  // Ignoring TLS errors per page disables Chromium's HTTP cache for this
  // self-signed origin. Trust only this test's public key in this browser.
  const spki = new X509Certificate(certificate.cert).publicKey.export({ type: 'spki', format: 'der' });
  const pin = createHash('sha256').update(spki).digest('base64');
  return chromium.launch({ executablePath: executables.find(p => p && existsSync(p)),
    args: ['--ignore-certificate-errors-spki-list=' + pin, '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', '--enable-unsafe-swiftshader'] });
}

async function verifyFiles() {
  const dir = path.join(project, 'dist-web');
  const files = new Map();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const name = path.relative(dir, file).replaceAll('\\', '/');
    assert.match(name, /^(?:index\.html|\.nojekyll|assets\/[\w.-]+-[\w-]{8}\.(?:js|css|glb|webp|mp3))$/);
    files.set(name, await readFile(file));
  }
  const rerun = await build({ root: project, mode: 'web', logLevel: 'error', build: { write: false } });
  const rebuilt = [rerun].flat().flatMap(r => r.output);
  assert.deepEqual(rebuilt.map(f => f.fileName).sort(), [...files.keys()].sort());
  for (const item of rebuilt) {
    assert.ok(files.get(item.fileName).equals(Buffer.from(item.type === 'chunk' ? item.code : item.source)),
      'Second build differs: ' + item.fileName);
  }
  const html = files.get('index.html').toString('utf8');
  const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(project, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.ok(html.includes('name="application-version" content="' + version + '"'));
  assert.ok(Buffer.byteLength(html) < 8192, 'The web entry grew beyond 8 KiB');
  for (const [, url] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('data:')) continue;
    assert.ok(url.startsWith('./assets/') && files.has(url.slice(2)), url);
  }
  const offline = await readFile(singleFile);
  const embeddedHtml = offline.toString('utf8');
  const models = {};
  const kinds = {};
  let totalBytes = 0;
  for (const [name, bytes] of files) {
    totalBytes += bytes.length;
    const ext = path.extname(name);
    if (ext) kinds[ext] = (kinds[ext] ?? 0) + 1;
    if (['.js', '.css', '.html'].includes(ext)) {
      assert.doesNotMatch(bytes.toString('utf8'), /;base64,[A-Za-z\d+/=]{1024}/, 'Embedded bulk media in ' + name);
    } else if (['.webp', '.mp3', '.glb'].includes(ext)) {
      assert.ok(embeddedHtml.includes(bytes.toString('base64')), 'Missing from double-click file: ' + name);
    }
    if (ext !== '.glb') continue;
    const id = path.basename(name).split('-')[0];
    const src = await readFile(path.join(project, 'src', 'assets', 'aholo', id + '.glb'));
    assert.ok(bytes.equals(src), 'Model differs from source: ' + id);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(gltf.buffers.every(b => !b.uri) && gltf.images.every(i => i.bufferView != null));
    models[id] = { path: name, bytes: bytes.length, sha256: digest(bytes), materials: gltf.materials.length,
      textures: gltf.images.length, jointsPerSkin: (gltf.skins ?? []).map(s => s.joints.length) };
  }
  assert.deepEqual(Object.keys(models).sort(), ['courier', 'flat', 'scooter']);
  assert.ok(models.courier.jointsPerSkin.some(n => n > 0));
  report.build = { version, repeatByteIdentical: true, htmlBytes: Buffer.byteLength(html), totalBytes, kinds, models,
    htmlSha256: digest(files.get('index.html')), offlineBytes: offline.length, offlineSha256: digest(offline) };
  return files;
}

async function instrument(context, allowed) {
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('websocket', () => errors.push('Unexpected WebSocket'));
  page.on('requestfailed', req => errors.push(req.failure()?.errorText + ' ' + req.url().slice(0, 180)));
  page.on('response', res => { if (res.status() >= 400) errors.push(res.status() + ' ' + res.url().slice(0, 180)); });
  page.on('request', req => {
    const url = new URL(req.url());
    if (['blob:', 'data:'].includes(url.protocol)) return;
    if (!allowed(url) || req.method() !== 'GET') errors.push('Unexpected request ' + url.pathname);
    requests.push(url.pathname);
  });
  await page.addInitScript(() => {
    let queued = false, ready = false;
    const observer = new MutationObserver(() => {
      if (!queued && document.querySelector('.nb-ui[data-screen="intro"] h1')) {
        queued = true;
        requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('qa-comic-frame')));
      }
      if (!ready && document.documentElement.dataset.models === 'ready') {
        ready = true;
        performance.mark('qa-models-ready');
      }
      if (queued && ready) observer.disconnect();
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-models', 'data-screen'] });
  });
  return { page, errors, requests };
}

async function play(page, url, { mobile = false, capture, onOpening, onFirstTurn } = {}) {
  const press = loc => mobile ? loc.tap() : loc.click();
  await page.goto(url.href, { waitUntil: 'commit' });
  if (onOpening) {
    await page.getByText('正在打开漫画…', { exact: true }).waitFor();
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length);
    onOpening();
  }
  const comic = screen(page, 'intro');
  await comic.getByRole('heading', { name: '我的工位，先下班了。' }).waitFor();
  await page.waitForFunction(() => performance.getEntriesByName('qa-comic-frame').length);
  assert.equal(await page.locator('#web-opening').isVisible(), false);
  if (capture === 'mobile') await page.screenshot({ path: path.join(output, 'mobile-comic.png') });
  for (const [index, title] of ['我的工位，先下班了。', '工牌换头盔。', '广场见，骑手上线。'].entries()) {
    await comic.getByRole('heading', { name: title }).waitFor();
    assert.equal(await comic.locator('.nb-frame [role="img"]:visible').count(), 2);
    await press(action(page, 'next'));
    if (index === 0 && onFirstTurn) {
      await comic.getByRole('heading', { name: '工牌换头盔。' }).waitFor();
      await onFirstTurn();
    }
  }
  await press(action(page, 'selectDay'));
  assert.match(await field(page, 'shop').innerText(), /红棚/);
  await press(action(page, 'accept'));
  await screen(page, 'ride').waitFor();
  const acceptedMs = Math.round(await page.evaluate(() => performance.now()));
  await page.waitForFunction(() => ['ready', 'failed', 'partial'].includes(document.documentElement.dataset.models),
    null, { timeout: 90000 });
  assert.equal(await page.locator('html').getAttribute('data-models'), 'ready');
  assert.equal(await page.locator('#fault:not([hidden])').count(), 0);
  assert.equal(await page.evaluate(() => 'campaignQA' in window), false);
  const read = () => readPocket(page, campaignDistrict.bounds);
  const start = await read();
  const driver = mobile ? await touchDriver(page) : keyboard(page);
  let moving;
  try {
    await driver.keys(['KeyW']);
    await page.waitForFunction(() => Number(document.querySelector('[data-field="speed"]')?.textContent) >= 12);
    moving = await read();
  } finally { await driver.keys([]); }
  const meters = distance(start.plotted, moving.plotted);
  assert.ok(moving.hudSpeed >= 10 && meters > .4, 'Throttle did not move the rider');
  await page.waitForLoadState('networkidle', { timeout: 90000 });
  if (capture) await page.screenshot({ path: path.join(output, capture + '-ride.png') });
  const perf = await page.evaluate(() => {
    const time = name => Math.round(performance.getEntriesByName(name)[0]?.startTime ?? 0);
    const resources = performance.getEntriesByType('resource').filter(e => /^https?:/.test(e.name));
    const comicFrameMs = time('qa-comic-frame');
    const beforeComic = resources.filter(e => e.responseEnd <= comicFrameMs);
    return { firstContentfulPaintMs: time('first-contentful-paint'), comicFrameMs,
      completedSubresourceBytesBeforeComic: beforeComic.reduce((n, r) => n + r.transferSize, 0),
      modelsReadyMs: time('qa-models-ready'), resources: resources.map(e => ({
        path: new URL(e.name).pathname, transferBytes: e.transferSize, encodedBytes: e.encodedBodySize,
      })) };
  });
  return { ...perf, acceptedMs, speedKph: moving.hudSpeed, movedMeters: +meters.toFixed(2) };
}

async function webCase(browser, files, mobile, certificate) {
  const host = await serveBuild(files, mobile ? '/aholo3d/' : '/', !mobile, certificate);
  // Leave request routing off: Playwright interception disables HTTP caching.
  const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  try {
    for (const name of mobile ? ['mobileCold', 'mobileWarm'] : ['desktopRoot']) {
      const { page, errors, requests } = await instrument(context,
        u => u.origin === host.url.origin && u.pathname.startsWith(host.url.pathname));
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, connectionType: 'cellular4g', ...mobileLink });
      }
      const offset = host.requests.length;
      const run = await play(page, host.url, { mobile, capture: name === 'mobileWarm' ? null : mobile ? 'mobile' : 'desktop',
        onOpening: mobile ? null : host.releaseScripts,
        onFirstTurn: mobile ? null : async () => {
          assert.ok(host.requests.some(r => r.path.endsWith('.glb')));
          assert.notEqual(await page.locator('html').getAttribute('data-models'), 'ready');
          host.releaseModels();
        },
      });
      const received = host.requests.slice(offset);
      assert.deepEqual(errors, []);
      assert.ok(run.firstContentfulPaintMs > 0 && run.comicFrameMs > 0);
      assert.ok(requests.length && received.every(r => r.status < 400));
      const glbs = run.resources.filter(r => r.path.endsWith('.glb'));
      report.runs[name] = { mount: host.url.pathname, secondComicBeforeGlbRelease: !mobile,
        ...run, originRequests: received, originBodyBytes: received.reduce((n, r) => n + r.bodyBytes, 0), errors };
      assert.equal(glbs.length, 3);
      if (name === 'mobileWarm') {
        assert.ok(glbs.every(r => r.transferBytes === 0 && r.encodedBytes > 0));
        assert.ok(received.every(r => !r.path.includes('/assets/')), 'Warm visit retransmitted hashed assets');
      } else {
        assert.ok(glbs.every(r => r.transferBytes > 0));
        assert.ok(received.some(r => r.path.endsWith('.js') && r.coding === 'br'));
      }
      console.log(name, run.comicFrameMs + ' ms to comic,', run.speedKph + ' km/h,', received.length + ' origin requests');
      await page.close();
    }
    if (mobile) {
      const probe = await probeWeb(host.url, certificate.cert);
      assert.ok(probe.passed, JSON.stringify(probe.files.filter(f => f.error)));
      const missing = await probeWeb(new URL('/missing/', host.url), certificate.cert);
      assert.ok(!missing.passed && missing.files.length === 1 && missing.files[0].status === 404);
      report.probe = { verifiedFiles: probe.files.length, missingMountStatus: missing.files[0].status };
    }
  } finally { host.releaseScripts(); host.releaseModels(); await context.close(); await host.close(); }
}

async function offlineCase(browser) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rider-single-html-'));
  const copy = path.join(dir, path.basename(singleFile));
  const url = pathToFileURL(copy);
  const context = await browser.newContext({ offline: true, locale: 'zh-CN', viewport: { width: 1280, height: 720 } });
  try {
    await copyFile(singleFile, copy);
    const { page, errors, requests } = await instrument(context, u => u.href === url.href);
    const run = await play(page, url);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [url.pathname]);
    report.runs.fileOffline = { ...run, onlyRequest: path.basename(copy), errors };
    console.log('fileOffline', run.speedKph + ' km/h, standalone HTML only');
  } finally { await context.close(); await unlink(copy); await rmdir(dir); }
}

await mkdir(output, { recursive: true });
try {
  const files = await verifyFiles();
  const certificate = localCertificate();
  const browser = await launchBrowser(certificate);
  try {
    report.browser = browser.version();
    await webCase(browser, files, false, certificate);
    await webCase(browser, files, true, certificate);
    await offlineCase(browser);
  } finally { await browser.close(); }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(path.join(output, 'local-results.json'), JSON.stringify(report, null, 2) + '\n');
}
