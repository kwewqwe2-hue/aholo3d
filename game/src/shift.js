import { createBike, tickBike } from './drive.js';
import { makeNavigator, lookAhead, routeLength } from './navigation.js';

const distance = (first, second) => Math.hypot(first.x - second.x, first.z - second.z);
const slowEnough = bike => Math.abs(bike.speed) <= 2.5;
const stopsRadius = 8;
const emptyControls = { throttle: false, brake: false, left: false, right: false, handbrake: false };

export function createShift(district, onEvent = () => {}) {
  const navigator = makeNavigator(district);
  const stops = Object.fromEntries(Object.entries(district.stops).map(([key, value]) =>
    [key, { ...navigator.node(value.node), label: value.label }]));
  const orders = [
    { title: '新人首单 · 趁热送到', shop: stops.shop1.label, home: stops.home1.label, pay: 18, fine: 6, limit: 115 },
    { title: '雨天急送 · 准时是福', shop: stops.shop2.label, home: stops.home2.label, pay: 32, fine: 9, limit: 92 }
  ];
  let state;
  let taken, contact, dynamicHazards, toastUntil, invuln, elapsed, pathClock, route, roadLength, pendingService;
  const orderData = () => orders[state.order - 1];
  const target = () => stops[(state.leg === 'pickup' ? 'shop' : 'home') + state.order];
  const origin = () => state.order === 1 ? stops.square : stops.home1;
  const near = () => distance(state.bike, target()) <= stopsRadius;
  const held = () => state.stage !== 'ride' || state.paused || state.mapOpen;
  function tell(text, duration = 2.8) { state.toast = text; toastUntil = duration; }
  function updatePath() {
    route = navigator.route(state.bike, target().id, state.order, state.routeMode);
    roadLength = routeLength(route);
    pathClock = 0;
  }
  function updateHazards() {
    dynamicHazards = district.hazards.filter(hazard => !hazard.order || hazard.order === state.order).map(hazard => {
      if (hazard.type !== 'walker') return hazard;
      const axis = hazard.axis || 'x';
      return { ...hazard, [axis]: hazard[axis] + (hazard.amplitude ?? 3.5) * Math.sin(elapsed * 0.82 + (hazard.phase ?? 0)) };
    });
  }
  function positionForOrder() {
    const start = origin();
    const upcoming = navigator.route(start, stops['shop' + state.order].id, state.order, state.routeMode);
    const firstLeg = upcoming.find(point => distance(point, start) > 0.3);
    const heading = firstLeg ? Math.atan2(start.x - firstLeg.x, firstLeg.z - start.z) : 0;
    state.bike = createBike(start.x, start.z, heading);
    state.hp = 100;
    state.inventory = 0;
    state.timeLimit = orderData().limit;
    state.timeLeft = state.timeLimit;
    state.leg = 'pickup';
    state.reason = ''; state.toast = ''; state.paused = false; state.mapOpen = false;
    state.wet = state.order === 2;
    elapsed = 0; invuln = 0; contact = new Map(); taken = new Set(); toastUntil = 0; pendingService = 0;
    updateHazards(); updatePath();
  }
  function resetDay() {
    state = { stage: 'intro', page: 0, order: 1, completed: 0, cash: 0, spend: 0, earn: 0,
      routeMode: 'safe', muted: false, stats: { attempts: 0, impacts: 0, recoveries: 0 } };
    positionForOrder();
  }
  resetDay();
  function fail(reason) {
    if (state.stage !== 'ride') return;
    const fine = orderData().fine;
    state.spend += fine; state.cash -= fine;
    state.stage = 'failed'; state.reason = reason; state.paused = false; state.mapOpen = false;
    state.bike.speed = 0; pendingService = 0; state.toast = ''; onEvent('failed');
  }
  function damage(amount, reason) {
    if (held() || amount <= 0 || !Number.isFinite(amount)) return;
    state.hp = Math.max(0, state.hp - Math.round(amount)); state.stats.impacts++;
    if (!state.hp) { fail(reason + '，车辆无法继续配送'); return; }
    tell(reason + ' · 耐久 −' + Math.round(amount)); onEvent('bump');
  }
  function finishPickup() {
    pendingService = 0; state.leg = 'dropoff'; updatePath();
    tell('取餐成功！下一站：' + target().label, 3.4); onEvent('pickup');
  }
  function interact() {
    if (held() || pendingService > 0) return;
    if (!near()) { tell('请到黄色停靠区办理交接'); return; }
    if (!slowEnough(state.bike)) { tell('先减速停稳，再按 E 交接'); return; }
    state.bike.speed = 0;
    if (state.leg === 'pickup') {
      if (state.order === 2) {
        pendingService = 2.4; tell('店家：「马上好！」正在封袋…'); onEvent('phone'); return;
      }
      finishPickup(); return;
    }
    const reward = orderData().pay;
    state.cash += reward; state.earn += reward; state.completed++;
    state.stage = 'delivered'; state.toast = ''; state.reason = '';
    onEvent('delivered');
  }
  function action(type) {
    if (type === 'mute') { state.muted = !state.muted; return; }
    if (type === 'next' && state.stage === 'intro') {
      if (state.page < 2) state.page++; else state.stage = 'offer';
      onEvent('page'); return;
    }
    if (type === 'skip' && state.stage === 'intro') { state.stage = 'offer'; return; }
    if (type === 'route' && (state.stage === 'offer' || state.stage === 'ride')) {
      state.routeMode = state.routeMode === 'safe' ? 'short' : 'safe'; updatePath(); return;
    }
    if (type === 'accept' && state.stage === 'offer') {
      state.stage = 'ride'; state.stats.attempts++; state.mapOpen = false;
      tell(state.order === 1 ? '已接单 · W 给油，S 刹车，靠边按 E 取餐' : '暴雨预警 · 门卫落闸，M 看绕行路线', 4.5);
      onEvent('phone'); return;
    }
    if (type === 'interact') { interact(); return; }
    if (type === 'map' && state.stage === 'ride' && !state.paused) { state.mapOpen = !state.mapOpen; return; }
    if (type === 'pause' && state.stage === 'ride') {
      if (state.mapOpen) state.mapOpen = false; else state.paused = !state.paused; return;
    }
    if (type === 'item' && !held()) {
      if (!state.inventory) { tell('经过扳手补给点可拾取修理包'); return; }
      if (state.hp === 100) { tell('车况完好，修理包先留着'); return; }
      const restored = Math.min(35, 100 - state.hp);
      state.hp += restored; state.inventory = 0; state.stats.recoveries++;
      tell('现场快修 · 耐久 +' + restored); onEvent('repair'); return;
    }
    if (type === 'retry' && state.stage === 'failed') {
      positionForOrder(); state.stage = 'ride'; state.stats.attempts++;
      tell('重新派回本单 · 已结算账目不变'); onEvent('phone'); return;
    }
    if (type === 'continue' && state.stage === 'delivered') {
      if (state.completed >= 2) { state.stage = 'dayend'; onEvent('done'); }
      else { state.order = 2; positionForOrder(); state.stage = 'offer'; }
      return;
    }
    if (type === 'restart' && state.stage === 'dayend') {
      const muted = state.muted; resetDay(); state.muted = muted;
    }
  }
  function contacts(previous) {
    for (const hazard of dynamicHazards) {
      const radius = hazard.type === 'gate' ? 0.79 : (hazard.r ?? 1.5) + 0.58;
      let center = hazard;
      if (hazard.type === 'gate') {
        const blocked = district.roads.find(road => road.closedOn === state.order);
        if (blocked) {
          const start = navigator.node(blocked.a), end = navigator.node(blocked.b);
          const length = distance(start, end) || 1;
          const acrossX = (end.z - start.z) / length, acrossZ = (start.x - end.x) / length;
          const halfSpan = Math.max(1, blocked.width * 0.5 - 0.35);
          const along = Math.max(-halfSpan, Math.min(halfSpan, (state.bike.x - hazard.x) * acrossX + (state.bike.z - hazard.z) * acrossZ));
          center = { x: hazard.x + along * acrossX, z: hazard.z + along * acrossZ };
        }
      }
      const dist = distance(state.bike, center);
      if (dist >= radius) continue;
      const last = contact.get(hazard.id) ?? -10;
      const speed = Math.abs(state.bike.speed);
      if (hazard.type === 'puddle') {
        if (elapsed - last > 2.0 && speed >= 9) {
          state.bike.speed *= 0.76; contact.set(hazard.id, elapsed);
          tell('积水打滑 · 入弯前先收油', 2); onEvent('splash');
        }
        continue;
      }
      const pedestrian = hazard.type === 'walker';
      if (pedestrian && speed < 0.65) continue;
      const normalX = previous.x - center.x, normalZ = previous.z - center.z;
      const length = Math.hypot(normalX, normalZ);
      if (length > 0.03) {
        state.bike.x = center.x + normalX / length * (radius + 0.08);
        state.bike.z = center.z + normalZ / length * (radius + 0.08);
      } else {
        state.bike.x = previous.x; state.bike.z = previous.z;
      }
      state.bike.speed = 0;
      if (elapsed - last < 1.1 || invuln > 0) continue;
      contact.set(hazard.id, elapsed);
      if (speed > 2.7) {
        const cost = Math.round(Math.min(29, (pedestrian ? 9 : 5) + speed * 0.9));
        invuln = 0.9;
        damage(cost, pedestrian ? '未礼让，紧急制动' : hazard.type === 'gate' ? '门岗截停，请绕行' : '撞到路障');
      } else {
        tell(hazard.type === 'gate' ? '门岗暂不通行，请看地图绕行' : pedestrian ? '礼让行人' : '前方有路障', 2);
      }
      if (state.stage !== 'ride') return;
    }
    if (state.inventory) return;
    for (const item of district.items) {
      if (taken.has(item.id) || (item.order && item.order !== state.order)) continue;
      if (distance(state.bike, item) <= 3.5) {
        taken.add(item.id); state.inventory = 1; tell('捡到修理包 · 受损后按 Q 使用');
        onEvent('item'); break;
      }
    }
  }
  function tick(dt, controls = emptyControls) {
    if (held() || dt <= 0) return;
    elapsed += dt; state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft < 0.001) { state.timeLeft = 0; fail('平台限时已到'); return; }
    invuln = Math.max(0, invuln - dt); toastUntil -= dt;
    if (toastUntil <= 0) state.toast = '';
    updateHazards();
    if (pendingService > 0) {
      pendingService -= dt;
      if (pendingService <= 0) finishPickup();
    } else {
      const previous = { x: state.bike.x, z: state.bike.z };
      const result = tickBike(state.bike, controls, dt, district, state.wet);
      if (result.impact > 0 && invuln <= 0) { damage(result.impact, '撞击剐蹭'); invuln = 0.9; }
      if (state.stage !== 'ride') return;
      contacts(previous);
    }
    pathClock += dt;
    if (pathClock >= 0.16) updatePath();
  }
  function view() {
    const atStop = near();
    const destination = target();
    let instructions = (state.leg === 'pickup' ? '前往取餐 · ' : '送到顾客 · ') + destination.label;
    if (atStop) instructions = slowEnough(state.bike)
      ? (state.leg === 'pickup' ? '按 E 停车取餐' : '按 E 交给顾客') : '抵达停靠区 · 请减速至停车速度';
    if (pendingService > 0) instructions = '商家封袋中 · ' + Math.ceil(pendingService) + ' 秒';
    return { ...state, near: atStop, serving: Math.max(0, pendingService), targetLabel: destination.label, target: destination,
      route, routeMeters: Math.round(roadLength), instructions, orders, hpMax: 100, speedKph: Math.round(Math.abs(state.bike.speed) * 3.6) };
  }
  function frame() {
    return { bike: state.bike, wet: state.wet, elapsed, stage: state.stage, paused: held(), destination: target(),
      waypoint: lookAhead(route, 21), hazards: dynamicHazards, items: district.items.filter(item => !taken.has(item.id) && (!item.order || item.order === state.order)) };
  }
  function place(x, z, heading = state.bike.heading) { state.bike = createBike(x, z, heading); updatePath(); }
  return { action, tick, view, frame, debug: { place, damage, stops,
    elapse(seconds) { for (let index = 0; index < Math.ceil(Math.min(600, seconds) * 60) && !held(); index++) tick(1 / 60); } } };
}
