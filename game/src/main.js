import { district as classicDistrict, elevationAt } from './district.js';
import { createUI, brandIconDataUrl } from './ui.js';
import { createWorld } from './world.js';
import { createShift } from './shift.js';
import { createSound } from './sound.js';
import { campaignDistrict, createCampaign } from './campaign.js';
import { createTrialScene } from '../trial/scene.js';
import { buildEstate } from './estate-art.js';
import { makeCourier } from './courier-model.js';
import { attachAholoAssets } from './aholo-assets.js';
import { createEstateLighting } from './estate-lighting.js';
import { updateStairInterior } from './stair-interior.js';
import { createShiftActors } from './shift-actors.js';
import { createResidentLife } from './resident-life.js';

const root = document.querySelector('#interface');
const canvas = document.querySelector('#city');
const params = new URLSearchParams(location.search);
const classic = params.get('classic') === '1';
const district = classic ? classicDistrict : campaignDistrict;
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.href = brandIconDataUrl();
document.head.append(favicon);
const sound = createSound(district);
const shift = classic ? createShift(district, sound.event) : createCampaign(sound.event);
const controls = { throttle: false, brake: false, left: false, right: false, handbrake: false,
  run: false, walkX: 0, walkZ: 0, cameraHeading: 0, lookLeft: false, lookRight: false };
const controlKeys = { KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'handbrake' };
const footKeys = { ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'lookLeft', KeyL: 'lookRight' };
const heldControls = new Map();
let ui, world, accumulator = 0, previousTime = 0, lastHud = -Infinity;
let wasBlocked = true, lastTravelMode = 'bike', lookPointer = null;
function holdControl(source, key, pressed) {
  if (pressed) heldControls.set(source, key);
  else heldControls.delete(source);
  controls[key] = [...heldControls.values()].includes(key);
}
function clearKeys() {
  heldControls.clear();
  for (const key of Object.keys(controls)) {
    if (key !== 'cameraHeading') controls[key] = typeof controls[key] === 'number' ? 0 : false;
  }
  lookPointer = null;
}
function refresh() {
  const snapshot = shift.view();
  const blocked = snapshot.stage !== 'ride' || snapshot.paused || snapshot.mapOpen;
  const travel = snapshot.travelMode || 'bike';
  if (blocked || wasBlocked || travel !== lastTravelMode) clearKeys();
  lastTravelMode = travel;
  root.classList.toggle('playing', !blocked);
  wasBlocked = blocked;
  ui?.update(snapshot); sound.update(snapshot, controls.throttle);
}
function dispatch(type, payload) {
  sound.unlock();
  if (type === 'control') {
    if (!wasBlocked && Object.hasOwn(controls, payload?.key) && payload.key !== 'cameraHeading') {
      const { key } = payload;
      if (key === 'walkX' || key === 'walkZ') controls[key] = Math.max(-1, Math.min(1, Number(payload.value) || 0));
      else holdControl(key, key, payload.pressed);
    }
    return;
  }
  shift.action(type);
  refresh();
}
function keydown(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const snapshot = shift.view();
  if (event.target?.tagName === 'BUTTON' && event.code === 'Enter' &&
      (snapshot.stage !== 'ride' || snapshot.mapOpen || snapshot.paused)) return;
  sound.unlock();
  if (!event.repeat && (event.code === 'Enter' || event.code === 'Space') &&
      snapshot.stage === 'intro') {
    event.preventDefault(); dispatch('next'); return;
  }
  if (!event.repeat && event.code === 'Enter' && snapshot.stage !== 'ride') {
    if (!classic && snapshot.stage === 'offer') {
      event.preventDefault();
      const visibleAction = [...root.querySelectorAll('[data-act="selectDay"], [data-act="accept"]')]
        .find(button => !button.disabled && button.getClientRects().length);
      visibleAction?.click();
      return;
    }
    const primary = { offer: 'accept', delivered: 'continue', failed: 'retry', dayend: 'restart' };
    if (primary[snapshot.stage]) { event.preventDefault(); dispatch(primary[snapshot.stage]); }
    return;
  }
  const key = controlKeys[event.code] ?? (snapshot.travelMode === 'foot' && footKeys[event.code]);
  if (snapshot.stage === 'ride' && key) {
    if (!event.repeat && !snapshot.paused && !snapshot.mapOpen) holdControl(event.code, key, true);
    event.preventDefault(); return;
  }
  if (!event.repeat && (event.code === 'KeyV' || snapshot.stage === 'ride')) {
    const rideKeys = classic ? { KeyE:'interact', KeyQ:'item' } :
      { Enter:'interact', KeyF:'mount', KeyQ:'left', KeyE:'right', ShiftLeft:'boost', ShiftRight:'boost' };
    const action = rideKeys[event.code] ?? { KeyM:'map', KeyV:'mute', Escape:'pause', KeyP:'pause' }[event.code];
    if (action) { event.preventDefault(); dispatch(action); return; }
  }
}
window.addEventListener('keydown', keydown);
// Release the physical key even when a modifier or a newly focused button owns the shortcut.
window.addEventListener('keyup', event => {
  const key = heldControls.get(event.code);
  if (key) holdControl(event.code, key, false);
}, true);
// Drag the world to look freely while walking. HUD buttons and the touch stick
// keep their own pointer, so looking does not release movement on a second finger.
window.addEventListener('pointerdown', event => {
  if (classic || wasBlocked || lastTravelMode !== 'foot' || lookPointer ||
      (event.button !== 0 && event.button !== 2) ||
      event.target?.closest?.('button, [data-control], [role="slider"], [data-stick], .nb-touch')) return;
  lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  if (event.target === canvas) canvas.setPointerCapture?.(event.pointerId);
});
window.addEventListener('pointermove', event => {
  if (lookPointer?.id !== event.pointerId) return;
  world?.orbit?.(event.clientX - lookPointer.x, event.clientY - lookPointer.y);
  lookPointer.x = event.clientX; lookPointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, event => {
  if (lookPointer?.id === event.pointerId) lookPointer = null;
});
canvas.addEventListener('contextmenu', event => { if (lastTravelMode === 'foot') event.preventDefault(); });
function background() {
  clearKeys(); accumulator = 0; previousTime = 0;
  const snapshot = shift.view();
  if (snapshot.stage === 'ride' && !snapshot.paused && !snapshot.mapOpen) shift.action('pause');
  refresh();
}
window.addEventListener('blur', background);
document.addEventListener('visibilitychange', () => { if (document.hidden) background(); });
window.addEventListener('resize', () => world?.resize());

function presentFrame() {
  const frame = shift.frame();
  if (!classic) {
    frame.cameraHeading = controls.cameraHeading;
    frame.braking = frame.travelMode==='bike' && (controls.brake || controls.handbrake);
    frame.walkInput = { forward: Number(controls.throttle) - Number(controls.brake) + controls.walkZ,
      side: Number(controls.right) - Number(controls.left) + controls.walkX };
  }
  return frame;
}
function animate(time) {
  const delta = previousTime ? Math.max(0, Math.min(0.15, (time - previousTime) / 1000)) : 0;
  previousTime = time; accumulator += delta;
  if (!classic) {
    if (controls.lookLeft || controls.lookRight) {
      world.orbit((Number(controls.lookLeft) - Number(controls.lookRight)) * delta * 420, 0);
    }
    controls.cameraHeading = world.heading();
  }
  while (accumulator >= 1 / 60) { shift.tick(1 / 60, controls); accumulator -= 1 / 60; }
  if (time - lastHud > 65) { refresh(); lastHud = time; }
  const frame = presentFrame();
  if (!classic) sound.world(frame);
  if (classic || (frame.stage === 'drive' && !frame.paused) || !worldPainted || frame.stage !== lastSceneStage) {
    world.render(frame, delta);
    worldPainted = true;
  }
  lastSceneStage = frame.stage;
  requestAnimationFrame(animate);
}
function fault(error) {
  const panel = document.querySelector('#fault');
  panel.textContent = '城区未能启动。请在支持 3D 加速的桌面浏览器中打开，或刷新重试。 ' + (error?.message || '');
  panel.hidden = false;
  console.error(error);
}
let worldPainted = false, lastSceneStage = '';
window.addEventListener('resize', () => { worldPainted = false; });
try {
  ui = createUI(root, district, dispatch);
  refresh();
  world = classic ? createWorld(canvas, district, elevationAt) : createTrialScene(canvas, district, {
    buildEnvironment: buildEstate, makePlayer: makeCourier, attachAssets: attachAholoAssets,
    setupLighting: createEstateLighting, updateInterior: updateStairInterior, createActors: createShiftActors,
    createResidents: createResidentLife, onFootfall:sound.footfall, onCourtBounce:sound.bounce,
  });
  if (!classic) world.assetsReady.then(result => {
    worldPainted = false;
    document.documentElement.dataset.models = result.status;
  }).catch(fault);
  world.resize(); refresh();
  requestAnimationFrame(animate);
} catch (error) { fault(error); }

if (import.meta.env.DEV && params.get('qa') === '1' && !classic) {
  window.campaignQA = Object.freeze({
    state: () => structuredClone(shift.view()), frame: () => structuredClone(presentFrame()), district: structuredClone(district),
    models: () => world.assetsReady.then(value => structuredClone(value)),
    camera: () => world.cameraState(), diagnostics: () => world.diagnostics(),
    overview: async () => { await world.assetsReady; const image = world.overview(); worldPainted = false; return image; }
  });
}
if (import.meta.env.DEV && params.get('qa') === '1' && classic) {
  const changed = work => { work(); refresh(); return shift.view(); };
  window.riderQA = {
    state: () => structuredClone(shift.view()), action: type => changed(() => shift.action(type)), district,
    place: (x, z, heading = 0) => changed(() => shift.debug.place(x, z, heading)),
    warpToStop: key => changed(() => { const node = shift.debug.stops[key]; if (!node) throw Error('Unknown stop'); shift.debug.place(node.x, node.z); }),
    hurt: amount => changed(() => shift.debug.damage(amount, 'QA 碰撞')),
    elapse: seconds => changed(() => shift.debug.elapse(seconds))
  };
}
