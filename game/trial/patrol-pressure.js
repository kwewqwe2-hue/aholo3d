import { playerFrame } from './pace-bike.js';

const warningTime = 0.9, closingTime = 0.8, cooldown = 5;
const minimumKickWindow = 0.25;
const probes = [-0.61, 0, 0.61];
const clamp01 = t => Math.max(0, Math.min(1, t));

// Only the gate approach and the court's wide outer road can host a merge.
// Split whenever the tangent turns more than ten degrees. Both vehicles
// must stay on the same straight throughout the signal and the merge.
function mergeLanes(course) {
  const lanes = [], line = course.mainLine, widths = new Map(course.roads.map(r => [r.a + '/' + r.b, r.width]));
  function collect(start, finish, name, entryMargin, exitMargin) {
    if (!start || !finish) return;
    const first = line.findIndex(p => p.id === start.id), last = line.findIndex(p => p.id === finish.id);
    if (first < 0 || last <= first) return;
    let begin = first, initialHeading = null, width = Infinity;
    function save(end) {
      const a = line[begin], b = line[end], dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const low = begin === first ? entryMargin : 1;
      const high = length - (end === last ? exitMargin : 0);
      if (width >= 9 && high - low >= 22) {
        lanes.push({ name, x: a.x, z: a.z, tx: dx / length, tz: dz / length, low, high, half: width / 2,
          points: line.slice(begin, end + 1) });
      }
    }
    for (let i = first; i < last; i++) {
      const a = line[i], b = line[i + 1], heading = Math.atan2(b.x - a.x, b.z - a.z);
      const w = widths.get(a.id + '/' + b.id) ?? 0;
      if (initialHeading !== null && (Math.cos(heading - initialHeading) < Math.cos(Math.PI / 18) || w < 9)) {
        save(i); begin = i; initialHeading = null; width = Infinity;
      }
      if (w < 9) { begin = i + 1; continue; }
      initialHeading ??= heading;
      width = Math.min(width, w);
    }
    if (begin < last) save(last);
  }
  collect(course.gate, course.landmarks.fork, 'gate', 0, 7);
  const courtSouth = course.mainLine.find(p => p.id === 'courtSouth');
  collect(courtSouth, course.landmarks.courtExit, 'court', 0, 2);
  return lanes;
}

function within(lane, body, runway = 0) {
  const x = body.x - lane.x, z = body.z - lane.z;
  const progress = x * lane.tx + z * lane.tz;
  return progress >= lane.low && progress + runway <= lane.high &&
    Math.abs(-x * lane.tz + z * lane.tx) < lane.half - 0.50 &&
    -Math.sin(body.heading) * lane.tx + Math.cos(body.heading) * lane.tz > 0.88;
}

// Reserve a lateral offset from the road centre when signalling. The target
// follows the road's gentle curvature while the rider is free to leave it.
function roadFrame(lane, p) {
  let nearest = Infinity, frame;
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1], b = lane.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz), t = clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / length ** 2);
    const x = a.x + t * dx, z = a.z + t * dz, distance = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (distance >= nearest) continue;
    nearest = distance;
    const nx = -dz / length, nz = dx / length;
    frame = { x, z, nx, nz, offset: (p.x - x) * nx + (p.z - z) * nz };
  }
  return frame;
}

// The same three 0.55 m body probes used by the vehicle against the scenery.
// Check the two oriented bodies after both have moved.
function touching(cart, bike) {
  const ax = -Math.sin(cart.heading), az = Math.cos(cart.heading);
  const bx = -Math.sin(bike.heading), bz = Math.cos(bike.heading);
  for (const a of probes) for (const b of probes) {
    const dx = cart.x - bike.x + a * ax - b * bx;
    const dz = cart.z - bike.z + a * az - b * bz;
    if (dx * dx + dz * dz <= 1.1 ** 2) return true;
  }
  return false;
}

export function createPatrolPressure(course) {
  if (!course.campaign || !course.guardStart || !course.landmarks?.fork) return null;
  const lanes = mergeLanes(course);
  let phase = 'idle', remaining = 0, side = '', target = null, outcome = '', kickWindow = 0;
  let lane = null, strip = 0, mustSeparate = false;

  function end(result) {
    phase = 'cooldown'; remaining = cooldown; side = ''; target = null;
    outcome = result; mustSeparate = true;
    return result;
  }
  function step(dt, cart, bike) {
    if (phase === 'cooldown') {
      remaining = Math.max(0, remaining - dt);
      if (remaining < 1e-8) { phase = 'idle'; remaining = 0; }
      return;
    }
    const alignment = Math.cos(cart.heading - bike.heading);
    const { side: lateral, along: ahead } = playerFrame(cart, bike);
    if (Math.abs(ahead) > 12 || Math.abs(lateral) > 6) mustSeparate = false;
    const inRange = cart.active && !cart.finished && !cart.pushed && bike.speed >= 4 &&
      alignment > 0.83 && Math.abs(ahead) < 15 && Math.abs(lateral) < 6;
    if (!inRange) return phase === 'idle' ? undefined : end('avoided');
    if (phase === 'idle') {
      const closingSpeed = Math.sign(ahead) * (bike.speed - cart.speed * alignment);
      if (mustSeparate || cart.pushLocked || cart.pushCooldown > 0 ||
          Math.abs(lateral) < 0.6 || Math.abs(lateral) > 4.4 ||
          Math.abs(ahead) > 2.1 + Math.max(0, closingSpeed) * warningTime) return;
      // Reserve the full signal and a playable contact window. An unfinished
      // merge yields as soon as either vehicle reaches the end of the straight.
      const runway = bike.speed * (warningTime + minimumKickWindow + 0.20);
      lane = lanes.find(l => within(l, bike, runway) && within(l, cart));
      if (!lane) return;
      side = lateral < 0 ? 'left' : 'right';
      strip = roadFrame(lane, bike).offset + Math.sign(lateral) * 0.20;
      phase = 'warning'; remaining = warningTime; outcome = ''; kickWindow = 0;
      return;
    }
    const sign = side === 'right' ? 1 : -1;
    if (!within(lane, bike) || !within(lane, cart) || lateral * sign < 0.15 ||
        sign * (strip - roadFrame(lane, bike).offset) > 1.30) return end('avoided');
    const track = roadFrame(lane, cart);
    target = { x: track.x + track.nx * strip, z: track.z + track.nz * strip, nx: track.nx, nz: track.nz };
    if (kickWindow < minimumKickWindow - 1e-8) {
      kickWindow = cart.reachSide === side ? kickWindow + dt : 0;
    }
    if (phase === 'closing' && touching(cart, bike)) {
      // If a brief crossing never offered a playable kick, the guard yields.
      // Only the cart receives a lateral impulse, integrated by its usual physics.
      cart.passSide = sign;
      cart.sideSpeed = sign * 1.6 * alignment;
      return end(kickWindow >= minimumKickWindow - 1e-8 ? 'contact' : 'yielded');
    }
    remaining -= dt;
    if (remaining > 1e-8) return;
    if (phase === 'closing') return end('avoided');
    if (Math.abs(ahead) <= 2.1) {
      phase = 'closing'; remaining = closingTime;
    } else if (remaining < -1) return end('avoided');
  }
  return {
    step,
    cancel() {
      if (phase === 'idle') return;
      phase = 'idle'; remaining = 0; side = ''; target = null; outcome = ''; kickWindow = 0;
    },
    kicked() { if (side) end('kicked'); },
    get target() { return phase === 'closing' ? target : null; },
    get warning() {
      if (!side) return '';
      return side === 'left' ? '左侧保安要并线 · 向右躲或并排左踢' : '右侧保安要并线 · 向左躲或并排右踢';
    },
    view() { return { phase, side, remaining: Math.max(0, remaining), outcome, lane: lane?.name ?? '' }; },
  };
}
