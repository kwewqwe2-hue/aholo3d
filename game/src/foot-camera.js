import { MathUtils, Vector3 } from 'three';
import { createStairLayout } from './stair-layout.js';

const { clamp, lerp } = MathUtils;
const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// A shoulder camera with a swept boom. It shares the stairs' actual floor,
// landing and portal dimensions so the ceiling of a lower flight cannot hide the rider.
export function createFootCamera(camera, course) {
  const stairs = createStairLayout(course);
  const solids = course.blocks.filter(b => b.h > .68);
  const eye = new Vector3(), focus = new Vector3(), ideal = new Vector3(), sample = new Vector3();
  let yaw = 0, pitch = .14, boom = 3, manualSeconds = 0;

  function insideBuilding(p) {
    const local = stairs.local(p);
    const ax = Math.abs(local.x), d = local.d;
    if (ax > stairs.halfWidth - .12 || d > stairs.depth - .12) return true;
    if (d < .15 && !(ax < stairs.doorHalf - .12 && p.y < 2.62)) return true;
    if (d < 0) return false;
    let base;
    if (d <= stairs.front) base = 0;
    else if (d >= stairs.back) base = stairs.rise;
    else {
      const t = clamp((d - stairs.front) / (stairs.back - stairs.front), 0, 1);
      base = local.x < 0 ? stairs.rise * t : stairs.floorHeight - stairs.rise * t;
    }
    for (let i = 0; i <= 2; i++) {
      const top = base + i * stairs.floorHeight;
      if (p.y >= top - .24 && p.y <= top + .13) return true;
    }
    return p.y <= .10;
  }
  function outsideObstruction(p, indoors) {
    if (p.y <= .14) return true;
    for (const b of solids) {
      if (p.y > b.h + .2 || Math.abs(p.x - b.x) > b.w / 2 + .14 ||
          Math.abs(p.z - b.z) > b.d / 2 + .14) continue;
      if (b.id === 'building7') {
        const local = stairs.local(p);
        if (local.d < 0 && Math.abs(local.x) < stairs.doorHalf && p.y < 2.6) continue;
        if (stairs.containsXZ(p)) return insideBuilding(p);
      }
      return true;
    }
    return indoors && stairs.local(p).d >= 0 && insideBuilding(p);
  }
  function orbit(dx, dy) {
    yaw -= dx * .005;
    pitch = clamp(pitch + dy * .0035, -.20, .46);
    manualSeconds = 3.0;
  }
  function follow(frame, dt, snap) {
    const player = frame.walker, indoor = player.indoors;
    if (snap) { yaw = player.heading; pitch = .14; manualSeconds = .30; }
    manualSeconds = Math.max(0, manualSeconds - dt);
    const guide = frame.waypoint;
    // A forward walking input can follow the camera into the next landing.
    // Strafing, backing up and a player's manual look always keep their own basis.
    const forward = frame.walkInput?.forward ?? 0, side = frame.walkInput?.side ?? 0;
    const handingOver = frame.motion?.type === 'knock' || frame.motion?.type === 'handoff';
    const target = handingOver ? stairs.door302 : guide;
    if (!manualSeconds && target && (handingOver || (forward > .25 && Math.abs(side) < .35))) {
      const dx = target.x - player.x, dz = target.z - player.z;
      if (Math.hypot(dx, dz) > .25) {
        const aim = Math.atan2(-dx, dz);
        const maxTurn = dt * (handingOver ? 2.8 : indoor ? 1.75 : .75);
        yaw += clamp(angleDelta(aim, yaw), -maxTurn, maxTurn);
      }
    }
    const fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const narrow = camera.aspect < .82;
    const shoulder = narrow ? .14 : indoor ? .34 : .46;
    const height = player.y || 0;
    const wanted = indoor ? (narrow ? 2.13 : 2.60) : (narrow ? 3.7 : 3.35);
    focus.set(player.x, height + 1.29, player.z);
    ideal.set(player.x - fx * wanted + rx * shoulder,
      height + (indoor ? 1.68 : 1.85) + pitch * wanted, player.z - fz * wanted + rz * shoulder);
    let clear = 1;
    for (let i = 1; i <= 30; i++) {
      sample.lerpVectors(focus, ideal, i / 30);
      if (outsideObstruction(sample, indoor)) { clear = Math.max(.105, (i - 1) / 30); break; }
    }
    const distance = wanted * clear;
    boom = snap ? distance : Math.min(distance, lerp(boom, distance, 1 - Math.exp(-8 * dt)));
    eye.lerpVectors(focus, ideal, boom / wanted);
    camera.position.copy(eye);
    const ahead = indoor ? 1.12 : 1.48;
    focus.set(player.x + fx * ahead + rx * shoulder * .88,
      height + (indoor ? 1.19 : 1.20) - pitch * .6,
      player.z + fz * ahead + rz * shoulder * .88);
    camera.lookAt(focus);
  }
  return { follow, orbit, get heading() { return yaw; } };
}
