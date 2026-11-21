import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { sha256 } from './doorstep-source.mjs';
import { distance, round } from './doorstep-driver.mjs';

// Read what is painted inside the ordinary driving HUD. Transform the rendered
// cursor through the map image's inverse matrix; this also works for a scrolling
// or magnified map where the cursor itself stays near the middle of the phone.
export function readPocket(page, bounds, includeDiagnostics = true) {
  return page.evaluate(({ bounds, includeDiagnostics }) => {
    const box = el => {
      const r = el?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const hud = document.querySelector('.nb-ui[data-screen="ride"] .nb-hud');
    const phone = hud?.querySelector('[data-act="map"]');
    const maps = [...(phone?.querySelectorAll('svg') ?? [])].filter(el =>
      el.getClientRects().length && el.querySelector('image,polyline,[aria-label*="朝向"]'));
    const svg = maps.sort((a, b) => box(b).w * box(b).h - box(a).w * box(a).h)[0];
    const image = svg?.querySelector('image');
    const ref = image && getComputedStyle(image).display !== 'none' ? image : null;
    const cursor = svg?.querySelector('[aria-label*="朝向"],[aria-label*="车头方向"],[data-marker="actor"]')
      ?? svg?.querySelector('.nb-map-cursor')?.parentElement;
    function worldPoint(el, x = 0, y = 0) {
      const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()).matrixTransform((ref ?? svg).getScreenCTM().inverse());
      if (!ref) return { x: p.x, z: p.y }; // The indoor viewBox uses world metres.
      const r = ref.getBBox();
      return { x: bounds.minX + (p.x - r.x) / r.width * (bounds.maxX - bounds.minX),
        z: bounds.minZ + (p.y - r.y) / r.height * (bounds.maxZ - bounds.minZ) };
    }
    let plotted = null;
    if (cursor?.getScreenCTM() && svg.getScreenCTM()) {
      const p = worldPoint(cursor), ahead = worldPoint(cursor, 0, -8);
      plotted = { ...p, heading: Math.atan2(p.x - ahead.x, ahead.z - p.z) };
    }
    const state = includeDiagnostics && window.campaignQA?.state();
    const f = includeDiagnostics && window.campaignQA?.frame();
    const label = svg?.getAttribute('aria-label') ?? '';
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
    const places = [...(svg?.querySelectorAll('[data-place]') ?? [])].filter(visible)
      .map(el => ({ id: el.dataset.place, name: el.textContent.trim(), ...worldPoint(el) }));
    const labelText = [...(svg?.querySelectorAll('text') ?? [])].filter(visible).map(n => n.textContent.trim());
    const controls = [...(hud?.querySelectorAll('button,meter,.nb-hud-aside') ?? [])]
      .filter(e => e.getClientRects().length && getComputedStyle(e).visibility === 'visible')
      .map(el => ({ kind: el.dataset.act ?? el.dataset.control ?? el.getAttribute('aria-label'), ...box(el) }));
    return { screen: document.querySelector('.nb-ui')?.dataset.screen, viewport: [innerWidth, innerHeight],
      phone: box(phone), map: box(svg), health: box(hud?.querySelector('meter')), cursor: box(cursor),
      label, labelText, text: phone?.innerText,
      currentLocation:hud?.querySelector('[data-field="pocketStatus"]')?.textContent,
      plotted, places, visibleImage: !!ref,
      space: svg?.dataset.space, floor: Number(svg?.dataset.floor),
      routeVertices: svg?.querySelector('[data-layer="route"]')?.points?.numberOfItems,
      hudSpeed: Number(hud?.querySelector('[data-field="speed"]')?.textContent),
      hudTravel: hud?.dataset.travel, cargoText: hud?.querySelector('[data-field="cargo"]')?.textContent,
      toast: hud?.querySelector('[data-field="toast"]:not([hidden])')?.textContent ?? '',
      chaseControls: !!hud?.querySelector('[data-field="kicks"]:not([hidden])'),
      motionText: hud?.querySelector('[data-field="motion"]:not([hidden])')?.textContent,
      interaction: hud?.querySelector('[data-act="interact"]:not([hidden]):not(:disabled)')?.dataset.context,
      cursorTransform: cursor?.getAttribute('transform'), controls,
      ...(state && { pose: state.actor, bike: state.bike, walker: state.walker, elapsed: state.elapsed,
        mapOpen: state.mapOpen, paused: state.paused, guard: state.guard.phase,
        cart: { x: f.pursuer.x, z: f.pursuer.z }, travel: state.travelMode }) };
  }, { bounds, includeDiagnostics });
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const delta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export async function verifyMapArt(page, p) {
  const r = p.map;
  const shot = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h }, scale: 'css' });
  const art = await page.evaluate(async png => {
    const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const canvas = new OffscreenCanvas(64, 40), ctx = canvas.getContext('2d');
    const bmp = await createImageBitmap(new Blob([decode(png)], { type: 'image/png' }));
    ctx.drawImage(bmp, 0, 0, 64, 40); bmp.close();
    const pix = ctx.getImageData(0, 0, 64, 40).data, bins = new Set(), light = [];
    for (let i = 0; i < pix.length; i += 4) {
      bins.add((pix[i] >> 4) * 256 + (pix[i + 1] >> 4) * 16 + (pix[i + 2] >> 4));
      light.push(.2126 * pix[i] + .7152 * pix[i + 1] + .0722 * pix[i + 2]);
    }
    light.sort((a, b) => a - b);
    const img = document.querySelector('.nb-ui[data-screen="ride"] [data-act="map"] svg image');
    const url = new URL(img.href.baseVal, document.baseURI);
    let ref;
    if (url.protocol === 'data:') {
      if (!url.href.startsWith('data:image/webp;base64,')) throw Error('地图不是内嵌 WebP');
      ref = decode(url.href.slice(url.href.indexOf(',') + 1));
    } else {
      if (!['https:', 'http:'].includes(url.protocol) || url.origin !== location.origin) throw Error('地图不在本游戏源');
      const response = await fetch(url, { method: 'GET', mode: 'same-origin', credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw Error('地图 GET 失败，HTTP ' + response.status);
      ref = new Uint8Array(await response.arrayBuffer());
    }
    if (String.fromCharCode(...ref.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...ref.subarray(8, 12)) !== 'WEBP') {
      throw Error('地图响应没有 WebP 文件标记');
    }
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', ref))].map(v => v.toString(16).padStart(2, '0')).join('');
    return { hash, bytes: ref.byteLength, transport: url.protocol === 'data:' ? 'embedded' : 'same-origin',
      path: url.protocol === 'data:' ? null : url.pathname, palette: bins.size, p10: light[256], p90: light[2303] };
  }, shot.toString('base64'));
  const expected = sha256(await readFile(new URL('../src/ui-assets/estate-overhead.webp', import.meta.url)));
  assert.equal(art.hash, expected, '常驻手机的底图与工程已选底图不同');
  assert.ok(art.palette > 12 && art.p90 - art.p10 > 25, '普通截图里小屏地图缺乏可辨识图像');
  return { ...art, expectedHash: expected, width: round(r.w), height: round(r.h), fraction: round(r.w*r.h/(p.viewport[0]*p.viewport[1])) };
}

export async function verifyPocket(page, course, name, { floor = 0, separated = false } = {}) {
  const start = Date.now();
  let p, error;
  do {
    p = await readPocket(page, course.bounds);
    try {
      assert.ok(p.screen === 'ride' && !p.mapOpen && !p.paused, '常驻屏显示时游戏应在运行');
      assert.ok(p.map && p.map.w >= 54 && p.map.h >= 34, '左上角有指令但缺少可辨识的地图画幅');
      const [w, h] = p.viewport;
      assert.ok(p.phone.x >= -1 && p.phone.y >= -1 && p.phone.x < w * .15 && p.phone.y < h * .15);
      assert.ok(p.map.x >= p.phone.x - 2 && p.map.y >= p.phone.y - 2);
      assert.ok(p.map.x + p.map.w <= p.phone.x + p.phone.w + 2 && p.map.y + p.map.h <= p.phone.y + p.phone.h + 2);
      assert.ok(p.health && !overlap(p.phone, p.health), '手机覆盖车况血条');
      const road = { x: w * .42, y: h * .38, w: w * .16, h: h * .34 };
      assert.ok(!overlap(p.phone, road), '手机覆盖中央行进视野');
      assert.ok(p.cursor && p.cursor.w > 2 && p.cursor.h > 2, '地图未绘制定位箭头');
      const cx = p.cursor.x + p.cursor.w/2, cy = p.cursor.y + p.cursor.h/2;
      assert.ok(cx >= p.map.x && cx <= p.map.x + p.map.w && cy >= p.map.y && cy <= p.map.y + p.map.h,
        '小屏内的实车箭头被裁掉');
      if (floor) {
        assert.equal(p.walker.floor, floor);
        assert.ok(!p.visibleImage && (p.label.includes('第' + floor + '层') ||
          p.labelText.some(t => t === floor + 'F' || t === floor + '楼')), '楼层小图没有自动切到 ' + floor + ' 楼');
        if (floor === 3) assert.ok(p.labelText.includes('302') || p.text.includes('302'), '三楼小屏缺少 302 房门');
      } else {
        assert.ok(p.visibleImage && p.plotted, '户外小地图未画原选街区或无法定位骑手');
        const errorM = distance(p.plotted, p.pose), angle = Math.abs(delta(p.plotted.heading, p.pose.heading));
        assert.ok(errorM <= .7 + Math.abs(p.pose.speed) * .15 && angle < .25,
          '画面标记偏离真实位置或朝向 ' + JSON.stringify({ errorM, degrees: angle * 180 / Math.PI }));
        if (separated) assert.ok(distance(p.bike, p.plotted) > 2 && errorM < distance(p.bike, p.plotted) / 2,
          '徒步标记仍跟随停车点');
      }
      return { name, ...p };
    } catch (e) { error = e; }
    await page.waitForTimeout(35);
  } while (Date.now() - start < 900);
  throw Error(name + '：' + error.message + ' ' + JSON.stringify({ phone: p.phone, map: p.map,
    label: p.label, colorsOrFloor: p.labelText, cursor: p.cursor, text: p.text }));
}

export function verifyJourney(samples, course) {
  const by = name => samples.find(p => p.name === name);
  const square = by('广场'), shop = by('红棚'), start = by('起追'), atDoor = by('楼前停车'), foot = by('人车分离');
  assert.ok(square && shop && start && atDoor && foot);
  assert.equal(square.currentLocation,'牛逼广场'); assert.equal(shop.currentLocation,'红棚烧腊');
  assert.equal(atDoor.currentLocation,'7号楼前');
  for (const sample of samples.filter(p=>p.walker.indoors)) assert.equal(sample.currentLocation,sample.walker.floor+' 楼');
  for (const [sample, target, meters] of [[square, course.square, 1.3], [shop, course.pickup, 5.2],
    [atDoor, course.finish, 7.5]]) assert.ok(distance(sample.plotted, target) < meters, sample.name + '定位地标不符');
  const angle = Math.abs(delta(square.plotted.heading, shop.plotted.heading)) * 180 / Math.PI;
  const expected = { square: course.square, shop: course.landmarks.market, gate: course.landmarks.booth,
    // The labelled turn is on the junction. The planter has its own offset inside the fork.
    fork: course.landmarks.fork, court: course.landmarks.court,
    arbor: course.landmarks.pergola[Math.floor(course.landmarks.pergola.length / 2)] };
  const places = new Set(), views = new Set();
  for (const sample of samples.filter(p => p.travel === 'bike')) {
    views.add(sample.places.map(p => p.id).join('/'));
    for (const spot of sample.places.filter(p => expected[p.id])) {
      assert.ok(distance(spot, expected[spot.id]) < .2, '常驻图上的地标位置不符 ' + spot.name);
      places.add(spot.name);
    }
  }
  assert.ok(places.size >= 2 && views.size >= 2, '经过街区时没有观察到两处不同的实际地标');
  assert.ok(distance(square.plotted, shop.plotted) > 85 && angle > 85, '行车地图位置或朝向没有随绕店掉头变化');
  assert.ok(start.guard === 'chasing' && atDoor.guard === 'chasing' && atDoor.elapsed > start.elapsed + 3 &&
    distance(atDoor.cart, start.cart) > 8, '常驻手机时追车或计时没有继续');
  assert.deepEqual([...new Set(samples.filter(s => s.walker.indoors).map(s => s.walker.floor))].sort(), [1, 2, 3]);
  return { squareToShopMeters: round(distance(square.plotted, shop.plotted)), turningDegrees: round(angle),
    chasingSeconds: round(atDoor.elapsed - start.elapsed), patrolTravelMeters: round(distance(start.cart, atDoor.cart)),
    walkedFromBikeMeters: round(distance(foot.plotted, foot.bike)), visiblePlaces: [...places],
    widths: [...new Set(samples.map(s => s.viewport[0]))] };
}

// MeshBasicMaterial has a stable amber centre. Verify that BOTH parts of the
// world-space exclamation are visible outside the phone, gauges and controls.
export function visibleGuardMark(pngPath, controls) {
  const program = `
import cv2, numpy as np, json, sys
img=cv2.imdecode(np.fromfile(sys.argv[1],dtype=np.uint8),cv2.IMREAD_COLOR)
h,w=img.shape[:2]
b,g,r=cv2.split(img)
mask=((r>=217)&(g>=150)&(g<=235)&(b<=90)&((r.astype(int)-g)>18)).astype('uint8')
for z in json.loads(sys.argv[2]):
    x,y=int(z['x'])-1,int(z['y'])-1
    mask[max(0,y):min(h,int(z['y']+z['h'])+2),max(0,x):min(w,int(z['x']+z['w'])+2)]=0
n,_,stats,_=cv2.connectedComponentsWithStats(mask,8)
parts=stats[1:]
pairs=[]
for x,y,a,b1,n in parts:
    if b1<5 or b1>.18*h or a<2 or not .18<=a/b1<=1.15 or n<.28*a*b1: continue
    for xx,yy,c,d,m in parts:
        if not .13<=d/b1<=.85 or not .22<=c/a<=1.22 or not .12<=m/n<=.9: continue
        if not -.09*b1<=yy-y-b1<=max(3,.48*b1) or abs((xx+c/2)-(x+a/2))>a*.85: continue
        pairs.append((int(n+m),[int(min(x,xx)),int(y),int(max(x+a,xx+c)-min(x,xx)),int(yy+d-y)]))
pairs.sort(reverse=True)
print(json.dumps(pairs[:8]))
`;
  const pairs = JSON.parse(execFileSync('python', ['-c', program, pngPath, JSON.stringify(controls)],
    { encoding: 'utf8', windowsHide: true }));
  assert.ok(pairs.length > 0, '普通截图中没有检出 HUD 外的黄色叹号和点');
  return pairs.map(([pixels, box]) => ({ pixels, box }));
}
