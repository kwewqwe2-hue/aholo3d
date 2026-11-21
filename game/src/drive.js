// 世界单位为米、秒、弧度。正 heading / steer / lean 均表示向骑手右侧。
const STEP = 1 / 120;
const MAX_FRAME = 0.25;
const TOP_SPEED = 23;
const REVERSE_SPEED = 3.4;
const REVERSE_HOLD = 0.32;
const WHEELBASE = 1.38;
// 三个重叠圆覆盖轮头、车身与尾箱。转向时保留巷道侧面的净宽。
const PROBE_RADIUS = 0.55;
const PROBE_OFFSET = 0.61;
const SHOULDER_WIDTH = 1.8;
const IMPACT_COOLDOWN = 0.9;
const CONTACT_RELEASE = 0.16;
const nodeIndexes = new WeakMap();

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

export function createBike(x, z, heading = 0) {
  return {
    x, z, heading,
    speed: 0, lean: 0, steer: 0,
    steeringInput: 0, reverseHold: 0, stepRemainder: 0,
    contactAxes: 0, contactRelease: 0, impactCooldown: 0,
  };
}

// 多条道路在路口取并集。路宽为全宽，线段两端也有路面。
function shoulderDistance(x, z, district) {
  let nodes = nodeIndexes.get(district.nodes);
  if (!nodes || nodes.size !== district.nodes.length) {
    nodes = new Map(district.nodes.map(node => [node.id, node]));
    nodeIndexes.set(district.nodes, nodes);
  }
  let nearest = SHOULDER_WIDTH;
  for (const road of district.roads) {
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

function updateSpeed(bike, controls, roughness, grip) {
  const { throttle, brake, handbrake } = controls;
  const speed = bike.speed;
  const braking = 12.5 * grip;

  if (brake && !throttle && !handbrake && speed <= 0) {
    bike.reverseHold = Math.min(REVERSE_HOLD, bike.reverseHold + STEP);
    if (speed < 0 || bike.reverseHold >= REVERSE_HOLD) {
      return approach(speed, -REVERSE_SPEED, 3.6 * grip * STEP);
    }
    return 0;
  }
  bike.reverseHold = 0;
  if (brake || (throttle && speed < 0)) return approach(speed, 0, braking * STEP);
  if (throttle) {
    const limit = handbrake ? 5.2 : TOP_SPEED - 15 * roughness;
    const engine = (7.4 - 0.16 * speed) * (1 - 0.38 * roughness);
    const slowing = handbrake ? 8.5 * grip : 3.5 + 4.5 * roughness;
    const power = handbrake ? engine * 0.62 : engine;
    return approach(speed, limit, (speed > limit ? slowing : power) * STEP);
  }
  const rolling = 1.25 + 0.0035 * speed * speed + 2.8 * roughness;
  const drag = handbrake ? 8.5 * grip : (speed < 0 ? Math.max(2.4, rolling) : rolling);
  return approach(speed, 0, drag * STEP);
}

// 沿单轴扫掠一个圆。圆到建筑侧面的距离决定圆角余量，薄墙也会截住整段运动。
// 从初始轻微重叠处只限制更深入的运动，倒车退出仍走自身位移。
function sweepAxis(start, across, delta, alongX, district) {
  if (delta === 0) return 0;
  const { bounds } = district;
  const bound = delta > 0
    ? (alongX ? bounds.maxX : bounds.maxZ) - PROBE_RADIUS
    : (alongX ? bounds.minX : bounds.minZ) + PROBE_RADIUS;
  let end = delta > 0
    ? Math.min(start + delta, Math.max(start, bound))
    : Math.max(start + delta, Math.min(start, bound));

  for (const block of district.blocks) {
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

function sweepBody(start, across, delta, offset, acrossOffset, alongX, district) {
  let allowed = sweepAxis(start, across, delta, alongX, district);
  allowed = sweepAxis(start + offset, across + acrossOffset, allowed, alongX, district);
  return sweepAxis(start - offset, across - acrossOffset, allowed, alongX, district);
}

function probeFits(x, z, district) {
  const { bounds } = district;
  const r = PROBE_RADIUS - 1e-7;
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  for (const block of district.blocks) {
    const dx = Math.max(0, Math.abs(x - block.x) - block.w * 0.5);
    const dz = Math.max(0, Math.abs(z - block.z) - block.d * 0.5);
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
}

function driveStep(bike, controls, district, roughness, wet) {
  const grip = (wet ? 0.86 : 1) * (1 - 0.26 * roughness);
  const oldSpeed = bike.speed;
  bike.speed = updateSpeed(bike, controls, roughness, grip);
  const rollingSpeed = (oldSpeed + bike.speed) * 0.5;
  const turn = Number(Boolean(controls.right)) - Number(Boolean(controls.left));
  bike.steeringInput = approach(bike.steeringInput, turn, (turn ? 5.5 : 7.5) * STEP);

  // 低速靠轴距掉头，高速靠横向抓地力转弯。手刹通过收紧半径和降速辅助入弯。
  const tight = controls.handbrake;
  const radius = (tight ? 2.15 : 2.8) + rollingSpeed ** 2 / ((tight ? 15.5 : 12.8) * grip);
  bike.steer = bike.steeringInput * Math.atan(WHEELBASE / radius);
  const curvature = Math.tan(bike.steer) / WHEELBASE;
  const travel = rollingSpeed * STEP;
  const yaw = travel * curvature;
  const midpoint = bike.heading + yaw * 0.5;
  const forwardX = -Math.sin(midpoint);
  const forwardZ = Math.cos(midpoint);
  const offsetX = -Math.sin(bike.heading) * PROBE_OFFSET;
  const offsetZ = Math.cos(bike.heading) * PROBE_OFFSET;
  const nextOffsetX = -Math.sin(bike.heading + yaw) * PROBE_OFFSET;
  const nextOffsetZ = Math.cos(bike.heading + yaw) * PROBE_OFFSET;
  // 后轮沿弧线走，车身中心随轴距摆入弯内，靠墙也能朝外打把驶离。
  const dx = forwardX * travel + (nextOffsetX - offsetX);
  const dz = forwardZ * travel + (nextOffsetZ - offsetZ);
  const movedX = sweepBody(bike.x, bike.z, dx, offsetX, offsetZ, true, district);
  bike.x += movedX;
  const movedZ = sweepBody(bike.z, bike.x, dz, offsetZ, offsetX, false, district);
  bike.z += movedZ;
  const hitX = movedX !== dx;
  const hitZ = movedZ !== dz;
  const axes = (hitX ? 1 : 0) | (hitZ ? 2 : 0);
  bike.impactCooldown = Math.max(0, bike.impactCooldown - STEP);
  let impact = 0;
  if (axes) {
    const normal = Math.hypot(hitX ? forwardX : 0, hitZ ? forwardZ : 0);
    const closingSpeed = Math.abs(rollingSpeed) * normal;
    const newContact = (axes & ~bike.contactAxes) !== 0;
    if (normal > 0.82) bike.speed = 0;
    else if (newContact) bike.speed *= 1 - normal * 0.8;
    else bike.speed = approach(bike.speed, 0, 15 * normal * STEP);
    if (newContact && closingSpeed > 3.2 && bike.impactCooldown === 0) {
      impact = Math.min(24, Math.ceil((closingSpeed - 3.2) * 1.25));
      bike.impactCooldown = IMPACT_COOLDOWN;
    }
    // 前轮擦过墙角后，尾箱紧接着擦过仍算同一次接触。
    bike.contactAxes |= axes;
    bike.contactRelease = CONTACT_RELEASE;
  } else if (bike.contactAxes) {
    bike.contactRelease = Math.max(0, bike.contactRelease - STEP);
    if (bike.contactRelease === 0) bike.contactAxes = 0;
  }

  const canTurn = yaw !== 0 && (movedX !== 0 || movedZ !== 0)
    && probeFits(bike.x + nextOffsetX, bike.z + nextOffsetZ, district)
    && probeFits(bike.x - nextOffsetX, bike.z - nextOffsetZ, district);
  if (canTurn) bike.heading += yaw;
  const lateral = canTurn ? Math.max(0, bike.speed) ** 2 * curvature : 0;
  const leanTarget = Math.max(-0.72, Math.min(0.72, Math.atan2(lateral, 9.81)));
  bike.lean += (leanTarget - bike.lean) * (1 - Math.exp(-10 * STEP));
  return impact;
}

// dt 为秒。重开用 createBike；订单、动态实体与 HP 均由调用方持有。
export function tickBike(bike, controls, dt, district, wet = false) {
  let shoulder = shoulderDistance(bike.x, bike.z, district);
  let impact = 0;
  if (Number.isFinite(dt) && dt > 0) {
    const total = bike.stepRemainder + Math.min(dt, MAX_FRAME);
    const steps = Math.floor(total / STEP + 1e-9);
    bike.stepRemainder = Math.max(0, total - steps * STEP);
    for (let i = 0; i < steps; i++) {
      const oldX = bike.x;
      const oldZ = bike.z;
      impact = Math.max(impact, driveStep(bike, controls, district, shoulder / SHOULDER_WIDTH, wet));
      if (bike.x !== oldX || bike.z !== oldZ) shoulder = shoulderDistance(bike.x, bike.z, district);
    }
  }
  return { impact, offroad: shoulder > 0 };
}
