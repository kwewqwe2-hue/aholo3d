import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { withQaBrowser } from './browser.mjs';
import { distance, keyboard, lookTowards, openDay, park, read, ride, waitState, walkTo } from './doorstep-driver.mjs';
import { project } from './doorstep-source.mjs';

const server = await createServer({ root: project, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false } });
try {
  await server.listen();
  await withQaBrowser(async ({ page, errors, external }) => {
    await openDay(page, new URL('?qa=1', server.resolvedUrls.local[0]));
    const course = await page.evaluate(() => window.campaignQA.district);
    const io = keyboard(page);
    async function checkPhoneTarget(label) {
      await io.tap('KeyM');
      const subtitle = page.locator('[data-field="legInfo"]:visible');
      await subtitle.waitFor();
      assert.ok((await subtitle.innerText()).includes(label), '手机副标题没有跟随当前黄线路标');
      await io.tap('KeyM');
      await waitState(page, state => !state.mapOpen, '收起导航后未返回步行');
    }
    const yellowLine = () => page.locator('.nb-pocket-nav [data-layer="route"]').evaluate(el =>
      Array.from(el.points, point => ({ x: point.x, z: point.y })));
    async function follow(line, lastRadius) {
      for (const point of line.slice(1)) {
        await walkTo(page, io, point, { run: false, radius: point === line.at(-1) ? lastRadius : .18 });
      }
    }
    const bend = course.pickupLine.findIndex(p => p.id === 'turnEast');
    assert.ok(bend > 0);
    await ride(page, io, course.pickupLine.slice(0, bend + 1),
      s => distance(s.bike, course.pickupLine[bend]) < 4.5 && Math.abs(s.bike.speed) < .45);
    const { bike } = await park(page, io);
    await io.tap('KeyF');
    await waitState(page, s => s.travelMode === 'foot' && s.motion.type === 'none', '未能下车');
    await lookTowards(page, course.pickup);
    await walkTo(page, io, course.pickup, { run: false, radius: .45 });
    await io.tap('Enter');
    const counter = await read(page);
    assert.equal(counter.leg, 'pickup');
    assert.equal(counter.interaction, null);
    const gap = distance(counter.actor, bike);
    assert.ok(gap > 7, '停车位置太近，没有验证到店后需要返车的情况');
    await checkPhoneTarget(counter.target.label);
    const line = await yellowLine();
    assert.ok(line.length > 1 && distance(line.at(-1), bike) < .05,
      `红棚离车 ${gap.toFixed(1)} 米，但手机黄线没有指回车辆，显示余程 ${counter.routeMeters} 米`);
    await follow(line, 1.65);
    assert.ok((await read(page)).canMount, '沿黄线返回后没有上车动作');
    await io.tap('KeyF');
    const mounted = await waitState(page, s => s.travelMode === 'bike' && s.motion.type === 'none' &&
      s.target.id === course.pickup.id, '上车后未恢复取餐导航');
    await page.locator('.nb-hud[data-travel="bike"]:visible').waitFor();
    // The steering aid stops 3.5 m before its endpoint. Aim past a clear
    // parking place so the box is in range and the counter is free to stand at.
    const shopParking = { x: course.pickup.x - 2.4, z: course.pickup.z };
    const pastParking = { x: shopParking.x, z: shopParking.z + 3.5 };
    await ride(page, io, [mounted.bike, pastParking], s =>
      distance(s.bike, shopParking) < 1.3 && Math.abs(s.bike.speed) < .45 && s.interaction?.kind === 'pickup');
    const { bike: nearShop } = await park(page, io);
    await io.tap('KeyF');
    const landed = await waitState(page, s => s.travelMode === 'foot' && s.motion.type === 'none', '店旁未下车');
    // Walk past the handlebars to the counter, as a player looking for the meal would.
    const cos = Math.cos(nearShop.heading), sin = Math.sin(nearShop.heading);
    const side = Math.sign((landed.actor.x - nearShop.x) * cos + (landed.actor.z - nearShop.z) * sin);
    await walkTo(page, io, { x: nearShop.x + side * 1.14 * cos - 1.7 * sin,
      z: nearShop.z + side * 1.14 * sin + 1.7 * cos }, { run: false });
    await walkTo(page, io, course.pickup, { run: false, radius: .29 });
    await io.tap('Enter');
    const atShop = await read(page);
    assert.equal(atShop.interaction, null);
    assert.equal(atShop.target.id, 'loadBox', '第二个停车点的尾箱必须在可装餐范围');
    await checkPhoneTarget(atShop.target.label);
    const toBox = await yellowLine();
    assert.ok(toBox.length > 1 && distance(toBox.at(-1), atShop.target) < .07 &&
      distance(atShop.actor, atShop.target) > .2, '黄线的终点应是当前车位可装餐的一侧');
    await follow(toBox, .17);
    assert.equal((await read(page)).interaction?.kind, 'pickup');
    await io.tap('Enter');
    const loaded = await waitState(page, s => s.leg === 'dropoff' && s.cargo === 'box', '返车后未能装餐');
    assert.deepEqual([...errors, ...external], []);
    console.log({ metersToBike: gap, shownMeters: counter.routeMeters, metersToLoad: atShop.routeMeters,
      afterPickup: loaded.cargo, mode: loaded.travelMode });
  });
} finally {
  await server.close();
}
