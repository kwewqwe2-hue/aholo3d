import * as THREE from 'three';
import { createArt, makeBike } from '../src/world-art.js';
import { elevationAt } from './course.js';
import { buildNeighborhood, makePatrolCart } from './scene-art.js';
import { createFootCamera } from '../src/foot-camera.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const tau = 2 * Math.PI;
const deltaAngle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const damping = (rate, seconds) => 1 - Math.exp(-rate * seconds);

function pathFor(points) {
  const segments = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const size = Math.hypot(dx, dz);
    if (!size) continue;
    segments.push({ x: a.x, z: a.z, tx: dx / size, tz: dz / size, length: size, at: length });
    length += size;
  }
  return { segments, length };
}

function nearest(path, x, z) {
  let best = Infinity, along = 0, segment = path.segments[0];
  for (const s of path.segments) {
    const dx = x - s.x, dz = z - s.z;
    const t = clamp(dx * s.tx + dz * s.tz, 0, s.length);
    const gap = (dx - s.tx * t) ** 2 + (dz - s.tz * t) ** 2;
    if (gap < best) { best = gap; along = s.at + t; segment = s; }
  }
  return { distance: Math.sqrt(best), along, segment };
}

function pointOn(path, at) {
  const s = path.segments.find(part => at <= part.at + part.length) ?? path.segments.at(-1);
  const t = clamp(at - s.at, 0, s.length);
  return { x: s.x + s.tx * t, z: s.z + s.tz * t };
}

function skyDome(art, scene) {
  const geometry = art.keepGeometry(new THREE.SphereGeometry(183, 36, 22));
  const vertices = geometry.getAttribute('position'), colors = [];
  const horizon = new THREE.Color('#f7ddba'), zenith = new THREE.Color('#98beca');
  const lower = new THREE.Color('#d5d8bc'), tint = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i) / 183;
    tint.lerpColors(horizon, y < 0 ? lower : zenith, smoothstep(Math.abs(y), 0, y < 0 ? .20 : .57));
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = art.keepMaterial(new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
  }));
  const sky = art.mesh(scene, geometry, mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  const earth = art.keepGeometry(new THREE.PlaneGeometry(460, 460)); earth.rotateX(-Math.PI / 2);
  art.mesh(scene, earth, art.material('#a4b39a'), [0, -.055, -28]);
  return sky;
}

function shadowMaterial(art) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(24,42,45,.61)'); g.addColorStop(.54, 'rgba(35,47,48,.32)');
  g.addColorStop(1, 'rgba(35,47,48,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return art.keepMaterial(new THREE.MeshBasicMaterial({ map: art.texture(canvas), transparent: true, depthWrite: false }));
}

function roadChevron(art, parent) {
  const shape = new THREE.Shape();
  shape.moveTo(-.86, .47); shape.lineTo(0, -.15); shape.lineTo(.86, .47);
  shape.lineTo(.86, .10); shape.lineTo(0, -.60); shape.lineTo(-.86, .10); shape.closePath();
  const geometry = art.keepGeometry(new THREE.ShapeGeometry(shape)); geometry.rotateX(-Math.PI / 2);
  const marker = new THREE.Group(), face = new THREE.Group(); parent.add(marker); marker.add(face);
  face.position.y = .34; face.rotation.x = -.34;
  art.mesh(face, geometry, art.material('#315959', true), [0, 0, 0], [1.16, 1, 1.13]);
  art.mesh(face, geometry, art.material('#b4e5c7', true), [0, .021, 0], [1.01, 1, .88]);
  return marker;
}

function motionMarks(art, bike) {
  const kick = new THREE.Group(), trails = new THREE.Group();
  bike.grade.add(kick, trails);
  // Two brush marks emerge from the chosen running board. They never move either collision body.
  const shape = new THREE.Shape();
  shape.moveTo(0, .015); shape.quadraticCurveTo(.34, .24, .81, .20);
  shape.lineTo(.72, .30); shape.lineTo(1.07, .17); shape.lineTo(.77, .00);
  shape.lineTo(.82, .105); shape.quadraticCurveTo(.40, .10, 0, .015);
  const brush = art.keepGeometry(new THREE.ShapeGeometry(shape));
  const gold = art.keepMaterial(new THREE.MeshBasicMaterial({ color: '#ffdb65', side: THREE.DoubleSide }));
  const light = art.keepMaterial(new THREE.MeshBasicMaterial({ color: '#fff3b0', side: THREE.DoubleSide }));
  art.mesh(kick, brush, gold, [0, 0, 0]);
  art.mesh(kick, brush, light, [.17, -.16, .015], [.70, .75, 1]);
  kick.visible = false; trails.visible = false;
  for (const s of [-1, 1]) {
    art.box(trails, '#a6e4d1', [s * .24, .105, -.38], [.043, .018, .83], [0, -s * .11, 0], true);
    art.box(trails, '#6cbab0', [s * .31, .092, -.15], [.033, .014, .43], [0, -s * .12, 0], true);
  }
  trails.position.z = -.88;
  return { kick, trails };
}

function makeCameraRig(camera, course) {
  const main = pathFor(course.mainLine), short = pathFor(course.shortLine);
  const entryAt = nearest(main, course.landmarks.courtEntry.x, course.landmarks.courtEntry.z).along;
  const exitAt = nearest(main, course.landmarks.courtExit.x, course.landmarks.courtExit.z).along;
  const forkAt = nearest(main, course.landmarks.fork.x, course.landmarks.fork.z).along;
  const sight = course.blocks.find(b => b.style === 'exitSign') ?? course.landmarks.courtExit;
  const cameraBlocks = course.blocks.filter(b => b.h >= .9 || b.style === 'treeBed').map(b => ({
    x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, top: b.style === 'treeBed' ? 4.8 : b.h + .22,
  }));
  const look = new THREE.Vector3();
  let yaw = 0, preview = 0, boom = 5, rise = 2.7, gateFrame = 0;

  function nearRoute(bike) {
    const outer = nearest(main, bike.x, bike.z), inner = nearest(short, bike.x, bike.z);
    return inner.distance + .20 < outer.distance ? { path: short, ...inner } : { path: main, ...outer };
  }
  function viewBias(bike, match) {
    const { path, along, distance, segment } = match;
    const heading = bike.heading, speed = Math.abs(bike.speed);
    const facing = -Math.sin(heading) * segment.tx + Math.cos(heading) * segment.tz;
    if (facing <= .35 || bike.speed < -.25 || distance > 7.8) return 0;
    const lead = pointOn(path, along + 13 + Math.min(speed, 19) * .40);
    const toward = candidate => deltaAngle(Math.atan2(bike.x - candidate.x, candidate.z - bike.z), heading);
    let angle = toward(lead) * .70;
    if (path === main && along > entryAt - 15 && along < exitAt) {
      const weight = smoothstep(along, entryAt - 15, entryAt + 1) * (1 - smoothstep(along, exitAt - 15, exitAt));
      angle = lerp(angle, toward(sight) * .84, weight * .83);
    }
    // Before the choice the camera sees both mouths, even if the HUD currently suggests the outer line.
    if (along > forkAt - 14 && along < forkAt + 2) {
      angle *= .35 + .65 * smoothstep(Math.abs(along - forkAt + 5), 1, 9);
    }
    return clamp(angle, -.44, .44) * smoothstep(facing, .35, .87) * (1 - smoothstep(distance, 4, 7.8));
  }

  function follow(bike, dt, snap, guard) {
    const match = nearRoute(bike), bias = viewBias(bike, match);
    yaw = snap ? bike.heading : yaw + deltaAngle(bike.heading, yaw) * damping(9.5, dt);
    preview = snap ? bias : lerp(preview, bias, damping(5.7, dt));
    const fast = clamp(Math.abs(bike.speed) / 22, 0, 1);
    const narrow = 1 - smoothstep(camera.aspect, .54, 1.48);
    let gateInterest = 0;
    if (guard && course.guardPost) {
      const inbound = smoothstep(Math.cos(bike.heading-course.guardStart.heading), .32, .84);
      if (guard.phase === 'posted') {
        gateInterest = (1-smoothstep(Math.hypot(bike.x-course.gate.x,bike.z-course.gate.z),9,30))*inbound;
      } else if (guard.phase === 'alert') gateInterest = inbound;
      else if (guard.phase === 'boarding') gateInterest = (1-smoothstep(guard.progress,.16,.72))*inbound;
    }
    gateFrame = snap ? gateInterest : lerp(gateFrame,gateInterest,damping(gateInterest>gateFrame?12:4,dt));
    // Move most of the preview around the rider rather than panning the rider out of frame.
    // Reserve horizontal room for a cart on either side, regardless of whether it is present.
    const orbitShare = lerp(.74, .89, narrow), orbit = yaw + preview * orbitShare;
    const fx = -Math.sin(orbit), fz = Math.cos(orbit);
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
    const base = course.campaign ? 4.15 : 5.10;
    const frameWidth = course.campaign ? 4.37 : 5.15;
    const wanted = Math.max(base + fast * .85 + narrow * 1.75, Math.min(12, frameWidth / halfFov))
      + 5.3*narrow*gateFrame;
    const elevation = elevationAt(bike.x, bike.z);
    let gentle = wanted, solid = wanted;
    const wantedRise = (course.campaign ? 2.03 : 2.55) + fast * .39 + narrow * .30;
    // Anticipate a wall over a 2 m band. The solid limit only serves as the last clearance stop.
    for (const b of cameraBlocks) {
      if (Math.abs(bike.x - b.x) > b.hw + wanted + 2.2 || Math.abs(bike.z - b.z) > b.hd + wanted + 2.2) continue;
      for (let i = 1; i <= 17; i++) {
        const s = wanted * i / 17, y = elevation + lerp(1.20, wantedRise, s / wanted);
        const x = bike.x - fx * s, z = bike.z - fz * s;
        const gap = Math.hypot(Math.max(0, Math.abs(x - b.x) - b.hw),
          Math.max(0, Math.abs(z - b.z) - b.hd), Math.max(0, y - b.top));
        const clear = Math.max(.43, s - .38);
        gentle = Math.min(gentle, lerp(clear, wanted, smoothstep(gap, .16, 2.0)));
        if (gap < .14) solid = Math.min(solid, clear);
      }
    }
    boom = snap ? gentle : Math.min(solid, lerp(boom, gentle, damping(gentle < boom ? 13 : 4.6, dt)));
    const eye = wantedRise + .88 * (1 - boom / wanted);
    rise = snap ? eye : lerp(rise, eye, damping(7, dt));
    camera.position.set(bike.x - fx * boom, elevation + rise, bike.z - fz * boom);
    const ahead = 3.10 + fast * 2.1;
    // Bias the line of sight by its total camera-to-target distance. The bike stays in the lower frame.
    const side = Math.tan(preview * (1 - orbitShare)) * (boom + ahead) + .91*gateFrame;
    look.set(bike.x + fx * ahead - fz * side, elevation + (course.campaign ? .90 : .72), bike.z + fz * ahead + fx * side);
    if (narrow*gateFrame>.004 && course.guardPost) {
      // Frame the actual two subjects in the portrait *horizontal* field of view.
      // A fixed pan frames a slow crossing but lets the cap and exclamation escape at speed.
      const eye=camera.position, post=course.guardPost;
      const riderAngle=Math.atan2(bike.x-eye.x,bike.z-eye.z);
      const guardOffset=deltaAngle(Math.atan2(post.x-eye.x,post.z-eye.z),riderAngle);
      const baseAngle=Math.atan2(look.x-eye.x,look.z-eye.z);
      const riderRoom=Math.atan(halfFov*.78),guardRoom=Math.atan(halfFov*.67);
      const low=Math.max(-riderRoom,guardOffset-guardRoom),high=Math.min(riderRoom,guardOffset+guardRoom);
      const offset=low<=high?clamp(deltaAngle(baseAngle,riderAngle),low,high):guardOffset*.53;
      const a=baseAngle+deltaAngle(riderAngle+offset,baseAngle)*narrow*gateFrame;
      const range=Math.hypot(look.x-eye.x,look.z-eye.z);
      look.x=eye.x+Math.sin(a)*range;look.z=eye.z+Math.cos(a)*range;
    }
    camera.lookAt(look);
    return match;
  }
  return { follow };
}

export function createTrialScene(canvas, course, {
  buildEnvironment = buildNeighborhood, makePlayer = makeBike, attachAssets, createActors, createResidents, setupLighting, updateInterior,
  onFootfall, onCourtBounce,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene();
  const { minX, maxX, minZ, maxZ } = course.bounds;
  // The merchant street looks across the whole estate to buildings beyond its western edge.
  const far = course.campaign ? Math.hypot(maxX - minX, maxZ - minZ) + 110 : 225;
  const camera = new THREE.PerspectiveCamera(59, 1, .10, far);
  const art = createArt(), sky = skyDome(art, scene);
  scene.fog = new THREE.Fog('#ded9c2', 64, 143);
  const fill = new THREE.HemisphereLight('#e0edf0', '#c1b398', 1.50);
  const sun = new THREE.DirectionalLight('#ffecd1', 1.80);
  sun.position.set(61, 92, 20); sun.target.position.set(3, 0, -35);
  scene.add(fill, sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -101, right: 101, top: 92, bottom: -92, near: 8, far: 240 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.normalBias = .105; sun.shadow.bias = -.00024;
  const environment = buildEnvironment(art, scene, course);
  if (environment?.userData?.assetsReady) {
    scene.userData.estateTexturesReady = Promise.all([
      scene.userData.estateTexturesReady, environment.userData.assetsReady,
    ]);
  }
  const rider = makePlayer(art), patrol = makePatrolCart(art, course.campaign);
  scene.add(rider.root, patrol.root); patrol.root.visible = false;
  const sceneParts = { art, scene, course, renderer, sun, camera, rider, patrol, environment, onFootfall, onCourtBounce };
  const actors = createActors?.(sceneParts);
  const residents = createResidents?.(sceneParts);
  const lighting = setupLighting?.(sceneParts);
  const footCamera = course.campaign ? createFootCamera(camera, course) : null;
  const marks = motionMarks(art, rider), marker = roadChevron(art, scene);
  const mat = shadowMaterial(art), plane = art.keepGeometry(new THREE.PlaneGeometry(1, 1)); plane.rotateX(-Math.PI / 2);
  const riderShadow = art.mesh(scene, plane, mat, [0, .016, 0], [1.30, 1, 2.43]);
  const patrolShadow = art.mesh(scene, plane, mat, [0, .016, 0], [1.48, 1, 2.43]);
  const rig = makeCameraRig(camera, course);
  const last = { x: NaN, z: NaN, heading: 0, spin: 0 };
  const other = { x: NaN, z: NaN, heading: 0, spin: 0 };
  let previousTime = -1, lastSide = 0, kickAt = 0, dead = false, restored = false;
  let activeMode = 'bike', bikeHeading = 0;
  const transitionEye = new THREE.Vector3(), transitionRotation = new THREE.Quaternion();
  let changeAt = -Infinity;
  let pixelsX = 0, pixelsY = 0, pixelRatio = 0;
  let attachments;
  attachments = attachAssets?.({ scene, course, rider, renderer, art });
  const assetsReady = Promise.all([attachments?.ready, actors?.ready, residents?.ready, lighting?.ready,
    environment?.userData?.assetsReady, scene.userData.estateTexturesReady, scene.userData.stairTexturesReady]).then(([result]) => {
    renderer.shadowMap.needsUpdate = true;
    return result ?? { status: 'ready', assets: {} };
  });

  function resize() {
    if (dead) return;
    const w = Math.max(1, Math.round(canvas.clientWidth || canvas.getBoundingClientRect().width));
    const h = Math.max(1, Math.round(canvas.clientHeight || canvas.getBoundingClientRect().height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    if (w === pixelsX && h === pixelsY && dpr === pixelRatio) return;
    pixelsX = w; pixelsY = h; pixelRatio = dpr;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = lerp(86, 59, smoothstep(camera.aspect, .54, 1.48));
    camera.updateProjectionMatrix();
  }
  function roll(state, position, radius, reset) {
    if (reset || !Number.isFinite(state.x)) state.spin = 0;
    else {
      const mid = state.heading + deltaAngle(position.heading, state.heading) / 2;
      const travel = -(position.x - state.x) * Math.sin(mid) + (position.z - state.z) * Math.cos(mid);
      state.spin = (state.spin + travel / radius) % tau;
    }
    state.x = position.x; state.z = position.z; state.heading = position.heading;
    return state.spin;
  }
  function poseRoot(root, shade, vehicle) {
    const h = elevationAt(vehicle.x, vehicle.z);
    root.position.set(vehicle.x, h + .010, vehicle.z); root.rotation.y = -vehicle.heading;
    shade.position.set(vehicle.x, h + .015, vehicle.z); shade.rotation.y = -vehicle.heading;
  }
  function updateMarks(frame, reset) {
    const kick = frame.kick || 0, side = Math.sign(kick), now = frame.elapsed ?? 0;
    if (reset || side !== lastSide) kickAt = now;
    lastSide = side;
    marks.kick.visible = !!side && frame.stage === 'drive';
    if (marks.kick.visible) {
      const amount = Math.abs(kick), sweep = smoothstep(now - kickAt, 0, .13);
      marks.kick.position.set(-side * (.38 + sweep * .29), .53, -.33);
      marks.kick.scale.set(-side * (.59 + .55 * amount), .65 + .35 * amount, 1);
    }
    const boost = clamp(frame.boost || 0, 0, 1);
    marks.trails.visible = boost > .025 && frame.stage === 'drive';
    marks.trails.scale.z = .48 + .86 * boost;
  }
  function render(frame, dt = 0) {
    if (dead || !frame?.bike) return;
    resize();
    const bike = frame.bike, time = frame.elapsed ?? 0;
    const mode = frame.travelMode ?? 'bike';
    const changedMode = mode !== activeMode;
    activeMode = mode;
    bikeHeading = bike.heading;
    const snap = restored || !Number.isFinite(last.x) || time < previousTime
      || Math.hypot(bike.x - last.x, bike.z - last.z) > 10;
    if (snap) changeAt = -Infinity;
    else if (changedMode) {
      changeAt = time;
      transitionEye.copy(camera.position); transitionRotation.copy(camera.quaternion);
    }
    restored = false; previousTime = time;
    const step = frame.paused ? 0 : clamp(Number.isFinite(dt) ? dt : 0, 0, .15);
    const rearLamp = rider.materials?.rearLight;
    if (course.campaign && rearLamp) {
      const level = mode==='bike' && frame.stage==='drive' ? (frame.braking ? 2.25 : .24) : .055;
      rearLamp.emissiveIntensity = snap ? level : lerp(rearLamp.emissiveIntensity,level,damping(24,step));
    }
    poseRoot(rider.root, riderShadow, bike);
    rider.bank.rotation.z = clamp(bike.lean || 0, -.75, .75);
    rider.stem.rotation.y = -clamp(bike.steer || 0, -.71, .71);
    rider.updatePose?.(frame.kick || 0, time);
    const rotation = roll(last, bike, .289, snap);
    for (const wheel of rider.wheels) wheel.rotation.x = rotation;
    updateMarks(frame, snap);
    if (mode === 'foot') { marks.kick.visible = false; marks.trails.visible = false; }
    const p = frame.pursuer;
    patrol.root.visible = patrolShadow.visible = !!p?.visible;
    if (patrol.root.visible) {
      poseRoot(patrol.root, patrolShadow, p);
      patrol.body.rotation.z = clamp((p.lean || 0) * .10, -.056, .056);
      const spin = roll(other, p, .223, snap);
      for (const wheel of patrol.wheels) wheel.rotation.x = spin;
      for (const hub of patrol.steering) hub.rotation.y = -clamp(p.steer || 0, -.65, .65);
    } else other.x = NaN;

    updateInterior?.(scene, frame);
    actors?.update(frame, step);
    residents?.update(frame, step);
    environment?.userData?.updateStreet?.(frame, step);
    let match;
    if (mode === 'foot' && frame.walker && footCamera) {
      footCamera.follow(frame, step, snap || changedMode);
    } else {
      match = rig.follow(bike, step, snap || changedMode, frame.guard);
    }
    if (time - changeAt < .38) {
      const from = 1 - smoothstep(time - changeAt, 0, .38);
      camera.position.lerp(transitionEye, from);
      camera.quaternion.slerp(transitionRotation, from);
    }
    sky.position.copy(camera.position);
    const next = frame.waypoint, fork = course.landmarks.fork;
    const choosing = frame.passedGate && Math.hypot(bike.x - fork.x, bike.z - fork.z) < 13;
    marker.visible = mode === 'bike' && frame.stage === 'drive' && !!next && !choosing
      && Math.hypot(next.x - bike.x, next.z - bike.z) > 2.9
      && Math.hypot(next.x - course.finish.x, next.z - course.finish.z) > 3;
    if (marker.visible) {
      const { segment } = nearest(match.path, next.x, next.z);
      marker.position.set(next.x, elevationAt(next.x, next.z) + .02, next.z);
      marker.rotation.y = Number.isFinite(frame.waypointYaw) ? frame.waypointYaw : Math.atan2(segment.tx, segment.tz);
    }
    lighting?.update(frame, camera, step);
    renderer.render(scene, camera);
  }
  function onRestore() {
    restored = true; renderer.shadowMap.needsUpdate = true;
  }
  canvas.addEventListener('webglcontextrestored', onRestore);
  function dispose() {
    if (dead) return;
    dead = true; canvas.removeEventListener('webglcontextrestored', onRestore);
    residents?.dispose?.(); actors?.dispose?.(); lighting?.dispose?.();
    scene.traverse(obj => { if (obj.isInstancedMesh) obj.dispose(); });
    attachments?.dispose?.();
    sun.shadow.dispose(); art.dispose(); scene.clear();
    renderer.resetState(); renderer.dispose();
  }
  resize();
  const result = { render, resize, dispose, assetsReady,
    heading: () => activeMode === 'foot' && footCamera ? footCamera.heading : bikeHeading,
    orbit: (dx, dy) => { if (activeMode === 'foot') footCamera?.orbit(dx, dy); }
  };
  if (import.meta.env.DEV) {
    result.cameraState = () => ({ heading: result.heading(), position: camera.position.toArray(),
      direction: camera.getWorldDirection(new THREE.Vector3()).toArray(), mode: activeMode, fov: camera.fov });
    result.diagnostics = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      width: canvas.width, height: canvas.height, dpr: renderer.getPixelRatio() });
    // The overview uses the exact same scene, transforms, materials and loaded models as the ride.
    result.overview = () => {
      const { minX, maxX, minZ, maxZ } = course.bounds;
      const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
      const aspect = canvas.width / canvas.height;
      const half = Math.max((maxX - minX) / aspect, (maxZ - minZ) * 0.93 + 13) * .51;
      const overview = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 650);
      overview.position.set(x, 310, z + 122);
      overview.lookAt(x, 2, z);
      const drivingFog = scene.fog, skyVisible = sky.visible;
      try {
        scene.fog = null;
        sky.visible = false;
        renderer.render(scene, overview);
        return canvas.toDataURL('image/png');
      } finally {
        scene.fog = drivingFog;
        sky.visible = skyVisible;
      }
    };
  }
  return result;
}
