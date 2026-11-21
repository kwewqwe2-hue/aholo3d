// Offline acceptance of the same scene builder, player rig and attachment hook used by Day 1.
// node scripts/prepare-lux-check.mjs [directory for inspection screenshots]
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { withQaBrowser } from '../qa/browser.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const captures = process.argv[2] && resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), 'day1-lux-check-'));
const entry = resolve(root, 'src/__aholo_offline_check__.js').replaceAll('\\', '/');
const harness = `
import * as THREE from 'three';
import { createTrialScene } from '../trial/scene.js';
import { campaignDistrict as course } from './campaign-course.js';
import { buildEstate } from './estate-art.js';
import { makeCourier } from './courier-model.js';
import { attachAholoAssets } from './aholo-assets.js';
const canvas = document.querySelector('canvas');
let ctx, handle;
const world = createTrialScene(canvas, course, { buildEnvironment: buildEstate, makePlayer: makeCourier,
  attachAssets(c) { ctx = c; handle = attachAholoAssets(c); return handle; } });
const { scene, renderer, rider } = ctx;
const v = (x,y,z) => new THREE.Vector3(x,y,z);
const box = node => new THREE.Box3().setFromObject(node,true);
const sample = name => scene.getObjectByName(name);
const roof = course.blocks.find(b => b.id === 'northFlats');
let time = 0;
function drive(point=course.square, heading=Math.PI, kick=0, steer=0) {
  time += .20;
  world.render({stage:'drive',bike:{...point,heading,kick,steer,lean:0,speed:0},elapsed:time,kick},.12);
}
function contact(x,z,ceiling=1.05) {
  const node=sample('AholoScooterChassis');
  const ray=new THREE.Raycaster(v(x,ceiling,z),v(0,-1,0));
  ray.ray.applyMatrix4(node.matrixWorld);
  const hit=ray.intersectObject(node,false)[0];
  return hit ? node.worldToLocal(hit.point.clone()).y : null;
}
function measure() {
  drive();
  const head=sample('AholoCourierHead'), body=sample('AholoScooterChassis'), flat=sample('AholoFlatNorth');
  const bounds=box(flat), localHead=rider.localHead;
  const axle=rider.wheels.map(w => w.getWorldPosition(new THREE.Vector3()));
  const resting=rider.joints.legs.right.end.getWorldPosition(new THREE.Vector3());
  drive(course.square,Math.PI,1,.43);drive(course.square,Math.PI,1,.43);
  const kicked=rider.joints.legs.right.end.getWorldPosition(new THREE.Vector3());
  const steering=rider.stem.rotation.y;
  const moved={...course.square,z:course.square.z-1.2};
  drive(moved,Math.PI,0,.43);
  const roll=rider.wheels.map(w=>w.rotation.x);
  drive();
  return {
    duplicateAttach:attachAholoAssets(ctx)===handle,
    headMounted:head.parent===rider.headAnchor && !localHead.visible,
    headBounds:[head.geometry.boundingBox.min.toArray(),head.geometry.boundingBox.max.toArray()],
    localHeadBounds:rider.headAnchor.userData.localBounds,
    realTextures:[head,body,flat].every(n=>n.material.map?.image?.width>0 && n.material.roughnessMap?.image?.width>0),
    chassisMounted:body.parent===rider.mounts.chassis && body.parent.children.filter(n=>n.isMesh&&n.visible).length===1,
    feet:[contact(-.185,.085),contact(.185,.085)], saddle:contact(0,-.19),
    rack:[-.17,0,.17].map(x=>contact(x,-.73,1.00)), wheelbase:axle[0].distanceTo(axle[1]),
    steering, roll, kickTravel:kicked.distanceTo(resting),
    flat:{min:bounds.min.toArray(),max:bounds.max.toArray(),count:flat.count,
      matched:Math.max(Math.abs(bounds.min.x-roof.x+roof.w/2),Math.abs(bounds.max.x-roof.x-roof.w/2),
        Math.abs(bounds.min.y),Math.abs(bounds.max.y-roof.h),Math.abs(bounds.min.z-roof.z+roof.d/2),
        Math.abs(bounds.max.z-roof.z-roof.d/2))<.002,
      stopClearance:bounds.distanceToPoint(v(course.finish.x,0,course.finish.z)),
      shellHidden:!sample('estate-shell-northFlats').visible},
  };
}
function orbit(eye,target,fov=34) {
  const cam=new THREE.PerspectiveCamera(fov,canvas.width/canvas.height,.05,225);
  cam.position.copy(eye);cam.lookAt(target);renderer.render(scene,cam);
}
function shot(name) {
  drive();
  const at=(x,y,z)=>rider.root.localToWorld(v(x,y,z));
  if(name==='side') orbit(at(3.48,1.26,.28),at(0,.87,-.08),34);
  if(name==='face') {
    drive(course.pickup,0);
    orbit(at(-1.35,1.48,2.13),at(0,1.23,-.04),31);
  }
  if(name==='kick') {
    drive(course.square,Math.PI,1,.43);drive(course.square,Math.PI,1,.43);
    orbit(at(-2.75,1.38,-2.62),at(0,.89,-.05),31);
  }
  if(name==='north-flats') {
    const i=course.shortLine.findIndex(p=>p.id==='fork_flowerTurn_5');
    const p=course.shortLine[i],next=course.shortLine[i+1];
    const heading=Math.atan2(p.x-next.x,next.z-p.z);
    drive(p,heading);drive(p,heading);
  }
  if(name==='facade') {
    orbit(v(roof.x+24,4.1,roof.z+roof.d/2+21),v(roof.x+8,6,roof.z+roof.d/2),47);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}
async function lifetime() {
  const count=course.blocks.length;
  handle.dispose();handle.dispose();
  const restored=rider.localHead.visible && sample('estate-shell-northFlats').visible &&
    rider.mounts.chassis.children.filter(m=>m.isMesh).every(m=>m.visible) && !sample('AholoCourierHead');
  const fallback=attachAholoAssets({...ctx,rider:{}});
  const state=await fallback.ready;
  const stood=box(sample('AholoCourierCheckIn')),parked=box(sample('AholoScooterPickup'));
  const fixtureCount=course.blocks.length-count;
  fallback.dispose();
  const cancelled=attachAholoAssets(ctx);cancelled.dispose();
  const cancelledState=await cancelled.ready;
  world.dispose();
  return { restored, roles:[state.assets.courier.role,state.assets.scooter.role],
    bases:[stood.min.y,parked.min.y],fixtureCount,
    removed:course.blocks.length===count,cancelled:cancelledState.status };
}
globalThis.inspectLux={ready:handle.ready,measure,shot,lifetime};
`;
try {
  const plugin = { name: 'offline-asset-check',
    resolveId(id) { if (id.replaceAll('\\', '/') === entry) return entry; },
    load(id) { if (id === entry) return harness; } };
  const result = await build({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error',
    plugins: [plugin], build: { write: false, rolldownOptions: { input: entry } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const scripts = output.filter(e => e.type === 'chunk');
  assert.equal(scripts.length, 1);
  assert.equal(output.filter(e=>e.type==='asset' && /\.(glb|wasm)$/i.test(e.fileName)).length, 0);
  const manifest = JSON.parse(await readFile(join(root, 'src/assets/aholo/manifest.json'), 'utf8'));
  for (const [id, record] of Object.entries(manifest)) {
    const data = await readFile(join(root, record.product));
    assert.ok(scripts[0].code.includes(data.toString('base64')), id + ' missing from single-file payload');
  }
  const html = join(temp, 'game.html');
  await writeFile(html, '<meta charset="utf-8"><style>*{margin:0}canvas{width:100vw;height:100vh;display:block}</style>' +
    '<canvas></canvas><script type="module">' + scripts[0].code.replace(/<\/script/gi,'<\\/script') + '</script>');
  const url = pathToFileURL(html).href;
  if (captures) await mkdir(captures, { recursive: true });
  await withQaBrowser(async ({ page, context, external, errors }) => {
    await context.setOffline(true);
    await context.route(url, route => route.continue());
    const network = [];
    page.on('request', req => { if (/^https?:/i.test(req.url())) network.push(req.url()); });
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.goto(url);
    await page.waitForFunction(() => !!globalThis.inspectLux);
    const state = await page.evaluate(() => globalThis.inspectLux.ready);
    assert.equal(state.status, 'ready', JSON.stringify(state));
    const result = await page.evaluate(() => globalThis.inspectLux.measure());
    console.log(JSON.stringify({ state, result }, null, 2));
    assert.ok(result.duplicateAttach && result.headMounted && result.chassisMounted && result.realTextures);
    assert.ok(result.flat.matched && result.flat.shellHidden && result.flat.stopClearance > 5);
    assert.ok(Math.abs(result.wheelbase - 1.38) < .001 && result.roll.every(a=>Math.abs(a)>.01));
    assert.ok(result.kickTravel > .4 && Math.abs(result.steering)>.4);
    assert.ok(result.feet.every(y=>Math.abs(y-.312)<.015) && Math.abs(result.saddle-.767)<.015);
    assert.ok(result.rack.some(y=>Math.abs(y-.824)<.015));
    if (captures) for (const name of ['rear','side','face','kick','north-flats','facade']) {
      const png = await page.evaluate(n => globalThis.inspectLux.shot(n), name);
      await writeFile(join(captures, name + '.png'), Buffer.from(png, 'base64'));
    }
    const lifetime = await page.evaluate(() => globalThis.inspectLux.lifetime());
    console.log(JSON.stringify({ lifetime, network, external, errors }, null, 2));
    assert.ok(lifetime.restored && lifetime.removed && lifetime.fixtureCount===2 && lifetime.cancelled==='disposed');
    assert.deepEqual(lifetime.roles,['plaza-check-in','pickup-parked-scooter']);
    assert.ok(lifetime.bases.every(y => Math.abs(y) < .001));
    assert.deepEqual([network,external,errors],[[],[],[]]);
  });
} finally {
  await rm(join(temp, 'game.html'), { force: true });
  await rmdir(temp);
}
