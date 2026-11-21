import { lookAhead, makeNavigator } from './navigation.js';
import { createStairLayout } from './stair-layout.js';

const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z, (b.y ?? 0) - (a.y ?? 0));
const metersAlong = points => points.reduce((sum, p, i) => sum + (i ? distance(points[i - 1], p) : 0), 0);
const degrees = radians => radians * 180 / Math.PI;
const pointKey = p => p.x + ',' + p.z;
const formatMeters = meters => Math.max(1, Math.round(meters)) + ' 米';

// Combine the samples of a curved street into a manoeuvre. The sign is
// clockwise on the north-up drawing (+Z is south). Distances follow the line.
function nextRoadTurn(path, actor, roadNodes) {
  if (path.length < 2) return null;
  const projection = path[1];
  const firstOnRoad = path.length > 2 && !projection.id &&
    (!roadNodes.has(pointKey(projection)) || distance(actor, projection) < 5) ? 1 : 0;
  const first = path[firstOnRoad], next = path[firstOnRoad + 1];
  const fx = -Math.sin(actor.heading), fz = Math.cos(actor.heading);
  const dx = next.x - first.x, dz = next.z - first.z;
  const bearing = degrees(Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz));
  if (Math.abs(bearing) > 125) return { icon: 'uTurn', text: '请掉头' };
  if (Math.abs(bearing) > 66) return { icon: bearing > 0 ? 'bendRight' : 'bendLeft', text: bearing > 0 ? '向右转' : '向左转' };

  let along = 0, sameBend = [];
  function manoeuvre() {
    const sweep = sameBend.reduce((sum, vertex) => sum + vertex.angle, 0);
    if (Math.abs(sweep) < 30) return null;
    const at = sameBend[0].along;
    const back = Math.abs(sweep) >= 150;
    return { icon: back ? 'uTurn' : sweep > 0 ? 'bendRight' : 'bendLeft',
      text: '前方 ' + formatMeters(at) + (back ? '掉头' : sweep > 0 ? '右转' : '左转') };
  }
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
    along += Math.hypot(ax, az);
    if (i <= firstOnRoad || Math.hypot(ax, az) < .025 || Math.hypot(bx, bz) < .025) continue;
    const angle = degrees(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
    if (Math.abs(angle) < 3) continue;
    const last = sameBend.at(-1);
    if (last && (last.angle * angle < 0 || along - last.along > 13)) {
      const turn = manoeuvre();
      if (turn) return turn;
      sameBend = [];
    }
    sameBend.push({ along, angle });
  }
  return manoeuvre();
}

// At the dogleg the next flight occupies the same X/Z as a flight one storey
// higher. Stop the highlighted line at the next full landing in our direction.
function currentFloorPath(stairs, path, floor, down) {
  const base = (floor - 1) * stairs.floorHeight;
  const stopY = down ? (path[0].y > base + .08 ? base : base - stairs.floorHeight) : base + stairs.floorHeight;
  const end = path.findIndex((p, i) => i && (down ? p.y <= stopY + .025 : p.y >= stopY - .025));
  return end < 0 ? path : path.slice(0, end + 1);
}

function indoorGuide(view, actor, stairs) {
  const down = view.cargo !== 'hand' && view.cargo !== 'delivered';
  const floor = view.walker.floor ?? stairs.floorAt(actor.y);
  const path = stairs.pathFrom(actor, down);
  const visiblePath = currentFloorPath(stairs, path, floor, down);
  const meters = metersAlong(path), toLanding = metersAlong(visiblePath);
  let icon, text;
  if (down && floor === 1 && actor.y < .15) {
    icon = 'exitDoor';
    text = '前方 ' + formatMeters(meters) + '出楼';
  } else if (down || floor < stairs.floorAt(stairs.door302.y)) {
    icon = down ? 'stairsDown' : 'stairsUp';
    const level = down ? stairs.floorAt(visiblePath.at(-1).y) : floor + 1;
    text = (down ? '下至 ' : '上至 ') + level + ' 楼 · ' + formatMeters(toLanding);
  } else {
    icon = 'door';
    text = view.near || meters < .45
      ? '已到 302 门前' : '距 302 门 ' + formatMeters(meters);
  }
  return { actor, indoors: true, down, floor, path: visiblePath, meters, icon, text,
    waypoint: down ? '返回单元门' : '送至 302 室' };
}

export function createPhoneNavigation(course) {
  const stairs = createStairLayout(course);
  const roads = makeNavigator(course);
  const gateRoutes = new Map();
  const roadNodes = new Set(course.nodes.map(pointKey));
  const nodeById = new Map(course.nodes.map(p => [p.id, p]));
  const streetNames = { '广场商街':'红棚商街', '商街门岗路':'门岗路', '紫藤花架巷':'紫藤花架', '七号楼前坪':'7号楼前' };
  const streets = course.roads.map(r => {
    const a=nodeById.get(r.a), b=nodeById.get(r.b), dx=b.x-a.x, dz=b.z-a.z;
    return {a, dx, dz, lengthSquared:dx*dx+dz*dz, name:streetNames[r.name]??r.name};
  });
  const addresses = [[course.square,13,'牛逼广场'],[course.pickup,10,'红棚烧腊'],[course.gate,9,'北门岗'],
    [course.landmarks.fork,12,'榕树岔口'],[course.finish,10,'7号楼前']];
  function currentStreet(actor) {
    for (const [point,radius,label] of addresses) {
      if ((actor.x-point.x)**2+(actor.z-point.z)**2 <= radius*radius) return label;
    }
    let nearest=Infinity, label='';
    for (const street of streets) {
      const x=actor.x-street.a.x, z=actor.z-street.a.z;
      const t=Math.max(0,Math.min(1,(x*street.dx+z*street.dz)/(street.lengthSquared||1)));
      const dist=(x-t*street.dx)**2+(z-t*street.dz)**2;
      if (dist < nearest) { nearest=dist; label=street.name; }
    }
    return label;
  }
  const outerRoad = new Set(course.mainLine.map(p => p.id));
  const arborRoad = new Set(course.shortLine.map(p => p.id));
  const fork = course.landmarks.fork;
  const afterFork = line => lookAhead(line.slice(line.findIndex(p => p.id === fork.id)), 18);
  const outer = afterFork(course.mainLine), arbor = afterFork(course.shortLine);
  const arborOnRight = (outer.x - fork.x) * (arbor.z - fork.z) > (outer.z - fork.z) * (arbor.x - fork.x);
  function forkTurn(path, actor) {
    // Both branches initially share a tangent. The decision belongs at the
    // common graph node, before the first visibly curved piece of either lane.
    const i = path.findIndex(p => p.id === fork.id || distance(p, fork) < .05);
    if (i < 0 || i === path.length - 1) return null;
    const dx = i ? fork.x - path[i - 1].x : -Math.sin(actor.heading);
    const dz = i ? fork.z - path[i - 1].z : Math.cos(actor.heading);
    if (dx * (fork.x - course.gate.x) + dz * (fork.z - course.gate.z) <= 0) return null;
    const branch = path.slice(i + 1).find(p => outerRoad.has(p.id) !== arborRoad.has(p.id));
    if (!branch) return null;
    const right = arborRoad.has(branch.id) === arborOnRight;
    const at = metersAlong(path.slice(0, i + 1));
    return { index: i, icon: right ? 'forkRight' : 'forkLeft', text: (at < 1 ? '岔口' : '前方 ' + formatMeters(at)) + (right ? '靠右' : '靠左') };
  }
  function describe(view) {
    const foot = view.travelMode === 'foot';
    const actor = view.actor;
    if (foot && view.walker?.indoors) return indoorGuide(view, actor, stairs);
    const collecting = view.leg === 'pickup';
    const target = view.target;
    const mode = view.line === 'short' && !collecting ? 'short' : view.routeMode;
    const current = view.route ?? [];
    // Before the first crossing the campaign targets the compulsory gate.
    // Draw its continuation to the house as one unbroken recommended route.
    const viaGate = !collecting && target?.id === course.gate.id &&
      current.length > 0 && distance(current.at(-1), course.gate) < .25;
    const key = view.order + '/' + mode;
    if (viaGate && !gateRoutes.has(key)) gateRoutes.set(key, roads.route(course.gate, course.finish.id, view.order, mode));
    const continuation = viaGate ? gateRoutes.get(key) : [];
    const path = continuation.length ? current.concat(continuation.slice(1)) : current;
    const meters = metersAlong(path);
    let waypoint = collecting ? course.pickup.label + '取餐' :
      foot && view.cargo === 'box' ? '去车后箱取袋' : '前往单元门';
    const onFootPickup = collecting && foot && (target?.id === 'bike' || target?.id === 'loadBox');
    if (onFootPickup) waypoint = target.label;
    if (!foot && !collecting && view.passedGate) {
      const viaOuter = path.some(p => outerRoad.has(p.id) && !arborRoad.has(p.id));
      const viaArbor = path.some(p => arborRoad.has(p.id) && !outerRoad.has(p.id));
      if (viaOuter && !viaArbor && view.routeMode === 'short') waypoint = '已改走球场外圈';
      if (viaArbor && !viaOuter && view.routeMode === 'safe') waypoint = '已改走紫藤线';
    }
    const choice = !collecting && actor && forkTurn(path, actor);
    const bend = actor && nextRoadTurn(choice ? path.slice(0, choice.index + 1) : path, actor, roadNodes);
    const turn = bend || choice;
    const near = view.interaction && view.interaction.near !== false;
    let guide = turn || { icon: 'straight', text: '直行 ' + formatMeters(meters) };
    if (near) guide = { icon: collecting || view.cargo === 'box' && foot ? 'bag' : 'door', text: view.interaction.label };
    else if (onFootPickup && target.id === 'bike') {
      if (view.canMount) guide = { icon: 'mount', text: '上车，骑回红棚' };
    }
    else if (view.near && collecting) guide = { icon: 'bag', text: foot ? '到车尾装餐' :
      Math.abs(actor.speed) > .5 ? '刹停取餐' : '取餐装箱' };
    else if (view.near && !foot) guide = { icon: 'mount', text: Math.abs(actor.speed) > .5 ? '靠边停车' : '下车取袋' };
    else if (view.near && view.cargo === 'box') guide = { icon: 'bag', text: '从尾箱取袋' };
    else if (meters <= 1.1) guide = { icon: collecting ? 'bag' : 'flag', text: collecting && !foot ? '到店取餐' : waypoint };
    return { actor, indoors: false, location:actor && currentStreet(actor), path:current, continuation, fullPath:path,
      end:path.at(-1), meters, waypoint, ...guide };
  }
  return { stairs, describe };
}
