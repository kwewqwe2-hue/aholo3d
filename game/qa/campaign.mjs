// node qa/campaign.mjs [local URL] [--public] [--enter] [--ride] [--mobile] [--map] [--gate] [--photos] [--final-map] [--no-save]
// node qa/campaign.mjs --offline "dist/牛逼外卖-第一天.html" [--no-save]
// --ride uses the doorstep regression. --mobile checks both narrow HUDs and runs the full touch delivery once.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withQaBrowser } from './browser.mjs';
import { pickup } from './doorstep-driver.mjs';
import { keyDriver, steerToward } from '../trial/qa/ride.mjs';

const titles = ['我的工位，先下班了。', '工牌换头盔。', '广场见，骑手上线。'];
const originalCloche = 'M2 16h19M4 14c0-5 3-8.5 8-9l-2.8 5.5 4.8-2-2 5.5H4ZM15 5.3c3.7 1.2 5.2 4 5.4 7.7h-5.8M6 19h11';
const screen = (page, name) => page.locator('.nb-ui[data-screen="' + name + '"]');
const field = (page, name) => page.locator('[data-field="' + name + '"]');
const button = (page, name) => page.locator('[data-act="' + name + '"]');
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const lengthOf = line => line.slice(1).reduce((sum, p, i) => sum + distance(line[i], p), 0);
const round = value => Number(value.toFixed(2));
const log = (event, details) => console.log(event + ' ' + JSON.stringify(details));
const saveShots = !process.argv.includes('--no-save');
const waitForFinalModels = process.argv.includes('--final-map') || process.argv.includes('--offline');

async function shot(page, name) {
  const filename = fileURLToPath(new URL('./campaign-' + name + '.png', import.meta.url));
  const png = await page.screenshot({ path: saveShots ? filename : undefined, scale: 'css' });
  const { width, height } = page.viewportSize();
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height], '截图尺寸与测试视口不符');
  if (saveShots) log('截图', filename);
  return png;
}

async function open(page, address, withBridge = false) {
  await page.goto(address.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.nb-ui[data-screen],vite-error-overlay,#fault:not([hidden])'),
    null, { timeout: 25000 });
  assert.equal(await page.locator('vite-error-overlay,#fault:not([hidden])').count(), 0,
    '默认入口启动失败 ' + (await page.locator('body').innerText()).slice(0, 350));
  await screen(page, 'intro').waitFor();
  assert.equal(await page.evaluate(() => !!window.campaignQA), withBridge);
  if (waitForFinalModels) {
    await page.waitForFunction(() => ['ready', 'partial', 'failed'].includes(document.documentElement.dataset.models) ||
      !!document.querySelector('#fault:not([hidden])'), null, { timeout: 60000 });
    const loaded = await page.locator('html').getAttribute('data-models');
    assert.equal(loaded, 'ready', '正式场景资源未全部就绪');
    log('实机场景', { models: loaded });
  }
}

async function cloche(page, host) {
  const icon = page.locator(host + ' svg').first();
  assert.ok(await icon.isVisible(), '未显示餐罩 ' + host);
  const paths = await icon.locator('path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
  assert.ok(paths.includes(originalCloche), '餐罩线稿与旧版不同 ' + host);
}

async function comics(page, capture = false) {
  for (const [i, title] of titles.entries()) {
    const comic = screen(page, 'intro');
    await comic.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.ok(await comic.getByLabel('第 ' + (i + 1) + ' 页，共 3 页').isVisible());
    const art = comic.locator('.nb-frame [role="img"]');
    assert.equal(await art.count(), 2);
    assert.ok(await art.first().isVisible() && await art.last().isVisible(), '漫画画格未显示');
    if (i === 2) assert.match(await comic.locator('blockquote').innerText(), /成功送达一单/);
    await cloche(page, '.nb-comic .nb-brand');
    if (capture) await shot(page, 'comic-' + (i + 1));
    if (i === 1) await page.keyboard.press('Enter');
    else await button(page, 'next').click();
  }
}

// A day label by itself does not exercise selection. Keep the remaining checks running
// on builds that can accept the order but lack an actionable day selector.
async function takeOrder(page, findings, capture = false) {
  const choose = page.getByRole('button', { name: /第一天|第\s*1\s*天/i })
    .or(page.getByRole('radio', { name: /第一天|第\s*1\s*天/i }))
    .or(page.getByRole('tab', { name: /第一天|第\s*1\s*天/i })).first();
  await page.locator('.nb-phone').or(choose).first().waitFor();
  if (await choose.isVisible()) {
    assert.ok(!await button(page, 'accept').isVisible(), '选第一天之前即显示确认接单');
    if (capture) await shot(page, 'day-select');
    await choose.click();
  } else {
    const actions = await page.locator('.nb-ui button:visible').allInnerTexts();
    findings.push('翻完第三页后没有可点击的“第一天”选项。可用按钮：' + actions.join('、'));
  }
  const phone = page.locator('.nb-phone');
  const accept = phone.getByRole('button', { name: '确认接单' });
  await accept.waitFor();
  assert.match(await field(page, 'shop').innerText(), /红棚/);
  assert.match(await field(page, 'home').innerText(), /7\s*号楼|七号楼/);
  await cloche(page, '.nb-phone-top');
  if (capture) await shot(page, 'offer');
  await accept.click();
  await screen(page, 'ride').waitFor();
  assert.match(await field(page, 'objective').innerText(), /取餐/);
  assert.match(await field(page, 'target').innerText(), /红棚/);
  await cloche(page, '.nb-nav-label .nb-brand-mark');
}

async function ordinaryEntry({ page }, address, findings, capture) {
  await open(page, address);
  await comics(page, capture);
  await takeOrder(page, findings, capture);
  log('普通入口', { url: page.url(), target: await field(page, 'target').innerText() });
}

async function enterConfirmation({ page }, address, clickHeading, capture) {
  await open(page, address);
  if (clickHeading) await button(page, 'skip').click();
  else for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await confirmWithEnter(page, clickHeading, capture);
}

async function confirmWithEnter(page, clickHeading, capture) {
  const choose = button(page, 'selectDay'), accept = button(page, 'accept');
  await choose.waitFor();
  assert.equal(await accept.isVisible(), false);
  if (clickHeading) await page.getByRole('heading', { name: '选择关卡' }).click();
  const focus = await page.evaluate(() => document.activeElement.dataset.act ?? document.activeElement.tagName);
  if (clickHeading) assert.notEqual(focus, 'selectDay', '未复现焦点移出第一天按钮的前提');
  else assert.equal(focus, 'selectDay', '键盘翻页后焦点未落在第一天');
  await page.keyboard.press('Enter');
  const afterFirst = { screen: await page.locator('.nb-ui').getAttribute('data-screen'),
    dayVisible: await choose.isVisible(), confirmVisible: await accept.isVisible() };
  if (afterFirst.screen === 'ride' && capture) await shot(page, 'select-enter-bypass');
  assert.deepEqual(afterFirst, { screen: 'offer', dayVisible: false, confirmVisible: true },
    '首次 Enter 必须显示订单并等待确认');
  if (capture) await shot(page, 'select-enter-confirmed');
  if (clickHeading) await field(page, 'title').click();
  await page.keyboard.press('Enter');
  await screen(page, 'ride').waitFor();
  assert.match(await field(page, 'target').innerText(), /红棚/);
  log('两次独立 Enter', { entry: page.url(), focus, afterFirst, afterSecond: 'ride', target: await field(page, 'target').innerText() });
}

// Scan the browser's already-rendered screenshot. The temporary canvas is detached
// from the document and does not touch the game's canvas, clock, styles or vehicle.
async function healthBar(page, name) {
  const meter = field(page, 'hpMeter');
  await meter.waitFor();
  const { x, y, width, height } = await meter.boundingBox();
  const hp = Number(await field(page, 'hp').textContent());
  const value = await meter.evaluate(el => el.value);
  assert.equal(value, hp);
  const png = await shot(page, name);
  const pixels = await page.evaluate(async ({ bytes, bounds }) => {
    const data = Uint8Array.from(atob(bytes), char => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
    const { x, y, width, height } = bounds;
    const w = Math.round(width), h = Math.round(height);
    const ctx = new OffscreenCanvas(w, h).getContext('2d');
    ctx.drawImage(bitmap, Math.round(x), Math.round(y), w, h, 0, 0, w, h);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, w, h).data;
    let longest = 0;
    for (let row = Math.floor(h / 4); row < Math.ceil(h * 3 / 4); row++) {
      let streak = 0;
      for (let col = 0; col < w; col++) {
        const offset = (row * w + col) * 4;
        const [r, g, b] = rgba.subarray(offset, offset + 3);
        const yellow = r >= 175 && g >= 125 && b <= 140 && r - b > 75 && g - b > 45 && r >= g * .9;
        streak = yellow ? streak + 1 : 0;
        longest = Math.max(longest, streak);
      }
    }
    return longest;
  }, { bytes: png.toString('base64'), bounds: { x, y, width, height } });
  const result = { hp, yellowPixels: pixels, trackWidth: round(width) };
  log('黄条', { name, ...result });
  return result;
}

async function mobileLayout(page, width, height, findings) {
  const layout = await page.evaluate(() => {
    function box(el) {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    }
    const panels = ['.nb-pocket-nav', '.nb-gauges', '.nb-pause-key', '.nb-road-info', '.nb-toast', '.nb-mount-key', '.nb-interact', '.nb-touch'];
    const regions = Object.fromEntries(panels.filter(name => document.querySelector(name)?.getClientRects().length)
      .map(name => [name, box(document.querySelector(name))]));
    const buttons = [...document.querySelectorAll('.nb-hud button')].filter(el => el.getClientRects().length)
      .map(el => {
        const rect = box(el);
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { name: el.getAttribute('aria-label') || el.innerText.trim(), action: el.dataset.control || el.dataset.act,
          ...rect, hit: top?.closest('button') === el };
      });
    return { width: innerWidth, height: innerHeight, touch: navigator.maxTouchPoints, regions, buttons };
  });
  assert.equal(layout.width, width);
  assert.equal(layout.height, height);
  assert.ok(layout.touch > 0);
  const fits = ({ x, y, width: w, height: h }) =>
    w > 0 && h > 0 && x >= -1 && y >= -1 && x + w <= width + 1 && y + h <= height + 1;
  const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
  const regions = Object.entries(layout.regions);
  const roadView = { x: width * .2, y: height * .35, width: width * .6, height: height * .3 };
  for (const [name, box] of regions) {
    if (!fits(box) || overlap(box, roadView)) findings.push(width + 'px HUD 越界或遮挡路中央 ' + name);
  }
  for (const [i, [name, box]] of regions.entries()) {
    for (const [other, next] of regions.slice(i + 1)) {
      if (overlap(box, next)) findings.push(width + 'px HUD 区域重叠 ' + name + ' / ' + other);
    }
  }
  for (const [i, box] of layout.buttons.entries()) {
    if (!fits(box) || !box.hit || Math.min(box.width, box.height) < 44) {
      findings.push(width + 'px 按钮越界、被盖住或过小 ' + box.name);
    }
    for (const next of layout.buttons.slice(i + 1)) {
      if (overlap(box, next)) findings.push(width + 'px 按钮重叠 ' + box.name + ' / ' + next.name);
    }
  }
  return layout;
}

async function mobile({ page, context }, address, width, height, findings) {
  // Keep the original disposable context's routing and error listeners for touch runs.
  await page.setViewportSize({ width, height });
  const device = await context.newCDPSession(page);
  await device.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height,
  });
  await device.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await open(page, address);
  await comics(page);
  await takeOrder(page, findings);
  const layout = await mobileLayout(page, width, height, findings);
  const bar = await healthBar(page, 'hud-' + width);
  if (!bar.yellowPixels) findings.push(width + 'px 满车况时截图中未见黄色填充');
  const throttle = layout.buttons.find(box => box.action === 'throttle');
  assert.ok(throttle, '未显示触屏油门');
  const contact = { x: throttle.x + throttle.width / 2, y: throttle.y + throttle.height / 2 };
  await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact] });
  try {
    await page.waitForFunction(() => Number(document.querySelector('[data-field="speed"]').textContent) >= 5,
      null, { timeout: 12000 });
  } finally {
    await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  log('触屏实测', { width, height, speed: await field(page, 'speed').innerText(), ...layout.regions,
    buttons: layout.buttons.map(box => [box.name, box.hit, round(box.width), round(box.height)]) });
}

const read = page => page.evaluate(() => window.campaignQA.state());
const pose = bike => [round(bike.x), round(bike.z), round(bike.speed)];

async function park(page, io) {
  await io.keys(['Space']);
  await page.waitForFunction(() => window.campaignQA.state().bike.speed === 0 &&
    document.querySelector('[data-field="speed"]')?.textContent === '0');
  await io.keys([]);
  return read(page);
}

async function storefrontPickup(page, io, course) {
  const start = await read(page);
  assert.equal(start.leg, 'pickup');
  assert.ok(distance(start.bike, course.square) < 1 && start.bike.speed === 0);
  assert.ok(start.route.length >= 2 && distance(start.route.at(-1), course.pickup) < 1);
  const shop = course.landmarks.market, stop = course.pickup;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const front = { x: clamp(stop.x, shop.x - shop.w / 2, shop.x + shop.w / 2),
    z: clamp(stop.z, shop.z - shop.d / 2, shop.z + shop.d / 2) };
  const line = approachForPhoto(start.route, stop, front);
  await io.tap('Enter');
  assert.equal((await read(page)).leg, 'pickup', '广场可以提前取餐');
  const deadline = Date.now() + 80000;
  let meters = 0, last = start.bike, peak = 0, movingEnter = false;
  while (Date.now() < deadline) {
    const s = await read(page);
    assert.equal(s.stage, 'ride');
    assert.equal(s.leg, 'pickup');
    meters += distance(last, s.bike);
    peak = Math.max(peak, Math.abs(s.bike.speed));
    last = s.bike;
    if (!movingEnter && s.near && s.bike.speed > 1.5) {
      await io.tap('Enter');
      assert.equal((await read(page)).leg, 'pickup', '尚在骑行就已取餐');
      movingEnter = true;
    }
    if (s.near && Math.abs(s.bike.speed) < .15) {
      const stopped = await park(page, io);
      assert.ok(meters >= distance(course.square, course.pickup) - (course.pickup.radius ?? 5) - .3 && peak > 4,
        '未实际从广场骑到店');
      assert.equal(stopped.interaction?.kind, 'pickup');
      await button(page, 'interact').waitFor();
      assert.equal(await field(page, 'interaction').innerText(), stopped.interaction.label);
      await shot(page, 'pickup-front');
      await io.tap('Enter');
      const loaded = await read(page);
      assert.equal(loaded.leg, 'dropoff');
      assert.ok(!loaded.passedGate && distance(loaded.bike, stopped.bike) < .2, '取餐后起点与停车处不符');
      assert.match(await field(page, 'target').innerText(), /门岗/);
      log('广场到红棚', { start: pose(start.bike), stop: pose(stopped.bike), riddenMeters: round(meters),
        guidedMeters: start.routeMeters, peakKph: round(peak * 3.6), movingEnter, next: loaded.targetLabel });
      return loaded.bike;
    }
    await io.keys(steerToward(line, s.bike));
    await page.waitForTimeout(45);
  }
  throw new Error('未在红棚停稳，最后实车位置 ' + JSON.stringify(pose(last)));
}

function nearestOnLine(point, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz));
  }
  return best;
}

// Choose a point which actually distinguishes the two live routes, including
// on maps with different turn names, lengths, or orientation.
function laneWitness(line, opposite) {
  const candidates = line.map(point => ({ point, separation: nearestOnLine(point, opposite) }));
  return candidates.reduce((best, item) => item.separation > best.separation ? item : best);
}

function mapMeasurements(course, requireFinal) {
  const { square, pickup, gate, finish, bounds, mainLine, shortLine } = course;
  const outer = laneWitness(mainLine, shortLine), arbor = laneWitness(shortLine, mainLine);
  const position = p => [round(p.x), round(p.z)];
  const street = distance(square, pickup);
  const gateFraction = ((gate.x - square.x) * (pickup.x - square.x) + (gate.z - square.z) * (pickup.z - square.z)) /
    (street * street);
  const measurements = { square: position(square), pickup: position(pickup), gate: position(gate),
    finish: position(finish), street: round(street), gateFraction: round(gateFraction),
    outerMeters: round(lengthOf(mainLine)), arborMeters: round(lengthOf(shortLine)),
    outerWitness: position(outer.point), arborWitness: position(arbor.point) };
  log('实机地图', measurements);
  if (!requireFinal) return;
  const eastStreet = (square.x + pickup.x) / 2;
  assert.ok(street >= 80 && street <= 140 && Math.abs(pickup.z - square.z) > 3 * Math.abs(pickup.x - square.x),
    '当前入口尚非约 110 米的纵向商街');
  assert.ok(eastStreet > (bounds.minX + bounds.maxX) / 2 && gateFraction > .15 && gateFraction < .85,
    '商街或门岗位置与正式俯视图不符');
  assert.ok([outer.point, arbor.point, finish].every(p => p.x < eastStreet) && Math.min(outer.separation, arbor.separation) > 3,
    '商街左侧未找到两条可区分的院内路线及楼门');
}

// The plaza and the storefront share the same northbound merchant street.
// In an offline build the phone's arrival icon is visible before the stopped
// pickup action. Drive using those two cues without a QA bridge.
async function stopAtShop(page) {
  const io = keyDriver(page);
  let peak = 0;
  try {
    const deadline = Date.now() + 75000;
    while (Date.now() < deadline) {
      const hud = await page.evaluate(() => {
        const interact = document.querySelector('[data-act="interact"][data-context="pickup"]');
        return { kph: Number(document.querySelector('[data-field="speed"]').textContent),
          arriving: document.querySelector('[data-field="direction"]').dataset.icon === 'bag',
          pickup: !!interact?.getClientRects().length && !interact.disabled };
      });
      peak = Math.max(peak, hud.kph);
      if (hud.pickup && hud.kph === 0) {
        assert.ok(peak > 10, '未实际从广场骑到红棚');
        return peak;
      }
      await io.keys(hud.arriving ? ['Space'] : hud.kph < 20 ? ['KeyW'] : []);
      await page.waitForTimeout(55);
    }
    throw Error('沿商街未到达可停稳取餐的位置');
  } finally { await io.keys([]); }
}

async function checkPhone(page) {
  const phone = screen(page, 'map');
  await phone.getByRole('heading', { name: '骑手导航' }).waitFor();
  await cloche(page, '.nb-nav-mast .nb-brand-mark');
  assert.match(await phone.locator('.nb-address').innerText(), /7\s*号楼\s*·\s*302/);
  assert.ok((await field(page, 'guide').innerText()).trim(), '手机缺少下一步导航');
  assert.ok(await phone.getByRole('button', { name: /收起手机/ }).isVisible());
}

async function offline({ page, context }, address, capture) {
  // The shared browser blocks arbitrary URLs. Allow only this explicit main file
  // for this tab while Chromium itself is offline.
  await page.route(candidate => candidate.href === address.href, route => route.continue());
  const webRequests = [];
  page.on('request', req => { if (/^https?:/.test(req.url())) webRequests.push(req.url()); });
  page.on('websocket', ws => webRequests.push(ws.url()));
  const hash = createHash('sha256').update(await readFile(address)).digest('hex');
  await context.setOffline(true);
  await open(page, address);
  await comics(page);
  await confirmWithEnter(page, true, false);
  const peakKph = await stopAtShop(page);
  await page.keyboard.press('Enter');
  await field(page, 'timerFace').waitFor(); // Loading the box starts the delivery bonus clock.
  assert.match(await field(page, 'target').innerText(), /门岗/, '取餐后应导航至门岗');
  if (capture) await shot(page, 'offline-pickup');
  await page.keyboard.press('KeyM');
  await checkPhone(page);
  const imageSize = await page.locator('image.nb-map-reference').evaluate(async img => {
    const href = img.href.baseVal;
    if (!href.startsWith('data:image/webp;base64,')) throw Error('离线地图未内嵌底图');
    const bytes = Uint8Array.from(atob(href.split(',')[1]), c => c.charCodeAt(0));
    const raster = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
    const size = [raster.width, raster.height];
    raster.close();
    return size;
  });
  assert.deepEqual(imageSize, [1536, 1024]);
  if (capture) await shot(page, 'offline-map');
  await page.keyboard.press('KeyM');
  await screen(page, 'ride').waitFor();
  assert.deepEqual(webRequests, []);
  log('离线红棚取餐', { file: fileURLToPath(address), sha256: hash, peakKph,
    next: await field(page, 'target').innerText(), map: imageSize, webRequests });
}

// The image is checked against the original artwork on disk. Marker positions
// are converted back from the rendered SVG to original-image pixels; the
// independent expectation comes from the live world bounds, never a waypoint list.
async function mapOverlay(page, reference, handset) {
  const raster = page.locator('svg.nb-cartography image.nb-map-reference');
  await raster.waitFor();
  return raster.evaluate(async (img, { original, handset }) => {
    const svg = img.ownerSVGElement;
    const encoded = img.href.baseVal;
    if (!encoded.startsWith('data:image/webp;base64,')) throw Error('底图不是内嵌 WebP');
    const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const webp = bytes(encoded.split(',')[1]);
    const [art, actual] = await Promise.all([
      createImageBitmap(new Blob([bytes(original)], { type: 'image/png' })),
      createImageBitmap(new Blob([webp], { type: 'image/webp' })),
    ]);
    const w = art.width, h = art.height;
    const ctx = new OffscreenCanvas(60, 40).getContext('2d', { willReadFrequently: true });
    function samples(image) {
      ctx.drawImage(image, 0, 0, 60, 40);
      return ctx.getImageData(0, 0, 60, 40).data;
    }
    const expected = samples(art), rendered = samples(actual);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) if (i % 4 !== 3) difference += Math.abs(expected[i] - rendered[i]);
    const imageSize = [actual.width, actual.height];
    art.close(); actual.close();
    const digest = await crypto.subtle.digest('SHA-256', webp);
    const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
    const d = window.campaignQA.district, s = window.campaignQA.state();
    const bounds = d.bounds;
    const fromWorld = p => [w * (p.x - bounds.minX) / (bounds.maxX - bounds.minX),
      h * (p.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)];
    const { x, y, width, height } = img.getBBox();
    const inverse = img.getScreenCTM().inverse();
    const onImage = (el, px = 0, py = 0) => {
      const pt = new DOMPoint(px, py).matrixTransform(el.getScreenCTM()).matrixTransform(inverse);
      return [(pt.x - x) / width * w, (pt.y - y) / height * h];
    };
    const markers = [];
    if (handset) {
      const goal = s.target.id === d.gate.id ? d.finish : s.target;
      markers.push({ name: '目的地旗', expected: fromWorld(goal), drawn: onImage(svg.querySelector('.nb-map-flag')) });
    } else {
      const groups = [...svg.querySelectorAll('g > title')];
      for (const p of [d.square, d.pickup, d.finish]) {
        const title = groups.find(el => el.textContent.includes(p.label));
        if (!title) throw Error('派单图缺少标记 ' + p.label);
        markers.push({ name: p.label, expected: fromWorld(p), drawn: onImage(title.parentElement) });
      }
    }
    const cursor = svg.querySelector(s.travelMode === 'foot' ? '[aria-label="步行位置及朝向"]' : '[aria-label="骑手及车头方向"]');
    const drawn = onImage(cursor), tip = onImage(cursor, 0, -1);
    markers.push({ name: '骑手', expected: fromWorld(s.actor), drawn });
    const dx = tip[0] - drawn[0], dz = tip[1] - drawn[1];
    const headingDot = (-Math.sin(s.actor.heading) * dx + Math.cos(s.actor.heading) * dz) / Math.hypot(dx, dz);
    const tracks = [[svg.querySelector('polyline.nb-map-current'), s.route]];
    if (handset && s.target.id === d.gate.id) {
      const lane = s.routeMode === 'short' ? d.shortLine : d.mainLine;
      const gate = lane.findIndex(p => p.id === d.gate.id);
      if (gate < 0) throw Error('推荐路线缺少门岗');
      tracks.push([svg.querySelector('polyline:not(.nb-map-current):not([stroke-dasharray])'), lane.slice(gate)]);
    }
    let routeError = 0, routePoints = 0;
    for (const [track, expected] of tracks) {
      if (track?.points.numberOfItems !== expected.length) throw Error('画面路线顶点数与实车导航不一致');
      routePoints += expected.length;
      expected.forEach((p, i) => {
        const pt = track.points.getItem(i), at = onImage(track, pt.x, pt.y), target = fromWorld(p);
        routeError = Math.max(routeError, Math.hypot(at[0] - target[0], at[1] - target[1]));
      });
    }
    return { originalSize: [w, h], imageSize, hash, colorDifference: difference / (60 * 40 * 3),
      markers, headingDot, routeError, routePoints, imageRatio: width / height };
  }, { original: reference.toString('base64'), handset });
}

async function verifyMap({ page }, address, width, capture) {
  if (width === 360) await page.setViewportSize({ width, height: 800 });
  const ref = await readFile(new URL('../art/reference/住宅区俯视-右侧商街与院内双路线.png', import.meta.url));
  const url = new URL(address);
  url.searchParams.set('qa', '1');
  await open(page, url, true);
  const course = await page.evaluate(() => window.campaignQA.district);
  mapMeasurements(course, capture);
  await button(page, 'skip').click();
  await button(page, 'selectDay').click();
  const offer = await mapOverlay(page, ref, false);
  await button(page, 'accept').click();
  await pickup(page, keyDriver(page), course);
  await page.keyboard.press('KeyM');
  await checkPhone(page);
  const expanded = await mapOverlay(page, ref, true);
  if (capture) await shot(page, 'map-gate-' + width);
  const firstRoute = (await read(page)).routeMode;
  await button(page, 'route').click();
  assert.notEqual((await read(page)).routeMode, firstRoute, '手机未切换配送路线');
  const alternate = await mapOverlay(page, ref, true);
  await page.keyboard.press('KeyM');
  await screen(page, 'ride').waitFor();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => {
    const s = window.campaignQA.state();
    return s.travelMode === 'foot' && s.motion.type === 'none';
  });
  const foot = await read(page);
  assert.ok(distance(foot.actor, foot.bike) > .5, '下车后仍无法区分人、车位置');
  await button(page, 'map').click();
  await checkPhone(page);
  const walking = await mapOverlay(page, ref, true);
  for (const [screenName, map] of [['接单', offer], ['骑行导航', expanded], ['切换路线', alternate], ['步行导航', walking]]) {
    assert.deepEqual(map.originalSize, [1536, 1024]);
    assert.deepEqual(map.imageSize, map.originalSize);
    assert.equal(map.hash, offer.hash, '接单与手机导航应使用同一张原图');
    assert.ok(map.headingDot > .999, '地图朝向偏离可控角色 ' + screenName);
    assert.ok(Math.abs(map.imageRatio - 1.5) < .015 && map.colorDifference < 10, '底图变形、裁切或与原图不符');
    for (const marker of map.markers) {
      assert.ok(Math.hypot(marker.drawn[0] - marker.expected[0], marker.drawn[1] - marker.expected[1]) < 1,
        '地图标记错位 ' + JSON.stringify(marker));
    }
    assert.ok(map.routeError < 2, '地图路线偏离实车路线 ' + map.routeError);
    log('底图核对', { width, screenName, originalSize: map.originalSize, encodedSize: map.imageSize,
      colorDifference: round(map.colorDifference), routePoints: map.routePoints, routeErrorPx: round(map.routeError),
      markers: map.markers.map(p => [p.name, ...p.drawn.map(round)]) });
  }
  await screen(page, 'map').getByRole('button', { name: /收起手机/ }).click();
  await screen(page, 'ride').waitFor();
}

async function repeatGate({ page }, address, findings) {
  const url = new URL(address);
  url.searchParams.set('qa', '1');
  await open(page, url, true);
  const course = await page.evaluate(() => window.campaignQA.district);
  await button(page, 'skip').click();
  await takeOrder(page, findings);
  const io = keyDriver(page);
  await pickup(page, io, course);
  let checkpoint = 0;
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const s = await read(page);
      assert.ok(s.stage === 'ride' && s.leg === 'dropoff');
      const meters = distance(s.bike, course.gate);
      const due = [!s.passedGate && s.guard.phase === 'posted' && meters < 15,
        s.passedGate && s.guard.phase === 'alert', s.guard.phase === 'chasing' && meters > 12];
      if (due[checkpoint]) {
        const name = ['gate-before', 'gate-repeat', 'gate-after'][checkpoint++];
        await shot(page, name);
        log('门岗机位', { name, bike: pose(s.bike), gateMeters: round(meters), phase: s.guard.phase });
        if (checkpoint === 3) return;
      }
      await io.keys(steerToward(course.mainLine, s.bike));
      await page.waitForTimeout(45);
    }
    throw new Error('门岗三处机位未全部骑到');
  } finally { await io.keys([]); }
}

// Aim the bike itself toward a landmark by riding in from the other side.
// Neither the camera nor the vehicle is repositioned by the test.
function approachForPhoto(line, stop, subject) {
  const length = distance(stop, subject);
  assert.ok(length > 0);
  const approach = { x: stop.x - 12 * (subject.x - stop.x) / length,
    z: stop.z - 12 * (subject.z - stop.z) / length };
  let nearest = 0;
  for (let i = 1; i < line.length; i++) {
    if (distance(line[i], approach) < distance(line[nearest], approach)) nearest = i;
  }
  return [...line.slice(0, nearest), approach, stop];
}

async function landmarkPhotos({ page }, address, findings) {
  const url = new URL(address);
  url.searchParams.set('qa', '1');
  await open(page, url, true);
  const course = await page.evaluate(() => window.campaignQA.district);
  await button(page, 'skip').click();
  await takeOrder(page, findings);
  const io = keyDriver(page);
  try {
    await storefrontPickup(page, io, course);
    const { court, fork } = course.landmarks;
    const gap = distance(court, fork), dx = (fork.x - court.x) / gap, dz = (fork.z - court.z) / gap;
    const edge = Math.min(court.w / (2 * Math.abs(dx)), court.d / (2 * Math.abs(dz)));
    const stop = { x: court.x + dx * (edge + 4), z: court.z + dz * (edge + 4) };
    const line = approachForPhoto(course.mainLine, stop, court);
    const deadline = Date.now() + 70000;
    while (Date.now() < deadline) {
      const s = await read(page);
      assert.ok(s.stage === 'ride' && s.leg === 'dropoff');
      if (s.passedGate && distance(stop, s.bike) < 4.5 && Math.abs(s.bike.speed) < .15) {
        const parked = await park(page, io);
        await shot(page, 'courtside');
        log('球场边停车', { pos: pose(parked.bike), courtMeters: round(distance(parked.bike, court)) });
        return;
      }
      await io.keys(steerToward(line, s.bike));
      await page.waitForTimeout(45);
    }
    throw Error('未能驶到球场边机位');
  } finally { await io.keys([]); }
}

async function runCase(name, task) {
  const findings = [];
  try {
    await withQaBrowser(async ctx => {
      ctx.page.setDefaultTimeout(12000);
      const consoleErrors = [];
      ctx.page.on('console', msg => {
        if (msg.type() === 'error') for (const arg of msg.args()) {
          consoleErrors.push(arg.evaluate(value => value?.stack || String(value)).catch(() => msg.text()));
        }
      });
      try {
        await task(ctx, findings);
      } catch (error) {
        const hud = await ctx.page.locator('.nb-ui,#fault:not([hidden])').allInnerTexts().catch(() => []);
        findings.push(error.message + ' ' + hud.join(' ').slice(0, 550));
        if (waitForFinalModels && await ctx.page.locator('#fault:not([hidden])').isVisible()) {
          await shot(ctx.page, 'startup-fault');
          for (const stack of await Promise.all(consoleErrors)) findings.push(stack.slice(0, 1050));
        }
      }
      for (const err of ctx.errors) findings.push('浏览器异常 ' + err);
      for (const url of ctx.external) findings.push('拦截了外部请求 ' + url);
      log('浏览器记录', { name, browser: ctx.browser.version(), errors: ctx.errors, external: ctx.external });
    });
  } catch (error) { findings.push(error.message); }
  const distinct = [...new Set(findings)];
  log(distinct.length ? '未通过' : '通过', { name, findings: distinct });
  return distinct.length;
}

function runDoorstep(mode, address) {
  const entry = fileURLToPath(new URL('./doorstep.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [entry, mode, address.href, '--check'], { stdio: 'inherit', windowsHide: true });
  log(child.status === 0 ? '通过' : '未通过', { name: '到户实机 ' + mode, code: child.status,
    signal: child.signal, error: child.error?.message });
  return child.status === 0 ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--offline') {
    assert.ok(args.length === 2 || (args.length === 3 && args[2] === '--no-save'), '请提供单文件成品路径');
    const address = pathToFileURL(path.resolve(args[1]));
    return runCase('离线成品', ctx => offline(ctx, address, args[2] !== '--no-save'));
  }
  const flags = args.filter(arg => arg.startsWith('--'));
  assert.ok(flags.every(flag => ['--public', '--ride', '--mobile', '--enter', '--map', '--gate', '--photos', '--final-map', '--no-save'].includes(flag)));
  const url = new URL(args.find(arg => !arg.startsWith('--')) ?? 'http://127.0.0.1:5188/');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol),
    '仅支持本机试玩地址');
  const root = new URL('/', url), alias = new URL('/trial/', url);
  const modes = flags.filter(flag => flag !== '--final-map' && flag !== '--no-save');
  const selected = name => !modes.length || modes.includes('--' + name);
  let failures = 0;
  if (selected('public')) {
    for (const address of [root, alias]) failures += await runCase('普通 ' + address.pathname,
      (ctx, issues) => ordinaryEntry(ctx, address, issues, address.pathname === '/'));
  }
  if (selected('enter') || modes.includes('--public')) {
    for (const address of [root, alias]) {
      const moved = address.pathname === '/trial/';
      failures += await runCase('Enter 逐步确认 ' + address.pathname,
        ctx => enterConfirmation(ctx, address, moved, moved && !modes.includes('--enter')));
    }
  }
  if (selected('ride')) failures += runDoorstep('regression', url.pathname === '/trial/' ? alias : root);
  if (selected('mobile')) {
    for (const [w, h, address] of [[360, 800, root], [390, 844, alias]]) {
      failures += await runCase('竖屏 ' + w, (ctx, issues) => mobile(ctx, address, w, h, issues));
    }
    failures += runDoorstep('mobile', root);
  }
  if (modes.includes('--map') || (selected('ride') && flags.includes('--final-map'))) {
    for (const width of [1280, 360]) failures += await runCase('原画底图 ' + width,
      ctx => verifyMap(ctx, root, width, flags.includes('--final-map')));
  }
  if (modes.includes('--gate')) failures += await runCase('门岗前后复查', (ctx, issues) => repeatGate(ctx, root, issues));
  if (modes.includes('--photos')) failures += await runCase('店面与球场实机', (ctx, issues) => landmarkPhotos(ctx, root, issues));
  return failures;
}

process.exitCode = (await main()) ? 1 : 0;
