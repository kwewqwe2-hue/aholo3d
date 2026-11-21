// node qa/first-order.sim.mjs
// Whole orders only use the public actions, inputs and snapshots. The separate
// geometry probes exercise exact post, portal and rail boundaries.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { campaignDistrict as course, createCampaign } from '../src/campaign.js';
import { createStairLayout } from '../src/stair-layout.js';
import { createWalkController, riderPose } from '../src/walk-controller.js';
import { createTrialSession } from '../trial/session.js';
import { course as practice } from '../trial/course.js';
import { steerToward } from '../trial/qa/ride.mjs';

const dt = 1 / 60, stairs = createStairLayout(course);
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, a + ' / ' + b);
const amount = n => +n.toFixed(3);
const inputs = (line, bike) => {
  const keys = steerToward(line, bike);
  return { throttle: keys.includes('KeyW'), brake: keys.includes('KeyS'), left: keys.includes('KeyA'), right: keys.includes('KeyD') };
};
function newOrder() {
  const events = [], game = createCampaign(e => events.push(e));
  assert.equal(game.view().stage, 'intro');
  assert(game.action('next') && game.action('next') && game.action('next') && game.action('accept'));
  assert.equal(game.view().cargo, 'none');
  assert.equal(game.view().timeLimit, 65);
  assert.equal(game.frame().stage, 'drive');
  assert(!game.action('interact'));
  return { game, events };
}

function drive(game, line, stopped, observe = () => {}) {
  for (let i = 0; i < 6000; i++) {
    const s = game.view();
    observe(s);
    if (stopped(s)) return s;
    assert.equal(s.stage, 'ride');
    game.tick(dt, inputs(line, s.bike));
  }
  assert.fail('Unreached driving target ' + JSON.stringify(game.view().actor));
}
function park(game, line, observe) {
  drive(game, line, s => gap(s.bike, line.at(-1)) < 4 && Math.abs(s.bike.speed) < 0.10, observe);
  game.tick(0.12, { handbrake: true });
  assert.equal(game.view().bike.speed, 0);
}
function load(game, byFoot = false) {
  let passedAtSpeed = false;
  park(game, game.view().route, s => {
    if (s.near && s.bike.speed > 1 && !passedAtSpeed) {
      assert.equal(s.interaction, null); assert(!game.action('interact')); passedAtSpeed = true;
    }
  });
  assert(passedAtSpeed);
  if (byFoot) { assert(game.action('mount')); game.tick(0.6); }
  const before = game.view();
  assert.equal(before.interaction.kind, 'pickup');
  assert(game.action('interact'));
  const loaded = game.view();
  assert.deepEqual(loaded.bike, before.bike);
  assert.deepEqual([loaded.cargo, loaded.elapsed, loaded.hp, loaded.cash], ['box', 0, before.hp, before.cash]);
  if (byFoot) { assert(game.action('mount')); game.tick(0.66); }
  return before.bike;
}

function frozen(game) {
  const { actor, bike, walker, pursuer, guard, motion, elapsed, cargo, cash, hp } = game.frame();
  return { actor, bike, walker, pursuer, guard, motion, elapsed, cargo, cash, hp };
}
function checkOverlays(game) {
  const before = frozen(game);
  for (const action of ['map', 'pause', 'blur']) {
    assert(game.action(action));
    if (action === 'blur') assert(game.action('blur'));
    game.tick(5, { throttle: true, left: true, walkX: 1, walkZ: 1, run: true });
    assert(!game.action('interact') && !game.action('mount') && !game.action('boost'));
    assert.deepEqual(frozen(game), before);
    assert(game.action(action === 'map' ? 'map' : 'pause'));
  }
}

function dismount(game) {
  const bike = game.view().bike;
  assert(game.view().canDismount && game.action('mount'));
  assert.equal(game.frame().motion.type, 'dismount');
  game.tick(0.3); close(game.view().motion.progress, 0.5);
  checkOverlays(game); assert(!game.action('mount'));
  game.tick(0.3);
  const s = game.view();
  close(gap(s.bike, bike), 0); close(s.bike.heading, bike.heading);
  assert.deepEqual([s.travelMode, s.motion.type, s.canMount], ['foot', 'none', true]);
  assert(gap(s.bike, s.walker) > 0.6);
}
function takeBag(game) {
  assert.equal(game.view().interaction.kind, 'takeBag');
  assert(game.action('interact') && !game.action('interact'));
  game.tick(0.35, { throttle: true });
  close(game.view().motion.progress, 0.5); assert.equal(game.view().cargo, 'box');
  checkOverlays(game);
  game.tick(0.35);
  assert.equal(game.view().cargo, 'hand');
}

function walkInput(actor, target, run, keyboard) {
  const dx = target.x - actor.x, dz = target.z - actor.z, n = Math.hypot(dx, dz);
  if (keyboard) return { throttle: true, run, cameraHeading: Math.atan2(-dx, dz) };
  // Hold an arbitrary camera angle. Project the stick onto its two basis vectors.
  const h = 0.89;
  return { cameraHeading: h, run, walkX: -(Math.cos(h) * dx + Math.sin(h) * dz) / n,
    walkZ: (-Math.sin(h) * dx + Math.cos(h) * dz) / n };
}
function walkTo(game, target, run = true) {
  for (let i = 0; i < 2400; i++) {
    const s = game.view();
    if (gap(s.actor, target) < 0.085) return;
    game.tick(dt, walkInput(s.actor, target, run, false));
  }
  assert.fail('Unreached walking target ' + JSON.stringify([game.view().actor, target]));
}
function followPhone(game, stop, { run = true, keyboard = false, observe = () => {} } = {}) {
  for (let i = 0; i < 6000; i++) {
    const s = game.view(), frame = game.frame();
    assert.equal(frame.stage, 'drive');
    assert.deepEqual(s.walker, s.actor);
    assert.deepEqual(frame.actor, s.actor);
    assert.deepEqual(frame.target, s.target);
    assert.deepEqual(frame.route, s.route);
    close(gap(s.route[0], s.actor), 0); close(s.route[0].y, s.actor.y);
    observe(s);
    if (stop(s)) return s;
    const next = s.route.find(p => gap(s.actor, p) > 0.22) ?? s.target;
    game.tick(dt, walkInput(s.actor, next, run, keyboard));
  }
  assert.fail('Navigation did not reach ' + JSON.stringify([game.view().target, game.view().actor]));
}
function cashOut(game, events, expectedBonus, previousCash = 0) {
  assert.equal(game.view().interaction.kind, 'knock');
  assert(game.action('interact') && !game.action('interact'));
  game.tick(0.4, { walkZ: 1 }); close(game.view().motion.progress, 0.5);
  checkOverlays(game);
  game.tick(0.4); assert.equal(game.view().motion.type, 'handoff');
  game.tick(0.94); assert.equal(game.view().completed, 0); assert.equal(game.view().cargo, 'hand');
  game.tick(1);
  const s = game.view();
  assert.deepEqual([s.stage, s.completed, s.earned, s.bonus, s.cash, s.cargo],
    ['delivered', 1, 18 + expectedBonus, expectedBonus, previousCash + 18 + expectedBonus, 'delivered']);
  assert(!game.action('interact') && !game.action('retry'));
  game.tick(10);
  for (const e of ['pickup', 'knock', 'handoff', 'delivered']) assert.equal(events.filter(x => x === e).length, 1, e);
  assert(game.action('continue') && !game.action('continue'));
  assert.equal(game.view().cash, s.cash); assert.equal(game.view().stage, 'dayend');
  return s;
}

export function deliverAt302(game, events, previousCash = 0) {
  dismount(game); takeBag(game);
  const s = followPhone(game, v => v.interaction?.kind === 'knock');
  return cashOut(game, events, s.elapsed + 1.75 <= s.bonusTime ? 6 : 0, previousCash);
}

function timedOrder(short, boundary) {
  const { game, events } = newOrder();
  if (short) assert(game.action('route'));
  load(game);
  const phases = new Map(), initialCart = game.frame().pursuer;
  close(gap(initialCart, course.guardStart), 0); close(initialCart.heading, course.guardStart.heading);
  const witness = short ? course.landmarks.arborApex : course.landmarks.outerApex;
  let apex = Infinity;
  park(game, short ? course.shortLine : course.mainLine, s => {
    apex = Math.min(apex, gap(s.bike, witness));
    const f = game.frame(), { phase, progress } = f.guard;
    assert(progress >= 0 && progress <= 1);
    if (!phases.has(phase)) {
      phases.set(phase, s.elapsed);
      if (phase === 'alert' || phase === 'boarding') checkOverlays(game);
    }
    if (phase !== 'chasing') {
      assert(!f.pursuer.active && f.pursuer.visible);
      assert.equal(gap(initialCart, f.pursuer), 0);
    } else assert(f.pursuer.active);
  });
  assert(apex < 4.5);
  assert.deepEqual([...phases.keys()], ['posted', 'alert', 'boarding', 'chasing']);
  close(phases.get('boarding') - phases.get('alert'), 0.65, dt);
  close(phases.get('chasing') - phases.get('boarding'), 1.2, dt);
  assert.equal(events.filter(e => e === 'guardAlert').length, 1);
  const parked = game.view();
  assert(parked.near && !parked.interaction && !game.action('interact'));
  dismount(game); takeBag(game);
  const stationaryBike = game.view().bike;
  const floors = new Set();
  function inspect(s) {
    assert.deepEqual(s.bike, stationaryBike);
    if (!s.walker.indoors) return;
    assert.equal(s.guard.phase, 'standDown'); assert(!game.frame().pursuer.active);
    assert(!s.canMount && !s.canDismount); floors.add(s.walker.floor);
  }
  if (!short && boundary === undefined) {
    // First visit: inspect the second-floor door at the correct XZ, then read the number.
    followPhone(game, s => s.actor.floor === 2 && Math.abs(s.actor.y - stairs.floorHeight) < 0.001,
      { run: false, observe: inspect });
    walkTo(game, stairs.world(stairs.lane, 1.3, stairs.floorHeight), false);
    walkTo(game, { ...stairs.knock, y: stairs.floorHeight }, false);
    game.tick(1.6);
    assert(!game.action('interact') && !game.view().canDeliver);
  }
  const ready = followPhone(game, s => s.interaction?.kind === 'knock', { run: short, keyboard: !short, observe: inspect });
  assert.deepEqual([...floors], [1, 2, 3]);
  close(ready.actor.y, stairs.door302.y);
  if (boundary !== undefined) game.tick(boundary - ready.elapsed - 1.75);
  const receipt = cashOut(game, events, boundary === undefined || boundary <= 65 ? 6 : 0);
  if (boundary !== undefined) close(receipt.elapsed, boundary, 1e-9);
  console.log('整单', short ? '紫藤' : '外圈', { 停稳: amount(parked.elapsed), 签收: amount(receipt.elapsed),
    工资含奖: receipt.earned, 门岗三阶段: [...phases.values()].slice(1).map(amount) });
}

function returnForBag() {
  const { game, events } = newOrder();
  load(game, true);
  park(game, course.shortLine);
  dismount(game);
  const parked = game.view().bike;
  // Walk into the building empty-handed and go upstairs anyway.
  for (const point of stairs.route) walkTo(game, point);
  assert.equal(game.view().actor.floor, 3);
  assert.equal(game.view().target.id, 'exit');
  assert(!game.action('interact') && !game.action('mount'));
  const retiredCart = game.frame().pursuer;
  followPhone(game, s => s.interaction?.kind === 'takeBag');
  assert.deepEqual(game.view().bike, parked);
  assert.equal(gap(retiredCart, game.frame().pursuer), 0);
  takeBag(game);
  assert(game.action('mount')); game.tick(0.33); close(game.view().motion.progress, 0.5);
  checkOverlays(game);
  game.tick(0.33);
  assert.deepEqual([game.view().travelMode, game.view().cargo], ['bike', 'box']);
  assert.deepEqual(game.view().bike, parked);
  dismount(game);
  // The sidewalk interaction is taking the same bag a second time.
  takeBag(game); followPhone(game, s => s.interaction?.kind === 'knock');
  assert.equal(events.filter(e => e === 'guardAlert').length, 1);
  const s = cashOut(game, events, 0);
  console.log('空手登三楼、按导航下楼、取袋回箱后重送', amount(s.elapsed), '秒，工资', s.earned);
}

function walkThroughGate() {
  const { game, events } = newOrder();
  load(game); dismount(game); takeBag(game);
  const parked = game.view().bike;
  const entered = followPhone(game, s => s.passedGate);
  assert.equal(entered.guard.phase, 'alert');
  const post = course.blocks.find(b => b.id === 'northPost');
  walkTo(game, { x: post.x + 2.5, z: entered.actor.z });
  walkTo(game, { x: post.x - 2.5, z: entered.actor.z });
  followPhone(game, s => s.interaction?.kind === 'knock');
  assert.deepEqual(game.view().bike, parked);
  assert.equal(events.filter(e => e === 'guardAlert').length, 1);
  const receipt = cashOut(game, events, 0);
  console.log('红棚留车，提袋步行三过门线到 302', amount(receipt.elapsed), '秒，首次入院喊话一次');
}

function failedRetry() {
  const { game, events } = newOrder(), loaded = load(game);
  const wall = course.landmarks.door, throughWall = [...course.mainLine, { x: stairs.origin.x, z: wall.z }];
  let s = drive(game, throughWall, s => s.hp < 100);
  const hp = [s.hp];
  while (s.stage === 'ride' && hp.length < 18) {
    const first = s;
    for (let i = 0; gap(s.bike, first.bike) < 16 && i < 900; i++) { game.tick(dt, { brake: true }); s = game.view(); }
    assert(gap(s.bike, first.bike) >= 16);
    for (let i = 0; s.hp === first.hp && i < 900; i++) { game.tick(dt, { throttle: true }); s = game.view(); }
    assert(s.hp < first.hp);
    assert(s.bike.z > stairs.origin.z && !s.actor.indoors); hp.push(s.hp);
  }
  assert.deepEqual([s.hp, s.stage, s.cash, s.spend], [0, 'failed', -6, 6]);
  game.tick(10); assert(!game.action('mount') && !game.action('interact'));
  assert.equal(events.filter(e => e === 'failed').length, 1);
  assert(game.action('retry') && !game.action('retry'));
  const fresh = game.view();
  close(gap(fresh.bike, loaded), 0);
  assert.deepEqual([fresh.travelMode, fresh.cargo, fresh.hp, fresh.elapsed, fresh.guard.phase, fresh.cash, fresh.stats.attempts],
    ['bike', 'box', 100, 0, 'posted', -6, 2]);
  park(game, course.shortLine);
  assert.equal(events.filter(e => e === 'guardAlert').length, 2);
  const receipt = deliverAt302(game, events, -6);
  assert.equal(receipt.spend, 6);
  assert(game.action('restart'));
  assert.deepEqual([game.view().cash, game.view().cargo, game.view().stage], [0, 'none', 'intro']);
  console.log('实际撞墙扣罚后重试', hp, '结余', receipt.cash);
}

function geometry() {
  const pad = course.blocks.find(b => b.id === 'northPost'), other = course.blocks.find(b => b.id === 'southPost');
  const z = (pad.z + other.z) / 2;
  const events = [], session = createTrialSession({ ...course, start: { x: pad.x + 2, z } }, e => events.push(e));
  session.act('start');
  const go = (x, z) => session.tick(dt, {}, { x, z, heading: 0, speed: 1, indoors: false });
  go(pad.x + 0.1, z); go(pad.x, z); go(pad.x + 0.3, z);
  go(pad.x + 0.3, pad.z - 1); go(pad.x - 0.3, pad.z - 1);
  go(pad.x - 0.3, z); go(pad.x, z); go(pad.x - 0.3, z); // approach the line from inside and turn back
  go(pad.x + 0.3, z);
  assert.equal(session.view().guard.phase, 'posted');
  go(pad.x - 0.3, z); go(pad.x + 0.3, z); go(pad.x - 0.3, z);
  assert.equal(events.filter(e => e === 'guardAlert').length, 1);

  const walk = createWalkController(course, stairs), bike = { ...course.square, speed: 0 };
  const p = riderPose({ ...stairs.world(2.6, -1), heading: Math.PI, speed: 0 });
  const forward = { throttle: true, run: true };
  for (let i = 0; i < 60; i++) walk.step(p, dt, forward, Math.PI, bike);
  assert(!p.indoors && stairs.local(p).d <= -0.25);
  Object.assign(p, stairs.world(-stairs.lane, 5, stairs.rise * (5 - stairs.front) / (stairs.back - stairs.front)),
    { indoors: true, floor: 1 });
  const y = p.y;
  for (let i = 0; i < 80; i++) walk.step(p, dt, { left: true, run: true }, 0, bike);
  assert(stairs.local(p).x <= -stairs.divider - 0.26); close(p.y, y);
  Object.assign(p, stairs.knock, { indoors: true, floor: 3 });
  for (let i = 0; i < 60; i++) walk.step(p, dt, forward, 0, bike);
  assert(p.indoors && p.floor === 3); close(p.y, stairs.knock.y);

  const wall = { x: 0.45, z: 0, w: 0.2, d: 4 };
  const tiny = { ...course, blocks: [wall] }, test = createWalkController(tiny, stairs);
  const scooter = { x: 0, z: 0, heading: 0 };
  assert(test.dismountSpot(scooter).x < 0);
  assert(!test.canReach({ x: 1.05, z: 0, indoors: false }, scooter, 1.8));
  tiny.blocks.push({ x: -0.45, z: 0, w: 0.2, d: 4 }, { x: 0, z: 0.7, w: 2, d: 0.1 }, { x: 0, z: -0.7, w: 2, d: 0.1 });
  assert.equal(test.dismountSpot(scooter), null);
  console.log('门柱界线、两侧实体、步行门洞、中栏、楼层及上下车净空通过');
}

function controls() {
  const { game } = newOrder(); dismount(game);
  const start = game.view().actor, parked = game.view().bike;
  function stride(input) {
    const a = game.view().actor;
    game.tick(0.25, { cameraHeading: Math.PI / 2, ...input });
    const b = game.view().actor;
    return { dx: b.x - a.x, dz: b.z - a.z, speed: b.speed };
  }
  const w = stride({ throttle: true }), d = stride({ right: true }), slow = stride({ walkZ: 0.4 });
  const run = stride({ walkZ: 1, run: true }), diagonal = stride({ walkZ: 1, walkX: 1, run: true });
  close(w.dz, 0); close(d.dx, 0); assert(w.dx < 0 && d.dz < 0);
  close(slow.speed, 0.4 * w.speed); close(diagonal.speed, run.speed); assert(run.speed > w.speed * 1.7);
  assert(!game.action('boost') && !game.action('right'));
  assert(!game.action('mount') && gap(start, game.view().actor) > 1.8);
  assert.deepEqual(game.view().bike, parked);
  checkOverlays(game);
}

function independentTrial() {
  for (const late of [false, true]) {
    const s = createTrialSession(practice); s.act('start'); assert.equal(s.view().bonusTime, 35);
    for (let i = 0; i < 4000; i++) {
      const v = s.view();
      if (v.canDeliver && Math.abs(v.bike.speed) < 0.1) break;
      s.tick(dt, inputs(late ? practice.mainLine : practice.shortLine, v.bike));
    }
    if (late) while (s.view().elapsed <= 35) s.tick(dt, { handbrake: true });
    assert(s.act('deliver') && !s.act('deliver'));
    assert.deepEqual([s.view().stage, s.view().earned], ['finished', late ? 18 : 24]);
    assert.equal(s.view().guard, undefined);
  }
  console.log('独立试驾两条线按原 35 秒结算通过');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  geometry(); controls();
  timedOrder(true); timedOrder(false); timedOrder(true, 65); timedOrder(true, 65.001);
  returnForBag(); walkThroughGate(); failedRetry(); independentTrial();
}
