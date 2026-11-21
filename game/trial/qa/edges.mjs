import assert from 'node:assert/strict';
import { withQaBrowser } from '../../qa/browser.mjs';
import { openTrial, keyDriver, capture, steerToward } from './ride.mjs';

const distance = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const elapsed = async (page, duration) => {
  const end = await page.evaluate(d => window.trialQA.state().elapsed + d, duration);
  await page.waitForFunction(t => window.trialQA.state().elapsed >= t, end, {timeout: 15000});
};
const pose = s => [s.bike.x, s.bike.z, s.bike.speed, s.bike.heading, s.bike.steer, s.bike.lean].map(n => +n.toFixed(4));

async function controls({page, context, errors, external}) {
  await openTrial(page, false);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#overlay').hidden);
  assert.equal(await page.evaluate(() => typeof window.trialQA), 'undefined');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) >= 32);
  await capture(page, '01-普通键盘起跑.png');
  const ordinary = { speed: await page.locator('#speed').innerText(), target: await page.locator('#objective').innerText() };
  await page.keyboard.up('KeyW');

  const other = await context.newPage();
  await other.setContent('<button>独立验收标签页</button>');
  await openTrial(page);
  for (const p of [page, other]) {
    const cdp = await context.newCDPSession(p);
    await cdp.send('Emulation.setFocusEmulationEnabled', {enabled: false});
  }
  await page.bringToFront();
  const io = keyDriver(page);
  await io.tap('Enter');
  await io.tap('Enter');
  assert.equal((await io.read()).stage, 'drive', '起点就能交付');
  await io.tap('KeyQ');
  assert.equal((await io.read()).pushCount, 0, '远离陪跑车却产生推开');
  await io.keys(['KeyW']);
  await page.waitForFunction(() => window.trialQA.state().bike.speed >= 8);
  const before = await io.read();
  await io.keys(['KeyW','KeyD']); await elapsed(page, 0.10);
  const right = await io.read();
  await io.keys(['KeyW']); await elapsed(page, 0.47);
  const rightFree = await io.read();
  assert.ok(right.bike.heading > before.bike.heading && right.bike.lean > 0);
  assert.ok(Math.abs(rightFree.bike.steer) < 0.001 && Math.abs(rightFree.bike.lean) < 0.03);
  assert.ok(rightFree.bike.heading > before.bike.heading, '松手后吸回旧朝向');
  await io.keys(['KeyA']); await elapsed(page, 0.105);
  const left = await io.read();
  await io.keys([]); await elapsed(page, 0.5);
  const leftFree = await io.read();
  assert.ok(left.bike.heading < rightFree.bike.heading && left.bike.lean < 0);
  assert.ok(Math.abs(leftFree.bike.steer) < 0.001 && Math.abs(leftFree.bike.lean) < 0.03);
  await io.keys(['KeyS']);
  await page.waitForFunction(() => window.trialQA.state().bike.speed < -0.6);
  const reversing = await io.read(); await io.keys([]);

  await io.tap('KeyR');
  const newStart = await io.read();
  await io.tap('ShiftLeft');
  await page.waitForFunction(() => window.trialQA.state().boost > 0.1);
  const boostOn = await io.read();
  await elapsed(page, 1.0);
  const boostOff = await io.read();
  assert.equal(boostOff.boost, 0); assert.ok(boostOff.bike.speed > boostOn.bike.speed);
  await io.keys(['KeyW']);
  await page.waitForFunction(() => window.trialQA.state().bike.speed > 10);
  const blurs = await page.evaluateHandle(() => {
    const events = [];
    window.addEventListener('blur', e => events.push(e.isTrusted));
    return events;
  });
  await other.bringToFront(); await other.getByRole('button').click();
  await page.waitForFunction(() => window.trialQA.state().paused, null, {polling:60, timeout:5000});
  const away = await io.read();
  await other.keyboard.up('KeyW'); await other.waitForTimeout(340);
  const frozen = await io.read();
  assert.deepEqual([frozen.elapsed, pose(frozen), frozen.pursuer.x, frozen.pursuer.z],
    [away.elapsed, pose(away), away.pursuer.x, away.pursuer.z]);
  assert.deepEqual(await blurs.jsonValue(), [true]); await blurs.dispose();
  await page.bringToFront(); await io.tap('Escape'); await elapsed(page, 0.85);
  const back = await io.read();
  assert.ok(back.bike.speed < away.bike.speed, '松在另一个标签的 W 仍在给油');
  await io.keys([]); await io.tap('KeyP'); assert.equal((await io.read()).paused, true);
  await io.tap('KeyP'); assert.equal((await io.read()).paused, false);
  await io.tap('KeyR'); const restart = await io.read();
  assert.deepEqual(pose(restart), pose(newStart));
  await io.keys(['KeyW']);
  await page.waitForFunction(() => {
    const s = window.trialQA.state();
    return s.passedGate && s.side === 'left' && !document.querySelector('#pace').hidden;
  }, null, {timeout: 10000});
  const alongside = await io.read();
  await io.tap('KeyE');
  const miss = await io.read();
  assert.equal(miss.pushCount, alongside.pushCount, '向空的一侧踢却推动陪跑车');
  await io.keys(['KeyS']);
  await page.waitForFunction(() => window.trialQA.state().bike.speed <= 0.1);
  await io.keys([]); await elapsed(page, 0.18);
  const stop = await io.read();
  await elapsed(page, 2.6);
  const leftBehind = await io.read();
  assert.ok(distance(stop.bike, leftBehind.bike) < 0.05 && distance(stop.pursuer, leftBehind.pursuer) > 5);
  assert.ok(leftBehind.pursuer.gap > stop.pursuer.gap + 3);
  console.log(JSON.stringify({ ordinary, micro: [before,right,rightFree,left,leftFree].map(pose),
    reverse: reversing.bike.speed, boost: [boostOn.boost,boostOff.boost,boostOff.bike.speed],
    blur: [away.bike.speed,back.bike.speed], reset:pose(restart), wrongSide:{ side:alongside.side, pushCount:miss.pushCount },
    parkedVsGuard:{ rider:distance(stop.bike,leftBehind.bike), guard:distance(stop.pursuer,leftBehind.pursuer),
      gap:[stop.pursuer.gap,leftBehind.pursuer.gap]}, errors, external },null,2));
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
}

async function damage({page, errors, external}) {
  await openTrial(page);
  const io=keyDriver(page);
  const course=await page.evaluate(() => window.trialQA.course);
  // The door is a solid static facade past the stop. Approach it under normal physics.
  const finish=course.finish, merge=course.landmarks.merge;
  const runIn=distance(merge,finish);
  const wallDirection={x:(finish.x-merge.x)/runIn,z:(finish.z-merge.z)/runIn};
  const aim={x:finish.x+15*wallDirection.x,z:finish.z+15*wallDirection.z};
  const line=[...course.shortLine,aim];
  const impacts=[];
  await io.tap('Enter');
  try {
    const deadline=Date.now()+60000;
    let s=await io.read();
    while (s.hp===100 && Date.now()<deadline) {
      await io.keys(steerToward(line,s.bike));
      await page.waitForTimeout(50); s=await io.read();
    }
    assert.ok(s.hp<100 && distance(s.bike,finish)<12, '未能到达终点外的静态墙面');
    impacts.push({hp:s.hp,t:+s.elapsed.toFixed(2),x:s.bike.x,z:s.bike.z});
    while (s.stage==='drive' && impacts.length<18) {
      const last={x:s.bike.x,z:s.bike.z};
      await io.keys(['KeyS']);
      await page.waitForFunction(last => {
        const b=window.trialQA.state().bike;return Math.hypot(b.x-last.x,b.z-last.z)>16;
      },last,{timeout:15000});
      await io.keys(['KeyW']);
      await page.waitForFunction(hp=>window.trialQA.state().hp<hp,s.hp,{timeout:14000});
      s=await io.read(); impacts.push({hp:s.hp,t:+s.elapsed.toFixed(2)});
    }
    await io.keys([]);
    assert.deepEqual([s.stage,s.hp,s.cash,s.fines],['failed',0,-s.fine,s.fine]);
    await page.waitForFunction(() => !document.querySelector('#overlay').hidden
      && document.querySelector('#title').textContent === '车况归零'
      && !document.querySelector('#bill').hidden && document.querySelector('#bill').textContent.includes('余额'));
    const bill=await page.locator('#bill').innerText();
    assert.ok(bill.includes('−¥' + s.fine) && bill.includes('余额 ¥' + s.cash), bill);
    await capture(page,'07-车况归零.png');
    await page.waitForTimeout(650);assert.equal((await io.read()).cash,s.cash);
    await io.tap('KeyR');const retry=await io.read();
    assert.deepEqual([retry.stage,retry.hp,retry.cash,retry.fines,retry.passedGate,retry.bike.speed],
      ['drive',100,s.cash,s.fines,false,0]);
    assert.ok(distance(retry.bike,course.start)<0.01);
    console.log(JSON.stringify({impacts,bill,retry:{hp:retry.hp,cash:retry.cash,hint:retry.hint,position:pose(retry)},errors,external}));
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  } finally { await io.keys([]); }
}

await withQaBrowser(process.argv.includes('--damage') ? damage : controls);
