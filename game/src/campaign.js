import { createTrialSession } from '../trial/session.js';
import { makeNavigator } from './navigation.js';
import { campaignDistrict } from './campaign-course.js';
import { createStairLayout } from './stair-layout.js';
import { boxPosition, createWalkController, overlapsBike, riderPose } from './walk-controller.js';

export { campaignDistrict };

const { square, pickup, gate, finish } = campaignDistrict;
const course = { ...campaignDistrict, start: square };
const stairs = createStairLayout(course);
const foot = createWalkController(course, stairs);
const parkingSpeed = 0.5;
const durations = { dismount: 0.60, mount: 0.66, takeBag: 0.70, knock: 0.80, handoff: 0.95 };
const reachBox = 1.45, reachBike = 1.8;
const groundGap = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const span = (a, b) => Math.hypot(b.x - a.x, b.z - a.z, (b.y ?? 0) - (a.y ?? 0));
const deliveryNavigator = makeNavigator(course);
const pickupNavigator = makeNavigator({ nodes: course.nodes, roads: course.roads.filter(r => r.pickupApproach) });
// Lead a walker through the threshold. Stopping just outside the facade
// would otherwise leave a zero-length route before the indoor guide takes over.
const entrance = { ...stairs.world(0, 0.60), id: 'entrance', label: '7 号楼 · 单元门' };
const room = { ...stairs.knock, id: 'door302', label: '7 号楼 · 3 楼 302 室' };
const exit = { ...stairs.outside, id: 'exit', label: '一楼出口' };
const store = { kind: 'pickup', label: '取餐装箱' };
const bag = { kind: 'takeBag', label: '从尾箱取袋' };
const customer = { kind: 'knock', label: '敲 302 室的门' };
const idle = () => ({ type: 'none', progress: 0 });

function atCustomer(walker) {
  return walker.indoors && walker.floor === 3 && Math.abs(walker.y - room.y) < 0.08 &&
    stairs.local(walker).d <= stairs.front && groundGap(walker, room) <= 1.05 &&
    groundGap(walker, stairs.door302) <= 1.48;
}

function appendPoint(points, point) {
  if (!points.length || span(points.at(-1), point) > 0.01) points.push(point);
}

// Interpolate height as well as XZ so markers sit on the current flight.
function aheadOnRoute(points, meters) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = span(a, b);
    if (length && meters <= length) {
      const t = meters / length;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
    }
    meters -= length;
  }
  return points.at(-1);
}

export function createCampaign(onEvent = () => {}) {
  let stage, page, leg, paused, mapOpen, routeMode, attempts, session, approachTime;
  let travelMode, cargo, bike, cart, walker, motion, motionTime, from, to, cameraHeading;
  let notice, noticeLeft, routeCache, vehicleAccess, pickupFootTarget, muted = false;
  const riding = () => stage === 'ride' && !paused && !mapOpen;
  const movingFreely = () => riding() && motion.type === 'none';
  const onBike = () => travelMode === 'bike';
  const actorPose = () => riderPose(onBike() ? bike : walker);
  const canDrive = () => movingFreely() && onBike();
  function tell(message, seconds = 2.4) { notice = message; noticeLeft = seconds; }

  function trialEvent(name) {
    if (name === 'phone') return;
    noticeLeft = 0;
    if (name === 'failed') { stage = 'failed'; motion = idle(); }
    if (name === 'delivered') { stage = 'delivered'; cargo = 'delivered'; motion = idle(); }
    onEvent(name);
  }
  function resetRider() {
    ({ bike, pursuer: cart } = session.view());
    walker = riderPose(bike); travelMode = 'bike'; cargo = leg === 'dropoff' ? 'box' : 'none';
    motion = idle(); motionTime = 0; from = to = null; cameraHeading = bike.heading;
    routeCache = vehicleAccess = pickupFootTarget = null;
  }
  function resetDay() {
    stage = 'intro'; page = 0; leg = 'pickup'; routeMode = 'safe';
    paused = mapOpen = false; attempts = 0; approachTime = 0; notice = ''; noticeLeft = 0;
    session = createTrialSession(course, trialEvent, {
      handoffReady: () => leg === 'dropoff' && cargo === 'hand' && !onBike() && atCustomer(walker) &&
        motion.type === 'handoff' && motion.progress === 1,
    });
    resetRider();
  }
  resetDay();
  const { basePay, fine, bonusTime, bonusPay } = session.view();
  const orders = Object.freeze([Object.freeze({
    title: '新人首单 · 趁热送到', shop: pickup.label, home: room.label,
    pay: basePay, fine, limit: bonusTime, bonusPay,
  })]);

  function walkingPickupGoal() {
    const box = boxPosition(bike);
    if (groundGap(box, pickup) <= pickup.radius + reachBox) {
      // Stand on the shop side of the box, within both interaction ranges and clear of the scooter.
      const towardShop = Math.atan2(pickup.z - box.z, pickup.x - box.x);
      for (const radius of [1.05, reachBox - .05]) {
        let nearest = null, best = pickup.radius;
        for (let i = 0; i < 16; i++) {
          const angle = towardShop + i * Math.PI / 8;
          const spot = { x: box.x + radius * Math.cos(angle), z: box.z + radius * Math.sin(angle) };
          const meters = groundGap(spot, pickup);
          if (meters <= best && !overlapsBike(spot, bike) && foot.clearSegment(box, spot)) {
            nearest = spot; best = meters;
          }
        }
        if (nearest) return { ...nearest, id: 'loadBox', label: '红棚烧腊 · 尾箱装餐' };
      }
    }
    return { x: bike.x, z: bike.z, id: 'bike', label: '外卖车 · 骑回红棚' };
  }

  function goal(run, actor) {
    if (actor.indoors) return cargo === 'hand' || cargo === 'delivered' ? room : exit;
    if (leg === 'pickup') return onBike() ? pickup : (pickupFootTarget ??= walkingPickupGoal());
    if (!onBike() && cargo === 'box') return { ...boxPosition(bike), id: 'box', label: '外卖车 · 尾箱' };
    if (!run.passedGate) return gate;
    return onBike() ? finish : entrance;
  }

  function vehicleRoadAccess(target) {
    if (vehicleAccess?.x === target.x && vehicleAccess.z === target.z) return vehicleAccess.node;
    const nearest = [...course.nodes].sort((a, b) => groundGap(a, target) - groundGap(b, target));
    const node = nearest.find(n => foot.clearSegment(target, n)) ?? nearest[0];
    vehicleAccess = { x: target.x, z: target.z, node };
    return node;
  }

  function navigation(run, actor) {
    const target = goal(run, actor), mode = leg === 'dropoff' && run.line === 'short' ? 'short' : routeMode;
    if (routeCache && routeCache.travelMode === travelMode && routeCache.x === actor.x && routeCache.z === actor.z && routeCache.y === actor.y &&
        routeCache.target.id === target.id && routeCache.mode === mode) return routeCache;

    let points;
    const vehicleReach = target.id === 'bike' ? reachBike : target.id === 'box' ? reachBox : 0;
    const approach = target === entrance ? stairs.entrance : target;
    if (actor.indoors) points = stairs.pathFrom(actor, target === exit);
    else if (!onBike() && groundGap(actor, approach) <= 16 && foot.clearSegment(actor, approach)) {
      points = [actor]; appendPoint(points, approach); appendPoint(points, target);
    } else {
      const nav = target === pickup ? pickupNavigator : deliveryNavigator;
      const node = target === entrance ? finish :
        vehicleReach || target.id === 'loadBox' ? vehicleRoadAccess(target) : target;
      points = nav.route(actor, node.id, 1, mode);
      if (target === entrance) { appendPoint(points, stairs.outside); appendPoint(points, stairs.entrance); }
      appendPoint(points, target);
    }
    if (!onBike() && !actor.indoors && points.length > 1) {
      const walkable = [points[0]];
      for (let i = 1; i < points.length; i++) {
        // A freely parked scooter can cover the navigator's projection onto
        // the road. Join the next clear point from the pedestrian's own side.
        if (i < points.length - 1 && overlapsBike(points[i], bike)) continue;
        const reach = i === points.length - 1 ? vehicleReach : 0;
        for (const p of foot.aroundBike(walkable.at(-1), points[i], bike, cart, reach)) appendPoint(walkable, p);
        appendPoint(walkable, points[i]);
      }
      points = walkable;
    }
    // The head is always the actual controlling pose, including on a landing.
    points[0] = { x: actor.x, y: actor.y, z: actor.z };
    const length = points.reduce((n, p, i) => n + (i ? span(points[i - 1], p) : 0), 0);
    routeCache = { x: actor.x, y: actor.y, z: actor.z, travelMode, mode, target, points, length };
    return routeCache;
  }

  function opportunities(actor) {
    const free = movingFreely();
    const stopped = Math.abs(bike.speed) <= parkingSpeed;
    const atShop = leg === 'pickup' && !actor.indoors && groundGap(actor, pickup) <= pickup.radius;
    const atBox = !onBike() && !actor.indoors && (cargo === 'box' || atShop) &&
      foot.canReach(actor, boxPosition(bike), reachBox, cart);
    const canKnock = cargo === 'hand' && atCustomer(actor);
    const atBuilding = leg === 'dropoff' && !actor.indoors && groundGap(actor, finish) <= 5.5;
    const near = (atShop && (onBike() || atBox)) || (cargo === 'box' && atBox) || canKnock || (onBike() && atBuilding);
    let interaction = null;
    if (free && atShop && stopped && (onBike() || atBox)) interaction = store;
    else if (free && atBox && cargo === 'box') interaction = bag;
    else if (free && canKnock) interaction = customer;
    const landing = free && onBike() && stopped ? foot.dismountSpot(bike, cart) : null;
    return { near, interaction, landing, canDismount: !!landing,
      canMount: free && !onBike() && foot.canReach(actor, bike, reachBike, cart) };
  }

  function instructions(run, actor, available) {
    if (motion.type !== 'none') return {
      dismount: '下车中', mount: '上车中', takeBag: '从尾箱取出餐袋', knock: '正在敲 302 室的门', handoff: '住户正在接餐',
    }[motion.type];
    if (available.interaction) return '按 Enter ' + available.interaction.label;
    if (actor.indoors) {
      if (cargo !== 'hand' && cargo !== 'delivered') return '沿楼梯下到一楼，出单元门' + (cargo === 'box' ? '回车取袋' : '去红棚取餐');
      return actor.floor === 3 ? '三楼前平台 · 找 302 室敲门' : '沿楼梯上三楼 · 当前 ' + actor.floor + ' 楼';
    }
    if (leg === 'pickup') {
      if (!onBike()) {
        if (goal(run, actor).id === 'loadBox') return '沿黄线走到尾箱旁，在红棚装餐';
        return available.canMount ? '按 F 上车，骑到红棚旁装餐' : '沿黄线回到自己的车旁，骑到红棚装餐';
      }
      if (available.near) return '红棚已到 · 请先刹停';
      return '沿商街向北，到红棚烧腊取餐';
    }
    if (!onBike() && cargo === 'box') return '走到自己车的尾箱旁取袋';
    if (!run.passedGate) return onBike() ? '向南行驶，右转穿过两根门柱' : '提袋沿商街向南，右转穿过两根门柱';
    if (!onBike()) return '提袋穿过 7 号楼单元门，送到三楼 302 室';
    if (available.near) return Math.abs(bike.speed) > parkingSpeed ? '7 号楼到了 · 刹停后按 F 下车' : '按 F 下车，到尾箱取袋';
    return '沿球场外圈或紫藤花架到 7 号楼，自选位置停车';
  }

  function startMotion(type, endpoint = null) {
    motion = { type, progress: 0 }; motionTime = 0;
    from = endpoint && { ...walker }; to = endpoint;
    walker.speed = 0; noticeLeft = 0;
    onEvent(type);
    return true;
  }
  function toggleMount() {
    if (!movingFreely()) return false;
    const available = opportunities(actorPose());
    if (onBike()) {
      if (!available.landing) {
        tell(Math.abs(bike.speed) > parkingSpeed ? '请先刹停，再按 F 下车' : '车旁空间太小，换个位置下车');
        return false;
      }
      session.act('park'); pickupFootTarget = null;
      travelMode = 'foot'; walker = riderPose(bike);
      return startMotion('dismount', { ...available.landing, heading: bike.heading });
    }
    if (!available.canMount) { tell(walker.indoors ? '先下楼，出门后回到自己的车旁' : '走到自己的车旁再按 F'); return false; }
    return startMotion('mount', riderPose(bike));
  }
  function interact() {
    if (!movingFreely()) return false;
    const actor = actorPose(), available = opportunities(actor);
    switch (available.interaction?.kind) {
      case 'pickup':
        approachTime = session.view().elapsed;
        session.act('load'); leg = 'dropoff'; cargo = 'box'; routeCache = null;
        tell('餐已装箱 · 向南行驶，右转穿过北门岗'); onEvent('pickup');
        return true;
      case 'takeBag': {
        const box = boxPosition(bike);
        walker.heading = Math.atan2(walker.x - box.x, box.z - walker.z);
        return startMotion('takeBag');
      }
      case 'knock':
        walker.heading = Math.atan2(walker.x - stairs.door302.x, stairs.door302.z - walker.z);
        return startMotion('knock');
      default:
        tell(instructions(session.view(), actor, available));
        return false;
    }
  }
  function endMotion() {
    switch (motion.type) {
      case 'mount':
        travelMode = 'bike';
        if (cargo === 'hand') cargo = 'box';
        break;
      case 'takeBag':
        cargo = 'hand'; tell('餐袋已拿好 · 送到 7 号楼三楼 302 室');
        break;
      case 'knock':
        startMotion('handoff'); return;
      case 'handoff':
        if (session.act('deliver')) return;
        break;
    }
    motion = idle(); from = to = null;
  }
  function retry() {
    if (stage !== 'failed' || !session.act('restart')) return false;
    stage = 'ride'; attempts++; resetRider();
    tell(leg === 'pickup' ? '车已修好 · 从广场重新去红棚取餐' : '车已修好 · 餐在尾箱，从红棚重新出发');
    onEvent('phone');
    return true;
  }
  function action(type) {
    switch (type) {
      case 'mute': muted = !muted; return true;
      case 'next':
      case 'skip':
        if (stage !== 'intro') return false;
        if (type === 'next' && page < 2) page++;
        else stage = 'offer';
        onEvent('page'); return true;
      case 'accept':
        if (stage !== 'offer' || !session.act('start')) return false;
        stage = 'ride'; attempts++; tell('从广场向北 · 红棚门前刹停，按 Enter 取餐', 4);
        onEvent('phone'); return true;
      case 'mount': return toggleMount();
      case 'interact': return interact();
      case 'map':
        if (stage !== 'ride' || paused) return false;
        mapOpen = !mapOpen; return true;
      case 'pause':
        if (stage !== 'ride') return false;
        if (mapOpen) mapOpen = false;
        else paused = !paused;
        return true;
      case 'blur':
        if (stage !== 'ride') return false;
        if (!mapOpen) paused = true;
        return true;
      case 'route':
        if (stage !== 'offer' && (stage !== 'ride' || paused)) return false;
        routeMode = routeMode === 'safe' ? 'short' : 'safe'; return true;
      case 'boost':
      case 'left':
      case 'right': return canDrive() && session.act(type);
      case 'continue':
        if (stage !== 'delivered') return false;
        stage = 'dayend'; onEvent('done'); return true;
      case 'restart':
        if (stage === 'dayend') { resetDay(); return true; }
        return retry();
      case 'retry': return retry();
      default: return false;
    }
  }

  function advance(dt, controls) {
    // Split at animation boundaries too. A knock in a long caller tick still
    // hands off and settles at the precise game-clock instant of receipt.
    while (dt > 0 && riding()) {
      const animating = motion.type !== 'none';
      const duration = durations[motion.type];
      const step = animating ? Math.min(dt, duration - motionTime) : dt;
      if (animating) {
        motionTime += step;
        motion.progress = duration - motionTime < 1e-10 ? 1 : motionTime / duration;
        if (to) {
          const p = motion.progress, t = p * p * (3 - 2 * p);
          walker.x = from.x + (to.x - from.x) * t; walker.z = from.z + (to.z - from.z) * t;
          const turn = to.heading - from.heading;
          walker.heading = from.heading + Math.atan2(Math.sin(turn), Math.cos(turn)) * t;
        }
      } else if (!onBike()) foot.step(walker, step, controls, cameraHeading, bike, cart);
      noticeLeft = Math.max(0, noticeLeft - step);
      session.tick(step, controls, onBike() ? null : walker);
      if (onBike() && !Number.isFinite(controls.cameraHeading)) cameraHeading = bike.heading;
      if (animating && motion.progress === 1) endMotion();
      dt -= step;
    }
  }
  function tick(dt, controls = {}) {
    if (!riding() || !Number.isFinite(dt) || dt <= 0) return;
    if (Number.isFinite(controls.cameraHeading)) cameraHeading = controls.cameraHeading;
    const count = Math.ceil(dt * 60), step = dt / count;
    for (let i = 0; i < count && riding(); i++) advance(step, controls);
  }

  function publicState(run, actor, path, available) {
    return {
      campaign: true, leg, travelMode, bike: { ...bike }, walker: { ...actor }, actor,
      cargo, guard: { ...run.guard }, motion: { ...motion }, cameraHeading,
      patrolPressure: leg === 'dropoff' || run.passedGate ? run.patrolPressure : undefined,
      interaction: available.interaction && { ...available.interaction },
      near: available.near, canMount: available.canMount, canDismount: available.canDismount,
      canDeliver: available.interaction?.kind === 'knock',
      routeMode, route: path.points.map(p => ({ ...p })), routeMeters: Math.round(path.length),
      target: { ...path.target }, targetLabel: path.target.label, instructions: instructions(run, actor, available),
      boostReady: canDrive() && run.boostReady,
    };
  }
  function hint(run) {
    if (stage !== 'ride') return '';
    if (run.patrolPressure?.side) return run.hint;
    return noticeLeft > 0 ? notice : run.hint;
  }
  function view() {
    const run = session.view(), actor = actorPose(), elapsed = leg === 'dropoff' ? run.elapsed : 0;
    return {
      ...publicState(run, actor, navigation(run, actor), opportunities(actor)),
      totalOrders: 1, order: 1, orders, stage, page, mapOpen, paused, muted, speedKph: Math.round(Math.abs(actor.speed) * 3.6),
      hp: run.hp, hpMax: 100, wet: false, inventory: 0, serving: 0, passedGate: run.passedGate,
      side: run.side, line: run.line, pushCount: run.pushCount, boost: run.boost, kick: run.kick,
      elapsed, timeLeft: Math.max(0, bonusTime - elapsed), timeLimit: bonusTime, bonusTime, basePay, bonusPay, fine,
      bonus: run.bonus, earned: run.earned, earn: run.earned, spend: run.fines, cash: run.cash,
      completed: run.stage === 'finished' ? 1 : 0, reason: run.outcome, medal: run.medal, toast: hint(run), stats: { attempts },
    };
  }
  function frame() {
    const run = session.view(), actor = actorPose(), path = navigation(run, actor);
    const ahead = Math.min(path.length, onBike() ? 8 + Math.min(8, Math.abs(bike.speed) * 0.42) : 1.65);
    const waypoint = aheadOnRoute(path.points, ahead), before = aheadOnRoute(path.points, Math.max(0, ahead - 0.15));
    const waypointYaw = waypoint && before && groundGap(waypoint, before) > 0.001
      ? Math.atan2(waypoint.x - before.x, waypoint.z - before.z) : null;
    return {
      ...run, ...publicState(run, actor, path, opportunities(actor)), pursuer: { ...cart },
      paused: !riding(), elapsed: approachTime + run.elapsed, deliveryElapsed: leg === 'dropoff' ? run.elapsed : 0,
      hint: hint(run), gateDistance: groundGap(actor, gate), finishDistance: actor.indoors ? span(actor, room) : groundGap(actor, finish),
      destination: { ...path.target }, waypoint: waypoint && { ...waypoint }, waypointYaw, remaining: path.length,
    };
  }
  return { view, frame, action, tick };
}
