const gap = (first, second) => Math.hypot(first.x - second.x, first.z - second.z);
const same = (first, second) => gap(first, second) < 0.05;

export function makeNavigator(district) {
  const nodes = new Map(district.nodes.map(node => [node.id, node]));
  const edges = district.roads.map(road => ({
    ...road, start: nodes.get(road.a), end: nodes.get(road.b),
    length: gap(nodes.get(road.a), nodes.get(road.b))
  }));
  const cached = new Map();
  const factor = (edge, mode) => mode === 'short' ? 1 : ({ main: 1, alley: 1.8, ramp: 2.05 }[edge.kind] ?? 1);
  function fromGoal(target, order, mode) {
    const key = [target, order, mode].join('/');
    if (cached.has(key)) return cached.get(key);
    const distances = new Map([[target, 0]]);
    const nextHop = new Map();
    const unvisited = new Set(nodes.keys());
    while (unvisited.size) {
      let current = null;
      let best = Infinity;
      for (const id of unvisited) {
        const candidate = distances.get(id) ?? Infinity;
        if (candidate < best) { best = candidate; current = id; }
      }
      if (current === null) break;
      unvisited.delete(current);
      for (const edge of edges) {
        if (edge.closedOn === order) continue;
        const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
        if (next === null || !unvisited.has(next)) continue;
        const cost = best + edge.length * factor(edge, mode);
        if (cost < (distances.get(next) ?? Infinity)) {
          distances.set(next, cost);
          nextHop.set(next, current);
        }
      }
    }
    const result = { distances, nextHop };
    cached.set(key, result);
    return result;
  }
  function route(position, target, order, mode = 'safe') {
    const { distances, nextHop } = fromGoal(target, order, mode);
    let nearest = Infinity;
    let bestCost = Infinity;
    let chosen = null;
    let projection = null;
    for (const edge of edges) {
      if (edge.closedOn === order || !edge.length) continue;
      const dx = edge.end.x - edge.start.x;
      const dz = edge.end.z - edge.start.z;
      const ratio = Math.min(1, Math.max(0, ((position.x - edge.start.x) * dx + (position.z - edge.start.z) * dz) / (edge.length ** 2)));
      const point = { x: edge.start.x + ratio * dx, z: edge.start.z + ratio * dz };
      const offset = gap(position, point);
      if (offset > nearest + 0.05) continue;
      if (offset < nearest - 0.05) { bestCost = Infinity; chosen = null; }
      const weight = factor(edge, mode);
      for (const [id, segment] of [[edge.a, ratio], [edge.b, 1 - ratio]]) {
        const cost = segment * edge.length * weight + (distances.get(id) ?? Infinity);
        if (cost < bestCost) {
          bestCost = cost; chosen = id; projection = point; nearest = offset;
        }
      }
    }
    if (chosen === null) return [];
    const points = [{ x: position.x, z: position.z }];
    if (!same(points[0], projection)) points.push(projection);
    while (chosen !== undefined) {
      const node = nodes.get(chosen);
      if (!same(points.at(-1), node)) points.push(node);
      if (chosen === target) break;
      chosen = nextHop.get(chosen);
    }
    return points;
  }
  return { route, node: id => nodes.get(id) };
}

export function lookAhead(points, distance) {
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = gap(start, end);
    if (length >= distance && length > 0) {
      const ratio = distance / length;
      return { x: start.x + (end.x - start.x) * ratio, z: start.z + (end.z - start.z) * ratio };
    }
    distance -= length;
  }
  return points.at(-1) ?? null;
}

export function routeLength(points) {
  return points.reduce((length, current, index) => length + (index ? gap(points[index - 1], current) : 0), 0);
}
