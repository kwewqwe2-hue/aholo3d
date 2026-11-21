import assert from 'node:assert/strict';
import { keyDriver, steerToward } from '../trial/qa/ride.mjs';

export const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
export const round = n => Number(n.toFixed(3));
export const action = (page, name) => page.locator('[data-act="' + name + '"]:visible').first();
export const field = (page, name) => page.locator('[data-field="' + name + '"]:visible').first();
export const screen = (page, name) => page.locator('.nb-ui[data-screen="' + name + '"]');
export const read = page => page.evaluate(() => window.campaignQA.state());
export const frame = page => page.evaluate(() => window.campaignQA.frame());

export function brief(s) {
  const p = s.actor ?? s.bike;
  return { stage: s.stage, mode: s.travelMode, leg: s.leg, cargo: s.cargo, guard: s.guard?.phase,
    motion: s.motion?.type, interaction: s.interaction?.kind, floor: s.walker?.floor,
    position: [p.x, p.y ?? 0, p.z, p.heading, p.speed].map(n => Number.isFinite(n) ? round(n) : null),
    elapsed: round(s.elapsed), hp: s.hp };
}

export async function waitState(page, predicate, message, timeout = 6000) {
  const until = Date.now() + timeout;
  let s;
  do {
    s = await read(page);
    if (predicate(s)) return s;
    await page.waitForTimeout(24);
  } while (Date.now() < until);
  throw Error(message + ' ' + JSON.stringify(brief(s)));
}

export async function openDay(page, url, mobile = false, onIntro, { keyboardOnly = false, onComic } = {}) {
  const start = performance.now();
  const entry = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  if (url.protocol === 'https:' && entry?.status() !== 200) throw Error('游戏入口 HTTP ' + entry?.status());
  await page.waitForFunction(() => document.querySelector('.nb-ui[data-screen],vite-error-overlay,#fault:not([hidden])'));
  assert.equal(await page.locator('vite-error-overlay,#fault:not([hidden])').count(), 0,
    '正式入口启动失败 ' + (await page.locator('body').innerText()).slice(0, 350));
  const comicMs = Math.round(performance.now() - start);
  await page.waitForFunction(() => ['ready', 'failed', 'partial'].includes(document.documentElement.dataset.models) ||
    !!document.querySelector('#fault:not([hidden])'), null, { timeout: 90000 });
  assert.equal(await page.locator('html').getAttribute('data-models'), 'ready', '场景资源未全部就绪');
  const resourcesMs = Math.round(performance.now() - start);
  if (onIntro) await onIntro();
  const enter = loc => keyboardOnly ? loc.press('Enter') : mobile ? loc.tap() : loc.click();
  for (const [i, title] of ['我的工位，先下班了。', '工牌换头盔。', '广场见，骑手上线。'].entries()) {
    const comic = screen(page, 'intro');
    await comic.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await comic.locator('.nb-frame [role="img"]:visible').count(), 2);
    assert.ok(await comic.getByLabel('第 ' + (i + 1) + ' 页，共 3 页').isVisible());
    if (onComic) await onComic(i, title);
    if (i === 1 && !mobile && !keyboardOnly) await page.keyboard.press('Enter');
    else await enter(action(page, 'next'));
  }
  await action(page, 'selectDay').waitFor();
  assert.equal(await action(page, 'accept').count(), 0);
  await enter(action(page, 'selectDay'));
  assert.match(await field(page, 'shop').innerText(), /红棚/);
  assert.match(await field(page, 'home').innerText(), /7\s*号楼|七号楼/);
  await enter(action(page, 'accept'));
  await screen(page, 'ride').waitFor();
  return { comicMs, resourcesMs, acceptedMs: Math.round(performance.now() - start) };
}

export function keyboard(page) {
  const io = keyDriver(page);
  return {
    keys: io.keys, tap: io.tap, counts: io.counts,
    walk: (x, z, run) => io.keys([
      ...(z > .39 ? ['KeyW'] : z < -.39 ? ['KeyS'] : []),
      ...(x > .39 ? ['KeyD'] : x < -.39 ? ['KeyA'] : []),
      ...(run ? ['ShiftLeft'] : []),
    ]),
  };
}

// Rotate using the game's ordinary drag-to-look control. Never assign a camera pose.
export async function lookTowards(page, target) {
  const { width, height } = page.viewportSize();
  for (let step = 0; step < 3; step++) {
    const { p, heading } = await page.evaluate(() => ({ p: window.campaignQA.state().walker,
      heading: window.campaignQA.camera().heading }));
    const aim = Math.atan2(p.x - target.x, target.z - p.z);
    const delta = Math.atan2(Math.sin(aim - heading), Math.cos(aim - heading));
    if (Math.abs(delta) < .045) return;
    const dx = Math.max(-width * .40, Math.min(width * .40, -delta / .005));
    const x = width * .5, y = height * .54;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: Math.max(2, Math.ceil(Math.abs(dx) / 39)) });
    await page.mouse.up();
  }
}

export async function ride(page, io, line, stop, { observe, maxSpeed, timeout = 95000 } = {}) {
  const deadline = Date.now() + timeout;
  let s, previous, meters = 0;
  while (Date.now() < deadline) {
    s = await read(page);
    assert.ok(s.stage === 'ride' && !s.paused && !s.mapOpen, '骑行中断 ' + JSON.stringify(brief(s)));
    if (previous) meters += distance(previous, s.bike);
    previous = s.bike;
    if (observe) await observe(s);
    if (stop(s)) {
      await io.keys([]);
      return { state: s, meters: round(meters) };
    }
    const keys = steerToward(line, s.bike);
    if (maxSpeed && s.bike.speed >= maxSpeed && keys.includes('KeyW')) keys.splice(keys.indexOf('KeyW'), 1);
    await io.keys(keys);
    await page.waitForTimeout(38);
  }
  throw Error('骑行未到目标 ' + JSON.stringify({ end: line.at(-1), state: brief(s), meters: round(meters) }));
}

export async function park(page, io) {
  await io.keys(['Space']);
  const s = await waitState(page, s => Math.abs(s.bike.speed) < .018, '手刹未停稳');
  await io.keys([]);
  return s;
}

export async function pickup(page, io, course, onStop) {
  const start = await read(page);
  assert.ok(start.leg === 'pickup' && distance(start.bike, course.square) < .3);
  await io.tap('Enter');
  assert.equal((await read(page)).leg, 'pickup', '广场提前取餐');
  const { meters } = await ride(page, io, course.pickupLine,
    s => distance(s.bike, course.pickup) < course.pickup.radius && Math.abs(s.bike.speed) < .45);
  const parked = await park(page, io);
  if (onStop) await onStop(parked);
  await io.tap('Enter');
  const loaded = await waitState(page, s => s.leg === 'dropoff', '红棚未取餐');
  assert.ok(meters > distance(course.square, course.pickup) - course.pickup.radius);
  assert.ok(!loaded.passedGate && distance(loaded.bike, parked.bike) < .1);
  return { loaded, meters };
}

export async function walkTo(page, io, target, { run = true, radius = .24, observe } = {}) {
  let closest = Infinity, lastAdvance, s;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const s = window.campaignQA.state(), camera = window.campaignQA.camera();
      return { s, h: typeof camera === 'number' ? camera : camera?.heading ?? camera?.cameraHeading };
    });
    s = sample.s;
    const w = s.walker, h = sample.h;
    assert.ok(s.stage === 'ride' && s.travelMode === 'foot' && !s.mapOpen && !s.paused,
      '步行中断 ' + JSON.stringify(brief(s)));
    assert.ok(Number.isFinite(h), '只读相机缺少实际控制朝向');
    if (observe) await observe(s);
    const dx = target.x - w.x, dz = target.z - w.z, d = Math.hypot(dx, dz);
    if (d <= radius && Math.abs((target.y ?? 0) - w.y) < .32) {
      await io.keys([]);
      return s;
    }
    // A browser frame stall and a collision need different evidence. Allow the
    // game's own motion time to advance before concluding that the path is blocked.
    if (d < closest - .06) { closest = d; lastAdvance = s.elapsed; }
    if (s.elapsed - lastAdvance > 3.3) break;
    // +Z on the stick moves towards screen-up. Facing world +Z puts world -X on screen-right.
    const right = (-dx * Math.cos(h) - dz * Math.sin(h)) / Math.max(d, .001);
    const forward = (-dx * Math.sin(h) + dz * Math.cos(h)) / Math.max(d, .001);
    await io.walk(right, forward, run && d > .75);
    await page.waitForTimeout(25);
  }
  await io.keys([]);
  throw Error('步行未到目标 ' + JSON.stringify({ target, closest: round(closest), state: brief(s) }));
}

export function stairWitnesses(stairs) {
  return stairs.route.slice(1).flatMap((p, i) => {
    const a = stairs.route[i];
    return p.y > a.y + 1 ? [{ x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, z: (p.z + a.z) / 2 }] : [];
  });
}

export function frameMeter(page) {
  let handle;
  return {
    async start() {
      handle = await page.evaluateHandle(() => {
        const deltas = [], slow = [], longFrames = [];
        const longObserver = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
          ? new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (entry.duration < 100 || longFrames.length >= 12) continue;
              longFrames.push({ duration: Math.round(entry.duration), blockingMs: Math.round(entry.blockingDuration),
                scripts: entry.scripts.map(s => ({ ms: Math.round(s.duration), fn: s.sourceFunctionName,
                  invocation: s.invoker, source: s.sourceURL?.split('?')[0].split('/').pop() })).slice(0, 8) });
            }
          }) : null;
        longObserver?.observe({ type: 'long-animation-frame' });
        let last, id;
        function sample(t) {
          if (last !== undefined) {
            const dt = t - last;
            deltas.push(dt);
            if (dt > 50 && slow.length < 32) {
              const s = window.campaignQA.state();
              slow.push({ ms: Math.round(dt * 10) / 10, seconds: s.elapsed, mode: s.travelMode,
                indoors: s.walker.indoors, floor: s.walker.floor, position: [s.actor.x, s.actor.y, s.actor.z],
                visibility: document.visibilityState, motion: s.motion.type, guard: s.guard.phase });
            }
          }
          last = t;
          id = requestAnimationFrame(sample);
        }
        id = requestAnimationFrame(sample);
        return () => {
          cancelAnimationFrame(id); longObserver?.disconnect();
          return { values: deltas, slow, longFrames };
        };
      });
    },
    async stop() {
      const { values, slow, longFrames } = await handle.evaluate(stop => stop());
      await handle.dispose();
      assert.ok(values.length > 8, '帧时采样不足');
      const sorted = values.toSorted((a, b) => a - b);
      const q = n => round(sorted[Math.ceil(n * sorted.length) - 1]);
      const ms = values.reduce((a, b) => a + b, 0);
      return { intervals: values.length, seconds: round(ms / 1000), meanMs: round(ms / values.length),
        p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99), maxMs: q(1),
        averageFps: round(1000 * values.length / ms), over33ms: values.filter(v => v > 33.7).length,
        over50ms: values.filter(v => v > 50).length, slow, longFrames };
    },
  };
}

// Chromium's read-only execution counters count the real emit statements.
// Enable only for the boundary run, outside the two timing/performance runs.
export async function eventCounter(page) {
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Debugger.enable');
  await devtools.send('Profiler.enable');
  await devtools.send('Profiler.startPreciseCoverage', { detailed: true, callCount: true });
  const totals = { guardAlert: 0, delivered: 0, failed: 0 };
  return async () => {
    const { result } = await devtools.send('Profiler.takePreciseCoverage');
    const script = result.find(item => item.url.split('?')[0].endsWith('/trial/session.js'));
    assert.ok(script, '未找到实际载入的配送事件脚本');
    const { scriptSource } = await devtools.send('Debugger.getScriptSource', { scriptId: script.scriptId });
    for (const event of Object.keys(totals)) {
      const offset = scriptSource.search(new RegExp('emit\\(\\s*[\x27"]' + event + '[\x27"]\\s*\\)'));
      assert.ok(offset >= 0, '当前事件调用点缺失 ' + event);
      const functions = script.functions.filter(fn => event === 'guardAlert'
        ? fn.functionName === '' && fn.ranges[0].endOffset - fn.ranges[0].startOffset < 600
        : fn.functionName === 'finish');
      const matching = functions.flatMap(fn => fn.ranges).filter(r => r.startOffset <= offset && offset < r.endOffset)
        .toSorted((a, b) => (a.endOffset - a.startOffset) - (b.endOffset - b.startOffset));
      // A second snapshot omits functions that did not execute since the first.
      if (matching.length) totals[event] += matching[0].count;
    }
    return { ...totals };
  };
}
