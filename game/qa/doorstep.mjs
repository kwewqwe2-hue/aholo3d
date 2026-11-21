// node qa/doorstep.mjs [prepare|timed|skilled|novice|regression|mobile|entries] [local URL] [--phone] [--width=360] [--final]
// timed is the unrecorded fast route. skilled records the actual tab's video and audio.
// Development evidence goes to a temporary directory. --final publishes a frozen successful run.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { withQaBrowser } from './browser.mjs';
import { withCaptureBrowser, recordTab } from './doorstep-recorder.mjs';
import { touchDriver } from './doorstep-touch.mjs';
import { readPocket, verifyJourney, verifyMapArt, verifyPocket, visibleGuardMark } from './doorstep-phone.mjs';
import { project as root, releaseEvidence as output, sourceVersions } from './doorstep-source.mjs';
import { createStairLayout } from '../src/stair-layout.js';
import { action, brief, distance, eventCounter, frame, frameMeter, keyboard, lookTowards, openDay, park, pickup,
  read, ride, round, screen, stairWitnesses, waitState, walkTo } from './doorstep-driver.mjs';

const mode = process.argv[2] ?? 'skilled';
assert.ok(['prepare', 'timed', 'skilled', 'novice', 'regression', 'mobile', 'entries'].includes(mode));
const publish = mode !== 'prepare' && process.argv.includes('--final');
const testPhone = publish || process.argv.includes('--phone');
const mobileWidth = process.argv.includes('--width=360') ? 360 : 390;
const runName = mode === 'mobile' ? mode + mobileWidth : mode;
const work = await mkdtemp(path.join(tmpdir(), 'rider-doorstep-' + mode + '-'));
const report = { mode, frozenCapture: publish, started: new Date().toISOString(), checkpoints: [], frames: {}, screenshots: {}, pocket: [],
  browserErrors: [], networkErrors: [] };
let listeningAtGate = false;
let events;
let fullMeter;
const note = (name, data = {}) => {
  report.checkpoints.push({ name, ...data });
  console.log(name, JSON.stringify(data));
};
const iso = () => new Date().toISOString();
const imagePath = name => path.join(work, name + (mode === 'mobile' ? '-' + mobileWidth : '') + '.png');
async function shot(page, name, state) {
  const png = await page.screenshot({ path: imagePath(name), scale: 'css', timeout: 10000 });
  report.screenshots[name] = { file: path.basename(imagePath(name)), at: iso(), width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    ...(state && { state: brief(state) }) };
}

async function environment(page, browser) {
  const cdp = await browser.newBrowserCDPSession();
  const { gpu } = await cdp.send('SystemInfo.getInfo');
  await cdp.detach();
  const viewport = await page.evaluate(() => {
    const c = document.querySelector('#city');
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, canvas: [c.width, c.height],
      touchPoints: navigator.maxTouchPoints, userAgent: navigator.userAgent };
  });
  return { browser: browser.version(), cpu: cpus()[0].model, gpu: gpu.auxAttributes.glRenderer,
    ...viewport, recording: mode === 'skilled' || mode === 'prepare' };
}

async function pocket(page, course, name, options) {
  if (testPhone) report.pocket.push(await verifyPocket(page, course, name, options));
}

async function rehearsal(page, io, course) {
  const stop = await recordTab(page, path.join(work, '录制预演.webm'));
  try {
    await ride(page, io, course.mainLine, s => s.passedGate && s.bike.x < course.gate.x - 8);
    await shot(page, '录制预演', await read(page));
  } finally { report.video = await stop(); }
  note('预演实车越线', brief(await read(page)));
}

async function inspectContract(page) {
  const [s, f] = await Promise.all([read(page), frame(page)]);
  assert.equal(f.stage, 'drive');
  for (const v of [s, f]) {
    assert.equal(v.travelMode, 'bike', '正式入口尚未接入上下车状态');
    assert.equal(v.cargo, 'none');
    assert.equal(v.guard.phase, 'posted');
    assert.equal(v.motion.type, 'none');
    for (const name of ['canMount', 'canDismount']) assert.equal(typeof v[name], 'boolean');
    for (const k of ['x', 'y', 'z', 'heading', 'speed']) assert.ok(Number.isFinite(v.walker[k]), 'walker.' + k);
    assert.ok(Number.isInteger(v.walker.floor) && typeof v.walker.indoors === 'boolean');
    assert.ok(distance(v.actor, v.bike) < .05);
    assert.ok(v.interaction === null || typeof v.interaction.label === 'string');
  }
  const camera = await page.evaluate(() => window.campaignQA.camera());
  note('正式状态与场景相机', { camera, frameStage: f.stage });
  const mark = await page.locator('.nb-hud .nb-brand-mark svg path').first().getAttribute('d');
  assert.equal(mark, 'M2 16h19M4 14c0-5 3-8.5 8-9l-2.8 5.5 4.8-2-2 5.5H4ZM15 5.3c3.7 1.2 5.2 4 5.4 7.7h-5.8M6 19h11');
  await yellowMeter(page, s.hp);
}

async function yellowMeter(page, hp) {
  const meter = page.locator('meter[data-field="hpMeter"]:visible');
  await page.waitForFunction(value => document.querySelector('meter[data-field="hpMeter"]')?.value === value, hp);
  const png = await meter.screenshot({ scale: 'css' });
  const pixels = await page.evaluate(async data => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const { data: row } = ctx.getImageData(0, Math.floor(bmp.height / 2), bmp.width, 1);
    let yellow = 0;
    for (let i = 0; i < row.length; i += 4) if (row[i] > 165 && row[i + 1] > 115 && row[i + 1] - row[i + 2] > 65) yellow++;
    bmp.close();
    return { width: ctx.canvas.width, yellow };
  }, png.toString('base64'));
  if (hp === 100 && !fullMeter) {
    assert.ok(pixels.yellow >= pixels.width * .85, '满车况时未铺满血条内轨');
    fullMeter = pixels;
  }
  assert.ok(pixels.width === fullMeter.width && Math.abs(pixels.yellow - fullMeter.yellow * hp / 100) <= 2,
    '黄色填充长度与本视口实测内轨不符 ' + JSON.stringify(pixels));
  note('品牌餐罩与实际黄色血条', { hp, ...pixels });
}

async function run({ page, browser, errors, external }, base) {
  page.setDefaultTimeout(10000);
  page.on('console', m => { if (m.type() === 'error') report.browserErrors.push(m.text()); });
  page.on('response', r => {
    if (r.status() >= 400) report.networkErrors.push({ status: r.status(), url: r.url() });
  });
  const mobile = mode === 'mobile';
  await page.setViewportSize(mobile ? { width: mobileWidth, height: mobileWidth === 360 ? 800 : 844 } : { width: 1280, height: 720 });
  const url = new URL(base);
  url.searchParams.set('qa', '1');
  const io = mobile ? await touchDriver(page) : keyboard(page);
  let touches, stopMovie;
  try {
    if (mode === 'regression') events = await eventCounter(page);
    const monitor = await page.context().newCDPSession(page);
    report.audioBufferSources = [];
    monitor.on('WebAudio.audioNodeCreated', ({ node }) => {
      if (listeningAtGate && /BufferSource/.test(node.nodeType)) {
        report.audioBufferSources.push({ type: node.nodeType, observedAt: iso() });
      }
    });
    await monitor.send('WebAudio.enable');
    if (mode === 'entries') {
      await entries(page, base);
      assert.deepEqual([...errors, ...external, ...report.browserErrors, ...report.networkErrors], []);
      return;
    }
    report.loading = await openDay(page, url, mobile, mode === 'skilled' ? async () => {
      await page.keyboard.press('KeyW'); // Real gesture unlocks tab sound while the first comic remains on screen.
      stopMovie = await recordTab(page, path.join(work, '第一天-常驻手机-连续原片.webm'));
      await page.waitForTimeout(450);
    } : undefined);
    if (mobile) touches = await page.evaluateHandle(() => {
      const counts = { contacts: 0, simultaneous: 0, untrusted: 0, keyboard: 0 };
      const touch = event => {
        counts.contacts++;
        counts.simultaneous = Math.max(counts.simultaneous, event.touches.length);
        if (!event.isTrusted) counts.untrusted++;
      };
      const key = () => { counts.keyboard++; };
      window.addEventListener('touchstart', touch, { capture: true, passive: true });
      window.addEventListener('keydown', key, true);
      return () => {
        window.removeEventListener('touchstart', touch, true);
        window.removeEventListener('keydown', key, true);
        return counts;
      };
    });
    report.environment = await environment(page, browser);
    note('漫画三页、第一天、确认接单', { url: page.url(), ...report.environment });
    const course = await page.evaluate(() => window.campaignQA.district);
    const stairs = createStairLayout(course);
    if (mode !== 'prepare') {
      await inspectContract(page);
      report.renderer = await page.evaluate(() => window.campaignQA.diagnostics());
    }
    await pocket(page, course, '广场');
    if (testPhone) report.pocketArt = await verifyMapArt(page, report.pocket.at(-1));
    if (mode === 'skilled' || mobile) await shot(page, '00A-广场接单及常驻手机', await read(page));
    const { loaded, meters } = await pickup(page, io, course, async parked => {
      await pocket(page, course, '红棚');
      if (mode !== 'skilled') return;
      const s = await dismount(page, io);
      await lookTowards(page, { x: course.landmarks.market.x, z: s.walker.z - 1.4 });
      await page.waitForTimeout(185);
      await shot(page, '00B-红棚商户及常驻手机', await read(page));
      await io.tap('KeyF');
      await waitState(page, s => s.travelMode === 'bike' && s.motion.type === 'none', '店前未能重新骑车');
      assert.ok(distance(parked.bike, (await read(page)).bike) < .1);
    });
    note('由广场骑到红棚取餐', { meters, ...brief(loaded) });
    if (mode === 'prepare') await rehearsal(page, io, course);
    else await delivery(page, io, course, stairs, loaded, async () => {
      if (stopMovie) { const stop = stopMovie; stopMovie = null; report.video = await stop(); }
    });
    if (testPhone) report.pocketJourney = verifyJourney(report.pocket, course);
    if (report.guardAtCapture) {
      report.guardPixels = visibleGuardMark(imagePath(report.guardAtCapture.image), report.guardAtCapture.controls);
    }
    report.keyDowns = io.counts;
    if (mobile) {
      report.touchTargets = io.measured;
      report.touchEvents = await touches.evaluate(stop => stop());
      assert.ok(report.touchEvents.simultaneous >= 2 && report.touchEvents.contacts > 5);
      assert.equal(report.touchEvents.untrusted + report.touchEvents.keyboard, 0);
    }
    assert.deepEqual(errors, [], '页面异常');
    assert.deepEqual(external, [], '访问外部资源');
    assert.deepEqual(report.browserErrors, [], '浏览器报错');
    assert.deepEqual(report.networkErrors, [], '加载资源失败');
  } catch (error) {
    report.lastState = await read(page).then(brief).catch(() => null);
    report.hud = await page.locator('.nb-ui,#fault:not([hidden])').allInnerTexts().catch(() => []);
    await shot(page, '故障现场').catch(() => {});
    throw error;
  } finally {
    await io.keys([]).catch(() => {});
    if (stopMovie) report.video = await stopMovie();
  }
}

async function entries(page, base) {
  // Ordinary players, without the diagnostics query or state bridge.
  await openDay(page, new URL(base));
  assert.equal(await page.evaluate(() => 'campaignQA' in window), false);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => +document.querySelector('[data-field="speed"]').textContent >= 7);
  await page.keyboard.up('KeyW');
  note('普通正式入口实际给油', { url: page.url() });
  await page.goto(new URL('/?classic=1', base).href);
  await action(page, 'skip').click();
  await action(page, 'accept').click();
  await screen(page, 'ride').waitFor();
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => +document.querySelector('[data-field="speed"]').textContent >= 7);
  await page.keyboard.up('KeyW');
  note('经典入口实际给油', { url: page.url() });
  await page.goto(new URL('/trial/?practice=1', base).href);
  await page.locator('#primary').click();
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => +document.querySelector('#speed').textContent >= 7);
  await page.keyboard.up('KeyW');
  note('独立试驾入口实际给油', { url: page.url() });
}

async function watchGate(page, postX) {
  return page.evaluateHandle(x => {
    const phases = [], crossings = [];
    let prev, id;
    function sample() {
      const s = window.campaignQA.state();
      const p = { phase: s.guard.phase, t: s.elapsed, x: s.bike.x, z: s.bike.z, speed: s.bike.speed };
      if (prev && (p.x < x) !== (prev.x < x)) crossings.push({ from: prev, to: p });
      if (p.phase !== prev?.phase) {
        const cart = window.campaignQA.frame().pursuer;
        phases.push({ ...p, previous: prev, cart: { x: cart.x, z: cart.z, speed: cart.speed, active: cart.active } });
      }
      prev = p;
      id = requestAnimationFrame(sample);
    }
    sample();
    return () => { cancelAnimationFrame(id); return { phases, crossings }; };
  }, postX);
}

async function phone(page, io, name) {
  const mobile = mode === 'mobile';
  const operate = () => mobile ? action(page, 'map').tap() : io.tap('KeyM');
  const initial = await read(page);
  if (mobile && testPhone && initial.travelMode === 'bike') {
    await io.keys(['KeyW']);
    await page.waitForTimeout(100);
    await io.openWhileHolding();
  } else await operate();
  await screen(page, 'map').waitFor();
  const before = await frame(page);
  const seen = (await screen(page, 'map').innerText()).replace(/\s+/g, ' ');
  if (name) await shot(page, name, await read(page));
  if (!mobile) await io.keys(['KeyW', 'ShiftLeft']);
  else if (testPhone) await io.swipeMap();
  await page.waitForTimeout(680);
  await io.keys([]);
  const after = await frame(page);
  for (const key of ['elapsed', 'deliveryElapsed', 'bike', 'walker', 'guard', 'pursuer']) {
    assert.deepEqual(after[key], before[key], '导航展开时仍在更新 ' + key);
  }
  if (mobile) {
    const close = screen(page, 'map').getByRole('button', { name: /收起|返回|继续/ }).first();
    await close.tap();
  } else await operate();
  await screen(page, 'ride').waitFor();
  await waitState(page, s => s.elapsed > before.deliveryElapsed + .05, '收起后计时未恢复');
  if (mobile && testPhone) {
    const resumed = await read(page);
    await page.waitForTimeout(230);
    const released = await read(page);
    if (resumed.travelMode === 'foot') assert.ok(distance(resumed.walker, released.walker) < .04, '收起后残留摇杆输入');
    else assert.ok(released.bike.speed <= resumed.bike.speed + .25, '收起手机后残留油门输入');
    io.invalidate();
  }
  note('展开和收起导航', { phase: before.guard.phase, floor: before.walker.floor,
    pausedGameSeconds: after.deliveryElapsed - before.deliveryElapsed, text: seen.slice(0, 250) });
}

async function pauseGame(page, io) {
  const toggle = () => mode === 'mobile' ? action(page, 'pause').tap() : io.tap('Escape');
  await toggle();
  await screen(page, 'pause').waitFor();
  const before = await frame(page);
  await page.waitForTimeout(440);
  const after = await frame(page);
  assert.ok(after.paused);
  assert.deepEqual([after.deliveryElapsed, after.guard, after.walker], [before.deliveryElapsed, before.guard, before.walker]);
  await toggle();
  await screen(page, 'ride').waitFor();
  await waitState(page, s => s.elapsed > before.deliveryElapsed + .05, '恢复游戏后仍冻结');
  note('暂停及继续', { phase: before.guard.phase, secondsFrozen: after.deliveryElapsed - before.deliveryElapsed });
}

async function gate(page, io, course, line) {
  const north = course.blocks.find(b => b.id === 'northPost'), south = course.blocks.find(b => b.id === 'southPost');
  const postX = (north.x + south.x) / 2;
  listeningAtGate = true;
  const monitor = await watchGate(page, postX);
  let before = false, alert = false, movingF = false;
  const preliminary = await frame(page);
  const parked = { x: preliminary.pursuer.x, z: preliminary.pursuer.z };
  async function observe(s) {
      if (mode === 'regression' && !movingF && s.bike.speed > 4) {
        assert.equal(s.canDismount, false);
        await io.tap('KeyF');
        assert.equal((await read(page)).travelMode, 'bike', '行车中可直接下车');
        movingF = true;
      }
      if (!before && s.guard.phase === 'posted' && s.bike.x < postX + 12 && s.bike.x > postX + 3) {
        before = true;
        const f = await frame(page);
        assert.ok(distance(f.pursuer, parked) < .12, '越线前巡逻车移动');
        if (mode === 'skilled') await shot(page, '01-越线前岗亭和空车', s);
      }
      if (!alert && s.guard.phase === 'alert' && (!['skilled', 'mobile'].includes(mode) || s.guard.progress >= .24)) {
        alert = true;
        if (mode === 'skilled') await shot(page, '02-越线喊停', s);
        if (mode === 'mobile') await shot(page, '02M-竖屏高速过岗', s);
        if (testPhone && ['skilled','mobile'].includes(mode)) {
          const displayed = await readPocket(page, course.bounds);
          const name = mode === 'mobile' ? '02M-竖屏高速过岗' : '02-越线喊停';
          report.guardAtCapture = { image: name, ui: displayed.phone, controls: displayed.controls,
            actor: s.bike, speedKph: round(3.6 * s.bike.speed) };
        }
      }
  }
  if (mode === 'skilled') {
    // Slow at the guard booth exactly as a player can. Stay on the bike and
    // watch the uniformed guard board and set off before accelerating again.
    await ride(page, io, line, s => s.bike.x < postX + 12.8, { maxSpeed: 9.2 });
    const street = await park(page, io);
    assert.ok(street.guard.phase === 'posted' && street.bike.x > postX + 1);
    await observe(street);
    const gateIndex = line.findIndex(p => p.id === course.gate.id);
    const through = [...line.slice(0, gateIndex), { x: postX - 9, z: course.gate.z - 1.8 }];
    await ride(page, io, through, s => s.guard.phase === 'alert', { maxSpeed: 2.55, observe });
    await park(page, io);
    await observe(await waitState(page, s => s.guard.phase === 'alert' && s.guard.progress > .27, '未观察到岗亭报警'));
    const boarding = await waitState(page, s => s.guard.phase === 'boarding' && s.guard.progress > .53, '未见保安登车');
    await shot(page, '02B-保安登车', boarding);
    const chase = await waitState(page, s => s.guard.phase === 'chasing', '保安没有起追');
    await page.waitForTimeout(400);
    await shot(page, '02C-巡逻车起追', chase);
  } else {
    await ride(page, io, line, s => mode === 'regression'
      ? s.bike.x < postX - .8 : s.guard.phase === 'chasing' && s.bike.x < postX - 4, {
      maxSpeed: mode === 'novice' || mode === 'regression' ? 9.2 : undefined, observe,
    });
  }
  if (mode === 'regression') {
    await park(page, io);
    await io.keys(['KeyS']);
    await waitState(page, s => s.bike.x > postX + 4, '倒出两根门柱', 20000);
    await park(page, io);
    await ride(page, io, line, s => s.bike.x < postX - 5, { maxSpeed: 9 });
  }
  const result = await monitor.evaluate(stop => stop());
  listeningAtGate = false;
  await monitor.dispose();
  assert.ok(before && alert, '未观测到越线前、喊停两个独立状态');
  assert.deepEqual(result.phases.map(p => p.phase), ['posted', 'alert', 'boarding', 'chasing']);
  const [, a, b, c] = result.phases;
  assert.ok(!a.cart.active && !b.cart.active && distance(a.cart, parked) < .1 && distance(b.cart, parked) < .1,
    '保安仍喊话或登车时巡逻车已经移动');
  const durations = { alert: round(b.t - a.t), boarding: round(c.t - b.t) };
  assert.ok(Math.abs(durations.alert - .65) < .21 && Math.abs(durations.boarding - 1.20) < .21,
    '门岗时序异常 ' + JSON.stringify(durations));
  assert.ok(a.previous.x >= postX - .3 && a.x <= postX + .3 &&
    a.z > Math.min(north.z, south.z) && a.z < Math.max(north.z, south.z), '首喊与两门柱越线不符');
  assert.equal(result.crossings.length, mode === 'regression' ? 3 : 1);
  if (mode === 'regression') assert.ok(movingF);
  const f = await frame(page);
  assert.equal(f.guard.phase, 'chasing');
  report.gate = { postX, parked, durations, ...result };
  if (events) {
    report.gate.emitted = await events();
    assert.deepEqual(report.gate.emitted, { guardAlert: 1, delivered: 0, failed: 0 },
      '实际过门线三次后的事件调用次数');
  }
  note('门柱、喊停、上车、起追', { postX: round(postX), durations, crossings: result.crossings.length,
    tabAudioSources: report.audioBufferSources.length });
}

function beside(bike, left, ahead) {
  const sin = Math.sin(bike.heading), cos = Math.cos(bike.heading);
  return { x: bike.x + left * cos - ahead * sin, y: 0, z: bike.z + left * sin + ahead * cos };
}
async function dismount(page, io) {
  const at = await read(page);
  assert.ok(at.travelMode === 'bike' && at.canDismount && Math.abs(at.bike.speed) < .05);
  await io.tap('KeyF');
  const s = await waitState(page, s => s.travelMode === 'foot' && s.motion.type === 'none', 'F 未下车');
  assert.ok(distance(at.bike, s.bike) < .03 && distance(s.walker, s.bike) > .4);
  return s;
}

async function fetchBag(page, io, advancedChecks, capture) {
  const s = await dismount(page, io);
  const { bike, walker } = s;
  const side = Math.sign((walker.x - bike.x) * Math.cos(bike.heading) +
    (walker.z - bike.z) * Math.sin(bike.heading)) || 1;
  if (advancedChecks) {
    await walkTo(page, io, beside(bike, side * 1.15, 2.15));
    await io.tap('Enter');
    const wrong = await read(page);
    assert.ok(wrong.cargo === 'box' && wrong.motion.type === 'none', '站在车把前可以取后箱餐袋');
  }
  await walkTo(page, io, beside(bike, side * .92, -.86), { radius: .18, run: false });
  const near = await read(page);
  assert.ok(near.cargo === 'box' && near.interaction && /袋|取餐/.test(near.interaction.label),
    '尾箱未出现取袋提示 ' + JSON.stringify(brief(near)));
  if (capture) await lookTowards(page, beside(bike, side * 3.4, 1.8));
  await io.tap('Enter');
  const opened = await waitState(page, s => s.motion.type === 'takeBag' && s.motion.progress >= .63,
    '尾箱取袋动作未展开');
  if (capture) await shot(page, '03-楼前尾箱取袋', opened);
  const carried = await waitState(page, s => s.cargo === 'hand' && s.motion.type === 'none', '取袋未入手');
  assert.equal(carried.earned, 0);
  if (advancedChecks) {
    assert.ok(carried.canMount);
    await io.tap('KeyF');
    await waitState(page, s => s.travelMode === 'bike' && s.cargo === 'box' && s.motion.type === 'none',
      '重新骑车后餐袋未收回尾箱');
    await fetchBag(page, io, false, false);
  }
  const resumed = await read(page);
  note('停实车、F 下车、到尾箱取袋', { bike: [round(bike.x), round(bike.z)], actor: brief(resumed),
    remounted: advancedChecks });
  // Walk around the outside of the parked bike before crossing towards the entrance.
  await walkTo(page, io, beside(bike, side * 1.04, 1.44), { run: true });
  return bike;
}

async function stairsTrip(page, io, course, stairs, line, { wrongFloor = false, down = false, capture = false } = {}) {
  const witnesses = stairWitnesses(stairs);
  assert.equal(witnesses.length, 4);
  const closest = witnesses.map(() => Infinity), floors = new Set(), phoneFloors = new Set();
  const start = await read(page);
  let maxSpeed = 0, checkedDoor = false, photographed = false;
  const advance = async s => {
    const p = s.walker;
    assert.equal(s.cargo, 'hand', '餐袋在走楼梯时丢失');
    assert.ok(distance(s.bike, start.bike) < .035, '离车后摩托跟随玩家移动');
    if (p.indoors) floors.add(p.floor);
    maxSpeed = Math.max(maxSpeed, p.speed);
    for (const [i, w] of witnesses.entries()) {
      closest[i] = Math.min(closest[i], Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z));
    }
    if (!photographed && mode === 'skilled' && !down && p.indoors && p.speed > 2.6 &&
        p.y > 1.73 * stairs.floorHeight && p.y < 1.85 * stairs.floorHeight) {
      photographed = true;
      await shot(page, '04A-提袋跑上第四段梯', s);
    }
  };
  for (const target of line) {
    if (mode === 'skilled' && distance((await read(page)).walker, target) > 2.6) await lookTowards(page, target);
    const s = await walkTo(page, io, target, { run: mode !== 'novice' || target.y >= stairs.floorHeight,
      observe: advance });
    if (s.walker.indoors && !phoneFloors.has(s.walker.floor)) {
      await pocket(page, course, '楼内' + s.walker.floor + '层', { floor: s.walker.floor });
      phoneFloors.add(s.walker.floor);
    }
    if (wrongFloor && !checkedDoor && s.walker.floor === 2 &&
        Math.abs(target.y - stairs.floorHeight) < .02 && stairs.local(target).d < stairs.front) {
      const wrong = { ...stairs.knock, y: stairs.floorHeight };
      await walkTo(page, io, wrong);
      await io.tap('Enter');
      const tried = await read(page);
      assert.ok(tried.stage === 'ride' && tried.completed === 0 && tried.earned === 0 &&
        tried.cargo === 'hand' && tried.motion.type === 'none', '二楼错门发生交付');
      checkedDoor = true;
      note('二楼同址错门拒收', brief(tried));
      await walkTo(page, io, target);
    }
  }
  assert.ok(closest.every(v => v < .85), '未实际经过四段梯 ' + JSON.stringify(closest));
  if (mode === 'skilled') assert.ok(photographed, '实机未拍到第四段梯上的跑动');
  assert.deepEqual([...floors].sort(), [1, 2, 3]);
  assert.ok(maxSpeed > 3.2, '四段梯上没有观测到实际跑步速度');
  if (wrongFloor) assert.ok(checkedDoor, '错门用例缺失');
  const last = await read(page);
  const world = await frame(page);
  assert.equal(world.stage, 'drive');
  assert.ok(world.travelMode === 'foot' && distance(world.walker, world.actor) < .001 &&
    Math.abs(world.walker.y - world.actor.y) < .001 && distance(world.bike, start.bike) < .035);
  if (down) assert.equal(last.walker.indoors, false);
  else {
    assert.ok(last.walker.indoors && last.walker.floor === 3 && last.guard.phase === 'standDown');
    assert.ok(last.interaction && /敲|302|送餐/.test(last.interaction.label));
    assert.equal(last.canMount, false);
    if (capture) await shot(page, '04-三楼302门前', last);
  }
  note(down ? '下完四段梯回室外' : '携袋走过四段梯至302', { floors: [...floors], closest: closest.map(round),
    seconds: round(last.elapsed - start.elapsed), maxSpeed: round(maxSpeed), state: brief(last) });
  return last;
}

async function settle(page, io, before) {
  await io.tap('Enter');
  const knock = await waitState(page, s => s.motion.type === 'knock', '没有看到敲门动作');
  await io.tap('Enter');
  const handing = await waitState(page, s => s.motion.type === 'handoff', '没有看到住户交接动作');
  await io.tap('Enter');
  if (mode === 'skilled') {
    const exchange = await waitState(page, s => s.motion.type === 'handoff' && s.motion.progress > .56,
      '未观测到住户接袋');
    await shot(page, '04B-住户接袋', exchange);
  }
  assert.equal(knock.earned, 0);
  assert.equal(handing.earned, 0);
  await screen(page, 'delivered').waitFor();
  const paid = await read(page);
  assert.equal(paid.cargo, 'delivered');
  assert.equal(paid.completed, 1);
  assert.equal(paid.bonus, paid.elapsed <= paid.bonusTime ? paid.bonusPay : 0);
  assert.equal(paid.earned, paid.basePay + paid.bonus);
  assert.equal(paid.cash, before.cash + paid.earned);
  await page.waitForTimeout(400);
  assert.equal((await read(page)).cash, paid.cash, '重复到账');
  report.payment = { seconds: round(paid.elapsed), limit: paid.bonusTime, base: paid.basePay, bonus: paid.bonus,
    fine: paid.spend, net: paid.cash, count: paid.completed, stats: paid.stats };
  if (events) {
    report.payment.emitted = await events();
    assert.deepEqual(report.payment.emitted, { guardAlert: 2, delivered: 1, failed: 1 },
      '前后两次出车的实际喊停、签收、失败次数');
  }
  note('302敲门、递袋后单次入账', report.payment);
  if (mode === 'skilled') await shot(page, '06-302签收回执', paid);
  return paid;
}

async function restart(page, io) {
  const doAction = async name => mode === 'mobile' ? action(page, name).tap() : action(page, name).click();
  const paid = await read(page);
  await doAction('continue');
  await screen(page, 'dayend').waitFor();
  assert.equal((await read(page)).cash, paid.cash);
  await doAction('restart');
  await screen(page, 'intro').waitFor();
  const fresh = await read(page);
  assert.equal(fresh.stage, 'intro');
  assert.equal(fresh.page, 0);
  assert.equal(fresh.cargo, 'none');
  assert.equal(fresh.guard.phase, 'posted');
  assert.equal(fresh.completed + Math.abs(fresh.cash), 0);
  note('日结后重开第一格漫画', brief(fresh));
}

async function delivery(page, io, course, stairs, loaded, finishMovie) {
  const record = mode === 'skilled', outer = mode === 'novice' || mode === 'mobile';
  const line = outer ? course.mainLine : course.shortLine;
  assert.equal(loaded.cargo, 'box');
  const meter = frameMeter(page);
  try {
    if (record) await phone(page, io, '00C-红棚展开骑手导航');
    await gate(page, io, course, line);
    if (mode !== 'regression') await pocket(page, course, '起追');
    if (outer) await phone(page, io, mode === 'novice' ? '05-骑手手机地图' : undefined);
    if (outer) await pauseGame(page, io);
    if (mode === 'regression') {
      await failureAndRetry(page, io, course, loaded);
      await ride(page, io, line, s => s.guard.phase === 'chasing');
      await pocket(page, course, '起追');
    }
    const witness = outer ? course.landmarks.outerApex : course.landmarks.arborApex;
    let apexDistance = Infinity, treeShot = false;
    const parkTarget = record || mode === 'timed' ? stairs.world(-2.0, -.9) : course.finish;
    const parkingLine = parkTarget === course.finish ? line : [...line, parkTarget];
    await meter.start();
    const leg = await ride(page, io, parkingLine, s => distance(s.bike, parkTarget) < 4.6 && Math.abs(s.bike.speed) < .5,
      { maxSpeed: mode === 'novice' ? 12 : undefined,
        observe: async s => {
          apexDistance = Math.min(apexDistance, distance(s.bike, witness));
          if (record && !treeShot && distance(s.bike, course.landmarks.fork) < 12) {
            treeShot = true;
            await shot(page, '02D-大榕树与院内公共区', s);
          }
        } });
    report.frames.courtyard = await meter.stop();
    report.frames.courtyard.renderer = await page.evaluate(() => window.campaignQA.diagnostics());
    assert.ok(apexDistance < 5, '实车未走指定线路');
    const stopped = await park(page, io);
    await pocket(page, course, '楼前停车');
    const cart = (await frame(page)).pursuer;
    assert.ok(cart.active && distance(cart, report.gate.parked) > 8, '起追后巡逻车没有离开岗亭');
    note('实车沿指定线路抵达楼前', { route: outer ? '球场外圈' : '紫藤线', apexDistance: round(apexDistance),
      metersAfterChase: leg.meters, metersToEntrance: round(distance(stopped.bike, stairs.entrance)), seconds: round(stopped.elapsed) });
    await io.tap('Enter');
    assert.ok((await read(page)).completed === 0, '骑车停在楼前提前结算');
    const bike = await fetchBag(page, io, mode === 'regression', record);
    if (mode === 'mobile') {
      await shot(page, '07-窄屏步行触控', await read(page));
      await io.walk(0, 1, true);
      await page.waitForTimeout(200);
      await io.cancel();
      await waitState(page, s => s.walker.speed === 0, '触摸取消后摇杆仍在移动');
      note('双指摇杆和跑步取消后停稳', brief(await read(page)));
    }
    await walkTo(page, io, stairs.outside);
    await pocket(page, course, '人车分离', { separated: true });
    const start = await read(page);
    await meter.start();
    let door;
    try { door = await stairsTrip(page, io, course, stairs, stairs.route, { wrongFloor: mode === 'novice' }); }
    finally { report.frames.stairwell = await meter.stop(); }
    report.frames.stairwell.renderer = await page.evaluate(() => window.campaignQA.diagnostics());
    assert.ok(distance(door.bike, bike) < .03);
    if (record) {
      await lookTowards(page, stairs.door302);
      await page.waitForTimeout(180);
      await shot(page, '04-三楼302门前', door);
    }
    if (mode === 'regression') {
      await io.tap('KeyF');
      assert.equal((await read(page)).travelMode, 'foot');
      await stairsTrip(page, io, course, stairs, stairs.pathFrom(door.walker, true), { down: true });
      door = await stairsTrip(page, io, course, stairs, stairs.route, { wrongFloor: true });
      if (door.elapsed <= door.bonusTime) {
        await waitState(page, s => s.elapsed > s.bonusTime + .05, '等候晚送临界点', (door.bonusTime - door.elapsed + 5) * 1000);
      }
    }
    if (mode === 'mobile') await phone(page, io, '08-窄屏三楼导航');
    report.timing = { route: outer ? '球场外圈' : '紫藤线', parked: round(stopped.elapsed),
      atEntrance: round(start.elapsed), at302: round(door.elapsed) };
    await settle(page, io, door);
  } finally { await finishMovie(); }
  await restart(page, io);
}

async function failureAndRetry(page, io, course, loaded) {
  // Drive into solid brick beside the entrance; reverse away before every new impact.
  const wall = { x: course.finish.x + 6.2, z: course.landmarks.door.z };
  let s = await read(page);
  const before = s.hp;
  const pathToWall = [...course.shortLine.slice(0, -1), { x: wall.x, z: course.finish.z + 5 }, wall];
  const damaged = await ride(page, io, pathToWall, s => s.hp < before &&
    s.bike.z < course.finish.z && Math.abs(s.bike.x - wall.x) < 4);
  s = damaged.state;
  await yellowMeter(page, s.hp);
  const hp = [s.hp];
  while (s.stage === 'ride' && hp.length < 16) {
    const prior = s;
    await io.keys(['KeyS']);
    await waitState(page, s => distance(s.bike, prior.bike) > 16, '未能真实倒出碰撞区', 16000);
    await io.keys(['KeyW']);
    s = await waitState(page, s => s.hp < prior.hp, '重复撞击后车况未下降', 15000);
    hp.push(s.hp);
  }
  await io.keys([]);
  assert.equal(s.stage, 'failed');
  assert.equal(s.hp, 0);
  assert.equal(s.cash, -s.fine);
  await action(page, 'retry').click();
  const restored = await waitState(page, s => s.stage === 'ride', '失败后的重试未恢复游戏');
  assert.ok(restored.leg === 'dropoff' && restored.travelMode === 'bike' && restored.cargo === 'box');
  assert.ok(restored.guard.phase === 'posted' && restored.motion.type === 'none' && restored.hp === 100);
  assert.ok(distance(restored.bike, loaded.bike) < .25 && restored.cash === s.cash && restored.elapsed < .4);
  await yellowMeter(page, 100);
  note('实撞至零、单笔罚款、从取餐处重试', { hp, cash: s.cash, restored: brief(restored) });
}

async function mobileSession(parent, base) {
  const context = await parent.browser.newContext({ viewport: { width: mobileWidth, height: mobileWidth === 360 ? 800 : 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.routeWebSocket(url => url.searchParams.has('token'), () => {});
  const page = await context.newPage(), errors = [], external = [];
  const emulation = await context.newCDPSession(page);
  await emulation.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.origin !== base.origin) external.push(u.href);
  });
  try { return await run({ browser: parent.browser, page, errors, external }, base); }
  finally { await context.close(); }
}

let server;
try {
  if (process.argv.includes('--isolated')) {
    server = await createServer({ root, logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, hmr: false, open: false } });
    await server.listen();
  }
  const base = new URL(server?.resolvedUrls.local[0] ?? process.argv.slice(3).find(arg => /^https?:/.test(arg)) ?? 'http://127.0.0.1:5188/');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
  report.sourceAtStart = await sourceVersions();
  const launch = mode === 'skilled' || mode === 'prepare' ? withCaptureBrowser : withQaBrowser;
  await launch(ctx => mode === 'mobile' ? mobileSession(ctx, base) : run(ctx, base));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack ?? String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  report.sourceAtEnd = await sourceVersions();
  if (publish && report.passed && report.sourceAtStart !== report.sourceAtEnd) {
    report.passed = false; report.error = '采样期间源文件或素材已变，需在同一冻结版本复拍';
    process.exitCode = 1;
  }
  report.finished = iso();
  await writeFile(path.join(work, runName + '.json'), JSON.stringify(report, null, 2) + '\n');
  if (publish && report.passed) {
    await mkdir(output, { recursive: true });
    for (const file of await readdir(work)) await copyFile(path.join(work, file), path.join(output, file));
  }
  console.log('本次证据', publish && report.passed ? output : work);
}
