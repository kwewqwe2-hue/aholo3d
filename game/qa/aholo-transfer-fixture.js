// A QA-only entry for driving the real attachment lifetime without modifying
// the production game or exposing a player/scene handle in shipped builds.
import { Scene, Group } from 'three';
import { attachAholoAssets } from '../src/aholo-assets.js';

const scene = new Scene();
const shell = new Group(), headAnchor = new Group(), localHead = new Group(), performer = new Group();
shell.name = 'estate-shell-northFlats';
headAnchor.userData.localBounds = { min: [-.116, 0, -.135], max: [.116, .313, .135] };
headAnchor.add(localHead);
scene.add(shell, headAnchor, performer);
const flat = { id: 'northFlats', x: 0, z: 0, w: 42, d: 15, h: 14 };
const course = { blocks: [flat], pickup: { x: 12, z: 40 } };
const context = { scene, course, rider: { headAnchor, localHead, mounts: { performer } } };
let handle;

function restored() {
  return localHead.visible && performer.children.length === 0 && headAnchor.children.length === 1 &&
    course.blocks.length === 1 && !scene.getObjectByName('AholoFlatNorth') && !scene.getObjectByName('AholoScooterPickup');
}

function disposeMounted() {
  const skin = performer.getObjectByProperty('isSkinnedMesh', true);
  if (!skin || localHead.visible) throw Error('No mounted courier to dispose');
  const skeleton = skin.skeleton;
  skeleton.computeBoneTexture();
  const bitmap = skin.material.map.image;
  const watched = { geometry: skin.geometry, material: skin.material, albedo: skin.material.map,
    roughness: skin.material.roughnessMap, boneTexture: skeleton.boneTexture };
  const disposals = Object.fromEntries(Object.keys(watched).map(k => [k, 0]));
  for (const [k, resource] of Object.entries(watched)) resource.addEventListener('dispose', () => disposals[k]++);
  const before = { joints: skeleton.bones.length, albedoWidth: bitmap.width };
  handle.dispose(); handle.dispose();
  return { before, disposals, boneTextureReleased: skeleton.boneTexture === null,
    bitmapClosed: bitmap instanceof ImageBitmap ? bitmap.width === 0 : null, restored: restored() };
}

window.transferFixture = {
  start() { handle = attachAholoAssets(context); return handle === attachAholoAssets(context); },
  ready: () => handle.ready,
  dispose() { handle.dispose(); handle.dispose(); },
  restored, disposeMounted,
};
