import { createVehicle, stepVehicle } from './handling.js';

// 外线陪跑，距离只用于显示、判断并排互动；远处的玩家不参与速度曲线。
const STEP = 1 / 120;
const PRACTICE_CRUISE = 18.5, CAMPAIGN_CRUISE = 20.2;
const laneCache = new WeakMap();

function project(leg, point) {
  const dx = point.x - leg.x, dz = point.z - leg.z;
  const along = Math.max(0, Math.min(leg.length, dx * leg.tx + dz * leg.tz));
  return { along, distanceSq: (dx - leg.tx * along) ** 2 + (dz - leg.tz * along) ** 2 };
}

function legsFrom(points, cruise) {
  const legs = [];
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) continue;
    legs.push({ x: a.x, z: a.z, tx: dx / length, tz: dz / length, length, start: distance, exitSpeed: cruise });
    distance += length;
  }
  return legs;
}

function nearestLeg(legs, point) {
  let best = Infinity, index = 0;
  for (let i = 0; i < legs.length; i++) {
    const distanceSq = project(legs[i], point).distanceSq;
    if (distanceSq < best) { index = i; best = distanceSq; }
  }
  return index;
}

function laneFor(course) {
  if (laneCache.has(course)) return laneCache.get(course);
  const cruise = course.campaign ? CAMPAIGN_CRUISE : PRACTICE_CRUISE;
  const line = legsFrom(course.mainLine || [], cruise);
  if (!line.length || !course.guardStart) return null;
  const guard = course.guardStart;
  const launch = line[nearestLeg(line, guard)];
  const lateral = -(guard.x - launch.x) * launch.tz + (guard.z - launch.z) * launch.tx;
  const offset = lateral < 0 ? -2 : 2;
  const points = [];
  // 在岗亭这一侧留一辆车的位置。相邻段共用同一个偏置顶点，转角处没有跳线。
  for (let i = 0; i <= line.length; i++) {
    const prev = line[Math.max(0, i - 1)], next = line[Math.min(i, line.length - 1)];
    const jointX = i < line.length ? next.x : prev.x + prev.tx * prev.length;
    const jointZ = i < line.length ? next.z : prev.z + prev.tz * prev.length;
    const divisor = Math.max(0.8, 1 + prev.tx * next.tx + prev.tz * next.tz);
    points.push({ x: jointX - offset * (prev.tz + next.tz) / divisor,
      z: jointZ + offset * (prev.tx + next.tx) / divisor });
  }
  const legs = legsFrom(points, cruise);
  if (!legs.length) return null;
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = legs[i], b = legs[i + 1];
    const angle = Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.tz * b.tz)));
    if (angle > 0.01) {
      const span = Math.min(7, (a.length + b.length) * 0.5);
      a.exitSpeed = Math.min(cruise, Math.sqrt(14 * span / angle));
    }
  }
  legs.at(-1).exitSpeed = 0;
  const connections = new Map();
  for (const { a, b } of course.roads) {
    connections.set(a, (connections.get(a) || 0) + 1);
    connections.set(b, (connections.get(b) || 0) + 1);
  }
  const junctions = [];
  for (const node of course.nodes) {
    if ((connections.get(node.id) || 0) < 3) continue;
    const leg = legs[nearestLeg(legs, node)], foot = project(leg, node);
    if (foot.distanceSq < 25) junctions.push(leg.start + foot.along);
  }
  const lane = { legs, end: points.at(-1), side: Math.sign(offset), junctions, cruise };
  laneCache.set(course, lane);
  return lane;
}

export function playerFrame(pursuer, bike) {
  const dx = pursuer.x - bike.x, dz = pursuer.z - bike.z;
  const s = Math.sin(bike.heading), c = Math.cos(bike.heading);
  return { side: -c * dx - s * dz, along: -s * dx + c * dz };
}

export function createPursuer() {
  return { ...createVehicle(0, 0), visible: false, active: false, finished: false, gap: Infinity,
    pushed: false, pushSide: null, reachSide: null, pushTime: 0, pushCooldown: 0, pushLocked: false, pushSpeed: 0,
    segment: -1, passSide: 0, passOffset: 0, launchTime: 0, paceRemainder: 0 };
}

function reachableSide(pursuer, bike) {
  if (!pursuer.active || pursuer.finished || pursuer.pushLocked || pursuer.pushCooldown > 0) return null;
  const relative = playerFrame(pursuer, bike);
  const lateral = Math.abs(relative.side);
  if (lateral < 0.45 || lateral > 3.35 || Math.abs(relative.along) > 2.1
    || Math.hypot(lateral, relative.along) > 3.65) return null;
  return relative.side < 0 ? 'left' : 'right';
}

// 推开只改变巡逻车的速度，横向位移在后续驾驶步内扫掠，保留车轮着地与朝向。
export function pushAside(pursuer, bike, side) {
  if ((side !== 'left' && side !== 'right') || reachableSide(pursuer, bike) !== side) return false;
  const sign = side === 'right' ? 1 : -1;
  pursuer.pushed = true;
  pursuer.pushLocked = true;
  pursuer.pushSide = side;
  pursuer.reachSide = null;
  pursuer.passSide = sign;
  pursuer.pushTime = 0.95;
  pursuer.pushCooldown = 1.45;
  pursuer.pushSpeed = Math.max(0, pursuer.speed * 0.62);
  pursuer.speed = Math.max(0, pursuer.speed * 0.85);
  pursuer.sideSpeed = sign * 4.2 * Math.cos(pursuer.heading - bike.heading);
  return true;
}

// 只偏移陪跑车的前视目标。玩家压着它的路线驶来时先选空侧，交错过程中不反复换边。
function passingOffset(p, bike, leg, laneSide, sameWay) {
  const dx = p.x - bike.x, dz = p.z - bike.z;
  const along = dx * leg.tx + dz * leg.tz;
  const across = -dx * leg.tz + dz * leg.tx;
  let target = 0;
  if (sameWay && Math.abs(along) < 14 && Math.abs(across) < 5) {
    if (!p.passSide) p.passSide = Math.abs(across) < 0.35 ? -laneSide : Math.sign(across);
    const playerOffset = -(bike.x - leg.x) * leg.tz + (bike.z - leg.z) * leg.tx;
    const space = p.pushed ? 2.8 : 1.9;
    const available = p.passSide === laneSide ? 1.4 : 4.8;
    target = p.passSide * Math.max(0, Math.min(available, p.passSide * playerOffset + space));
  } else {
    p.passSide = 0;
  }
  const change = target - p.passOffset;
  p.passOffset += Math.sign(change) * Math.min(Math.abs(change), (target ? 6 : 1.8) * STEP);
  return p.passOffset;
}

function followStep(p, bike, course, lane, targetLine) {
  const { legs, end } = lane;
  let leg = legs[p.segment], foot = project(leg, p);
  // 仅从当前段进入相邻下一段。近线经过或玩家掉头不会使巡逻车换段。
  while (p.segment + 1 < legs.length && leg.length - foot.along < 12) {
    const next = legs[p.segment + 1], other = project(next, p);
    if (foot.along < leg.length - 0.06 && other.distanceSq + 0.015 >= foot.distanceSq) break;
    p.segment++;
    leg = next;
    foot = other;
  }
  const distance = leg.start + foot.along;
  const sight = 4 + Math.abs(p.speed) * 0.36;
  let aimLeg = leg, targetSpeed = lane.cruise;
  for (let i = p.segment; i < legs.length; i++) {
    const upcoming = legs[i];
    if (upcoming.start - distance > 40) break;
    if (upcoming.start <= distance + sight) aimLeg = upcoming;
    const runIn = Math.max(0, upcoming.start + upcoming.length - distance - (upcoming.exitSpeed ? 3.5 : 0.5));
    targetSpeed = Math.min(targetSpeed, Math.sqrt(upcoming.exitSpeed ** 2 + 15 * runIn));
  }
  const t = Math.max(0, Math.min(aimLeg.length, distance + sight - aimLeg.start));
  const sameWay = Math.cos(p.heading - bike.heading) > 0.9;
  const baseX = aimLeg.x + aimLeg.tx * t, baseZ = aimLeg.z + aimLeg.tz * t;
  let offset;
  if (targetLine) {
    const lateral = (targetLine.x - p.x) * targetLine.nx + (targetLine.z - p.z) * targetLine.nz;
    const sideSpeed = Math.max(-2.6, Math.min(2.6, lateral * 3));
    p.sideSpeed += Math.max(-14 * STEP, Math.min(14 * STEP, sideSpeed - p.sideSpeed));
    offset = (targetLine.x - baseX) * targetLine.nx + (targetLine.z - baseZ) * targetLine.nz;
  } else offset = passingOffset(p, bike, leg, lane.side, sameWay);
  const aimX = baseX - aimLeg.tz * offset;
  const aimZ = baseZ + aimLeg.tx * offset;
  const aim = Math.atan2(p.x - aimX, aimZ - p.z);
  const error = Math.atan2(Math.sin(aim - p.heading), Math.cos(aim - p.heading));
  if (Math.abs(error) > 0.55) targetSpeed = Math.min(targetSpeed, 6.6);
  const relative = playerFrame(p, bike);
  p.launchTime += STEP;
  // 若岗亭在玩家前方，出岗时缓行让玩家靠上。所有配速都受自身巡航上限约束。
  if (p.launchTime < 7 && sameWay && relative.along > 2 && relative.along < 32
    && Math.abs(relative.side) < 8 && bike.speed > 3) {
    targetSpeed = Math.min(targetSpeed, Math.max(3, bike.speed - Math.min(8, relative.along * 1.4)));
  }
  // 两车快要挤到一起时，陪跑车顺着已选空侧让出身位；位移仍受实体约束。
  if (!targetLine && !p.pushed && p.passSide && sameWay && Math.abs(relative.along) < 6 && Math.abs(relative.side) < 2.8) {
    const room = p.passSide * relative.side;
    const sideSpeed = Math.min(3.1, Math.max(0, (1.7 - room) * 5));
    p.sideSpeed += p.passSide * Math.min(24 * STEP, Math.max(0, sideSpeed - p.passSide * p.sideSpeed));
  }
  const alongside = sameWay && Math.abs(relative.along) <= 2.4 && Math.abs(relative.side) < 4;
  if (alongside && bike.speed > 5) targetSpeed = Math.min(targetSpeed, bike.speed - relative.along * 0.65);
  // 岔口前结束并排，收油留出先后顺序，避免两条路线交叉时从玩家车里穿过去。
  const atJunction = lane.junctions.some(mark => mark - distance < 17 && mark - distance > -7);
  if (atJunction && Math.abs(relative.side) < 5 && Math.abs(relative.along) < 10) {
    const yieldSpeed = bike.speed - Math.max(0, relative.along + 4.6) * 1.35;
    targetSpeed = Math.min(targetSpeed, Math.max(1.5, yieldSpeed));
  }
  if (p.pushed) targetSpeed = Math.min(targetSpeed, p.pushSpeed);
  const arriving = p.segment === legs.length - 1 && Math.hypot(p.x - end.x, p.z - end.z) < 1.45;
  const controls = {
    throttle: !arriving && p.speed < targetSpeed - 0.04,
    brake: !arriving && p.speed > targetSpeed + 0.36,
    handbrake: arriving,
    left: !arriving && error < -0.016, right: !arriving && error > 0.016,
  };
  // 正式岗车先等保安上车，起步电机只给这一次固定推力。后续全程靠真实车速追赶。
  const launchBoost = course.campaign ? 1.35 : 0.6;
  controls.boost = controls.throttle && p.launchTime <= launchBoost && p.speed < (course.campaign ? 15 : 12.5) && !p.pushed;
  stepVehicle(p, controls, STEP, course);
  if (arriving && p.speed === 0) {
    p.finished = true;
    p.pushTime = 0;
  }
  p.pushCooldown = Math.max(0, p.pushCooldown - STEP);
  p.pushTime = Math.max(0, p.pushTime - STEP);
  p.pushed = p.pushTime > 0;
  if (!p.pushed) p.pushSide = null;
  if (p.pushLocked && (Math.abs(relative.side) > 3.85 || Math.abs(relative.along) > 2.8)) {
    p.pushLocked = false;
  }
}

// 首次调用在岗亭就位；active 是开出许可。暂停可传 dt=0，重试用新的 createPursuer()。
export function stepPursuer(pursuer, bike, course, dt, active, targetLine = null) {
  const lane = laneFor(course);
  if (!lane) return;
  if (pursuer.segment < 0) {
    const start = course.guardStart;
    pursuer.x = start.x;
    pursuer.z = start.z;
    pursuer.segment = nearestLeg(lane.legs, start);
    const leg = lane.legs[pursuer.segment];
    pursuer.heading = start.heading ?? Math.atan2(-leg.tx, leg.tz);
    pursuer.visible = true;
  }
  pursuer.active = Boolean(active);
  if (pursuer.active && !pursuer.finished && Number.isFinite(dt) && dt > 0) {
    const total = pursuer.paceRemainder + Math.min(dt, 0.25);
    const steps = Math.floor(total / STEP + 1e-9);
    pursuer.paceRemainder = Math.max(0, total - steps * STEP);
    for (let i = 0; i < steps && !pursuer.finished; i++) followStep(pursuer, bike, course, lane, targetLine);
  }
  pursuer.gap = Math.hypot(pursuer.x - bike.x, pursuer.z - bike.z);
  pursuer.reachSide = reachableSide(pursuer, bike);
}
