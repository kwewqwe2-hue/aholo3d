import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
function recorderBrowser() {
  const fallback = path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime',
    'dependencies', 'node', 'node_modules', 'playwright');
  let library;
  for (const candidate of [process.env.QA_PLAYWRIGHT, 'playwright', 'playwright-core', fallback].filter(Boolean)) {
    try { library = require.resolve(candidate); break; }
    catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  const { chromium } = require(library);
  const cache = path.dirname(path.dirname(path.dirname(chromium.executablePath())));
  const installed = existsSync(cache) ? readdirSync(cache).filter(name => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))
    .map(name => path.join(cache, name, 'chrome-win64', 'chrome.exe')) : [];
  const executablePath = [process.env.QA_BROWSER, chromium.executablePath(), ...installed,
    path.join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe')].filter(Boolean).find(existsSync);
  return chromium.launch({ executablePath, headless: true, ignoreDefaultArgs: ['--mute-audio'], args: [
    '--auto-accept-this-tab-capture', '--enable-usermedia-screen-capturing', '--disable-background-networking',
  ] });
}

export async function withCaptureBrowser(run) {
  const browser = await recorderBrowser();
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1, serviceWorkers: 'block' });
    // Hold the loaded revision for this take while other departments keep editing.
    await context.routeWebSocket(url => url.searchParams.has('token'), () => {});
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      const u = new URL(r.url());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) external.push(u.href);
    });
    return await run({ browser, context, page, errors, external });
  } finally { await browser.close(); }
}

export function ffmpeg() {
  if (process.env.QA_FFMPEG) return process.env.QA_FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true }); return 'ffmpeg'; }
  catch { return execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
    { encoding: 'utf8', windowsHide: true }).trim(); }
}

// Capture the composited game tab, with its own live Web Audio. No system audio,
// canvas replacement, game clock control, replay frames or re-created sound.
export async function recordTab(page, target) {
  const capture = await page.evaluateHandle(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude', surfaceSwitching: 'exclude',
      video: { displaySurface: 'browser', frameRate: { ideal: 30, max: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        suppressLocalAudioPlayback: true },
    });
    const [video] = stream.getVideoTracks(), [audio] = stream.getAudioTracks();
    if (video.getSettings().displaySurface !== 'browser' || !audio || !/tab/i.test(audio.label)) {
      stream.getTracks().forEach(t => t.stop());
      throw Error('浏览器没有提供本游戏标签页的独立音画');
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 6500000, audioBitsPerSecond: 128000 });
    const { width, height, frameRate } = video.getSettings();
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
    const wallStart = performance.now();
    recorder.start(750);
    let blob;
    return {
      async finish() {
        recorder.stop();
        await stopped;
        stream.getTracks().forEach(t => t.stop());
        blob = new Blob(chunks, { type: 'video/webm' });
        return { bytes: blob.size, wallSeconds: (performance.now() - wallStart) / 1000, mime: recorder.mimeType,
          audio: audio.label, source: 'current browser tab', width, height, frameRate };
      },
      read(offset) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob.slice(offset, offset + 512 * 1024));
        });
      },
    };
  });
  return async () => {
    const info = await capture.evaluate(c => c.finish());
    assert.ok(info.bytes > 20000);
    const native = path.join(tmpdir(), 'rider-tab-' + process.pid + '-' + Date.now() + '.webm');
    const file = await open(native, 'wx');
    try {
      for (let offset = 0; offset < info.bytes; offset += 512 * 1024) {
        const chunk = await capture.evaluate((c, at) => c.read(at), offset);
        await file.writeFile(Buffer.from(chunk, 'base64'));
      }
    } finally { await file.close(); await capture.dispose(); }
    // MediaRecorder's streaming WebM lacks a seek table. Copy both tracks
    // intact into a seekable WebM without an edit, cut, or encoder pass.
    execFileSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-i', native, '-map', '0:v:0',
      '-map', '0:a:0', '-c', 'copy', '-y', target], { windowsHide: true });
    return info;
  };
}
