// North is up. The SVG viewBox and every route vertex use campaign world X/Z
// metres. Only the ink, lettering and position arrow stay a fixed screen size.
const ns = 'http://www.w3.org/2000/svg';
const ink = '#201e18', amber = '#ffd13b', cream = '#fff9e8';
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const fixed = n => Number(n.toFixed(4));
function set(node, key, value) {
  const text = String(value);
  if (node.getAttribute(key) !== text) node.setAttribute(key, text);
}
function draw(tag, attrs, parent) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}
function lettering(parent, content, attrs = {}) {
  const node = draw('text', { 'font-size': 11, 'font-weight': 750, ...attrs }, parent);
  node.textContent = content;
  return node;
}
function pose(p, unit, angle = 0) {
  return 'translate(' + fixed(p.x) + ' ' + fixed(p.z) + ') rotate(' + fixed(angle) + ') scale(' + fixed(unit) + ')';
}

function paintFloor(group, stairs, floor) {
  group.replaceChildren();
  const { origin, halfWidth, depth, front, back, treads, divider, doorHalf } = stairs;
  const left = origin.x - halfWidth, right = origin.x + halfWidth, top = origin.z - depth;
  const rear = origin.z - back, near = origin.z - front;
  const stroke = (d, color, width) => draw('path', { d, fill: 'none', stroke: color, 'stroke-width': width }, group);
  draw('rect', { x: left, y: top, width: halfWidth * 2, height: depth,
    fill: '#fcf5db', stroke: '#334b41', 'stroke-width': .24 }, group);
  draw('rect', { x: left + .12, y: rear, width: halfWidth * 2 - .24, height: back - front, fill: '#b6cbb5' }, group);
  let lines = '';
  for (let i = 0; i <= treads; i++) {
    const at = rear + i * (back - front) / treads;
    lines += 'M' + left + ' ' + at + 'H' + (origin.x - divider) + 'M' + (origin.x + divider) + ' ' + at + 'H' + right;
  }
  stroke(lines, '#698573', .09);
  draw('rect', { x: origin.x - divider, y: rear, width: divider * 2, height: back - front, fill: '#3b594c' }, group);
  if (floor === 1) stroke('M' + (origin.x - doorHalf) + ' ' + origin.z + 'h' + doorHalf * 2, '#fcf5db', .32);
  if (floor === stairs.floorAt(stairs.door302.y)) {
    const door = stairs.door302;
    stroke('M' + door.x + ' ' + (door.z - .55) + 'v1.10', '#b66125', .34);
  }
}

export function createPocketMap(course, stairs, basemap) {
  const chart = draw('svg', { class: 'nb-pocket-chart', role: 'img', 'aria-label': '骑手周边导航图，上北下南' });
  const { minX, minZ, maxX, maxZ } = course.bounds;
  const image = draw('image', { 'data-layer': 'street', x: minX, y: minZ, width: maxX - minX,
    height: maxZ - minZ, href: basemap, preserveAspectRatio: 'xMidYMid meet' }, chart);
  const floorPlan = draw('g', { 'data-layer': 'floorPlan' }, chart);
  const tracks = [[ink, 5.4], [amber, 3.1]].map(([stroke, width], i) => draw('polyline', {
    'data-layer': i ? 'route' : 'casing', fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, chart));
  const arrows = Array.from({ length: 2 }, () => draw('path', { d: 'M-3 2 0 -1.5 3 2', fill: 'none',
    stroke: ink, 'stroke-width': 1.45, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, chart));
  const labels = draw('g', { class: 'nb-pocket-places' }, chart);
  const { market, booth, court, fork, pergola } = course.landmarks;
  const places = [
    ['gate', '北门岗', booth], ['fork', '榕树岔口', fork], ['arbor', '紫藤花架', pergola[Math.floor(pergola.length / 2)]],
    ['court', '篮球场', court], ['shop', '红棚烧腊', market], ['square', '牛逼广场', course.square],
    ['home', '7号楼', stairs.entrance],
    ['stairs', '楼梯', stairs.world(-stairs.halfWidth, (stairs.front + stairs.back) / 2)],
    ['entry', '入口', stairs.entrance], ['door302', '302', stairs.door302],
  ].map(([id, name, point]) => {
    const group = draw('g', { 'data-place': id }, labels);
    if (id === 'fork') draw('circle', { r: 2.2, fill: amber, stroke: ink, 'stroke-width': 1.2 }, group);
    const label = lettering(group, name, { 'dominant-baseline': 'central' });
    return { id, name, point, group, label };
  });
  const flag = draw('g', { 'data-layer': 'target' }, chart);
  draw('path', { d: 'M0 0v-12l9 3.2-9 4', fill: amber, stroke: ink, 'stroke-width': 1.7, 'stroke-linejoin': 'round' }, flag);
  const rider = draw('g', { 'data-layer': 'actor', 'aria-label': '当前位置和朝向' }, chart);
  draw('circle', { r: 10, fill: '#2b291f', 'fill-opacity': .28 }, rider);
  draw('path', { d: 'M0 -10.4 7.1 7.7 0 4.2 -7.1 7.7Z', stroke: ink, 'stroke-width': 2, fill: '#fffefa',
    'stroke-linejoin': 'round' }, rider);
  const scale = draw('g', { 'data-layer': 'scale', fill: cream }, chart);
  const backplate = draw('rect', { x: -3, y: -13, height: 15, rx: 2, fill: '#171d19', opacity: .83 }, scale);
  const ruler = draw('path', { fill: 'none', stroke: cream, 'stroke-width': 1 }, scale);
  const measure = lettering(scale, '', { y: -4, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 650 });
  let lastFloor;

  function update(view, nav) {
    const { width, height } = chart.getBoundingClientRect();
    if (!width || !height) return;
    const { actor, indoors } = nav, floor = indoors ? nav.floor : 0;
    const foot = view.travelMode === 'foot', speed = Math.abs(actor.speed);
    // Widen the street at riding speed; a pedestrian can resolve the box and doorway.
    const spanX = indoors ? (stairs.depth + 2.6) * width / height : foot
      ? 23 + Math.min(nav.meters, 38) * .48 + Math.min(speed, 5) * .8 : 84 + Math.min(speed, 22) * 1.65;
    const unit = spanX / width, spanZ = height * unit;
    let cx, cz;
    if (indoors) {
      cx = stairs.origin.x + spanX * .025;
      cz = stairs.origin.z - stairs.depth / 2;
    } else {
      cx = clamp(actor.x - Math.sin(actor.heading) * spanX * .22, minX + spanX / 2, maxX - spanX / 2);
      cz = clamp(actor.z + Math.cos(actor.heading) * spanZ * .23, minZ + spanZ / 2, maxZ - spanZ / 2);
      // At the very edge of the district, leave enough margin for the true arrow tip.
      cx = clamp(cx, actor.x - spanX/2 + 12*unit, actor.x + spanX/2 - 12*unit);
      cz = clamp(cz, actor.z - spanZ/2 + 12*unit, actor.z + spanZ/2 - 12*unit);
    }
    const left = cx - spanX / 2, top = cz - spanZ / 2;
    set(chart, 'viewBox', [left, top, spanX, spanZ].map(fixed).join(' '));
    if (floor !== lastFloor) {
      lastFloor = floor;
      set(chart, 'data-space', indoors ? 'floor' : 'street'); set(chart, 'data-floor', floor);
      set(chart, 'aria-label', indoors ? '7号楼第' + floor + '层实时平面图' : '街区实时导航图，上北下南');
      set(image, 'display', indoors ? 'none' : 'inline');
      set(floorPlan, 'display', indoors ? 'inline' : 'none');
      if (indoors) paintFloor(floorPlan, stairs, floor);
    }
    const path = nav.fullPath ?? nav.path;
    const points = path.map(p => fixed(p.x) + ',' + fixed(p.z)).join(' ');
    for (const track of tracks) set(track, 'points', points);
    let flight = 0;
    if (indoors) {
      for (let i = 1; i < path.length && flight < arrows.length; i++) {
        const a = path[i-1], b = path[i];
        if (Math.abs(b.y-a.y) < .45) continue;
        const mid = { x: (a.x+b.x)/2, z: (a.z+b.z)/2 };
        set(arrows[flight], 'transform', pose(mid, unit, Math.atan2(b.x-a.x, a.z-b.z)*180/Math.PI));
        flight++;
      }
    }
    arrows.forEach((arrow, i) => set(arrow, 'visibility', i < flight ? 'visible' : 'hidden'));
    const end = path.at(-1);
    if (end) set(flag, 'transform', pose(end, unit));
    set(flag, 'visibility', end && Math.hypot(actor.x - end.x, actor.z - end.z) > 7 * unit ? 'visible' : 'hidden');
    set(rider, 'transform', pose(actor, unit, 180 + actor.heading * 180 / Math.PI));

    const meters = [50, 20, 10, 5, 2, 1].find(m => m <= unit * (width < 164 ? 32 : 43)) ?? 1;
    const pixels = fixed(meters / unit);
    set(scale, 'transform', pose({ x: left + 6 * unit, z: top + (height - 5) * unit }, unit));
    set(ruler, 'd', 'M0 -3V0H' + pixels + 'v-3');
    set(backplate, 'width', pixels + 6); set(measure, 'x', pixels / 2);
    if (measure.textContent !== meters + 'm') measure.textContent = meters + 'm';

    const px = p => (p.x - left) / unit, py = p => (p.z - top) / unit;
    const used = [[px(actor) - 10, py(actor) - 11, 20, 20], [0, height - 21, pixels + 11, 21], [width - 18, 0, 18, 20]];
    if (end) used.push([px(end) - 2, py(end) - 13, 12, 14]);
    for (const place of places) {
      const { id, point, group, label, name } = place;
      const insideLabel = id === 'stairs' || id === 'entry' || id === 'door302';
      const x = px(point), y = py(point);
      let show = insideLabel === indoors && (id !== 'entry' || floor === 1) &&
        (id !== 'door302' || floor === stairs.floorAt(stairs.door302.y)) && x >= 0 && x <= width && y >= 0 && y <= height;
      if (show) {
        const size = id === 'door302' ? 23 : name.length * 11;
        const offsets = id === 'stairs' ? [[-size-4,0],[4,0]] : insideLabel ? [[5,0],[-size-5,0],[5,-18],[5,18]] :
          [[-size/2,-12],[-size/2,12],[-size-14,0],[14,0],[-size/2,-20],[-size/2,20]];
        const offset = offsets.find(([ox, oy]) => {
          const bx = x + ox, by = y + oy - 7;
          return bx >= 2 && bx + size <= width - 2 && by >= 1 && by + 14 <= height - 1 &&
            !used.some(([u,v,w,h]) => bx < u+w && bx+size > u && by < v+h && by+14 > v);
        });
        show = !!offset;
        if (offset) {
          used.push([x+offset[0]-1,y+offset[1]-7,size+2,14]);
          set(group, 'transform', pose(point, unit));
          set(label, 'x', offset[0]); set(label, 'y', offset[1]);
        }
      }
      set(group, 'visibility', show ? 'visible' : 'hidden');
    }
  }
  return { chart, update };
}
