// All stairwell positions are in metres. Local depth increases into the block (world -Z).
// The same four flights drive the building mesh, foot collisions, camera and phone.
export function createStairLayout(course) {
  const block = course.landmarks.door;
  const origin = { x: course.finish.x, z: block.z + block.d / 2 };
  const halfWidth = 3.8, depth = 10.4, doorHalf = 1.55;
  const front = 2.4, back = 8, rise = 1.62, floorHeight = 2 * rise, treads = 10;
  const radius = .26, divider = .20, lane = 1.72;
  const world = (x, d, y = 0) => ({ x: origin.x + x, y, z: origin.z - d });
  const local = p => ({ x: p.x - origin.x, d: origin.z - p.z });
  const entrance = world(0, 0), outside = world(0, -1.15);
  const door302 = world(halfWidth, 1.3, 2 * floorHeight);
  const knock = world(halfWidth - .86, 1.3, 2 * floorHeight);
  const floorAt = y => Math.max(1, Math.min(3, 1 + Math.floor((y + .075) / floorHeight)));
  const route = [entrance, world(-lane, 1.20)];
  for (let storey = 0; storey < 2; storey++) {
    const bottom = storey * floorHeight;
    route.push(world(-lane, front, bottom), world(-lane, back, bottom + rise),
      world(-lane, 9.04, bottom + rise), world(lane, 9.04, bottom + rise),
      world(lane, back, bottom + rise), world(lane, front, bottom + floorHeight),
      world(lane, 1.20, bottom + floorHeight));
    if (storey === 0) route.push(world(-lane, 1.20, bottom + floorHeight));
  }
  route.push(knock);

  function containsXZ(p) {
    const { x, d } = local(p);
    return Math.abs(x) <= halfWidth && d >= 0 && d <= depth;
  }

  function portalBetween(a, b) {
    const from = local(a), to = local(b);
    if (from.d === to.d || from.d * to.d > 0 || Math.max(a.y || 0, b.y || 0) > .32) return false;
    const fraction = -from.d / (to.d - from.d);
    return Math.abs(from.x + fraction * (to.x - from.x)) <= doorHalf - radius;
  }

  // The overlapping floor plates have identical XZ footprints. Use the incoming
  // height to select the connected surface; crossing a rail cannot change storeys.
  function heightAt(p, previousY = p.y ?? 0) {
    const { x, d } = local(p), ax = Math.abs(x);
    if (ax > halfWidth - radius || d > depth - radius) return null;
    if (d < 0) return d >= -.45 && ax < doorHalf - radius && previousY < .30 ? 0 : null;
    if (d < radius && (previousY > .35 || ax > doorHalf - radius)) return null;
    let levels;
    if (d <= front) levels = [0, floorHeight, 2 * floorHeight];
    else if (d >= back) levels = [rise, floorHeight + rise];
    else {
      if (ax < divider + radius) return null;
      const ratio = (d - front) / (back - front);
      const first = x < 0 ? ratio * rise : floorHeight - ratio * rise;
      levels = [first, first + floorHeight];
    }
    let best = levels[0];
    for (const level of levels) {
      if (Math.abs(level - previousY) < Math.abs(best - previousY)) best = level;
    }
    return Math.abs(best - previousY) <= .32 ? best : null;
  }

  // Project in three dimensions so a phone on the third-floor landing never
  // puts the rider back at the entrance on the ground floor.
  function pathFrom(position, towardsExit = false) {
    const y = position.y ?? 0;
    let nearest = Infinity, segment = 0, projection = route[0];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
      const weightY = 8;
      const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz
        + (y - a.y) * dy * weightY) / (dx * dx + dz * dz + dy * dy * weightY)));
      const p = { x: a.x + t * dx, y: a.y + t * dy, z: a.z + t * dz };
      const distance = (p.x - position.x) ** 2 + (p.z - position.z) ** 2 + weightY * (p.y - y) ** 2;
      if (distance < nearest) { nearest = distance; segment = i - 1; projection = p; }
    }
    const tail = towardsExit ? route.slice(0, segment + 1).reverse().concat(outside) : route.slice(segment + 1);
    const points = [{ x: position.x, y, z: position.z }, projection, ...tail];
    return points.filter((p, i) => !i || Math.hypot(p.x - points[i-1].x, p.z - points[i-1].z, p.y - points[i-1].y) > .025);
  }

  return { origin, halfWidth, depth, doorHalf, front, back, rise, floorHeight, treads,
    divider, lane, entrance, outside, knock, door302, world, local, heightAt, containsXZ,
    portalBetween, floorAt, route, pathFrom, pathToExit: p => pathFrom(p, true) };
}
