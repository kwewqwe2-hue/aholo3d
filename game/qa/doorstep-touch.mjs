import assert from 'node:assert/strict';

// Use the same pointer targets a player's fingers hit. Chrome delivers trusted
// touch and pointer events, including simultaneous stick and run contacts.
export async function touchDriver(page) {
  const device = await page.context().newCDPSession(page);
  const counts = {}, boxes = new Map(), measured = {};
  let held = '', positions = '', contacts = [];
  async function box(selector) {
    if (boxes.has(selector)) return boxes.get(selector);
    const item = page.locator(selector + ':visible').first();
    await item.waitFor({ timeout: 2200 });
    // Wait through the HUD refresh following a mode change; it occurs after
    // the simulation reports the end of dismount/mount.
    await page.waitForFunction(sel => {
      const el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }, selector, { timeout: 1100 }).catch(() => {});
    const rect = await item.evaluate(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      const cx = x + width / 2, cy = y + height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return { cx, cy, width, height, hit: el.contains(hit), hitNode: hit?.tagName + '.' + hit?.className,
        viewport: [visualViewport.width, visualViewport.height, visualViewport.scale, visualViewport.offsetTop],
        onScreen: x >= -.5 && y >= -.5 && x + width <= innerWidth + .5 && y + height <= innerHeight + .5 };
    });
    assert.ok(rect.hit && rect.onScreen, '触控中心被遮挡或出屏 ' + selector + ' ' + JSON.stringify(rect));
    boxes.set(selector, rect);
    measured[selector] = rect;
    return rect;
  }
  async function release() {
    if (held) await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    held = ''; positions = ''; contacts = [];
  }
  async function contact(specs) {
    if (!specs.length) return release();
    const sorted = [...specs].sort((a, b) => a.selector.localeCompare(b.selector));
    const gesture = sorted.map(s => s.selector).join(',');
    const coords = [];
    for (const [i, spec] of sorted.entries()) {
      const r = await box(spec.selector);
      coords.push({ x: r.cx + (spec.dx ?? 0) * Math.min(r.width, r.height) * .32,
        y: r.cy - (spec.dz ?? 0) * Math.min(r.width, r.height) * .32, id: i + 1,
        force: .7, radiusX: 3, radiusY: 3 });
    }
    const key = coords.map(p => p.x.toFixed(1) + '/' + p.y.toFixed(1)).join(',');
    if (gesture === held && key === positions) return;
    if (gesture !== held) await release();
    const type = held ? 'touchMove' : 'touchStart';
    await device.send('Input.dispatchTouchEvent', { type, touchPoints: coords });
    if (!held) for (const s of sorted) counts[s.selector] = (counts[s.selector] ?? 0) + 1;
    held = gesture; positions = key; contacts = coords;
  }
  const controls = { KeyW: 'throttle', KeyS: 'brake', KeyD: 'right', KeyA: 'left', Space: 'handbrake' };
  return {
    counts, measured,
    keys: names => contact(names.map(k => ({ selector: '[data-control="' + controls[k] + '"]' }))),
    walk: (dx, dz, run) => contact([{ selector: '[data-stick]', dx, dz },
      ...(run ? [{ selector: '[data-control="run"]' }] : [])]),
    async tap(key) {
      await release();
      const type = { Enter: 'interact', KeyF: 'mount', KeyM: 'map' }[key];
      assert.ok(type, '未映射的触屏动作 ' + key);
      const item = page.locator('[data-act="' + type + '"]:visible:not(:disabled),[data-context="' + type + '"]:visible:not(:disabled)').first();
      // At the plaza or during an animation there may be no available action.
      if (key === 'Enter' && !await item.count() &&
          !await page.evaluate(() => window.campaignQA.state().interaction)) return;
      await item.tap({ timeout: 2300 });
      counts[type] = (counts[type] ?? 0) + 1;
      boxes.clear();
    },
    invalidate: () => boxes.clear(),
    async openWhileHolding() {
      assert.ok(contacts.length > 0);
      const b = await box('[data-act="map"]');
      const start = [...contacts, { id: 19, x: b.cx, y: b.cy, force: .7, radiusX: 3, radiusY: 3 }];
      await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
      await page.waitForTimeout(48);
      await release(); boxes.clear();
    },
    async swipeMap() {
      const r = await page.locator('.nb-ui[data-screen="map"] [data-field="map"]:visible').boundingBox();
      assert.ok(r && r.width > 40);
      const pt = { id: 7, x: r.x + r.width * .4, y: r.y + r.height * .5 };
      await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await device.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...pt, x: pt.x + r.width * .17 }] });
      await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async cancel() {
      await device.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      held = ''; positions = ''; contacts = [];
    },
  };
}
