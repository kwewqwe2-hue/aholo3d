// 米、秒、弧度。+Z 为零朝向，正转向指向跟车镜头右方（世界 -X）。
const STEP = 1 / 120;
const TOP_SPEED = 22;
const WHEELBASE = 1.38;
const SHOULDER_WIDTH = 1.8;
const PROBE_RADIUS = 0.55;
const PROBE_OFFSET = 0.61;
const nodeIndexes = new WeakMap();

function approach(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

export function createVehicle(x, z, heading = 0) {
  return {
    x, z, heading, speed: 0, steer: 0, lean: 0,
    steeringInput: 0, sideSpeed: 0, reverseHold: 0, stepRemainder: 0,
    contactAxes: 0, contactRelease: 0, impactCooldown: 0,
  };
}

// 多条道路在路口取并集。路宽为全宽，线段两端也有路面。
function shoulderDistance(x, z, course) {
  let nodes = nodeIndexes.get(course.nodes);
  if (!nodes || nodes.size !== course.nodes.length) {
    nodes = new Map(course.nodes.map(node => [node.id, node]));
    nodeIndexes.set(course.nodes, nodes);
  }
  let nearest = SHOULDER_WIDTH;
  for (const road of course.roads) {
    const a = nodes.get(road.a);
    const b = nodes.get(road.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const along = lengthSq ? ((x - a.x) * dx + (z - a.z) * dz) / lengthSq : 0;
    const t = Math.max(0, Math.min(1, along));
    const gapX = x - (a.x + dx * t);
    const gapZ = z - (a.z + dz * t);
    const gapSq = gapX * gapX + gapZ * gapZ;
    const halfWidth = road.width * 0.5;
    if (gapSq <= halfWidth * halfWidth) return 0;
    if (gapSq < (halfWidth + nearest) ** 2) nearest = Math.sqrt(gapSq) - halfWidth;
  }
  return nearest;
}

function speedAfterInput(bike, controls, roughness, grip) {
  const { brake, handbrake, boost } = controls;
  const power = controls.throttle || boost;
  const speed = bike.speed;
  const serviceBrake = 13 * grip * STEP;
  if (brake && !power && !handbrake && speed <= 0) {
    bike.reverseHold = Math.min(0.28, bike.reverseHold + STEP);
    return speed < 0 || bike.reverseHold >= 0.28 ? approach(speed, -3.5, 4 * grip * STEP) : 0;
  }
  bike.reverseHold = 0;
  if (brake || (power && speed < 0)) return approach(speed, 0, serviceBrake);
  if (!power) {
    const rolling = 1.28 + 0.0038 * speed * speed + 2.8 * roughness;
    const drag = handbrake ? 9 * grip : Math.max(speed < 0 ? 2.6 : 0, rolling);
    return approach(speed, 0, drag * STEP);
  }
  const limit = handbrake ? 5.6 : TOP_SPEED - 13.5 * roughness + (boost ? 4 - 2.5 * roughness : 0);
  if (speed > limit) return approach(speed, limit, (handbrake ? 9 * grip : 2.7 + 5 * roughness) * STEP);
  const thrust = (8.1 - 0.19 * speed + (boost ? 4.8 : 0)) * (1 - 0.38 * roughness);
  return approach(speed, limit, thrust * (handbrake ? 0.64 : 1) * STEP);
}

// 反打先快速卸去旧把角，再逐渐建立新把角；轻拍的前段和持续满把各自可调。
function steeringAfterInput(value, target, fast) {
  if (!target) return approach(value, 0, STEP / (0.075 + 0.02 * fast));
  let time = STEP;
  if (target * value < 0) {
    const release = 0.048 + 0.012 * fast;
    time -= Math.abs(value) * release;
    if (time <= 0) return approach(value, 0, STEP / release);
    value = 0;
  }
  return approach(value, target, time / (0.14 + 0.055 * fast));
}

// 沿单轴扫掠一个圆。圆到建筑侧面的距离决定圆角余量，薄墙也会截住整段运动。
// 从初始轻微重叠处只限制更深入的运动，倒车退出仍走自身位移。
function sweepAxis(start, across, delta, alongX, course) {
  if (delta === 0) return 0;
  const { bounds } = course;
  const bound = delta > 0
    ? (alongX ? bounds.maxX : bounds.maxZ) - PROBE_RADIUS
    : (alongX ? bounds.minX : bounds.minZ) + PROBE_RADIUS;
  let end = delta > 0
    ? Math.min(start + delta, Math.max(start, bound))
    : Math.max(start + delta, Math.min(start, bound));

  for (const block of course.blocks) {
    const center = alongX ? block.x : block.z;
    const half = (alongX ? block.w : block.d) * 0.5;
    if (delta > 0 && (start >= center || end <= center - half - PROBE_RADIUS)) continue;
    if (delta < 0 && (start <= center || end >= center + half + PROBE_RADIUS)) continue;
    const acrossCenter = alongX ? block.z : block.x;
    const acrossHalf = (alongX ? block.d : block.w) * 0.5;
    const gap = Math.max(0, Math.abs(across - acrossCenter) - acrossHalf);
    if (gap >= PROBE_RADIUS) continue;
    const pad = Math.sqrt(PROBE_RADIUS * PROBE_RADIUS - gap * gap);
    if (delta > 0) end = Math.min(end, Math.max(start, center - half - pad));
    else end = Math.max(end, Math.min(start, center + half + pad));
  }
  return end === start + delta ? delta : end - start;
}

function sweepBody(start, across, delta, offset, acrossOffset, alongX, course) {
  let allowed = sweepAxis(start, across, delta, alongX, course);
  allowed = sweepAxis(start + offset, across + acrossOffset, allowed, alongX, course);
  return sweepAxis(start - offset, across - acrossOffset, allowed, alongX, course);
}

function probeFits(x, z, course) {
  const { bounds } = course;
  const r = PROBE_RADIUS - 1e-7;
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  for (const block of course.blocks) {
    const dx = Math.max(0, Math.abs(x - block.x) - block.w * 0.5);
    const dz = Math.max(0, Math.abs(z - block.z) - block.d * 0.5);
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
}

function advance(bike, controls, course, roughness, wet) {
  const grip = (wet ? 0.88 : 1) * (1 - 0.26 * roughness);
  const oldSpeed = bike.speed;
  bike.speed = speedAfterInput(bike, controls, roughness, grip);
  const speed = (oldSpeed + bike.speed) * 0.5;
  const blend = Math.max(0, Math.min(1, (Math.abs(speed) - 14) / 8));
  const fast = blend * blend * (3 - 2 * blend);
  const turn = Number(!!controls.right) - Number(!!controls.left);
  bike.steeringInput = steeringAfterInput(bike.steeringInput, turn, fast);
  const input = bike.steeringInput;
  const soft = 0.24 + 0.18 * fast;
  const lock = input * (1 - soft + soft * Math.abs(input));
  const lateralLimit = (22 - 8 * fast) * grip;
  const radius = controls.handbrake
    ? 1.65 + speed * speed / (lateralLimit * 1.18)
    : 1.95 + speed * speed / lateralLimit;
  bike.steer = Math.atan(WHEELBASE * lock / radius);
  const curvature = Math.tan(bike.steer) / WHEELBASE;
  const travel = speed * STEP;
  const yaw = travel * curvature;
  const mid = bike.heading + yaw * 0.5;
  const forwardX = -Math.sin(mid), forwardZ = Math.cos(mid);
  const offsetX = -Math.sin(bike.heading) * PROBE_OFFSET, offsetZ = Math.cos(bike.heading) * PROBE_OFFSET;
  const nextX = -Math.sin(bike.heading + yaw) * PROBE_OFFSET, nextZ = Math.cos(bike.heading + yaw) * PROBE_OFFSET;
  // 训练车受游戏互动产生的横移也走同一套实体扫掠。普通转向不会积累侧滑。
  const nextSide = approach(bike.sideSpeed, 0, 6 * STEP);
  const sideTravel = (bike.sideSpeed + nextSide) * 0.5 * STEP;
  bike.sideSpeed = nextSide;
  const dx = forwardX * travel - forwardZ * sideTravel + (nextX - offsetX);
  const dz = forwardZ * travel + forwardX * sideTravel + (nextZ - offsetZ);
  const movedX = sweepBody(bike.x, bike.z, dx, offsetX, offsetZ, true, course);
  bike.x += movedX;
  const movedZ = sweepBody(bike.z, bike.x, dz, offsetZ, offsetX, false, course);
  bike.z += movedZ;
  const hitX = movedX !== dx, hitZ = movedZ !== dz;
  const axes = (hitX ? 1 : 0) | (hitZ ? 2 : 0);
  bike.impactCooldown = Math.max(0, bike.impactCooldown - STEP);
  let impact = 0;
  if (axes) {
    const closing = Math.hypot(hitX ? dx : 0, hitZ ? dz : 0) / STEP;
    const normal = closing * STEP / Math.hypot(dx, dz);
    const fresh = (axes & ~bike.contactAxes) !== 0;
    if (normal > 0.82) bike.speed = 0;
    else if (fresh) bike.speed *= 1 - normal * 0.8;
    else bike.speed = approach(bike.speed, 0, 15 * normal * STEP);
    if (fresh && closing > 3.2 && bike.impactCooldown === 0) {
      impact = Math.min(24, Math.ceil((closing - 3.2) * 1.25));
      bike.impactCooldown = 0.9;
    }
    bike.contactAxes |= axes;
    bike.contactRelease = 0.16;
  } else if (bike.contactAxes) {
    bike.contactRelease = Math.max(0, bike.contactRelease - STEP);
    if (bike.contactRelease === 0) bike.contactAxes = 0;
  }

  const canTurn = yaw !== 0 && (movedX !== 0 || movedZ !== 0)
    && probeFits(bike.x + nextX, bike.z + nextZ, course)
    && probeFits(bike.x - nextX, bike.z - nextZ, course);
  if (canTurn) bike.heading += yaw;
  const lateral = canTurn && bike.speed > 0 ? bike.speed * bike.speed * curvature : 0;
  const lean = Math.max(-0.67, Math.min(0.67, Math.atan2(0.76 * lateral, 9.81)));
  bike.lean += (lean - bike.lean) * (1 - Math.exp(-13 * STEP));
  return impact;
}

// 冲刺持续时间和电量归入口所有。boost 为真期间提供推力，刹车有优先权。
export function stepVehicle(bike, controls, dt, course, wet = false) {
  let shoulder = shoulderDistance(bike.x, bike.z, course);
  let impact = 0;
  if (Number.isFinite(dt) && dt > 0) {
    const elapsed = bike.stepRemainder + Math.min(dt, 0.25);
    const steps = Math.floor(elapsed / STEP + 1e-9);
    bike.stepRemainder = Math.max(0, elapsed - steps * STEP);
    for (let i = 0; i < steps; i++) {
      const x = bike.x, z = bike.z;
      impact = Math.max(impact, advance(bike, controls, course, shoulder / SHOULDER_WIDTH, wet));
      if (x !== bike.x || z !== bike.z) shoulder = shoulderDistance(bike.x, bike.z, course);
    }
  }
  return { impact, offroad: shoulder > 0 };
}
