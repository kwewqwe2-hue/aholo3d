// node qa/hosted-delivery.mjs --local
// node qa/hosted-delivery.mjs --site=https://example.org/project/
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deliverFromHUD } from './doorstep-hud.mjs';
import { project, sha256 } from './doorstep-source.mjs';
import { siteDirectory, withHostedPage } from './hosted-network.mjs';
import { localCertificate, serveBuild } from './web-origin.mjs';

const [option, ...extra] = process.argv.slice(2);
const local = option === '--local';
if (extra.length || (!local && !option?.startsWith('--site='))) {
  throw Error('用法：node qa/hosted-delivery.mjs --local 或 --site=<HTTPS目录/>');
}
let site = local ? undefined : siteDirectory(option.slice('--site='.length));
const dist = path.join(project, 'dist-web');
const root = path.join(project, 'artifacts', '公开配送验收');
await mkdir(root, { recursive: true });
const mode = local ? 'local' : 'public';
const started = new Date().toISOString();
const out = await mkdtemp(path.join(root, mode + '-' + started.replaceAll(':', '-') + '-'));
const report = { mode, started, steps: [], errors: [], passed: false };
let fixture;
try {
  const expectedEntry = await readFile(path.join(dist, 'index.html'));
  let certificate;
  if (local) {
    const files = new Map([['index.html', expectedEntry]]);
    for (const name of await readdir(path.join(dist, 'assets'))) {
      files.set('assets/' + name, await readFile(path.join(dist, 'assets', name)));
    }
    certificate = localCertificate();
    fixture = await serveBuild(files, '/aholo3d/', false, certificate);
    site = fixture.url;
  }
  report.site = site.href;
  await withHostedPage(site, report, async page => {
    let entry;
    page.on('response', res => {
      if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) entry = res;
    });
    await page.addInitScript(() => {
      const counts = window.hostedDeliveryKeyCounts = {};
      document.addEventListener('keydown', e => {
        if (e.isTrusted && /^(Enter|Space|Key[WASDFM]|ShiftLeft)$/.test(e.code)) counts[e.code] = (counts[e.code] ?? 0) + 1;
      }, true);
    });
    const capture = async id => {
      const filename = id + '.png';
      await page.screenshot({ path: path.join(out, filename), scale: 'css', timeout: 12000 });
      return filename;
    };
    try {
      await deliverFromHUD(page, site, report, { capture, keyboardOnly: true });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      report.trustedKeyDowns = await page.evaluate(() => window.hostedDeliveryKeyCounts);
      for (const key of ['Enter', 'KeyW', 'KeyF', 'KeyM']) assert.ok(report.trustedKeyDowns[key] > 0, key);
      assert.equal(entry?.status(), 200);
    } catch (error) {
      report.failureScreenshot = await capture('failure').catch(() => null);
      throw error;
    } finally {
      report.entry = { status: entry?.status() ?? null, url: page.url(), localSha256: sha256(expectedEntry),
        servedSha256: entry ? await entry.body().then(sha256).catch(() => null) : null,
        version: await page.locator('meta[name="application-version"]').getAttribute('content', { timeout: 1000 }).catch(() => null) };
      report.entry.matchesLocalHtml = report.entry.servedSha256 === report.entry.localSha256;
    }
  }, certificate?.cert);
  // Include requests attempted as the document closes, such as a pagehide beacon.
  assert.deepEqual(report.network.blocked, [], '发现被拦截的请求');
  assert.deepEqual(report.network.errors, [], '网络检查出错');
  assert.deepEqual(report.network.requests.filter(r => r.method !== 'GET' || r.failure || !(r.status >= 200 && r.status < 400)), []);
  assert.deepEqual(report.errors, []);
  if (fixture) {
    assert.ok(fixture.requests.every(r => r.path.startsWith(site.pathname) && r.status === 200));
  }
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  report.failureScreenshot ??= report.steps.at(-1)?.screenshot ?? null;
  process.exitCode = 1;
} finally {
  await fixture?.close();
  report.finished = new Date().toISOString();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.failure) console.error(report.failure);
  console.log(report.passed ? '配送验收通过' : '配送验收失败', path.join(out, 'report.json'));
}
