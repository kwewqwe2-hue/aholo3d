import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import courier from './assets/aholo/courier.glb?url';
import scooter from './assets/aholo/scooter.glb?url';
import flat from './assets/aholo/flat.glb?url';

const files = { courier, scooter, flat };
const active = new WeakMap();

function embeddedBytes(uri) {
  const comma = uri.indexOf(',');
  if (!/^data:[^,]*;base64$/i.test(uri.slice(0, comma))) throw Error('GLB was not embedded in the game');
  const encoded = uri.slice(comma + 1);
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded).buffer;
  const raw = atob(encoded), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function downloadModel(url, signal, cache) {
  const response = await fetch(url, { mode: 'same-origin', signal, cache });
  if (response.ok) return response.arrayBuffer();
  response.body?.cancel().catch(() => {});
  const error = new Error('GLB request failed: HTTP ' + response.status);
  error.status = response.status;
  throw error;
}

// Disposal cancels both the backoff and an outstanding second download.
// The initial load keeps its normal HTTP cache and transfer timing.
function retryDownload(url, signal) {
  return new Promise((resolve, reject) => {
    const transfer = new AbortController();
    let timer;
    function cancel() {
      clearTimeout(timer);
      transfer.abort();
      reject(signal.reason ?? new DOMException('GLB request aborted', 'AbortError'));
    }
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(async () => {
      timer = setTimeout(() => transfer.abort(), 90_000);
      try { resolve(await downloadModel(url, transfer.signal, 'reload')); }
      catch (error) { reject(error); }
      finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
    }, 500);
  });
}

async function modelBytes(uri, signal) {
  if (uri.startsWith('data:')) return embeddedBytes(uri);
  const url = new URL(uri, document.baseURI);
  if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) throw Error('Expected a same-origin GLB');
  try {
    return await downloadModel(url, signal, 'default');
  } catch (error) {
    const { status } = error;
    const transient = error instanceof TypeError || error.name === 'NetworkError' ||
      status === 408 || status === 429 || (status >= 500 && status <= 599);
    if (!transient || signal.aborted || error.name === 'AbortError') throw error;
  }
  return retryDownload(url, signal);
}

function model(gltf, name, moving = false) {
  const mesh = gltf.scenes.find(s => s.name === name + 'Scene')?.getObjectByName(name);
  if (!mesh?.isMesh || !mesh.material.map?.image || !mesh.material.roughnessMap?.image) {
    throw Error('Missing textured mesh ' + name);
  }
  const result = mesh.clone();
  result.userData.sourceMesh = name;
  result.castShadow = !moving;
  result.receiveShadow = true;
  result.geometry.computeBoundingBox();
  return result;
}

// Both glTF scenes (whole export and fitted part) share texture objects.
function release(gltf) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), bitmaps = new Set();
  const skeletons = new Set();
  for (const root of gltf.scenes) root.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.isSkinnedMesh) skeletons.add(obj.skeleton);
    geometry.add(obj.geometry);
    for (const m of [].concat(obj.material)) materials.add(m);
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    m.dispose();
  }
  for (const tex of textures) { bitmaps.add(tex.source.data); tex.dispose(); }
  for (const data of bitmaps) data?.close?.();
  for (const geo of geometry) geo.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

function residential(gltf, { scene, course }) {
  const block = course.blocks.find(b => b.id === 'northFlats');
  const shell = scene.getObjectByName('estate-shell-northFlats');
  if (!block || !shell) throw Error('Missing northFlats lot or replaceable estate shell');
  const module = model(gltf, 'FlatModule');
  const geometry = module.geometry, pos = geometry.attributes.position, index = geometry.index;
  const cornice = .232, returnZ = .012, leftJamb = -.209, rightJamb = .211, indices = [];
  // Keep the actual balconies, windows, entrances and their side returns. The
  // rear cut lies inside the host wall; the top ends under its eave.
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (Math.max(pos.getX(a), pos.getX(b), pos.getX(c)) > leftJamb &&
        Math.min(pos.getX(a), pos.getX(b), pos.getX(c)) < rightJamb &&
        Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c)) > returnZ &&
        Math.min(pos.getY(a), pos.getY(b), pos.getY(c)) < cornice) indices.push(a, b, c);
  }
  geometry.setIndex(indices);
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  for (const i of new Set(indices)) {
    pos.setX(i, THREE.MathUtils.clamp(pos.getX(i), leftJamb, rightJamb));
    pos.setY(i, Math.min(cornice, pos.getY(i)));
    pos.setZ(i, Math.max(returnZ, pos.getZ(i)));
    bounds.expandByPoint(point.fromBufferAttribute(pos, i));
  }
  pos.needsUpdate = true;
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  // Nine of the local window bays, stopping short of the existing central door.
  // Their new relief fits within the depth of the original south balconies.
  const bay = block.w / Math.floor(block.w / 3.9), width = 3 * bay, units = 3;
  const left = -block.w / 2 + bay, right = left + units * width, front = block.d / 2;
  const flats = new THREE.InstancedMesh(geometry, module.material, units);
  flats.name = 'AholoFlatNorth';
  flats.userData.sourceMesh = module.userData.sourceMesh;
  flats.position.set(block.x + (left + right) / 2, 0, block.z + front);
  flats.castShadow = flats.receiveShadow = true;
  const transform = new THREE.Object3D();
  const size = bounds.getSize(point), midX = (bounds.min.x + bounds.max.x) / 2;
  transform.scale.set((width - .12) / size.x, (block.h - .025) / size.y, 5.8);
  for (let i = 0; i < units; i++) {
    transform.position.set((i - (units - 1) / 2) * width - midX * transform.scale.x,
      -bounds.min.y * transform.scale.y, .140 - .04 * transform.scale.z);
    transform.updateMatrix();
    flats.setMatrixAt(i, transform.matrix);
  }
  flats.computeBoundingBox();
  flats.computeBoundingSphere();

  // Recess only the old window/rail fittings behind this strip. The continuous
  // building, roof slab, two tanks and every rooftop instance stay in place.
  const originals = [];
  flats.addEventListener('added', () => {
    const matrix = new THREE.Matrix4();
    shell.traverse(batch => {
      if (!batch.isInstancedMesh) return;
      let changed = false;
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const e = matrix.elements;
        if (e[12] <= left || e[12] >= right || e[13] >= block.h || e[14] < front - .05) continue;
        originals.push([batch, i, matrix.clone()]);
        e[14] -= 1.55;
        batch.setMatrixAt(i, matrix);
        changed = true;
      }
      if (changed) batch.instanceMatrix.needsUpdate = true;
    });
  });
  flats.addEventListener('removed', () => {
    for (const [batch, i, matrix] of originals.splice(0)) {
      batch.setMatrixAt(i, matrix);
      batch.instanceMatrix.needsUpdate = true;
    }
  });
  return { node: flats, parent: scene, role: 'north-residential-south-facade', space: 'world' };
}

function roadside(gltf, { scene, course }, id) {
  const person = id === 'courier';
  const node = model(gltf, person ? 'CourierStanding' : 'ScooterParked');
  const stop = person ? course.square : course.pickup;
  if (!stop) throw Error('Day 1 station is missing');
  node.name = person ? 'AholoCourierCheckIn' : 'AholoScooterPickup';
  // The plaza marshal looks back at the new rider. The scooter runs alongside
  // the shopfront, just beyond the stopping circle and outside the traffic lane.
  const x = stop.x + (person ? 5.55 : 6.30), z = stop.z + (person ? -6.60 : 4.10);
  node.rotation.y = person ? Math.atan2(stop.x - x, stop.z - z) : -Math.PI / 2;
  node.scale.setScalar(person ? 1 : 1.09);
  node.position.set(x, -node.geometry.boundingBox.min.y * node.scale.y, z);
  node.updateMatrixWorld();
  const bounds = new THREE.Box3().setFromObject(node, true);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const obstacle = { id: node.name, style: 'aholoFixture', x: center.x, z: center.z, w: size.x, d: size.z, h: size.y };
  return { node, parent: scene, obstacle, role: person ? 'plaza-check-in' : 'pickup-parked-scooter', space: 'world' };
}

function fitCourier(gltf, context) {
  const { headAnchor, localHead } = context.rider ?? {};
  const target = headAnchor?.userData.localBounds;
  if (!target || localHead?.parent !== headAnchor) return roadside(gltf, context, 'courier');
  const head = model(gltf, 'CourierHead', true);
  const box = head.geometry.boundingBox, center = box.getCenter(new THREE.Vector3());
  // Fit the temples. The two raised visors have different heights.
  const scale = (target.max[0] - target.min[0]) / (box.max.x - box.min.x);
  head.name = 'AholoCourierHead';
  head.scale.setScalar(scale);
  // The oblique source cut crosses the neck at y=.659. Sink the open edge
  // into the local neck while the chin joint carries all steering/kick motion.
  head.position.set((target.max[0] + target.min[0]) / 2 - center.x * scale,
    -.006 - .659 * scale, (target.max[2] + target.min[2]) / 2 - center.z * scale);
  const socket = context.rider.mounts?.performer;
  const suit = gltf.scenes.find(s => s.name === 'CourierPerformanceScene');
  const skin = suit?.getObjectByProperty('isSkinnedMesh', true);
  if (socket && skin) {
    suit.position.y = .9; // Imported bounds are centred about the waist.
    suit.traverse(part => {
      if (!part.isSkinnedMesh) return;
      part.castShadow = part.receiveShadow = true;
      part.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .03, 0), 1.55);
      part.userData.sourceMesh = 'CourierStanding';
    });
  }
  return { node: head, parent: headAnchor, hide: [localHead], role: 'player-head', space: 'headAnchor',
    performer: socket && skin ? { socket, suit } : null };
}

function fitScooter(gltf, context) {
  const chassis = context.rider?.mounts?.chassis;
  const shells = chassis?.children.filter(child => child.isMesh);
  if (!shells?.length || !context.rider.stem || context.rider.wheels?.length !== 2) {
    return roadside(gltf, context, 'scooter');
  }
  const node = model(gltf, 'ScooterChassis', true);
  node.name = 'AholoScooterChassis';
  node.castShadow = true;
  // Only the old rigid surfaces are exchanged. Grips, steering, both axles,
  // the cargo box and animated footrest targets retain their existing parents.
  return { node, parent: chassis, hide: shells, role: 'player-chassis', space: 'chassis' };
}

const installers = { courier: fitCourier, scooter: fitScooter, flat: residential };

/**
 * Call once after building the campaign scene and its player. Returns immediately.
 * ready resolves to {status, assets: {courier, scooter, flat}}. Each mounted record
 * identifies the source variant, visible node, role and placement coordinate space.
 * dispose() can be called before or after ready and restores the local art.
 */
export function attachAholoAssets(context) {
  const { scene, course, renderer } = context;
  if (active.has(scene)) return active.get(scene);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw Error('Expected an embedded GLB texture');
  });
  const loader = new GLTFLoader(manager);
  const transfers = new AbortController();
  const mounted = [];
  let disposed = false;

  async function mount(id) {
    let gltf;
    try {
      const bytes = await modelBytes(files[id], transfers.signal);
      if (disposed) return [id, { status: 'disposed' }];
      gltf = await loader.parseAsync(bytes, '');
      if (disposed) { release(gltf); return [id, { status: 'disposed' }]; }
      const { node, parent, hide = [], obstacle, role, space, performer } = installers[id](gltf, context);
      const visibility = hide.map(obj => [obj, obj.visible]);
      node.userData.aholo = { source: id + '.glb', variant: node.userData.sourceMesh,
        task: gltf.parser.json.asset.extras.task, role };
      parent.add(node);
      if (performer) performer.socket.add(performer.suit);
      for (const obj of hide) obj.visible = false;
      if (obstacle) course.blocks.push(obstacle);
      mounted.push(() => {
        node.removeFromParent();
        performer?.suit.removeFromParent();
        for (const [obj, visible] of visibility) obj.visible = visible;
        if (obstacle) {
          const index = course.blocks.indexOf(obstacle);
          if (index >= 0) course.blocks.splice(index, 1);
        }
        if (node.isInstancedMesh) node.dispose();
        release(gltf);
      });
      if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
      const record = { status: 'mounted', ...node.userData.aholo, node: node.name, space, position: node.position.toArray() };
      if (performer) {
        const skin = performer.suit.getObjectByProperty('isSkinnedMesh', true);
        let triangles = 0;
        performer.suit.traverse(part => { if (part.isSkinnedMesh) triangles += part.geometry.index.count / 3; });
        record.performer = { node: performer.suit.name, sourceMesh: 'CourierStanding', joints: skin.skeleton.bones.length,
          triangles, albedoWidth: skin.material.map.image.width };
      }
      return [id, record];
    } catch (error) {
      if (gltf) release(gltf);
      return [id, { status: 'failed', reason: error.message }];
    }
  }

  const ready = Promise.all(Object.keys(files).map(mount)).then(entries => {
    const assets = Object.fromEntries(entries);
    if (disposed) {
      for (const key of Object.keys(assets)) assets[key] = { status: 'disposed' };
      return { status: 'disposed', assets };
    }
    const count = entries.filter(([, item]) => item.status === 'mounted').length;
    return { status: count === entries.length ? 'ready' : count ? 'partial' : 'failed', assets };
  });
  const handle = { ready, dispose() {
    if (disposed) return;
    disposed = true;
    transfers.abort();
    for (const undo of mounted.splice(0)) undo();
    active.delete(scene);
    if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
  } };
  active.set(scene, handle);
  return handle;
}
