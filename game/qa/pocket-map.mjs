// node qa/pocket-map.mjs [all|desktop|390|360] [local dev URL]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withQaBrowser } from './browser.mjs';
import { action, distance, frame, keyboard, openDay, park, read, ride, screen, waitState, walkTo } from './doorstep-driver.mjs';
import { touchDriver } from './doorstep-touch.mjs';
import { createStairLayout } from '../src/stair-layout.js';

const chosen = process.argv[2] ?? 'all';
assert.ok(['all', 'desktop', '390', '360'].includes(chosen));
const url = new URL(process.argv[3] ?? 'http://127.0.0.1:5188/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
url.searchParams.set('qa', '1');
const out = fileURLToPath(new URL('../artifacts/常驻手机/', import.meta.url));
const selectors = {
  screen: '[data-field="pocketMap"] > svg', space: 'data-space', floor: 'data-floor',
  window: 'viewBox (minX, minZ, widthMetres, depthMetres)', cursor: '[data-layer="actor"]',
  route: 'polyline[data-layer="route"]', destination: '[data-layer="target"]', landmarks: '[data-place][visibility="visible"]',
  instruction: '[data-field="guide"]', action: '[data-act="map"]',
};

async function snapshot(page) {
  return page.evaluate(selector => {
    const s = window.campaignQA.state(), course = window.campaignQA.district, svg = document.querySelector(selector);
    const box = e => { const { x, y, width, height } = e.getBoundingClientRect(); return { x, y, width, height }; };
    const housing = box(svg.closest('button')), vb = svg.viewBox.baseVal;
    const marker = svg.querySelector('[data-layer="actor"]');
    const m = svg.getScreenCTM().inverse().multiply(marker.getScreenCTM());
    const pose = { x: m.e, z: m.f, heading: Math.atan2(m.b, m.a) - Math.PI };
    const points = [...svg.querySelector('[data-layer="route"]').points].map(p => ({ x: p.x, z: p.y }));
    const image = svg.querySelector('image'), plan = svg.querySelector('[data-layer="floorPlan"]');
    const walls = plan.firstElementChild?.getBBox();
    const plaza = new DOMPoint(course.square.x, course.square.z).matrixTransform(svg.getScreenCTM());
    const rider = new DOMPoint(0,0).matrixTransform(marker.getScreenCTM());
    const streetGoal = s.target.id === course.gate.id ? course.finish : s.target;
    const controls = [...document.querySelectorAll('.nb-gauges,.nb-pause-key,.nb-live-touch button,.nb-context button')]
      .filter(e => e.getClientRects().length).map(box);
    const overlaps = b => housing.x < b.x+b.width && housing.x+housing.width > b.x && housing.y < b.y+b.height && housing.y+housing.height > b.y;
    const top = document.elementFromPoint(housing.x+housing.width/2, housing.y+housing.height/2);
    return {
      stage: s.stage, mapOpen: s.mapOpen, paused: s.paused, elapsed: s.elapsed, travelMode: s.travelMode,
      actor: s.actor, bike: {x:s.bike.x,z:s.bike.z}, guard: s.guard, cargo: s.cargo,
      space: svg.getAttribute('data-space'), floor: Number(svg.getAttribute('data-floor')),
      viewBox: [vb.x, vb.y, vb.width, vb.height], housing, glass: box(svg), cursor: pose,
      first: points[0], last: points.at(-1), points: points.length, streetGoal: {x:streetGoal.x,z:streetGoal.z},
      fromPlazaPx: Math.hypot(rider.x-plaza.x, rider.y-plaza.y),
      guide: document.querySelector('[data-field="guide"]').textContent, scale: svg.querySelector('[data-layer="scale"] text').textContent,
      visiblePlaces: [...svg.querySelectorAll('[data-place][visibility="visible"]')].map(el => el.dataset.place),
      image: image.href.baseVal.startsWith('data:image/webp;base64,'),
      streetVisible: getComputedStyle(image).display !== 'none', floorVisible: getComputedStyle(plan).display !== 'none',
      walls: walls && s.actor.indoors ? [walls.x,walls.y,walls.width,walls.height] : null,
      clear: !controls.some(overlaps) && !overlaps({x:innerWidth*.23,y:innerHeight*.35,width:innerWidth*.54,height:innerHeight*.30}),
      tappable: top?.closest('button') === svg.closest('button'),
    };
  }, selectors.screen);
}

// The guard's solid, unlit yellow is sampled from the actual composited PNG.
// A connected stroke and a separate dot distinguish the mark from isolated
// yellow flecks in foliage or lettering on the HUD.
async function alertPixels(page, screenshot, phone) {
  return page.evaluate(async ({ bytes, phone }) => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], {type:'image/png'}));
    const w = image.width, h = image.height;
    const ctx = new OffscreenCanvas(w,h).getContext('2d'); ctx.drawImage(image,0,0); image.close();
    const rgba = ctx.getImageData(0,0,w,h).data, mask = new Uint8Array(w*h);
    for (let i=0; i<mask.length; i++) {
      if (rgba[i*4] >= 248 && Math.abs(rgba[i*4+1]-202)<=8 && Math.abs(rgba[i*4+2]-35)<=9) mask[i] = 1;
    }
    const shapes = [];
    for (let i=0; i<mask.length; i++) {
      if (!mask[i]) continue;
      const stack = [i]; mask[i] = 0;
      let left=w, right=0, top=h, bottom=0, pixels=0;
      while (stack.length) {
        const n=stack.pop(), x=n%w, y=Math.floor(n/w);
        left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y); pixels++;
        for (const next of [n-w,n+w,x>0?n-1:-1,x<w-1?n+1:-1]) {
          if (mask[next]) { mask[next]=0; stack.push(next); }
        }
      }
      if (pixels >= 3) shapes.push({left,right,top,bottom,pixels});
    }
    for (const bar of shapes.sort((a,b)=>b.pixels-a.pixels)) {
      const bw=bar.right-bar.left+1, bh=bar.bottom-bar.top+1;
      if (bh < 6 || bh < bw || bar.pixels < 12) continue;
      const dot=shapes.find(d=>d.top>bar.bottom && d.top-bar.bottom<bh*.65 &&
        Math.abs((d.left+d.right-bar.left-bar.right)/2)<bw && d.pixels<bar.pixels*.85);
      if (!dot) continue;
      const left=Math.min(bar.left,dot.left), right=Math.max(bar.right,dot.right);
      if (right<phone.x || left>phone.x+phone.width || bar.top>phone.y+phone.height)
        return {left,right,top:bar.top,bottom:dot.bottom,pixels:bar.pixels+dot.pixels};
    }
    return null;
  }, {bytes:screenshot.toString('base64'),phone});
}

async function play(page, id, browser) {
  const touch = id !== 'desktop', width = touch ? Number(id) : 1280, height = touch ? (width===390?844:800) : 720;
  await page.setViewportSize({width,height});
  const io = touch ? await touchDriver(page) : keyboard(page);
  const reports = {};
  async function check(name, picture=false, alert=false) {
    const v = await snapshot(page);
    assert.ok(v.stage==='ride' && !v.mapOpen && !v.paused && v.image && v.clear && v.tappable, name+' '+JSON.stringify(v));
    const lag = Math.abs(v.actor.speed)*.18+.09;
    assert.ok(distance(v.actor,v.cursor)<lag && distance(v.cursor,v.first)<.025 && v.guide, name+' 位置/路线');
    assert.ok(Math.cos(v.cursor.heading-v.actor.heading)>.95, name+' 朝向');
    const [x,z,sx,sz] = v.viewBox;
    assert.ok(v.cursor.x>x && v.cursor.x<x+sx && v.cursor.z>z && v.cursor.z<z+sz, name+' 箭头出屏');
    assert.ok(v.floor === (v.actor.indoors ? v.actor.floor : 0));
    assert.equal(v.space, v.actor.indoors ? 'floor' : 'street');
    assert.equal(v.streetVisible,!v.actor.indoors); assert.equal(v.floorVisible,v.actor.indoors);
    if (!v.actor.indoors) assert.ok(distance(v.last,v.streetGoal)<.07, name+' 目标实线终点');
    assert.ok(v.glass.height >= 75 && (touch ? v.housing.width>=132 : v.housing.width>=180 && v.housing.width<=235));
    if (picture) {
      v.file = id+'-'+name+'.png';
      const png = await page.screenshot({path:path.join(out,v.file),scale:'css'});
      if (alert) { v.exclamation=await alertPixels(page,png,v.housing); assert.ok(v.exclamation,'截图中无法辨认门岗感叹号 '+v.file); }
    }
    reports[name]=v;
    return v;
  }
  await openDay(page,url,touch);
  const inputs=await page.evaluateHandle(()=>{
    const counts={keys:0,touches:0,multi:0,untrusted:0};
    window.addEventListener('keydown',e=>{counts.keys++; if(!e.isTrusted) counts.untrusted++;});
    window.addEventListener('touchstart',e=>{
      counts.touches++; counts.multi=Math.max(counts.multi,e.touches.length); if(!e.isTrusted) counts.untrusted++;
    },{passive:true});
    return counts;
  });
  const course=await page.evaluate(()=>window.campaignQA.district), stairs=createStairLayout(course);
  const start=await check('广场默认定位',id!=='390');
  assert.ok(start.visiblePlaces.includes('square') && start.viewBox[2]<(course.bounds.maxX-course.bounds.minX)*.55);
  await io.keys(['KeyW']); await waitState(page,s=>s.actor.speed>7 && distance(s.actor,start.actor)>6,'广场起步');
  const moving=await check('前行缩放',id==='desktop');
  assert.ok(moving.viewBox[2]>start.viewBox[2]+7 && Math.hypot(moving.viewBox[0]-start.viewBox[0],moving.viewBox[1]-start.viewBox[1])>2);
  assert.ok(moving.fromPlazaPx>start.fromPlazaPx+6,'箭头与固定广场地标未拉开');
  await ride(page,io,course.pickupLine,s=>distance(s.bike,course.pickup)<course.pickup.radius && Math.abs(s.bike.speed)<.45);
  await park(page,io); await io.tap('Enter'); await waitState(page,s=>s.leg==='dropoff','红棚装餐');
  const line=touch?course.mainLine:course.shortLine;
  const post=course.blocks.find(b=>b.id==='northPost').x;
  await ride(page,io,line,s=>s.bike.x<post+12.8,{maxSpeed:9});
  await park(page,io);
  const through=[...line.slice(0,line.findIndex(p=>p.id===course.gate.id)),{x:post-9,z:course.gate.z-1.8}];
  await ride(page,io,through,s=>s.guard.phase==='alert',{maxSpeed:2.55});
  await io.keys(['Space']); await waitState(page,s=>s.guard.phase==='alert' && s.guard.progress>=.23,'门岗喊停');
  const gate=await check('门岗喊停',true,true); await io.keys([]);
  assert.ok(gate.elapsed>0 && gate.visiblePlaces.includes('gate') && Math.cos(gate.cursor.heading-start.cursor.heading)<.65);
  await waitState(page,s=>s.guard.phase==='chasing','小屏状态下追逐未启动');
  const glass=gate.glass;
  if (touch) await page.touchscreen.tap(glass.x+glass.width*.3,glass.y+glass.height*.55);
  else await page.mouse.click(glass.x+glass.width*.3,glass.y+glass.height*.55);
  await screen(page,'map').waitFor(); await page.locator('.nb-nav-device').waitFor();
  const frozen=await frame(page); await page.waitForTimeout(320);
  const after=await frame(page);
  for(const key of ['actor','guard','deliveryElapsed']) assert.deepEqual(after[key],frozen[key]);
  reports.全图暂停={gameSecondsAdvanced:after.deliveryElapsed-frozen.deliveryElapsed,phase:after.guard.phase};
  if(!touch) await action(page,'route').click();
  if(touch) await action(page,'map').tap(); else await io.tap('KeyM');
  await page.locator(selectors.screen).waitFor();
  await waitState(page,s=>s.elapsed>frozen.deliveryElapsed+.05,'收起手机后未恢复');
  await check('收起返回');
  if(id!=='360') {
    const landmark=touch?course.landmarks.outerApex:course.landmarks.arborApex;
    await ride(page,io,line,s=>distance(s.bike,landmark)<4);
    const at=await check(touch?'球场外圈':'紫藤花架',true);
    assert.ok(at.visiblePlaces.includes(touch?'court':'arbor'),'院内地标不可读 '+JSON.stringify(at));
    await ride(page,io,line,s=>distance(s.bike,course.finish)<4.6 && Math.abs(s.bike.speed)<.5);
    const parked=await park(page,io);
    await io.tap('KeyF'); await waitState(page,s=>s.travelMode==='foot' && s.motion.type==='none','下车');
    await io.tap('Enter'); const hand=await waitState(page,s=>s.cargo==='hand' && s.motion.type==='none','取袋');
    const h=parked.bike.heading, side=Math.sign((hand.actor.x-parked.bike.x)*Math.cos(h)+(hand.actor.z-parked.bike.z)*Math.sin(h))||1;
    await walkTo(page,io,{x:parked.bike.x+side*1.08*Math.cos(h)-1.5*Math.sin(h),z:parked.bike.z+side*1.08*Math.sin(h)+1.5*Math.cos(h)});
    await walkTo(page,io,stairs.outside); await page.waitForTimeout(100);
    const foot=await check('停车后步行',!touch);
    assert.ok(distance(foot.bike,foot.cursor)>3 && foot.viewBox[2]<start.viewBox[2]*.7);
    const floors=new Set();
    for(const target of stairs.route) {
      const s=await walkTo(page,io,target);
      if(!s.actor.indoors || floors.has(s.actor.floor)) continue;
      floors.add(s.actor.floor); await page.waitForTimeout(100);
      const f=await check(s.actor.floor+'楼平面',s.actor.floor===(touch?2:1));
      assert.ok(f.viewBox[3] >= stairs.depth && f.viewBox[3] < stairs.depth*1.5);
      const expected=[stairs.origin.x-stairs.halfWidth,stairs.origin.z-stairs.depth,stairs.halfWidth*2,stairs.depth];
      assert.ok(f.walls?.every((value,i)=>Math.abs(value-expected[i])<.01),'平面图墙体与共享布局不符');
      assert.equal(f.visiblePlaces.includes('door302'),s.actor.floor===3);
    }
    assert.deepEqual([...floors],[1,2,3]); await page.waitForTimeout(100);
    const atDoor=await check('302门前',true);
    assert.ok(atDoor.visiblePlaces.includes('door302') && distance(atDoor.last,stairs.knock)<.04);
    if(!touch) { await io.tap('KeyM'); await screen(page,'map').waitFor(); await io.tap('KeyM'); await screen(page,'ride').waitFor(); }
    await io.tap('Enter'); await screen(page,'delivered').waitFor();
    const paid=await read(page); assert.equal(paid.cargo,'delivered'); assert.equal(paid.completed,1);
  }
  const inputCounts=await inputs.jsonValue();
  assert.equal(inputCounts.untrusted,0);
  if(touch) assert.ok(inputCounts.keys===0 && inputCounts.touches>0 && inputCounts.multi>=2);
  else assert.ok(inputCounts.keys>0);
  const record={browser,id,width,height,fields:selectors,inputCounts,samples:reports,completed:(await read(page)).completed};
  await writeFile(path.join(out,id+'.json'),JSON.stringify(record,null,2)+'\n');
  console.log('通过',id,Object.keys(reports).join('、'),out);
}

await mkdir(out,{recursive:true});
for (const id of chosen==='all'?['desktop','390','360']:[chosen]) {
  await withQaBrowser(async ({ browser, page, errors, external })=>{
    if (id==='desktop') await play(page,id,browser.version());
    else {
      const ctx=await browser.newContext({isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'zh-CN',serviceWorkers:'block'});
      await ctx.routeWebSocket(u=>u.searchParams.has('token'),()=>{});
      const p=await ctx.newPage();
      p.on('pageerror',e=>errors.push(e.message));
      try { await play(p,id,browser.version()); } finally { await ctx.close(); }
    }
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  });
}
