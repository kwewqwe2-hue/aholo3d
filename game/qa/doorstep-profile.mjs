// node qa/doorstep-profile.mjs [--root=source-copy] [--view=desktop|mobile|both]
//   [--repeat=2] [--gl] [--output=report.json]
// No screenshots, video, CPU sampling or state injection on the timed path.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { withQaBrowser } from './browser.mjs';
import { distance, keyboard, openDay, park, pickup, read, ride, waitState, walkTo } from './doorstep-driver.mjs';
import { touchDriver } from './doorstep-touch.mjs';
import { createStairLayout } from '../src/stair-layout.js';
import { checkClearance, liveCourse, renderedFootprints } from './doorstep-clearance.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => args.find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(arg('root', fileURLToPath(new URL('..', import.meta.url))));
const view = arg('view', 'both'), repeat = Number(arg('repeat', '2')), gl = args.includes('--gl');
assert(['desktop', 'mobile', 'both'].includes(view) && Number.isInteger(repeat) && repeat > 0);
const rounded = n => +n.toFixed(2);

async function fingerprint() {
  const src = (await readdir(path.join(root, 'src'), { recursive: true })).filter(f => /\.(js|css|json|webp|png|jpe?g|svg|glb|mp3)$/i.test(f));
  const trial = (await readdir(path.join(root, 'trial'))).filter(f => /\.js$/.test(f));
  const hash = createHash('sha256');
  for (const file of ['index.html', ...src.sort().map(s => 'src/' + s), ...trial.sort().map(s => 'trial/' + s)]) {
    hash.update(file.replaceAll('\\', '/') + '\0'); hash.update(await readFile(path.join(root, file)));
  }
  return hash.digest('hex');
}

// Three's built-in observation hook only publishes new scenes/renderers.
function observeScene() {
  const devtools = window.__THREE_DEVTOOLS__ = new EventTarget(), scenes = [];
  devtools.addEventListener('observe', ({detail}) => {
    if (detail.isScene) scenes.push(detail);
    if (detail.isWebGLRenderer) window.portalRenderer = detail;
  });
  window.portalScenes = scenes;
}
// Optional attribution pass. Keep native-call wrappers out of baseline runs.
function observeGL() {
  const list = window.portalGL = [], proto = WebGL2RenderingContext.prototype;
  for (const name of ['compileShader','linkProgram','getProgramParameter','getProgramInfoLog','getShaderInfoLog',
    'getShaderParameter','getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation',
    'useProgram','texImage2D','texSubImage2D','compressedTexImage2D','texStorage2D','bufferData','bufferSubData',
    'generateMipmap','drawElements','drawElementsInstanced','drawArrays']) {
    const original = proto[name];
    if (!original) continue;
    proto[name] = function (...args) {
      const t = performance.now(), result = original.apply(this, args), ms = performance.now() - t;
      if ((ms >= 2 || name === 'linkProgram') && list.length < 4000) list.push({ name, t, ms });
      return result;
    };
  }
}

// Read the actor at 16 Hz and on a missed frame. Keep both poses bracketing
// each hitch: the game limits simulation catch-up after a long wall-clock gap.
function beginMeter({ x, z, rise }) {
  const intervals = [], poses = [], loaf = [], hidden = [];
  let last, lastRead = -Infinity, pose, id, maxReadMs = 0;
  const lamp = window.portalScenes?.map(s=>s.getObjectByName('302-landing-bulb')).find(Boolean);
  const observer = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame') && new PerformanceObserver(list => {
    for (const e of list.getEntries()) loaf.push({ t: e.startTime, ms: e.duration, block: e.blockingDuration,
      renderStart: e.renderStart, scripts: e.scripts.map(s => ({ ms: s.duration, fn: s.sourceFunctionName,
        source: s.sourceURL?.split('?')[0].split('/').at(-1), invoker: s.invoker, layoutMs: s.forcedStyleAndLayoutDuration })) });
  });
  observer?.observe({ type: 'long-animation-frame' });
  const visibility = () => hidden.push([performance.now(), document.visibilityState, document.hasFocus()]);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', visibility);
  function sample(t) {
    const ms = last === undefined ? 0 : t - last;
    const prev = pose;
    if (t - lastRead >= 62 || ms > 32) {
      const start = performance.now(), s = window.campaignQA.state(), a = s.actor;
      const d = Math.hypot(a.x - x, a.z - z);
      const zone = s.travelMode === 'bike' ? (d <= 30 ? 'road30' : 'far') : !a.indoors ? 'onFootOutside' :
        a.y < 0.02 ? 'lobby' : a.y < rise - 0.025 ? 'firstFlight' :
        a.y < 2 * rise - 0.025 ? 'toFloor2' : 'upper';
      pose = { t, zone, x: a.x, y: a.y, z: a.z, d, floor: a.floor, motion: s.motion.type,
        elapsed: s.elapsed, ...window.campaignQA.diagnostics(), programs:window.portalRenderer?.info.programs.length,
        lamp:lamp && (lamp.visible ? lamp.intensity : 0) };
      poses.push(pose); lastRead = t;
      maxReadMs = Math.max(maxReadMs, performance.now() - start);
    }
    if (ms && prev) intervals.push({ t: last, ms, zone: pose.zone, pre: prev, post: pose });
    last = t; id = requestAnimationFrame(sample);
  }
  id = requestAnimationFrame(sample);
  return () => {
    cancelAnimationFrame(id); observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', visibility);
    const stats = rows => {
      if (!rows.length) return null;
      const ms = rows.map(v => v.ms).sort((a,b) => a-b);
      const q = p => +ms[Math.ceil(p * ms.length) - 1].toFixed(2);
      return { n: ms.length, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1),
        over50: ms.filter(n => n > 50).length, over250: ms.filter(n => n > 250).length, over1000: ms.filter(n => n > 1000).length };
    };
    const near = intervals.filter(v => v.zone !== 'far');
    const early = ['road30','onFootOutside','lobby','firstFlight'];
    const phases = Object.fromEntries([...new Set(near.map(v => v.zone))].map(k => [k, stats(near.filter(v => v.zone === k))]));
    const calls = window.portalGL ?? [];
    const slow = near.filter(v => v.ms > 33.3).sort((a,b) => b.ms-a.ms).slice(0, 16).map(v => ({
      ms: v.ms, from: v.pre, to: v.post,
      tasks: loaf.filter(l => l.t < v.t + v.ms + 8 && l.t+l.ms > v.t - 8),
      gl: calls.filter(c => c.t < v.t + v.ms + 8 && c.t+c.ms > v.t - 8).sort((a,b) => b.ms-a.ms).slice(0, 12),
    }));
    return { before30: stats(intervals.filter(v => v.zone === 'far')),
      early: stats(near.filter(v => early.includes(v.zone))), fromThreshold: stats(near.filter(v => !early.slice(0,2).includes(v.zone))),
      phases, slow, hidden, maxReadMs, loafSupported: !!observer, glEvents: calls.length,
      boundaries: poses.filter((v,i) => !i || v.zone !== poses[i-1].zone) };
  };
}

async function order(page, url, mobile, iteration) {
  const loading = await openDay(page, url, mobile);
  const io = mobile ? await touchDriver(page) : keyboard(page);
  const course = await page.evaluate(() => window.campaignQA.district), stairs = createStairLayout(course);
  await pickup(page, io, course);
  const meter = await page.evaluateHandle(beginMeter, { ...stairs.origin, rise: stairs.rise });
  const line = mobile ? course.mainLine : course.shortLine;
  const parking = mobile ? course.finish : stairs.world(-2, -.9);
  let witness = Infinity;
  await ride(page, io, mobile ? line : [...line, parking], s => distance(s.bike, parking) < 4.6 && Math.abs(s.bike.speed) < .40,
    { observe: s => { witness = Math.min(witness, distance(s.bike, mobile ? course.landmarks.outerApex : course.landmarks.arborApex)); } });
  assert(witness < 5, '未走指定路线'); await park(page, io);
  await io.tap('KeyF'); const off = await waitState(page, s => s.travelMode === 'foot' && s.motion.type === 'none', '下车');
  assert.equal(off.interaction?.kind, 'takeBag'); await io.tap('Enter');
  await waitState(page, s => s.cargo === 'hand', '取袋');
  const b = off.bike, left = Math.sign((off.walker.x-b.x)*Math.cos(b.heading)+(off.walker.z-b.z)*Math.sin(b.heading));
  await walkTo(page, io, { x:b.x+left*1.08*Math.cos(b.heading)-1.48*Math.sin(b.heading),
    z:b.z+left*1.08*Math.sin(b.heading)+1.48*Math.cos(b.heading), y:0 });
  for (const p of [stairs.outside, ...stairs.route]) await walkTo(page, io, p);
  const atDoor = await read(page); assert.equal(atDoor.interaction?.kind, 'knock');
  const timing = await meter.evaluate(stop => stop()); await meter.dispose();
  await io.tap('Enter'); const paid = await waitState(page, s => s.stage === 'delivered', '302签收');
  assert.equal(paid.completed, 1); assert.equal(paid.cargo, 'delivered'); assert.equal(paid.hp, 100);
  assert(timing.early?.n > 50 && timing.phases.firstFlight && timing.phases.upper && !timing.hidden.length);
  const label = mobile ? 'mobile' : 'desktop';
  console.log(label, iteration, JSON.stringify({ early: timing.early, stairs: timing.fromThreshold,
    slow: timing.slow.slice(0,3).map(v => [rounded(v.ms),v.to.zone,rounded(v.to.y)]), paidAt: rounded(paid.elapsed) }));
  return { label, iteration, route: mobile ? 'outer' : 'short', witness, loading, hp:paid.hp, paid:paid.cash, seconds:paid.elapsed, timing };
}

const report = { source: await fingerprint(), started: new Date().toISOString(), gl, runs: [] };
const server = await createServer({ root, configFile: false, cacheDir: path.join(tmpdir(), 'rider-profile-vite-' + process.pid),
  logLevel:'error', server:{ host:'127.0.0.1', port:0, hmr:false, fs:{ allow:[root, fileURLToPath(new URL('..', import.meta.url))] } } });
try {
  await server.listen();
  const url = new URL('?qa=1', server.resolvedUrls.local[0]);
  await withQaBrowser(async ({browser, page, errors, external}) => {
    const cdp = await browser.newBrowserCDPSession();
    report.browser = browser.version(); report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu.auxAttributes.glRenderer;
    await cdp.detach(); await page.setViewportSize({width:1280,height:720});
    for (const label of view === 'both' ? ['desktop','mobile'] : [view]) {
      const mobile = label === 'mobile';
      const context = mobile ? await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
        isMobile:true,hasTouch:true,locale:'zh-CN',serviceWorkers:'block' }) : null;
      const p = mobile ? await context.newPage() : page;
      if (mobile) {
        p.on('pageerror', e => errors.push(e.message));
        const device = await context.newCDPSession(p); await device.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      }
      p.setDefaultTimeout(10000);
      await p.addInitScript(observeScene);
      if (gl) await p.addInitScript(observeGL);
      try {
        for (let n=1; n<=repeat; n++) {
          report.runs.push(await order(p,url,mobile,n));
          if (!report.clearance) {
            const prior = arg('prior') ? JSON.parse(await readFile(arg('prior'),'utf8')).clearance.solids : [];
            const course = await liveCourse(p);
            report.clearance = checkClearance(course, prior);
            report.rendered = await renderedFootprints(p, course);
            report.sceneModules = await p.evaluate(() => performance.getEntriesByType('resource')
              .map(e => new URL(e.name).pathname).filter(s => /\/src\/[^/]+\.js$/.test(s)).sort());
            assert.deepEqual(report.clearance.door.blocked, []);
          }
        }
      } catch (error) {
        report.lastState = await p.evaluate(() => {
          if (!window.campaignQA) return document.querySelector('#fault')?.textContent;
          const s=window.campaignQA.state();
          return {stage:s.stage, actor:s.actor, cargo:s.cargo, hp:s.hp, target:s.target, guard:s.guard, errors:document.querySelector('#fault')?.textContent};
        }).catch(() => null);
        throw error;
      } finally { if (context) await context.close(); }
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    if (arg('prior')) assert.deepEqual(report.clearance.intrusions, [], '新增或移动的碰撞体占用路面或入口');
  });
  report.passed = true;
} catch (error) {
  report.error = error.stack; process.exitCode=1; console.error(error);
} finally {
  await server.close();
  report.finished = new Date().toISOString();
  const output = arg('output');
  if (output) { await mkdir(path.dirname(path.resolve(output)), {recursive:true}); await writeFile(output, JSON.stringify(report,null,2)+'\n'); }
}
