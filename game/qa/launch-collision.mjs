import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { campaignDistrict as course } from '../src/campaign-course.js';
import { createStairLayout } from '../src/stair-layout.js';
import { createVehicle, stepVehicle } from '../trial/handling.js';
import { withQaBrowser } from './browser.mjs';
import { distance, keyboard, openDay, park, pickup, read, ride, waitState, walkTo } from './doorstep-driver.mjs';
import { project, sourceVersions } from './doorstep-source.mjs';

// Rounded, read-only position from the character team's original browser timeout.
const reported = { x: -96.598, z: -56.652, heading: 9.464 };
const pose = b => ({ x: b.x, z: b.z, heading: b.heading, speed: b.speed, contactAxes: b.contactAxes });
function replayReportedContact() {
  const bike = createVehicle(reported.x, reported.z, reported.heading);
  function drive(seconds, controls) {
    for (let i = 0; i < Math.round(seconds * 120); i++) stepVehicle(bike, controls, 1 / 120, course, false);
    return pose(bike);
  }
  const reverse = drive(3, { brake: true });
  const steerOut = drive(1.1, { throttle: true, left: true });
  assert.ok(distance(reverse, reported) > 2 || distance(steerOut, reverse) > 2.5, '转交坐标处未能脱离');
  return { start: reported, reverse, steerOut };
}

const proof = { sourceAtStart: await sourceVersions(), physicsReplay: replayReportedContact() };
const server = await createServer({ root: project, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false } });
try {
  await server.listen();
  await withQaBrowser(async ({ page, errors, external }) => {
    await openDay(page, new URL('?qa=1', server.resolvedUrls.local[0]));
    const io = keyboard(page);
    const { loaded } = await pickup(page, io, course);
    // Same approach as the old failure driver. Small differences in heading can
    // either clear the planter on the way back or put the rear wheel against it.
    const wall = { x: course.finish.x + 6.2, z: course.landmarks.door.z };
    const line = [...course.shortLine.slice(0, -1), { x: wall.x, z: course.finish.z + 5 }, wall];
    const { state: hit } = await ride(page, io, line, s => s.hp < loaded.hp &&
      s.bike.z < course.finish.z && Math.abs(s.bike.x - wall.x) < 4);
    await io.keys(['KeyS']);
    const reverse = await waitState(page, s => distance(s.bike, hit.bike) > 16 ||
      (s.elapsed - hit.elapsed > 4 && s.bike.contactAxes && Math.abs(s.bike.speed) < .04), '未观察到倒车或接触', 20000);
    proof.browser = { frontContact: pose(hit.bike), reverse: pose(reverse.bike), hp: reverse.hp };
    if (distance(reverse.bike, hit.bike) < 16) {
      const held = await waitState(page, s => s.elapsed >= reverse.elapsed + 1.2, '持续观察倒车接触');
      proof.browser.heldReverseMeters = distance(reverse.bike, held.bike);
      proof.browser.metersFromReported = distance(held.bike, reported);
      assert.ok(proof.browser.heldReverseMeters < .1);
      await io.keys(['KeyW', 'KeyA']);
      const escaped = await waitState(page, s => distance(s.bike, held.bike) > 1.65, '前进左转未能脱离楼前接触');
      assert.equal(escaped.bike.contactAxes, 0);
      proof.browser.steerOut = pose(escaped.bike);
      proof.browser.escapeSeconds = escaped.elapsed - held.elapsed;
    }
    const here = await park(page, io);
    await ride(page, io, [here.bike, course.finish],
      s => distance(s.bike, course.finish) < 5.5 && Math.abs(s.bike.speed) < .5);
    await park(page, io);
    await io.tap('KeyF');
    await waitState(page, s => s.travelMode === 'foot' && s.motion.type === 'none', '未能下车');
    await io.tap('Enter');
    await waitState(page, s => s.cargo === 'hand', '停车后未取到袋');
    const stairs = createStairLayout(course);
    await page.getByText('手持餐袋', { exact: true }).waitFor();
    const approach = await page.locator('.nb-pocket-nav [data-layer="route"]').evaluate(line =>
      Array.from(line.points, p => ({ x: p.x, z: p.y })));
    assert.ok(approach.length > 1 && distance(approach.at(-1), stairs.entrance) < 1);
    proof.browser.walkingRouteToEntrance = approach;
    for (const point of approach.slice(1)) {
      await walkTo(page, io, point, { run: false, radius: .15 });
      if ((await read(page)).walker.indoors) break;
    }
    for (const point of stairs.route.slice(1)) await walkTo(page, io, point);
    assert.equal((await read(page)).interaction?.kind, 'knock');
    await io.tap('Enter');
    const paid = await waitState(page, s => s.stage === 'delivered', '未实际在 302 签收');
    assert.equal(paid.completed, 1);
    assert.deepEqual([...errors, ...external], []);
    proof.browser.receipt = { elapsed: paid.elapsed, hp: paid.hp, earned: paid.earned, completed: paid.completed };
  });
  proof.sourceAtEnd = await sourceVersions();
  assert.equal(proof.sourceAtStart, proof.sourceAtEnd, '运行期间游戏源发生变化');
  console.log(JSON.stringify(proof));
} finally {
  await server.close();
}
