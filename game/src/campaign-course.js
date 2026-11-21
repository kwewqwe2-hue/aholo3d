import { estateTreeLots } from './estate-planting.js';
import { marketLots } from './market-sites.js';
import { courtyardLots } from './courtyard-sites.js';
import { streetLots } from './street-sites.js';

// The accepted 1536 × 1024 overhead drawing is the level plan. Author in its
// pixels; the map, physics, camera and art all consume the same metre data.
const scale = 0.18;
const world = (px, py) => ({ x: (px - 768) * scale, z: (py - 512) * scale });
const point = (id, px, py) => ({ id, ...world(px, py) });
const square = { ...point('square', 1380, 900), label: '牛逼广场', heading: Math.PI };
const pickup = { ...point('start', 1380, 272), label: '红棚烧腊', heading: 0, radius: 4.5 };
const marketTurn = point('marketTurn', 1315, 505);
const gate = { ...point('gate', 1225, 510), label: '北门岗' };
const fork = point('fork', 920, 570);
const courtEntry = point('courtEntry', 321, 661);
const outerApex = point('outerApex', 175, 605);
const courtExit = point('courtExit', 171, 395);
const arborApex = point('arborApex', 544, 253);
const merge = point('merge', 303, 346);
const finish = { ...point('finish', 201, 170), label: '7 号楼' };

// Cubic spans pass through every named anchor. Controls are map pixels.
// Only the centre lines are sampled; handling still allows free steering.
function curve(start, spans) {
  const points = [start];
  for (const [end, ax, ay, bx, by, pieces] of spans) {
    const from = points.at(-1), a = world(ax, ay), b = world(bx, by);
    for (let i = 1; i < pieces; i++) {
      const t = i / pieces, s = 1 - t;
      const coord = key => s ** 3 * from[key] + 3 * s * s * t * a[key] +
        3 * s * t * t * b[key] + t ** 3 * end[key];
      points.push({ id: from.id + '_' + end.id + '_' + i, x: coord('x'), z: coord('z') });
    }
    points.push(end);
  }
  return points;
}

const turnWest = point('turnWest', 1314, 232);
const turnNorth = point('turnNorth', 1347, 199);
const turnEast = point('turnEast', 1380, 232);
const approach = curve(square, [
  [point('plazaExit', 1373, 665), 1380, 821, 1379, 727, 3],
  [marketTurn, 1369, 605, 1316, 565, 5],
  [turnWest, 1313, 427, 1314, 302, 4],
  [turnNorth, 1314, 214, 1329, 199, 4],
  [turnEast, 1365, 199, 1380, 214, 4],
  [pickup, 1380, 244, 1380, 259, 1],
]);
const common = curve(pickup, [
  [point('shopBend', 1373, 431), 1380, 329, 1374, 387, 3],
  [marketTurn, 1372, 471, 1356, 502, 5],
  [gate, 1286, 504, 1253, 504, 3],
  [point('gateStraight', 1047, 550), 1170, 522.36, 1105, 536.97, 5],
  [fork, 1006, 559, 959, 570, 4],
]);
const outer = curve(fork, [
  [point('courtSouthEntry', 691, 581), 848, 570, 739, 572, 4],
  [point('courtSouth', 539, 659), 654, 598, 632, 659, 6],
  [courtEntry, 480, 661, 388, 661, 3],
  [outerApex, 254, 661, 202, 657, 6],
  [point('courtWest', 163, 482), 159, 573, 162, 531, 3],
  [courtExit, 163, 438, 163, 418, 3],
  [merge, 185, 348, 291, 375, 6],
]);
const flowerTurn = point('flowerTurn', 750, 490);
const arborEntry = point('arborEntry', 650, 385);
const arborExit = point('arborExit', 454, 269);
const inner = curve(fork, [
  [flowerTurn, 808, 571, 802, 553, 6],
  [arborEntry, 720, 453, 681, 436, 5],
  [arborApex, 615, 329, 593, 270, 6],
  [arborExit, 508, 241, 471, 245, 4],
  [merge, 411, 327, 358, 364, 7],
]);
const doorLine = curve(merge, [
  [point('doorLane', 202, 282), 290, 322, 203, 332, 6],
  [finish, 202, 240, 201, 205, 2],
]);
const mainLine = [...common, ...outer.slice(1), ...doorLine.slice(1)];
const shortLine = [...common, ...inner.slice(1), ...doorLine.slice(1)];
const nodes = [...new Map([...approach, ...mainLine, ...shortLine].map(n => [n.id, n])).values()];
function road(line, width, kind, name, approachOnly = false) {
  return line.slice(1).map((end, i) => ({
    a: line[i].id, b: end.id, width, kind, name, pickupApproach: approachOnly,
  }));
}
const roads = [
  ...road(approach, 9.6, 'main', '广场商街', true),
  ...road(common, 10.6, 'main', '商街门岗路'),
  ...road(outer, 9.6, 'main', '球场外圈'),
  ...road(inner, 6.6, 'alley', '紫藤花架巷'),
  ...road(doorLine, 8.8, 'main', '七号楼前坪'),
];

function lot(id, style, left, top, right, bottom, h, details = {}) {
  return { id, style, ...world((left + right) / 2, (top + bottom) / 2),
    w: (right - left) * scale, d: (bottom - top) * scale, h, ...details };
}
const market = lot('pickupMarket', 'market', 1424, 101, 1533, 337, 5.1, { front: 'west', label: pickup.label });
const booth = lot('guardBooth', 'booth', 1172, 359, 1243, 468, 3.7, { front: 'south' });
const court = lot('basketballCourt', 'court', 269, 395, 601, 614, 0.28);
const tree = lot('forkTree', 'treeBed', 872, 485, 957, 537, 0.48, { label: '大榕树' });
const garden = lot('flowerGarden', 'garden', 470, 299, 553, 368, 0.58);
const door = lot('building7', 'door', 13, 3, 389, 144, 13.4, { front: 'south', label: finish.label });
const blocks = [
  market, booth, court, tree, garden, door,
  lot('southMarket', 'market', 1432, 389, 1534, 554, 4.3, { front: 'west', label: '街坊食铺' }),
  lot('northFlats', 'flats', 718, 9, 1176, 219, 13.3, { front: 'south' }),
  lot('southFlats', 'flats', 720, 647, 1166, 969, 12.4, { front: 'north' }),
  lot('westFlats', 'flats', 1, 713, 338, 1016, 12.7, { front: 'north' }),
  lot('cycleShed', 'bikeShed', 374, 770, 666, 872, 3.5),
  lot('northFence', 'gateFence', 1262, 3, 1280, 471, 1.65),
  lot('southFence', 'gateFence', 1264, 551, 1283, 1019, 1.65),
  lot('northPost', 'gatePost', 1234, 466, 1240, 472, 2.4),
  lot('southPost', 'gatePost', 1234, 548, 1240, 554, 2.4),
  lot('westFlowers', 'garden', 42, 246, 124, 329, 0.48),
  lot('doorFlowers', 'garden', 266, 239, 391, 295, 0.48),
  lot('rockGarden', 'garden', 579, 380, 620, 432, 0.63),
  lot('eastFlowers', 'garden', 653, 492, 716, 530, 0.48),
  lot('courtWalkSign', 'exitSign', 244, 397, 253, 405, 2.15),
  lot('squareTree', 'treeBed', 1444, 676, 1509, 745, 0.42),
  lot('northTree', 'treeBed', 474, 111, 528, 159, 0.42),
  lot('westTree', 'treeBed', 62, 592, 115, 649, 0.42),
  lot('hallTree', 'treeBed', 1064, 304, 1108, 345, 0.42),
  lot('southTree', 'treeBed', 1177, 752, 1230, 817, 0.42),
];

// Feet and meshes share the same transforms. The 7.46 m post spacing
// leaves the 6.6 m riding surface clear, including through the curved spans.
const firstArch = inner.indexOf(arborEntry), lastArch = inner.indexOf(arborExit);
const pergola = [];
for (let i = firstArch; i <= lastArch; i += 2) {
  const p = inner[i], before = inner[i - 1], after = inner[i + 1];
  const yaw = Math.atan2(after.x - before.x, after.z - before.z);
  const feet = [-1, 1].map(side => ({
    id: p.id + (side < 0 ? '_L' : '_R'), style: 'arborFoot',
    x: p.x + side * 3.73 * Math.cos(yaw), z: p.z - side * 3.73 * Math.sin(yaw),
    w: 0.32, d: 0.32, h: 4.65,
  }));
  blocks.push(...feet);
  pergola.push({ x: p.x, z: p.z, yaw, feet });
}
blocks.push(...estateTreeLots(nodes, roads, blocks));

// Launch on the booth side of the outbound tangent, already parallel to the
// player. The pace driver projects this pose onto its own offset outer lane.
const next = common[common.indexOf(gate) + 1];
const span = Math.hypot(next.x - gate.x, next.z - gate.z);
const tx = (next.x - gate.x) / span, tz = (next.z - gate.z) / span;
// The cart waits by the gatehouse curb. Its first movement is the guard pulling
// out of this bay after boarding, leaving the middle of the entrance open.
const guardStart = { x: gate.x + tx * 6.4 - tz * 4.15, z: gate.z + tz * 6.4 + tx * 4.15,
  heading: Math.atan2(-tx, tz) };
const guardPost = { x:guardStart.x, y:.11, z:booth.z+booth.d/2-.32 };
const stops = {
  square: { node: square.id, label: square.label },
  shop1: { node: pickup.id, label: pickup.label },
  home1: { node: finish.id, label: finish.label },
};

export const campaignDistrict = {
  campaign: true, bounds: { minX: -768 * scale, maxX: 768 * scale, minZ: -512 * scale, maxZ: 512 * scale },
  nodes, roads, blocks, stops, square, pickup, start: pickup, gate, guardStart, guardPost, finish,
  pickupLine: approach, mainLine, shortLine,
  landmarks: { square, pickup, market, booth, court, tree, garden, door, fork, merge, courtEntry, courtExit,
    outerApex, arborApex, arborEntry, arborExit, pergola, marketTurn, turnNorth },
};
blocks.push(...marketLots(campaignDistrict), ...courtyardLots(campaignDistrict), ...streetLots(campaignDistrict));
