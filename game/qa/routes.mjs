import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Roads in the district contract are bidirectional. A closure applies to one order.
export function routeBetween(district, start, end, order, skippedRoad) {
  const nodes = new Map(district.nodes.map(node => [node.id, node]));
  const adjacent = new Map([...nodes.keys()].map(id => [id, []]));
  for (const road of district.roads) {
    if (road.closedOn === order || road === skippedRoad) continue;
    const a = nodes.get(road.a);
    const b = nodes.get(road.b);
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    adjacent.get(a.id).push([b.id, length]);
    adjacent.get(b.id).push([a.id, length]);
  }
  const distance = new Map([[start, 0]]);
  const parent = new Map();
  const frontier = new Set([start]);
  while (frontier.size) {
    let current;
    for (const id of frontier) {
      if (current === undefined || distance.get(id) < distance.get(current)) current = id;
    }
    if (current === end) {
      const result = [current];
      while (parent.has(result[0])) result.unshift(parent.get(result[0]));
      return result;
    }
    frontier.delete(current);
    for (const [next, length] of adjacent.get(current)) {
      const total = distance.get(current) + length;
      if (total >= (distance.get(next) ?? Infinity)) continue;
      distance.set(next, total);
      parent.set(next, current);
      frontier.add(next);
    }
  }
  return null;
}

export function checkDistrict(district) {
  const { bounds, nodes, roads, stops } = district;
  const byId = new Map(nodes.map(node => [node.id, node]));
  assert.equal(byId.size, nodes.length, '节点 ID 重复');
  assert.ok([bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
    && bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ, '地图边界无效');
  for (const { id, x, z } of nodes) {
    assert.ok(id != null && Number.isFinite(x) && Number.isFinite(z)
      && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ,
    '节点越界或坐标无效 ' + id);
  }
  for (const road of roads) {
    const a = byId.get(road.a);
    const b = byId.get(road.b);
    assert.ok(a && b && (a.x !== b.x || a.z !== b.z)
      && Number.isFinite(road.width) && road.width > 0, '道路端点或宽度无效 ' + road.name);
  }
  const stopKeys = ['square', 'shop1', 'home1', 'shop2', 'home2'];
  for (const key of stopKeys) assert.ok(byId.has(stops[key]?.node), '站点未绑定有效节点 ' + key);
  const legs = [[1, 'square', 'shop1'], [1, 'shop1', 'home1'],
    [2, 'home1', 'shop2'], [2, 'shop2', 'home2']];
  return legs.map(([order, a, b]) => {
    const route = routeBetween(district, stops[a].node, stops[b].node, order);
    assert.ok(route, '按单号剔除封路后不可达 ' + [order, a, b].join(' / '));
    return { order, from: a, to: b, route };
  });
}

function liesOn(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return gap(p, { x: a.x + t * dx, z: a.z + t * dz }) < 0.06;
}

// Ask the game's navigator for its displayed polyline. Judge each segment against
// district geometry directly, without calling its own cost or projection helpers.
export function checkNavigator(district, navigator, legs) {
  const byId = new Map(district.nodes.map(node => [node.id, node]));
  const choices = [];
  let samples = 0;
  for (const { order, from, to } of legs) {
    const open = district.roads.filter(road => road.closedOn !== order);
    const ends = open.map(road => [byId.get(road.a), byId.get(road.b)]);
    const starts = district.nodes.map(node => ({ position: node, anchor: node.id }));
    for (const [a, b] of ends) {
      starts.push({ position: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, anchor: a.id });
    }
    const target = district.stops[to].node;
    const origin = district.stops[from].node;
    for (const { position, anchor } of starts) {
      if (!routeBetween(district, anchor, target, order)) continue;
      for (const mode of ['safe', 'short']) {
        const points = navigator.route(position, target, order, mode);
        const describe = [order, mode, position.id ?? [position.x, position.z], target].join(' / ');
        assert.ok(points.length && gap(points[0], position) < 0.06
          && gap(points.at(-1), byId.get(target)) < 0.06, '导航未从起点抵达目标 ' + describe);
        for (let i = 1; i < points.length; i++) {
          const p = points[i - 1];
          const q = points[i];
          assert.ok(ends.some(([a, b]) => liesOn(p, a, b) && liesOn(q, a, b)),
            '导航线穿过非当单开放边 ' + describe + ' ' + JSON.stringify([p, q]));
        }
        if (position.id === origin) {
          const ids = points.map((p, index) => index === 0 ? origin : p.id ?? [p.x, p.z]);
          choices.push({ order, from, to, mode, ids,
            length: Math.round(points.reduce((n, p, i) => n + (i ? gap(points[i - 1], p) : 0), 0)) });
        }
        samples++;
      }
    }
  }
  return { samples, choices };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const location = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2]))
    : new URL('../src/district.js', import.meta.url);
  const { district } = await import(location.href);
  const legs = checkDistrict(district);
  const { makeNavigator } = await import('../src/navigation.js');
  console.log(JSON.stringify({ legs, navigator: checkNavigator(district, makeNavigator(district), legs) }));
}
