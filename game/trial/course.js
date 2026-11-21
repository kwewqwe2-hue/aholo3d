// Metres. East is +X, north is -Z. Both centre lines describe optional routes on open asphalt.
const point = (id, x, z) => ({ id, x, z });
const start = { x: 66, z: 12, heading: Math.PI / 2 };
const gate = point('gate', 38, 12);
const guardStart = { x: 32, z: 14.25, heading: start.heading };
const courtEntry = point('courtEntry', 6, 12);
const courtExit = point('courtExit', -18, -12);
const fork = point('fork', -18, -33);
const merge = point('merge', -20, -82);
const finish = { ...point('finish', -20, -94), label: '7 号楼' };

const arc = [];
for (let i = 1; i < 6; i++) {
  const angle = i * Math.PI / 12;
  arc.push(point('court' + i, 6 - 24 * Math.sin(angle), -12 + 24 * Math.cos(angle)));
}
const common = [point('start', start.x, start.z), gate, courtEntry, ...arc, courtExit, fork];

function cubic(prefix, a, b, c, end, pieces) {
  const points = [];
  for (let i = 1; i < pieces; i++) {
    const t = i / pieces, s = 1 - t;
    const at = axis => s ** 3 * a[axis] + 3 * s * s * t * b[axis]
      + 3 * s * t * t * c[axis] + t ** 3 * end[axis];
    points.push(point(prefix + i, at('x'), at('z')));
  }
  return [...points, end];
}

const outerApex = point('outerApex', -42, -55);
const outer = [
  fork, ...cubic('outerIn', fork, { x: -24, z: -41 }, { x: -42, z: -43 }, outerApex, 6),
  ...cubic('outerOut', outerApex, { x: -42, z: -71 }, { x: -20, z: -71 }, merge, 7),
];
const arborApex = point('arborApex', -11.5, -55);
const inner = [
  fork, ...cubic('arborIn', fork, { x: -15, z: -41 }, { x: -11.5, z: -45 }, arborApex, 4),
  ...cubic('arborOut', arborApex, { x: -11.5, z: -66 }, { x: -20, z: -74 }, merge, 5),
];
const nodes = [...common, ...outer.slice(1), ...inner.slice(1, -1), finish];
const roads = [];
function pavement(line, width, kind, name) {
  for (let i = 1; i < line.length; i++) roads.push({ a: line[i - 1].id, b: line[i].id, width, kind, name });
}
pavement(common, 10.6, 'main', '门岗球场路');
pavement(outer, 9.6, 'main', '花圃外圈');
pavement(inner, 6.6, 'alley', '花架短路');
pavement([merge, finish], 8.8, 'main', '楼门前坪');

const court = { x: 3, z: -6.4, w: 15, d: 14, h: .32, style: 'court' };
const blocks = [
  court,
  { x: 57.5, z: 1.05, w: 27, d: 6.1, h: 4.4, style: 'market' },
  { x: 34.75, z: 21.35, w: 4.5, d: 3.5, h: 3.0, style: 'booth' },
  { x: 38, z: 5.95, w: .55, d: .52, h: 2.1, style: 'gatePost' },
  { x: 38, z: 18.05, w: .55, d: .52, h: 2.1, style: 'gatePost' },
  { x: 38, z: -5.98, w: .34, d: 23.38, h: 1.17, style: 'gateFence' },
  { x: 38, z: 26.81, w: .34, d: 17.0, h: 1.17, style: 'gateFence' },
  { x: 2, z: 29, w: 27, d: 7.8, h: 8.9, style: 'flats', front: 'north' },
  { x: 14.8, z: -19.4, w: 15, d: 5.8, h: 6.2, style: 'flats', front: 'south' },
  { x: -36, z: 14.5, w: 12, d: 7, h: 6.1, style: 'flats', front: 'east' },
  { x: -56.5, z: -51, w: 8.5, d: 30, h: 9.0, style: 'flats', front: 'east' },
  { x: 3.6, z: -62, w: 6.8, d: 21, h: 6.1, style: 'flats', front: 'west' },
  { x: -27.7, z: -56.0, w: 9.8, d: 12.8, h: .58, style: 'garden' },
  { x: -25.8, z: -13, w: 2.45, d: .85, h: .43, style: 'exitSign' },
  { x: -20, z: -103.2, w: 22, d: 7.4, h: 9.3, style: 'door', front: 'south', label: finish.label },
];
for (const [x, z] of [[52, 22.5], [22, 1.9], [-31, -.8], [-8, -26], [-47.8, -31], [-35, -84.5], [-5, -84]]) {
  blocks.push({ x, z, w: 2.4, d: 1.8, h: .37, style: 'treeBed' });
}

// Place the pergola feet in the collision map at the same coordinates as their meshes.
const pergola = [3, 4, 5].map(i => {
  const a = inner[i - 1], p = inner[i], b = inner[i + 1];
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const feet = [-1, 1].map(side => ({
    x: p.x + side * Math.cos(yaw) * 3.73, z: p.z - side * Math.sin(yaw) * 3.73,
    w: .32, d: .32, h: 4.65, style: 'arborFoot',
  }));
  blocks.push(...feet);
  return { x: p.x, z: p.z, yaw, feet };
});

export const course = {
  bounds: { minX: -64, maxX: 78, minZ: -111, maxZ: 36 },
  nodes, roads, blocks, start, gate, guardStart, finish,
  mainLine: [...common, ...outer.slice(1), finish],
  shortLine: [...common, ...inner.slice(1), finish],
  landmarks: { court, courtEntry, courtExit, fork, merge, pergola },
};

// Level ground keeps comparisons between inside and outside cornering lines reproducible.
export function elevationAt(x, z) { return 0; }
