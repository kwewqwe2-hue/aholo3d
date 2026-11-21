import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withQaBrowser } from './browser.mjs';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5188/?classic=1');
url.searchParams.set('qa', '1');
const shot = name => fileURLToPath(new URL('./bridge-' + name + '.png', import.meta.url));

await withQaBrowser(async ({ page, external, errors }) => {
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.riderQA && !document.querySelector('#fault')?.textContent, null, { timeout: 15000 });
  const call = (name, ...args) => page.evaluate(([name, args]) => { window.riderQA[name](...args); }, [name, args]);
  const action = name => call('action', name);
  const warp = name => call('warpToStop', name);
  const read = () => page.evaluate(() => window.riderQA.state());
  const interact = () => page.keyboard.press('KeyE');
  const checkpoints = [];
  const expect = async (label, expected) => {
    const state = await read();
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(state[key], value, label + ' / ' + key);
    checkpoints.push({ label, stage: state.stage, order: state.order, leg: state.leg,
      completed: state.completed, hp: state.hp, cash: state.cash, timeLeft: +state.timeLeft.toFixed(2) });
    return state;
  };
  const snap = async name => {
    // The state change and the HUD draw can occur on consecutive animation frames.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: shot(name), timeout: 20000 });
  };
  const district = await page.evaluate(() => window.riderQA.district);
  const stop = key => district.nodes.find(node => node.id === district.stops[key].node);
  await expect('新班', { stage: 'intro', completed: 0, cash: 0 });
  await action('skip');
  await warp('shop1');
  await interact();
  await expect('未接单到店', { stage: 'offer', leg: 'pickup', cash: 0 });
  await warp('square');
  await action('accept');
  const start = await read();
  assert.equal(start.bike.heading, 0);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.riderQA.state().bike.speed >= 5);
  const forward = await read();
  assert.ok(forward.bike.z > start.bike.z && Math.abs(forward.bike.x - start.bike.x) < 0.01);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.riderQA.state().bike.heading >= 0.15);
  await page.keyboard.up('KeyD');
  const right = await read();
  assert.ok(right.bike.x < forward.bike.x);
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => window.riderQA.state().bike.heading < -0.08);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  const left = await read();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.riderQA.state().bike.speed === 0);
  await page.keyboard.up('Space');
  const parked = await read();
  await page.keyboard.down('KeyD');
  await page.waitForFunction(time => window.riderQA.state().timeLeft < time - 2, parked.timeLeft);
  await page.keyboard.up('KeyD');
  const still = await read();
  for (const key of ['x', 'z', 'heading', 'speed']) assert.equal(still.bike[key], parked.bike[key], '停车 / ' + key);
  console.log('实键方向与停车 ' + JSON.stringify([start, forward, right, left, parked, still].map(s =>
    [s.bike.x, s.bike.z, s.bike.heading, s.bike.speed].map(v => +v.toFixed(3)))));
  await warp('home1');
  await interact();
  await expect('客户处漏取餐', { stage: 'ride', leg: 'pickup', completed: 0, cash: 0 });
  const shop = stop('shop1');
  await page.evaluate(([x, z]) => {
    window.riderQA.place(x + 8.1, z);
    window.riderQA.action('interact');
  }, [shop.x, shop.z]);
  await expect('取餐范围外 8.1', { leg: 'pickup' });
  await page.evaluate(([x, z]) => {
    window.riderQA.place(x + 8, z);
    window.riderQA.action('interact');
  }, [shop.x, shop.z]);
  await expect('取餐边界 8.0', { leg: 'dropoff' });

  const item = district.items.find(item => !item.order || item.order === 1);
  assert.ok(item, '首单缺少可测试的修理道具');
  await call('hurt', 15);
  await call('place', item.x, item.z);
  await page.waitForFunction(() => window.riderQA.state().inventory === 1);
  await page.keyboard.press('KeyQ');
  await expect('修理至上限', { hp: 100, inventory: 0 });
  await call('elapse', 0.2);
  await expect('同一道具不再拾取', { inventory: 0 });

  await warp('home1');
  await interact();
  await interact();
  await expect('首单重复交付', { stage: 'delivered', completed: 1, cash: 18, earn: 18, spend: 0 });
  await action('continue');
  await expect('首单后继续派单', { order: 2, stage: 'offer', completed: 1, cash: 18, wet: true });
  await action('accept');
  if (district.stops.home1.node !== district.stops.shop2.node) {
    await warp('home1');
    await interact();
    await expect('第二单重访第一单客户节点', { leg: 'pickup', cash: 18, completed: 1 });
  }
  const gate = district.hazards.find(h => h.type === 'gate' && h.order === 2);
  if (gate) {
    // Set up on the open approach. Only a keyboard throttle drives into the barrier.
    await call('place', gate.x, gate.z + 5, Math.PI);
    const priorImpacts = (await read()).stats.impacts;
    await page.keyboard.down('KeyW');
    await page.waitForFunction(count => window.riderQA.state().stats.impacts > count, priorImpacts);
    await page.keyboard.up('KeyW');
    const blocked = await read();
    assert.ok(blocked.bike.z > gate.z && blocked.hp < 100 && blocked.cash === 18);
    console.log('雨天实键闸杆 ' + JSON.stringify({ z: blocked.bike.z, gateZ: gate.z, hp: blocked.hp, cash: blocked.cash }));
  }
  await warp('shop2');
  await snap('rain');
  await interact();
  const serving = await expect('第二店开始封袋', { stage: 'ride', leg: 'pickup' });
  assert.ok(serving.serving > 0, '封袋应在进行中');
  await interact();
  await call('elapse', 2.5);
  await expect('封袋完成一次', { leg: 'dropoff', completed: 1, cash: 18 });
  await warp('home2');
  await interact();
  await interact();
  await expect('第二单重复交付', { stage: 'delivered', completed: 2, cash: 50, earn: 50, spend: 0 });
  await action('continue');
  await action('continue');
  await expect('两单收工', { stage: 'dayend', completed: 2, cash: 50 });
  await snap('dayend');

  await action('restart');
  await action('skip');
  await action('accept');
  await call('hurt', 99);
  await expect('最后 1 HP', { hp: 1, stage: 'ride' });
  await call('hurt', 1);
  await expect('HP 刚好为 0', { hp: 0, stage: 'failed', completed: 0, cash: -6, spend: 6 });
  await snap('hp-zero');
  await call('elapse', 200);
  await call('hurt', 5);
  await interact();
  await expect('失败后重复触发', { stage: 'failed', completed: 0, cash: -6, spend: 6 });
  await page.locator('button[data-act="retry"]').click();
  const retry = await expect('原单重试', { order: 1, stage: 'ride', leg: 'pickup', hp: 100, cash: -6 });
  await call('elapse', retry.timeLeft - 0.4);
  await page.waitForFunction(() => window.riderQA.state().stage === 'failed', null, { timeout: 12000 });
  await call('hurt', 100);
  await interact();
  await expect('自然过零再触发损伤', { stage: 'failed', timeLeft: 0, hp: 100, completed: 0, cash: -12, spend: 12 });
  await page.keyboard.press('Enter');
  await expect('超时后重试', { stage: 'ride', order: 1, leg: 'pickup', hp: 100, cash: -12 });
  console.log(JSON.stringify({ checkpoints, external, errors }, null, 2));
  assert.deepEqual(external, [], '页面尝试访问外部服务');
  assert.deepEqual(errors, [], '页面发生脚本异常');
});
