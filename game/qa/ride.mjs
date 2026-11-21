import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withQaBrowser } from './browser.mjs';

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const yawTo = (a, b) => Math.atan2(a.x - b.x, b.z - a.z);

// This driver acts on a path that the game's navigation actually displayed.
// It emits keys only; it never advances simulation time or sets a vehicle pose.
export function followRoute(route) {
  const points = route.map(point => ({ ...point }));
  let index = 1;
  return bike => {
    const end = points.at(-1);
    const remaining = gap(bike, end);
    if (remaining < 7.0 && Math.abs(bike.speed) < 2.15) return { arrived: true };
    if (points.length === 1) return { keys: ['Space'], index: 0 };
    let a, b, dx, dz, length, distanceAlong;
    while (index < points.length) {
      a = points[index - 1]; b = points[index];
      dx = b.x - a.x; dz = b.z - a.z;
      length = Math.max(0.001, Math.hypot(dx, dz));
      distanceAlong = ((bike.x - a.x) * dx + (bike.z - a.z) * dz) / length;
      if (index === points.length - 1 || (distanceAlong < length && gap(bike, b) > 2.6)) break;
      index++;
    }
    const toCorner = Math.max(0, length - distanceAlong);
    const look = Math.max(4.2, Math.min(8, 3.6 + bike.speed * 0.32));
    const along = Math.max(0, Math.min(length, distanceAlong + look));
    let aim = { x: a.x + dx * along / length, z: a.z + dz * along / length };
    const next = points[index + 1];
    if (next && look > toCorner) {
      const fraction = Math.min(1, (look - toCorner) / Math.max(0.001, gap(b, next)));
      aim = { x: b.x + fraction * (next.x - b.x), z: b.z + fraction * (next.z - b.z) };
    }
    const error = wrap(yawTo(bike, aim) - bike.heading);
    let targetSpeed = 16;
    if (next && Math.abs(wrap(yawTo(b, next) - yawTo(a, b))) > 0.5) {
      targetSpeed = Math.min(targetSpeed, Math.sqrt(4.6 ** 2 + 11 * Math.max(0, toCorner - 5)));
    }
    if (!next) targetSpeed = Math.min(targetSpeed, Math.sqrt(12 * Math.max(0, remaining - 4.8)));
    if (Math.abs(error) > 0.48) targetSpeed = Math.min(targetSpeed, 5.1);
    const keys = [];
    if (bike.speed > targetSpeed + 0.5) keys.push('KeyS');
    else if (bike.speed < targetSpeed - 0.15) keys.push('KeyW');
    if (Math.abs(error) > 0.035) keys.push(error > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(error) > 0.48 || (!next && remaining < 5.5)) keys.push('Space');
    return { keys, index };
  };
}

async function play({ page, external, errors }, address) {
  const url = new URL(address);
  url.searchParams.set('qa', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.riderQA && !document.querySelector('#fault')?.textContent, null, { timeout: 18000 });
  // This is the ONLY interaction with the development bridge in the entire journey.
  const read = () => page.evaluate(() => window.riderQA.state());
  const save = async name => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: fileURLToPath(new URL('./ride-' + name + '.png', import.meta.url)) });
  };
  const held = new Set();
  const counts = {};
  const setKeys = async desired => {
    for (const key of [...held]) {
      if (!desired.includes(key)) { await page.keyboard.up(key); held.delete(key); }
    }
    for (const key of desired) {
      if (held.has(key)) continue;
      await page.keyboard.down(key);
      held.add(key);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  };
  const enter = () => page.keyboard.press('Enter');
  const observations = [];
  const rideLeg = async (order, name) => {
    const start = await read();
    assert.equal(start.stage, 'ride');
    assert.equal(start.order, order);
    assert.equal(start.leg, name);
    const route = start.route;
    const follow = followRoute(route);
    const event = { order, leg: name, nodes: route.map(p => p.id ?? [p.x, p.z]),
      trail: [], meters: 0, maxKph: 0, startTime: start.timeLeft };
    let previous = start.bike;
    let previousSample = Infinity;
    let shownMovement = false;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const s = await read();
      assert.equal(s.stage, 'ride', '行驶意外结束 ' + JSON.stringify([s.stage, s.reason, s.bike, s.timeLeft]));
      assert.equal(s.paused || s.mapOpen, false, '行驶意外暂停');
      event.meters += gap(s.bike, previous);
      event.maxKph = Math.max(event.maxKph, s.speedKph);
      if (previousSample - s.timeLeft > 4) {
        previousSample = s.timeLeft;
        event.trail.push([+s.bike.x.toFixed(1), +s.bike.z.toFixed(1), s.speedKph]);
      }
      previous = s.bike;
      const step = follow(s.bike);
      if (step.arrived) {
        await setKeys([]);
        assert.equal(s.near, true, '到达时游戏未识别停靠区');
        await page.keyboard.press('KeyE');
        if (name === 'pickup') {
          await page.waitForFunction(() => window.riderQA.state().leg === 'dropoff', null, { timeout: 15000 });
        } else {
          await page.waitForFunction(() => window.riderQA.state().stage === 'delivered', null, { timeout: 10000 });
        }
        const done = await read();
        Object.assign(event, { meters: +event.meters.toFixed(1), hp: done.hp, cash: done.cash,
          completed: done.completed, endTime: +done.timeLeft.toFixed(1), impacts: done.stats.impacts });
        observations.push(event);
        console.log('LEG ' + JSON.stringify(event));
        if (order === 1) await save(name === 'pickup' ? 'pickup' : 'first-pay');
        return;
      }
      await setKeys(step.keys);
      if (!shownMovement && event.meters > 18 && name === 'pickup') {
        shownMovement = true;
        await save(order === 1 ? 'driving' : 'rain');
      }
      await page.waitForTimeout(75);
    }
    throw new Error('墙钟超过五分钟 ' + JSON.stringify(event));
  };
  try {
    for (let i = 0; i < 3; i++) await enter();
    assert.equal((await read()).stage, 'offer');
    await enter();
    await rideLeg(1, 'pickup');
    await rideLeg(1, 'dropoff');
    const first = await read();
    assert.equal(first.completed, 1);
    assert.equal(first.cash, 18);
    await enter();
    assert.equal((await read()).order, 2);
    await enter();
    await rideLeg(2, 'pickup');
    await rideLeg(2, 'dropoff');
    await enter();
    const end = await read();
    assert.equal(end.stage, 'dayend');
    assert.equal(end.cash, 50);
    await save('dayend');
    console.log(JSON.stringify({ observations, counts, totals: [end.completed, end.earn, end.spend, end.cash], external, errors }));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } catch (error) {
    await setKeys([]);
    const s = await read();
    console.error('地点与账目 ' + JSON.stringify({ bike: s.bike, stage: s.stage, leg: s.leg, time: s.timeLeft, hp: s.hp, cash: s.cash, observations }));
    await save('interrupted');
    throw error;
  } finally {
    await setKeys([]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await withQaBrowser(context => play(context, process.argv[2] ?? 'http://127.0.0.1:5188/?classic=1'));
}
