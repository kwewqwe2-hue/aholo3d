import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const bundledPackages = path.join(homedir(), '.cache', 'codex-runtimes',
  'codex-primary-runtime', 'dependencies', 'node', 'node_modules');

function loadPlaywright() {
  const candidates = [
    process.env.QA_PLAYWRIGHT, 'playwright', 'playwright-core',
    path.join(bundledPackages, 'playwright'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    let resolved;
    try {
      resolved = require.resolve(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      continue;
    }
    return require(resolved);
  }
  throw new Error('找不到现有 Playwright。可用 QA_PLAYWRIGHT 指定已安装的包。');
}

function browserExecutable(chromium) {
  if (process.env.QA_BROWSER) return process.env.QA_BROWSER;
  const installed = [
    [process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'],
    [process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'],
    [process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'],
    [process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'],
  ].filter(([root]) => root).map(([root, file]) => path.join(root, file));
  return [...installed, chromium.executablePath()].find(existsSync);
}

function isLocal(rawUrl) {
  const url = new URL(rawUrl);
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || ['data:', 'blob:', 'about:'].includes(url.protocol);
}

// launch() creates a disposable profile. No persistent context or personal CDP endpoint.
export function launchQaBrowser(extraArgs = []) {
  const { chromium } = loadPlaywright();
  return chromium.launch({
    executablePath: browserExecutable(chromium),
    headless: process.env.QA_HEADED !== '1',
    args: ['--enable-unsafe-swiftshader', '--disable-background-networking', ...extraArgs],
  });
}

export async function withQaBrowser(run) {
  const browser = await launchQaBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
      locale: 'zh-CN', serviceWorkers: 'block',
    });
    const external = [];
    const hotUpdates = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (isLocal(url)) return route.continue();
      external.push(url);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket(/.*/, socket => {
      if (isLocal(socket.url())) {
        const server = socket.connectToServer();
        if (!new URL(socket.url()).searchParams.has('token')) return;
        server.onMessage(message => {
          // Keep the first page load stable while teammates edit the dev server.
          // Forward all game traffic and Vite's connection/heartbeat messages.
          if (typeof message === 'string' && message.startsWith('{')) {
            let meta;
            try { meta = JSON.parse(message); } catch { /* A non-JSON game message. */ }
            if (['full-reload', 'update', 'prune'].includes(meta?.type)) {
              hotUpdates.push(meta.type);
              return;
            }
          }
          socket.send(message);
        });
      } else {
        external.push(socket.url());
        socket.close();
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    return await run({ browser, context, page, external, errors, hotUpdates });
  } finally {
    await browser.close();
  }
}

async function probe({ browser, context, page }) {
  await page.setContent('<canvas width="64" height="64"></canvas>');
  const webgl = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    if (!gl) return null;
    gl.clearColor(0.25, 0.5, 0.75, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    globalThis.probeKeys = [];
    for (const event of ['keydown', 'keyup']) {
      window.addEventListener(event, e => globalThis.probeKeys.push([e.type, e.code, e.isTrusted]));
    }
    return [...pixel];
  });
  assert.ok(webgl && Math.abs(webgl[1] - 128) <= 1 && webgl[3] === 255, 'WebGL2 像素不符');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => globalThis.probeKeys),
    [['keydown', 'ArrowRight', true], ['keyup', 'ArrowRight', true]]);
  const cdp = await context.newCDPSession(page);
  const version = await cdp.send('Browser.getVersion');
  const png = await page.screenshot();
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  console.log(JSON.stringify({ browser: version.product || browser.version(),
    webgl, trustedKeyEvents: 2, screenshotBytes: png.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await withQaBrowser(probe);
}
