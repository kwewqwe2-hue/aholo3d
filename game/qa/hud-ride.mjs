import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withQaBrowser } from './browser.mjs';

// Ordinary player entry. Steering decisions use only the painted HUD's arrow,
// distance, speed and interaction prompt. Open the second order's short route on the phone.
const address = new URL(process.argv[2] ?? 'http://127.0.0.1:5188/?classic=1');
address.searchParams.delete('qa');
await withQaBrowser(async ({ page, errors, external }) => {
  await page.goto(address.href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-screen="intro"]').waitFor({ timeout: 16000 });
  assert.equal(await page.evaluate(() => typeof window.riderQA), 'undefined');
  const button = type => page.locator('[data-act="' + type + '"]').first().click();
  const held = new Set();
  async function press(keys) {
    for (const k of [...held]) {
      if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    }
    for (const k of keys) {
      if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    }
  }
  const shot = async name => page.screenshot({ path: fileURLToPath(new URL('./hud-' + name + '.png', import.meta.url)) });
  const hud = () => page.evaluate(() => {
    const field = name => document.querySelector('[data-field="' + name + '"]');
    const content = name => field(name)?.textContent ?? '';
    const guide = content('guide');
    const rawAngle = parseFloat(field('direction')?.firstElementChild?.style.transform?.replace('rotate(', '')) || 0;
    return { screen: document.querySelector('[data-screen]')?.dataset.screen, objective: content('objective'),
      target: content('target'), angle: ((rawAngle % 360 + 540) % 360) - 180, kph: Number(content('speed')),
      distance: Number(guide.match(/沿线\s*(\d+(?:\.\d+)?)\s*米/)?.[1] ?? NaN), guide, near: field('interactButton')?.hidden === false,
      time: content('time'), hp: content('hp'), cash: content('cash'), completed: content('completed'),
      amount: content('amount'), earn: content('earn'), spend: content('spend') };
  });
  const controls = (s) => {
    if (s.near) return s.kph > 6 ? ['KeyS', 'Space'] : [];
    const angle = Math.abs(s.angle);
    let speed = angle > 34 ? 5.1 : angle > 16 ? 8 : angle > 7 ? 11 : 16;
    if (Number.isFinite(s.distance)) speed = Math.min(speed, Math.sqrt(11 * Math.max(0, s.distance - 4.8)));
    const keys = [];
    if (s.kph / 3.6 > speed + 0.6) keys.push('KeyS');
    else if (s.kph / 3.6 < speed - 0.1) keys.push('KeyW');
    if (angle >= 2) keys.push(s.angle > 0 ? 'KeyD' : 'KeyA');
    if (angle > 34) keys.push('Space');
    return keys;
  };
  const traces = [];
  async function rideTo(order, expected, finalLeg) {
    await page.waitForFunction(label => document.querySelector('[data-field="target"]')?.textContent === label, expected);
    const trace = { order, target: expected, samples: [], maxKph: 0 };
    traces.push(trace);
    let lastTime = '';
    let photographed = false;
    const deadline = Date.now() + 350000;
    while (Date.now() < deadline) {
      const s = await hud();
      assert.equal(s.screen, 'ride', JSON.stringify(s));
      assert.equal(s.target, expected);
      trace.maxKph = Math.max(trace.maxKph, s.kph);
      if (s.time !== lastTime && (trace.samples.length === 0 || /[05]$/.test(s.time))) {
        trace.samples.push([s.time, s.distance, s.kph, s.hp]);
        lastTime = s.time;
      }
      if (s.near && s.kph <= 6) {
        await press([]);
        await page.keyboard.press('KeyE');
        await page.waitForFunction(({ label, final }) => final
          ? document.querySelector('[data-screen]')?.dataset.screen === 'delivered'
          : document.querySelector('[data-field="target"]')?.textContent !== label,
        { label: expected, final: finalLeg }, { timeout: 15000 });
        trace.arrival = [s.time, s.guide, s.hp, s.cash];
        console.log('HUD ' + JSON.stringify(trace));
        return;
      }
      await press(controls(s));
      if (!photographed && !finalLeg && s.kph >= 38) {
        photographed = true;
        await shot(order === 1 ? 'driving' : 'rain');
      }
      await page.waitForTimeout(75);
    }
    throw new Error('驾驶未在墙钟限时内结束 ' + expected);
  }
  try {
    await button('skip');
    await button('accept');
    await rideTo(1, '红棚烧腊', false);
    await rideTo(1, '机修里六号', true);
    const first = await hud();
    assert.match(first.amount, /18/);
    assert.match(first.completed, /1\s*\/\s*2/);
    await shot('first-pay');
    await button('continue');
    await button('route');
    await button('accept');
    await rideTo(2, '禾苗面馆', false);
    await page.keyboard.press('KeyM');
    await page.locator('[data-screen="map"]').waitFor();
    await shot('short-map');
    await page.keyboard.press('KeyM');
    await rideTo(2, '北泵房宿舍二栋', true);
    await button('continue');
    await page.locator('[data-screen="dayend"]').waitFor();
    const receipt = await hud();
    assert.match(receipt.completed, /2\s*\/\s*2/);
    assert.match(receipt.amount, /50/);
    await shot('dayend');
    console.log(JSON.stringify({ receipt, traces, external, errors }));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(JSON.stringify({ hud: await hud(), traces, errors, external }));
    await page.screenshot({ path: path.join(tmpdir(), 'rider-qa-hud-interrupted.png') });
    throw error;
  } finally {
    await press([]);
  }
});
