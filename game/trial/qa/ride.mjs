import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withQaBrowser } from '../../qa/browser.mjs';

export const address = process.env.TRIAL_URL ?? 'http://127.0.0.1:5188/trial/practice.html';
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const rounded = n => +n.toFixed(3);
export const capture = (page, file) => page.screenshot({ path: fileURLToPath(new URL(file, import.meta.url)) });

export async function openTrial(page, readOnly = true) {
  const url = new URL(address);
  if (readOnly) url.searchParams.set('qa', '1');
  else url.searchParams.delete('qa');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  assert.match(await page.title(), /球场试驾/);
  await page.waitForFunction(() => document.body.dataset.modal === '1' || !document.querySelector('#fault')?.hidden
    || document.querySelector('vite-error-overlay'), null, { timeout: 15000 });
  assert.equal(await page.locator('#fault').innerText(), '');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  if (readOnly) await page.waitForFunction(() => !!window.trialQA?.state, null, { timeout: 15000 });
  await page.locator('#primary').waitFor();
}

export function keyDriver(page) {
  const held = new Set();
  const counts = {};
  async function keys(next) {
    for (const k of [...held]) {
      if (!next.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    }
    for (const k of next) {
      if (held.has(k)) continue;
      await page.keyboard.down(k);
      held.add(k);
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return { keys, counts,
    tap: key => page.keyboard.press(key),
    read: () => page.evaluate(() => window.trialQA.state()),
  };
}

// For the other passing side, aim through the actual open space beside the booth.
// The waypoint is only a steering target. The game receives ordinary key edges.
function waypoints(course, lane, passOutside) {
  const line = lane === 'short' ? course.shortLine : course.mainLine;
  if (!passOutside) return line;
  const { start, gate, guardStart } = course;
  const length = gap(start, gate);
  const tx = (gate.x - start.x) / length, tz = (gate.z - start.z) / length;
  const side = (guardStart.x - gate.x) * -tz + (guardStart.z - gate.z) * tx;
  const offset = side + Math.sign(side) * 1.7;
  const point = along => ({ x: gate.x + tx * along - tz * offset, z: gate.z + tz * along + tx * offset });
  return [line[0], point(-10), point(0), point(13), ...line.slice(2)];
}

export function steerToward(line, bike) {
  let nearest = Infinity, along = 0, index = 0;
  const segments = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], size = gap(a, b);
    if (size < 0.001) continue;
    const tx = (b.x - a.x) / size, tz = (b.z - a.z) / size;
    const p = Math.max(0, Math.min(size, (bike.x - a.x) * tx + (bike.z - a.z) * tz));
    const offset = Math.hypot(bike.x - a.x - tx * p, bike.z - a.z - tz * p);
    if (offset < nearest) { nearest = offset; index = segments.length; along = p; }
    segments.push({ a, b, tx, tz, size });
  }
  const look = Math.min(8.2, 3.55 + 0.25 * Math.abs(bike.speed));
  let aimIndex = index, at = along + look;
  while (aimIndex < segments.length - 1 && at > segments[aimIndex].size) at -= segments[aimIndex++].size;
  const aim = segments[aimIndex];
  at = Math.min(aim.size, at);
  const dx = aim.a.x + at * aim.tx - bike.x, dz = aim.a.z + at * aim.tz - bike.z;
  const error = wrap(Math.atan2(-dx, dz) - bike.heading);
  let limit = 18.5, distance = segments[index].size - along;
  for (let j = index; j < segments.length - 1 && distance < 35; j++) {
    const a = segments[j], b = segments[j + 1];
    const angle = Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.tz * b.tz)));
    if (angle > 0.04) {
      const corner = angle > 0.8 ? 6.5 : Math.sqrt(13 * Math.min(20, (a.size + b.size) / 2) / angle);
      limit = Math.min(limit, Math.sqrt(corner ** 2 + 12 * Math.max(0, distance - 4)));
    }
    distance += b.size;
  }
  if (Math.abs(error) > 0.48) limit = Math.min(limit, 7);
  const finalGap = gap(bike, line.at(-1));
  limit = Math.min(limit, Math.sqrt(13 * Math.max(0, finalGap - 3.5)));
  const keys = [];
  if (bike.speed > limit + 0.2) keys.push('KeyS');
  else if (bike.speed < limit - 0.15) keys.push('KeyW');
  if (Math.abs(error) > 0.028 && finalGap > 3.5) keys.push(error > 0 ? 'KeyD' : 'KeyA');
  return keys;
}

// The sampler lives in a Playwright handle. It never changes window.trialQA or either vehicle.
async function trackFrames(page) {
  return page.evaluateHandle(() => {
    const frames = [];
    let request;
    function add() {
      const s = window.trialQA.state();
      const pose = b => ({ x: b.x, z: b.z, speed: b.speed, sideSpeed: b.sideSpeed, lean: b.lean });
      if (s.stage === 'drive' && !s.paused && s.elapsed !== frames.at(-1)?.t) {
        frames.push({ t: s.elapsed, player: pose(s.bike), guard: s.pursuer.visible ? pose(s.pursuer) : null,
          pushed: s.pursuer.pushed, active: s.pursuer.active, gate: s.passedGate, hp: s.hp });
      }
      request = requestAnimationFrame(add);
    }
    add();
    return { stop() { cancelAnimationFrame(request); return frames; } };
  });
}

function continuity(frames, body) {
  let worstExcess = 0, pairs = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1][body], b = frames[i][body], dt = frames[i].t - frames[i - 1].t;
    if (!a || !b || dt <= 0) continue;
    // Allow longitudinal and lateral speed plus body rotation about its wheel contact point.
    const bound = Math.max(Math.abs(a.speed), Math.abs(b.speed)) + Math.max(Math.abs(a.sideSpeed), Math.abs(b.sideSpeed)) + 2;
    worstExcess = Math.max(worstExcess, gap(a, b) - bound * dt);
    pairs++;
  }
  return { pairs, excessMeters: rounded(worstExcess) };
}

async function ride({ page, errors, external }, lane, late) {
  await openTrial(page);
  const io = keyDriver(page);
  const c = await page.evaluate(() => window.trialQA.course);
  const targets = waypoints(c, lane, lane === 'short');
  await io.tap('Enter');
  const log = await trackFrames(page);
  const apex = (lane === 'short' ? c.shortLine : c.mainLine).find(p => p.id === (lane === 'short' ? 'arborApex' : 'outerApex'));
  let nearestApex = Infinity, gateTime, kick, bendShot = false, forkShot = false, movingEnter = false;
  let attempts = 0, peakLean = 0;
  const deadline = Date.now() + 120000;
  try {
    while (Date.now() < deadline) {
      const { s, prompt } = await page.evaluate(() => ({ s: window.trialQA.state(),
        prompt: document.querySelector('#pace').hidden ? '' : document.querySelector('#pace').innerText }));
      assert.equal(s.stage, 'drive', '驾驶意外结束 ' + JSON.stringify([s.stage, s.hp, s.hint]));
      assert.equal(s.paused, false);
      nearestApex = Math.min(nearestApex, gap(s.bike, apex));
      if (s.passedGate && gateTime === undefined) gateTime = s.elapsed;
      if (!attempts && s.side && prompt.includes(s.side === 'left' ? 'Q' : 'E')) {
        attempts++;
        const key = s.side === 'left' ? 'KeyQ' : 'KeyE';
        await io.tap(key);
        const after = await io.read();
        kick = { key, prompt, t: after.elapsed, before: s.pushCount, after: after.pushCount,
          heading: s.bike.heading, side: s.side };
      }
      if (kick && !kick.photo && s.pursuer.pushed && s.elapsed - kick.t > 0.12 && lane === 'main') {
        await capture(page, '02-并排推开.png');
        kick.photo = true;
      }
      const courtPoint = c.mainLine.find(point => point.id === 'court3');
      if (gap(s.bike, courtPoint) < 10) {
        peakLean = Math.max(peakLean, Math.abs(s.bike.lean));
        if (!bendShot && lane === 'main' && Math.abs(s.bike.lean) > 0.17) {
          await capture(page, '03-球场弯.png'); bendShot = true;
        }
      }
      if (lane === 'short' && !forkShot && gap(s.bike, apex) < 8) {
        await capture(page,'04-花架短路.png'); forkShot = true;
      }
      if (s.canDeliver && !movingEnter && s.bike.speed > 3) {
        await io.tap('Enter'); assert.equal((await io.read()).stage, 'drive'); movingEnter = true;
      }
      if (s.canDeliver && Math.abs(s.bike.speed) < 0.15) {
        await io.keys([]);
        if (late) await page.waitForFunction(() => {
          const v = window.trialQA.state(); return v.elapsed > v.bonusTime + 1;
        }, null, { timeout: 75000 });
        const before = await io.read(); assert.equal(before.stage, 'drive');
        await io.tap('Enter');
        const end = await io.read();
        assert.equal(end.stage, 'finished');
        assert.equal(end.bonus, late ? 0 : end.bonusPay);
        assert.equal(end.cash - before.cash, end.basePay + end.bonus);
        const bill = await page.locator('#bill').innerText();
        await capture(page, late ? '05-晚送签收.png' : '06-准时签收.png');
        const frames = await log.evaluate(store => store.stop());
        const motion = { player: continuity(frames, 'player'), guard: continuity(frames, 'guard') };
        const pushed = frames.filter(f => f.pushed && f.guard);
        const beforePush = kick && frames.findLast(f => f.t <= kick.t && f.guard);
        const later = kick && frames.find(f => f.t >= kick.t + 0.4 && f.guard);
        if (beforePush && later) {
          const relativeSide = f => -(f.guard.x-f.player.x)*Math.cos(kick.heading) - (f.guard.z-f.player.z)*Math.sin(kick.heading);
          kick.separation = [beforePush, later].map(f => rounded(relativeSide(f)));
          const outward = kick.side === 'left' ? -1 : 1;
          const dx = later.guard.x-beforePush.guard.x, dz = later.guard.z-beforePush.guard.z;
          kick.guardOutwardMeters = rounded(outward * (-dx*Math.cos(kick.heading) - dz*Math.sin(kick.heading)));
        }
        if (kick) {
          kick.pushedFrames = pushed.length;
          const resumed = frames.find(f => f.t > kick.t + 1.2 && f.active && !f.pushed && f.guard);
          kick.laterSpeed = resumed && rounded(resumed.guard.speed);
        }
        await io.tap(late ? 'Enter' : 'KeyR');
        const fresh = await io.read();
        assert.ok(fresh.stage === 'drive' && fresh.hp === 100 && !fresh.passedGate && gap(fresh.bike,c.start) < 0.01);
        const result = { lane, bill, elapsed: rounded(end.elapsed), hp: end.hp, gateAt: rounded(gateTime),
          nearApex: rounded(nearestApex), peakLean: rounded(peakLean), movingEnter, kick, motion, keys: io.counts,
          retryFromReceipt: {stage:fresh.stage, hp:fresh.hp, cash:fresh.cash}, errors, external };
        console.log(JSON.stringify(result, null, 2));
        assert.ok(nearestApex < 4.5 && peakLean > 0.1, '未走指定弯线');
        assert.ok(Object.values(motion).every(m => m.pairs > 30 && m.excessMeters < 0.08), '检测到异常位置跳变');
        assert.ok(kick && kick.after === kick.before + 1 && kick.pushedFrames > 0 && kick.guardOutwardMeters > 0.2
          && kick.laterSpeed > 0, '此趟未验证侧踢、横移及之后继续骑行');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        return;
      }
      await io.keys(steerToward(targets, s.bike));
      await page.waitForTimeout(42);
    }
    throw new Error('驾驶超时，最后位置 ' + JSON.stringify((await io.read()).bike));
  } finally {
    await io.keys([]);
    await log.dispose();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const lane = process.argv.includes('--short') ? 'short' : 'main';
  await withQaBrowser(ctx => ride(ctx, lane, process.argv.includes('--late')));
}
