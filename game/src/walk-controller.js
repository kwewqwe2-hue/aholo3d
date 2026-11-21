// Ground positions are sole positions in metres. The stair layout already
// includes the pedestrian clearance at its walls, handrail and doorway.
const radius = 0.26;
const walkSpeed = 2.05, runSpeed = 4.35;
const clampAxis = value => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

export function riderPose(body) {
  return { x: body.x, y: body.y ?? 0, z: body.z, heading: body.heading, speed: body.speed,
    indoors: body.indoors ?? false, floor: body.floor ?? 0 };
}

function beside(bike, left, forward) {
  const sin = Math.sin(bike.heading), cos = Math.cos(bike.heading);
  return { x: bike.x + left * cos - forward * sin, y: 0, z: bike.z + left * sin + forward * cos };
}

export const boxPosition = bike => beside(bike, 0, -0.78);

function touchesVehicle(point, body, halfLength, widthRadius) {
  const dx = point.x - body.x, dz = point.z - body.z;
  const fx = -Math.sin(body.heading), fz = Math.cos(body.heading);
  const along = Math.max(-halfLength, Math.min(halfLength, dx * fx + dz * fz));
  return (dx - along * fx) ** 2 + (dz - along * fz) ** 2 < (widthRadius + radius) ** 2;
}

export const overlapsBike = (p, bike) => touchesVehicle(p, bike, 0.59, 0.36);

// Only the part of a navigation segment near the scooter can intersect it.
function crossesBike(a, b, bike) {
  const length = distance(a, b);
  if (!length) return false;
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  const along = Math.max(0, Math.min(length, (bike.x - a.x) * dx + (bike.z - a.z) * dz));
  if (Math.hypot(a.x + dx * along - bike.x, a.z + dz * along - bike.z) > 1.35) return false;
  const low = Math.max(0, along - 1.35), high = Math.min(length, along + 1.35);
  const steps = Math.max(1, Math.ceil((high - low) / 0.10));
  for (let i = 0; i <= steps; i++) {
    const t = low + (high - low) * i / steps;
    if (overlapsBike({ x: a.x + dx * t, z: a.z + dz * t }, bike)) return true;
  }
  return false;
}

export function createWalkController(course, stairs) {
  const { bounds, blocks, landmarks } = course;
  function clearGround(p) {
    if (p.x < bounds.minX + radius || p.x > bounds.maxX - radius ||
        p.z < bounds.minZ + radius || p.z > bounds.maxZ - radius) return false;
    for (const b of blocks) {
      const dx = Math.max(0, Math.abs(p.x - b.x) - b.w / 2);
      const dz = Math.max(0, Math.abs(p.z - b.z) - b.d / 2);
      if (dx * dx + dz * dz >= radius * radius) continue;
      if (b.id === landmarks.door.id) {
        const { x, d } = stairs.local(p);
        if (d <= 0 && Math.abs(x) <= stairs.doorHalf - radius) continue;
      }
      return false;
    }
    return true;
  }

  // A short sweep also prevents reaching a box or mounting through a thin
  // fence. The parked bike itself is intentionally reachable.
  function clearSegment(a, b, cart) {
    const count = Math.max(1, Math.ceil(distance(a, b) / radius));
    for (let i = 1; i <= count; i++) {
      const t = i / count, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (!clearGround(p) || (cart?.visible && touchesVehicle(p, cart, 0.61, 0.55))) return false;
    }
    return true;
  }

  function dismountSpot(bike, cart) {
    // Try both sides by the box, both sides by the bars, then fore and aft.
    for (const [left, front] of [[0.98, -0.40], [-0.98, -0.40], [0.98, 0.44], [-0.98, 0.44],
      [0, -1.52], [0, 1.52]]) {
      const point = beside(bike, left, front);
      if (clearSegment(bike, point, cart)) return point;
    }
    return null;
  }

  function canReach(walker, p, reach, cart) {
    return !walker.indoors && distance(walker, p) <= reach && clearSegment(walker, p, cart);
  }

  // A rider coming back from the hall can be directly in front of the
  // handlebars. Guide around the parked body to a reachable side of the box.
  function aroundBike(a, b, bike, cart, reach = 0) {
    const length = distance(a, b);
    if (length <= reach) return [];
    const t = reach ? (length - reach + 0.05) / length : 1;
    if (!crossesBike(a, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, bike)) return [];
    const ring = [[0, -1.60], [0.99, -0.84], [0.99, 0.84], [0, 1.60], [-0.99, 0.84], [-0.99, -0.84]]
      .map(([side, front]) => beside(bike, side, front));
    const clear = (p, q) => !crossesBike(p, q, bike) && clearSegment(p, q, cart);
    let shortest = Infinity, best = [];
    for (let i = 0; i < ring.length; i++) {
      if (!clear(a, ring[i])) continue;
      for (const dir of [-1, 1]) {
        const path = [ring[i]];
        let cost = distance(a, ring[i]);
        for (let n = 1; n <= ring.length && cost < shortest; n++) {
          const p = path.at(-1), total = cost + distance(p, b);
          if (reach ? canReach(p, b, reach, cart) : clear(p, b)) {
            if (total < shortest) { shortest = total; best = path.slice(); }
            break;
          }
          const next = ring[(i + n * dir + ring.length) % ring.length];
          if (!clear(p, next)) break;
          path.push(next); cost += distance(p, next);
        }
      }
    }
    return best;
  }

  function move(walker, dx, dz, bike, cart) {
    const p = { x: walker.x + dx, z: walker.z + dz, y: walker.y };
    const inside = stairs.containsXZ(p);
    if (inside !== walker.indoors && !stairs.portalBetween(walker, p)) return false;
    const y = inside ? stairs.heightAt(p, walker.y) : 0;
    if (y === null || (!inside && !clearGround(p))) return false;
    if (y < 0.32 && (overlapsBike(p, bike) ||
        (cart?.visible && touchesVehicle(p, cart, 0.61, 0.55)))) return false;
    walker.x = p.x; walker.z = p.z; walker.y = y;
    walker.indoors = inside; walker.floor = inside ? stairs.floorAt(y) : 0;
    return true;
  }

  function step(walker, dt, controls, heading, bike, cart) {
    const right = clampAxis(clampAxis(controls.walkX) + Number(!!controls.right) - Number(!!controls.left));
    const forward = clampAxis(clampAxis(controls.walkZ) + Number(!!controls.throttle) - Number(!!controls.brake));
    const input = Math.hypot(right, forward);
    walker.speed = 0;
    if (input < 0.02 || dt <= 0) return;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const vx = (-sin * forward - cos * right) / input;
    const vz = (cos * forward - sin * right) / input;
    const yaw = Math.atan2(-vx, vz) - walker.heading;
    const turn = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    walker.heading += Math.sign(turn) * Math.min(Math.abs(turn), 13 * dt);
    const speed = (controls.run ? runSpeed : walkSpeed) * Math.min(1, input);
    const length = speed * dt * (walker.indoors ? 0.86 : 1);
    const pieces = Math.max(1, Math.ceil(length / 0.10));
    const dx = length * vx / pieces, dz = length * vz / pieces;
    const startX = walker.x, startZ = walker.z, startY = walker.y;
    for (let i = 0; i < pieces; i++) {
      if (move(walker, dx, dz, bike, cart)) continue;
      if (dx) move(walker, dx, 0, bike, cart);
      if (dz) move(walker, 0, dz, bike, cart);
    }
    walker.speed = Math.hypot(walker.x - startX, walker.z - startZ, walker.y - startY) / dt;
  }
  return { step, canReach, dismountSpot, clearSegment, aroundBike };
}
