import assert from 'node:assert/strict';
import { campaignDistrict as course } from '../src/campaign-course.js';
import { createStairLayout } from '../src/stair-layout.js';
import { steerToward } from '../trial/qa/ride.mjs';
import { distance, keyboard, openDay, screen } from './doorstep-driver.mjs';
import { readPocket, verifyMapArt } from './doorstep-phone.mjs';

const stairs = createStairLayout(course);
const hud = page => readPocket(page, course.bounds, false);
const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));

async function waitHUD(page, predicate, msg, timeout = 6500) {
  const until = Date.now() + timeout;
  let p;
  do {
    p = await hud(page);
    if (predicate(p)) return p;
    await page.waitForTimeout(30);
  } while (Date.now() < until);
  throw Error(msg + ' ' + JSON.stringify({ plotted: p.plotted, travel: p.hudTravel, floor: p.floor, text: p.text }));
}

async function rideHUD(page, io, line, store = false, observe) {
  let p, maxKph = 0;
  const deadline = Date.now() + 110000, end = line.at(-1);
  while (Date.now() < deadline) {
    p = await hud(page);
    assert.ok(p.hudTravel === 'bike' && p.plotted && !p.motionText, '普通游戏骑行状态不符');
    if (observe) await observe(p);
    const bike = { ...p.plotted, speed: p.hudSpeed / 3.6 };
    maxKph = Math.max(maxKph, p.hudSpeed);
    if (distance(bike, end) < (store ? course.pickup.radius : 4.6) && p.hudSpeed <= 2) {
      await io.keys(['Space']);
      p = await waitHUD(page, d => d.hudSpeed === 0 && (!store || d.interaction === 'pickup'), '到站未停稳');
      await io.keys([]);
      return { p, maxKph };
    }
    await io.keys(steerToward(line, bike));
    await page.waitForTimeout(32);
  }
  throw Error('普通游戏未到站 ' + JSON.stringify(p?.plotted));
}

// The production page exposes no camera hook. Use a real drag to turn and W
// to move, observing displacement on the displayed map to correct each turn.
async function turnView(page, angle) {
  const { width, height } = page.viewportSize();
  let remaining = -wrap(angle) / .005;
  while (Math.abs(remaining) > 1) {
    const dx = Math.max(-width * .38, Math.min(width * .38, remaining));
    await page.mouse.move(width * .5, height * .53);
    await page.mouse.down();
    await page.mouse.move(width * .5 + dx, height * .53, { steps: 4 });
    await page.mouse.up();
    remaining -= dx;
  }
}

async function walkHUD(page, io, camera, target, radius = .27) {
  const until = Date.now() + 18000;
  let p = await hud(page);
  while (Date.now() < until) {
    const a = p.plotted;
    assert.ok(a && p.hudTravel === 'foot');
    const dist = distance(a, target);
    if (dist <= radius) return p;
    const aim = Math.atan2(a.x - target.x, target.z - a.z);
    const change = wrap(aim - camera.h);
    if (Math.abs(change) > .065) { await turnView(page, change); camera.h = aim; }
    const running = dist > 1;
    await io.keys(running ? ['KeyW', 'ShiftLeft'] : ['KeyW']);
    await page.waitForTimeout(Math.max(65, Math.min(380, 1000 * (dist - radius * .50) / (running ? 4.35 : 2.05))));
    await io.keys([]);
    await page.waitForTimeout(85); // Wait one visible HUD refresh after the real release.
    p = await hud(page);
    if (distance(a, p.plotted) > .07) camera.h = Math.atan2(a.x - p.plotted.x, p.plotted.z - a.z);
    else camera.h = p.plotted.heading;
  }
  throw Error('单文件徒步没有接近目标 ' + JSON.stringify({ target, plotted: p.plotted, floor: p.floor }));
}

// Read the street position from the drawn map and the guard's call from the
// HUD. Crossing the coordinates alone does not prove the guard reacted.
function watchGate(checkpoint, report) {
  const posts = ['northPost', 'southPost'].map(id => course.blocks.find(b => b.id === id));
  const lineX = (posts[0].x + posts[1].x) / 2;
  const gate = report.gate = {};
  let previous;
  return async p => {
    const point = p.plotted;
    if (!gate.crossing && previous?.x > lineX && point.x <= lineX) {
      const fraction = (lineX - previous.x) / (point.x - previous.x);
      const z = previous.z + fraction * (point.z - previous.z);
      assert.ok(z > Math.min(...posts.map(b => b.z)) && z < Math.max(...posts.map(b => b.z)), '骑手未从两根门柱间通过');
      gate.crossing = { x: lineX, z };
    }
    previous = point;
    if (!gate.alert && /送餐的.*等一下|巡逻车已出发/.test(p.toast)) {
      gate.alert = { text: p.toast, position: point, speedKph: p.hudSpeed };
      await checkpoint('gate-alert', '北门岗保安喊停', gate.alert);
    }
    if (gate.alert && !gate.chase && p.chaseControls) gate.chase = { position: point, speedKph: p.hudSpeed };
  };
}

export async function deliverFromHUD(page, address, report, { capture, keyboardOnly = false } = {}) {
  const io = keyboard(page);
  async function checkpoint(id, step, details = {}) {
    const item = { id, step, ...details };
    report.steps.push(item);
    if (capture) item.screenshot = await capture(id);
  }
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    report.opening = await openDay(page, address, false, undefined, {
      keyboardOnly,
      onComic: (i, title) => checkpoint('comic-' + (i + 1), title),
    });
    const start = await waitHUD(page, s => !!s.plotted, '未按 M 时没有实车小图');
    assert.ok(distance(start.plotted, course.square) < .65);
    report.mapArt = await verifyMapArt(page, start);
    await checkpoint('accepted', '确认接单，从广场出发', { position: start.plotted, map: start.map });
    const shop = await rideHUD(page, io, course.pickupLine, true);
    await io.tap('Enter');
    const loaded = await waitHUD(page, p => /餐已装箱/.test(p.toast), '取餐后未出现装箱提示');
    await checkpoint('pickup', '红棚停车取餐', { position: shop.p.plotted, peakKph: shop.maxKph, toast: loaded.toast });
    await io.tap('KeyM');
    await screen(page, 'map').getByRole('heading', { name: '骑手导航' }).waitFor();
    await io.tap('KeyM');
    await screen(page, 'ride').waitFor();
    const home = await rideHUD(page, io, course.shortLine, false, watchGate(checkpoint, report));
    assert.ok(report.gate?.crossing && report.gate.alert && report.gate.chase, '未完整观察到越过门柱、保安喊停及追车操作');
    const parked = home.p.plotted, camera = { h: parked.heading };
    await io.tap('KeyF');
    let foot = await waitHUD(page, p => p.hudTravel === 'foot' && !p.motionText && !!p.plotted, '未下车');
    await checkpoint('dismount', '7 号楼停车并下车', { parked, position: foot.plotted });
    const sin = Math.sin(parked.heading), cos = Math.cos(parked.heading);
    const lateral = Math.sign((foot.plotted.x-parked.x)*cos + (foot.plotted.z-parked.z)*sin) || 1;
    const beside = (left, forward) => ({ x: parked.x + cos*left - sin*forward, z: parked.z + sin*left + cos*forward });
    await walkHUD(page, io, camera, beside(lateral*.92, -.87), .19);
    await waitHUD(page, p => p.interaction === 'takeBag', '普通尾箱没有取袋提示');
    await io.tap('Enter');
    const carrying = await waitHUD(page, p => /手持|手提|携带/.test(p.cargoText) && !p.motionText, '接袋未完成');
    await checkpoint('bag', '从尾箱提袋', { cargo: carrying.cargoText, position: carrying.plotted });
    await walkHUD(page, io, camera, beside(lateral*1.04, 1.45));
    await walkHUD(page, io, camera, stairs.outside);
    const floors = new Set();
    for (const target of stairs.route) {
      foot = await walkHUD(page, io, camera, target);
      if (foot.space === 'floor') floors.add(foot.floor);
    }
    assert.deepEqual([...floors].sort(), [1, 2, 3]);
    assert.ok(foot.floor === 3 && (foot.text.includes('302') || foot.labelText.includes('302')));
    await waitHUD(page, p => p.interaction === 'knock', '302门前未出现敲门提示');
    await checkpoint('door-302', '上三层，到 302 门口', { floors: [...floors], interaction: 'knock', location: foot.text });
    await io.tap('Enter');
    await screen(page, 'delivered').waitFor();
    const receipt = await screen(page, 'delivered').innerText();
    assert.match(receipt, /签收|送到了/);
    assert.match(receipt, /302/);
    await checkpoint('receipt', '302 签收回执', { floors: [...floors], receipt });
  } finally { await io.keys([]).catch(() => {}); report.driveKeys = io.counts; }
}
