import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { campaignDistrict } from '../src/campaign-course.js';
import { withQaBrowser } from './browser.mjs';
import { distance, openDay } from './doorstep-driver.mjs';
import { readPocket } from './doorstep-phone.mjs';
import { project } from './doorstep-source.mjs';

// Use the public page's speedometer and the position actually drawn on its phone.
const server = await createServer({ root: project, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false } });
try {
  await server.listen();
  await withQaBrowser(async ({ page, errors, external }) => {
    await openDay(page, new URL(server.resolvedUrls.local[0]));
    assert.equal(await page.evaluate(() => typeof window.campaignQA), 'undefined');
    const keys = page.keyboard;
    const speed = () => page.locator('[data-field="speed"]:visible').innerText().then(Number);
    const position = async () => (await readPocket(page, campaignDistrict.bounds)).plotted;
    async function accelerate() {
      await keys.down('KeyW');
      await page.waitForFunction(() => Number(document.querySelector('[data-field="speed"]').textContent) >= 12);
    }
    async function changeFrom(before) {
      await page.waitForFunction(start => {
        const reading = Number(document.querySelector('[data-field="speed"]').textContent);
        return reading <= start - 2 || reading >= start + 4;
      }, before);
      return speed();
    }
    async function brake() {
      await keys.down('Space');
      await page.waitForFunction(() => Number(document.querySelector('[data-field="speed"]').textContent) === 0);
      await keys.up('Space');
    }

    await accelerate();
    await keys.down('ControlLeft');
    const release = await speed();
    await keys.up('KeyW');
    await keys.up('ControlLeft');
    const coast = await changeFrom(release);
    assert.ok(coast < release, `松开 W 时 Ctrl 仍按着，双手松开后车速从 ${release} 变成 ${coast}`);
    await brake();

    await accelerate();
    await keys.down('ArrowUp');
    const overlap = await speed();
    await keys.up('KeyW');
    const pulling = await changeFrom(overlap);
    assert.ok(pulling > overlap, `松开 W 后 ↑ 仍按着，车速从 ${overlap} 变成 ${pulling}`);
    await keys.up('ArrowUp');
    await brake();

    await keys.press('KeyF');
    await page.locator('.nb-hud[data-travel="foot"] [data-act="mount"]:visible').waitFor();
    const start = await position();
    await keys.down('KeyW');
    await page.waitForTimeout(450);
    await keys.down('ControlLeft');
    await keys.up('KeyW');
    await keys.up('ControlLeft');
    await page.waitForTimeout(150);
    const released = await position();
    await page.waitForTimeout(450);
    const drift = distance(released, await position());
    assert.ok(distance(start, released) > .35, '没有走离下车位置');
    assert.ok(drift < .05, `松开步行键后人物又走了 ${drift.toFixed(2)} 米`);
    assert.deepEqual([...errors, ...external], []);
    console.log({ release, coast, overlap, pulling, walkDriftMeters: drift });
  });
} finally {
  await server.close();
}
