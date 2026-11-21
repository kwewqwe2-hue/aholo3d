// --public exercises this same HUD-only driver against the live ordinary page.
// With the producer's frozen single-file package: node qa/doorstep-offline.mjs --final
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { withQaBrowser } from './browser.mjs';
import { deliverFromHUD } from './doorstep-hud.mjs';
import { project, releaseEvidence, sha256, sourceVersions } from './doorstep-source.mjs';

const live = process.argv.includes('--public');
const final = !live && process.argv.includes('--final');
const work = await mkdtemp(path.join(tmpdir(), 'rider-doorstep-offline-'));
const name = '牛逼外卖-第一天.html', original = path.join(project, 'dist', name);
const isolated = path.join(work, name);
const report = { started: new Date().toISOString(), ordinaryPublicPage: live, steps: [], requests: [], errors: [] };

async function verifyPackage() {
  const bytes = await readFile(original), html = bytes.toString('utf8');
  // Same Vite production configuration, in memory. Do not write into dist or the producer's project.
  const result = await build({ root: project, logLevel: 'error', build: { write: false } });
  const files = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
  const js = files.find(f => f.type === 'chunk' && f.isEntry).code.replace(/<\/script/gi, '<\\/script');
  const css = files.find(f => f.type === 'asset' && f.fileName.endsWith('.css')).source;
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  assert.ok(code && styles.length);
  const resultHashes = { html: sha256(bytes), productionJS: sha256(js), packagedJS: sha256(code),
    productionCSS: sha256(css), packagedStyles: styles.map(sha256), bytes: bytes.length };
  assert.equal(resultHashes.packagedJS, resultHashes.productionJS, '单文件内游戏代码/内嵌素材与当前生产源构建不同');
  assert.ok(resultHashes.packagedStyles.includes(resultHashes.productionCSS), '单文件内 CSS 与冻结构建不同');
  return resultHashes;
}

async function main({ page, context, browser, errors }, address) {
  if (!live) {
    await page.route(u => u.href === address.href, route => route.continue());
    page.on('request', req => {
      if (!['data:', 'blob:'].includes(new URL(req.url()).protocol)) report.requests.push(req.url());
    });
    page.on('websocket', ws => report.requests.push(ws.url()));
    await context.setOffline(true);
  }
  try {
    report.browser = browser.version();
    await deliverFromHUD(page, address, report);
    assert.equal(await page.evaluate(() => 'campaignQA' in window), false);
    if (!live) assert.deepEqual([...new Set(report.requests)], [address.href], '离线单文件有外部依赖');
    assert.deepEqual(errors, []);
  } finally { report.errors = [...errors]; }
}

try {
  report.source = await sourceVersions();
  if (!live) {
    report.bundle = await verifyPackage();
    await copyFile(original, isolated);
    assert.equal(sha256(await readFile(isolated)), report.bundle.html);
    if (final) {
      const recorded = JSON.parse(await readFile(path.join(releaseEvidence, 'skilled.json'), 'utf8'));
      assert.ok(recorded.passed && recorded.frozenCapture && recorded.sourceAtStart === report.source &&
        recorded.sourceAtEnd === report.source, '录像与独立复算的当前生产源指纹不同');
    }
  }
  await withQaBrowser(ctx => main(ctx, live ? new URL('http://127.0.0.1:5188/') : pathToFileURL(isolated)));
  assert.equal(await sourceVersions(), report.source, '验证期间游戏源或资源发生变化');
  report.passed = true;
} catch (err) {
  report.passed = false; report.error = err.stack; console.error(err); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  const dest = report.passed && final ? releaseEvidence : work;
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, 'offline.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('单文件验收记录', dest);
}
