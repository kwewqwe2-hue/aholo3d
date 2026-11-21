import { createVehicle, stepVehicle } from './handling.js';
import { createPursuer, stepPursuer, pushAside } from './pace-bike.js';
import { createPatrolPressure } from './patrol-pressure.js';

const gap = (first, second) => Math.hypot(first.x - second.x, first.z - second.z);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const basePay = 18;
const bonusPay = 6;
const fine = 6;

function makeLine(points) {
  const segments = [];
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    const size = gap(start, end);
    if (size < 0.01) continue;
    segments.push({ start, end, size, offset: length, dx: end.x - start.x, dz: end.z - start.z });
    length += size;
  }
  return { segments, length };
}

function nearest(line, point) {
  let best = { distance: Infinity, along: 0 };
  for (const segment of line.segments) {
    const fraction = clamp(((point.x - segment.start.x) * segment.dx +
      (point.z - segment.start.z) * segment.dz) / (segment.size ** 2), 0, 1);
    const dist = Math.hypot(segment.start.x + fraction * segment.dx - point.x, segment.start.z + fraction * segment.dz - point.z);
    if (dist < best.distance) best = { distance: dist, along: segment.offset + fraction * segment.size };
  }
  return best;
}

function pointAt(line, at) {
  const segment = line.segments.find(part => part.offset + part.size >= at) ?? line.segments.at(-1);
  if (!segment) return null;
  const ratio = clamp((at - segment.offset) / segment.size, 0, 1);
  return { x: segment.start.x + segment.dx * ratio, z: segment.start.z + segment.dz * ratio };
}

// Intersect the actor's swept segment with the opening between the inner
// faces of the actual posts. The pickup identifies the street half-plane.
function createGateGuard(course, start, alert) {
  const north = course.blocks.find(b => b.id === 'northPost');
  const south = course.blocks.find(b => b.id === 'southPost');
  const width = gap(north, south), tx = (south.x - north.x) / width, tz = (south.z - north.z) / width;
  const side = p => (p.x - north.x) * tz - (p.z - north.z) * tx;
  const street = Math.sign(side(course.pickup));
  const halfPost = b => (Math.abs(tx) * b.w + Math.abs(tz) * b.d) / 2;
  const low = halfPost(north), high = width - halfPost(south);
  const state = { phase: 'posted', progress: 0 };
  let fromX = start.x, fromZ = start.z, fromSide = side(start) * street, lastSide = fromSide;
  let elapsed = 0;
  function step(dt, actor) {
    if (state.phase === 'posted') {
      const toSide = side(actor) * street;
      let crossed = false;
      if (lastSide > 0 && fromSide >= 0 && toSide < 0) {
        const t = fromSide / (fromSide - toSide);
        const along = (fromX + (actor.x - fromX) * t - north.x) * tx +
          (fromZ + (actor.z - fromZ) * t - north.z) * tz;
        crossed = along > low && along < high;
        if (crossed) dt *= 1 - t;
      }
      if (toSide !== 0) lastSide = toSide;
      fromX = actor.x; fromZ = actor.z; fromSide = toSide;
      if (!crossed) return 0;
      state.phase = 'alert';
      alert();
    }
    if (actor.indoors) { state.phase = 'standDown'; state.progress = 1; }
    if (state.phase === 'standDown') return 0;
    while (state.phase === 'alert' || state.phase === 'boarding') {
      const duration = state.phase === 'alert' ? 0.65 : 1.2;
      const left = duration - elapsed;
      if (dt + 1e-10 < left) {
        elapsed += dt; state.progress = elapsed / duration;
        return 0;
      }
      dt = Math.max(0, dt - left); elapsed = 0;
      state.phase = state.phase === 'alert' ? 'boarding' : 'chasing';
      state.progress = state.phase === 'boarding' ? 0 : 1;
    }
    return dt;
  }
  return { state, step };
}

export function createTrialSession(course, emit = () => {}, checkpoint = {}) {
  const main = makeLine(course.mainLine), shortcut = makeLine(course.shortLine);
  const gateAlong = nearest(main, course.gate).along;
  const bonusTime = course.campaign ? 65 : 35;
  let state, guide, pressure, guard, elapsedError, respawn = course.start;
  let boostLeft, boostLock, kickLeft, kickLock, noticeLeft, notice, hitLock;
  function tell(message, duration = 2) { notice = message; noticeLeft = duration; }
  function refreshGuide(actor = state.bike) {
    const mainPos = nearest(main, actor), shortPos = nearest(shortcut, actor);
    if (state.passedGate && shortPos.distance + 0.8 < mainPos.distance) state.line = 'short';
    if (mainPos.distance + 0.8 < shortPos.distance) state.line = 'main';
    const path = state.line === 'short' ? shortcut : main;
    const closest = state.line === 'short' ? shortPos : mainPos;
    const look = 8 + Math.min(8, Math.abs(actor.speed) * 0.42);
    guide = !state.passedGate ? course.gate : pointAt(path, closest.along + look);
    state.remaining = !state.passedGate ? Math.max(0, gateAlong - mainPos.along) : Math.max(0, path.length - closest.along);
  }
  function reset(stage = 'ready', previousCash = 0, previousFines = 0) {
    const head = respawn.heading ?? 0;
    state = { stage, paused: false, bike: createVehicle(respawn.x, respawn.z, head), pursuer: createPursuer(),
      passedGate: false, hp: 100, elapsed: 0, earned: 0, bonus: 0, fines: previousFines, cash: previousCash, line: 'main',
      kick: 0, boost: 0, pushCount: 0, remaining: 0, medal: '', outcome: '', side: '', canDeliver: false };
    if (stage === 'ready' && checkpoint.bike) {
      Object.assign(state.bike, checkpoint.bike);
      if (Number.isFinite(checkpoint.hp)) state.hp = clamp(checkpoint.hp, 0, 100);
    }
    boostLeft = boostLock = kickLeft = kickLock = noticeLeft = hitLock = elapsedError = 0; notice = '';
    pressure = createPatrolPressure(course);
    if (course.campaign) {
      guard = createGateGuard(course, state.bike, () => {
        state.passedGate = true; tell('哎！送餐的，等一下！', 1.85); emit('guardAlert');
      });
      stepPursuer(state.pursuer, state.bike, course, 0, false);
    }
    refreshGuide();
  }
  reset();
  function active() { return state.stage === 'drive' && !state.paused; }
  function finish(ok) {
    if (!active()) return false;
    state.stage = ok ? 'finished' : 'failed'; state.bike.speed = 0; state.boost = 0; state.kick = 0;
    if (ok) {
      if (course.campaign && Math.abs(state.elapsed - bonusTime) < 8 * Number.EPSILON * bonusTime) state.elapsed = bonusTime;
      state.bonus = state.elapsed <= bonusTime ? bonusPay : 0;
      state.earned = basePay + state.bonus; state.cash += state.earned;
      state.medal = state.bonus ? '准时送达' : '已送达'; emit('delivered');
    } else {
      state.fines += fine; state.cash -= fine; state.outcome = '车况归零'; emit('failed');
    }
    return true;
  }
  function act(intent) {
    if (intent === 'start' && state.stage === 'ready') {
      state.stage = 'drive'; emit('phone');
      if (!course.campaign) tell('餐已取好 · 穿过黄黑门岗', 2.6);
      return true;
    }
    if (intent === 'restart' && state.stage !== 'ready') {
      const keep = state.stage !== 'finished';
      reset('drive', keep ? state.cash : 0, keep ? state.fines : 0); emit('phone');
      tell('已回到取餐后 · 本次重新试驾'); return true;
    }
    if (intent === 'pause' && state.stage === 'drive') { state.paused = !state.paused; return true; }
    if (!active()) return false;
    if (intent === 'park' && course.campaign) {
      Object.assign(state.bike, { speed: 0, lean: 0, steer: 0, sideSpeed: 0, steeringInput: 0,
        reverseHold: 0, stepRemainder: 0 });
      boostLeft = kickLeft = state.boost = state.kick = 0;
      return true;
    }
    if (intent === 'load' && course.campaign) {
      const { x, z, heading } = state.bike;
      respawn = { x, z, heading }; state.elapsed = elapsedError = 0; noticeLeft = 0;
      return true;
    }
    if (intent === 'boost' && !boostLock) { boostLeft = 0.85; boostLock = 3.6; emit('item'); return true; }
    if ((intent === 'left' || intent === 'right') && !kickLock) {
      const pushed = pushAside(state.pursuer, state.bike, intent);
      kickLeft = 0.34; kickLock = 0.66; state.kick = intent === 'left' ? -1 : 1;
      if (pushed) { pressure?.kicked(); state.pushCount++; emit('bump'); tell('拉开了 · 选你的弯线', 1.5); }
      return pushed;
    }
    if (intent === 'deliver') {
      if (course.campaign) return checkpoint.handoffReady?.() === true && finish(true);
      if (state.passedGate && gap(state.bike, course.finish) < 5.5 && Math.abs(state.bike.speed) <= 2.5) return finish(true);
      if (gap(state.bike, course.finish) < 9) tell('松油刹稳，再按 Enter 交餐');
    }
    return false;
  }
  function tick(dt, controls = {}, pedestrian = null) {
    if (!active() || !Number.isFinite(dt) || dt <= 0) return;
    // Keep the inclusive bonus boundary stable across small player-input steps.
    const corrected = dt - elapsedError, next = state.elapsed + corrected;
    elapsedError = (next - state.elapsed) - corrected;
    state.elapsed = next;
    boostLeft = Math.max(0, boostLeft - dt); boostLock = Math.max(0, boostLock - dt);
    kickLeft = Math.max(0, kickLeft - dt); kickLock = Math.max(0, kickLock - dt);
    noticeLeft = Math.max(0, noticeLeft - dt);
    hitLock = Math.max(0, hitLock - dt);
    state.boost = clamp(boostLeft / 0.85, 0, 1);
    state.kick = Math.sign(state.kick) * Math.min(1, kickLeft / 0.17);
    const previousDistance = guard ? 0 : gap(state.bike, course.gate);
    const impact = pedestrian ? 0 : stepVehicle(state.bike, { ...controls, boost: boostLeft > 0 }, dt, course, false).impact;
    if (impact > 0 && hitLock === 0) {
      state.hp = Math.max(0, state.hp - Math.ceil(impact)); hitLock = 0.8;
      if (!state.hp) { finish(false); return; }
      emit('bump'); tell('剐蹭 · 车况 ' + state.hp, 1.4);
    }
    if (!guard && !state.passedGate && (gap(state.bike, course.gate) <= 6 || previousDistance <= 6)) {
      state.passedGate = true; tell('进院 · 岗亭巡逻车已出发', 2.4); emit('pickup');
    }
    const actor = pedestrian ?? state.bike;
    const chaseTime = guard ? guard.step(dt, actor) : dt;
    const chasing = guard ? guard.state.phase === 'chasing' : state.passedGate;
    const cart = state.pursuer;
    if (guard?.state.phase === 'standDown' && cart.active) {
      cart.speed = cart.steer = cart.lean = cart.sideSpeed = 0;
      cart.pushed = false; cart.pushSide = null;
    }
    if (pedestrian) pressure?.cancel();
    stepPursuer(cart, actor, course, chaseTime, chasing, pressure?.target);
    if (pedestrian) cart.reachSide = null;
    const result = !pedestrian && chasing ? pressure?.step(chaseTime, cart, actor) : null;
    if (result === 'contact') {
      state.bike.speed -= Math.min(1.8, state.bike.speed * 0.12);
      emit('bump'); tell('保安车擦过 · 车速稍降', 1.6);
    } else if (result === 'avoided') tell('已避开保安车', 1.2);
    state.side = state.pursuer.reachSide ?? '';
    state.canDeliver = !course.campaign && state.passedGate && gap(state.bike, course.finish) < 5.5;
    refreshGuide(actor);
  }
  function view() {
    return { ...state, ...(guard && { guard: { ...guard.state } }), ...(pressure && { patrolPressure: pressure.view() }),
      hint: pressure?.warning || (noticeLeft > 0 ? notice : ''), waypoint: guide, bonusTime, basePay, bonusPay, fine,
      boostReady: boostLock === 0, gateDistance: gap(state.bike, course.gate), finishDistance: gap(state.bike, course.finish) };
  }
  return { act, tick, view };
}
