// Run with node qa/patrol-pressure.mjs. Only normal campaign controls drive the rides.
import assert from 'node:assert/strict';
import { campaignDistrict as course, createCampaign } from '../src/campaign.js';
import { stepVehicle } from '../trial/handling.js';
import { steerToward } from '../trial/qa/ride.mjs';
import { deliverAt302 } from './first-order.sim.mjs';

const dt = 1 / 60;
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const round = value => Number(value.toFixed(3));
function controls(line, bike) {
  const keys = steerToward(line, bike);
  return { throttle: keys.includes('KeyW'), brake: keys.includes('KeyS'),
    left: keys.includes('KeyA'), right: keys.includes('KeyD') };
}
function probeGap(a, b) {
  let closest = Infinity;
  for (const i of [-0.61, 0, 0.61]) for (const j of [-0.61, 0, 0.61]) {
    closest = Math.min(closest, Math.hypot(a.x - i * Math.sin(a.heading) - b.x + j * Math.sin(b.heading),
      a.z + i * Math.cos(a.heading) - b.z - j * Math.cos(b.heading)));
  }
  return closest;
}

function ride(mode, cap, route = course.mainLine, zone = 'court') {
  const events = [];
  const game = createCampaign(event => events.push(event));
  game.action('skip'); game.action('accept');
  let line = game.view().route;
  let warningAt, warningSide, firstReach, resolvedAt, kickPose, contactGap, doorMoving, cooldownEnded;
  let separating = 0, speedLoss = 0, minimumGap = Infinity;
  const outcome = { hold: 'contact', dodge: 'avoided', kick: 'kicked' }[mode];

  for (let i = 0; i < 6000; i++) {
    const view = game.view(), frame = game.frame(), patrol = frame.patrolPressure;
    const { bike, pursuer } = frame;
    const input = controls(line, bike);
    if (view.leg === 'pickup') {
      assert.equal(patrol, undefined);
      if (view.near && Math.abs(bike.speed) < 0.1) {
        game.tick(0.35, { handbrake: true });
        assert(game.action('interact'));
        line = route;
      } else game.tick(dt, input);
      continue;
    }
    if (bike.speed >= cap) input.throttle = false;
    if (patrol.phase === 'warning' && warningAt === undefined) {
      assert(view.passedGate && frame.guard.phase === 'chasing' && pursuer.active);
      assert.notEqual(mode, 'outrun', '快车或花架线上出现追赶预警');
      assert.equal(patrol.lane, zone);
      warningSide = patrol.side;
      assert(['left', 'right'].includes(warningSide));
      assert.match(view.toast, warningSide === 'right' ? /右侧.*向左.*右踢/ : /左侧.*向右.*左踢/);
      warningAt = view.elapsed;
      for (const overlay of ['map', 'pause']) {
        game.action(overlay); game.tick(1, { throttle: true });
        assert.deepEqual(game.frame().patrolPressure, patrol);
        assert.deepEqual(game.frame().bike, bike);
        game.action(overlay);
      }
    }
    const sinceWarning = view.elapsed - warningAt;
    if (patrol.side) {
      assert(view.passedGate && !view.near);
      if (view.side === patrol.side) firstReach ??= view.elapsed;
      minimumGap = Math.min(minimumGap, probeGap(bike, pursuer));
    }
    if (mode === 'dodge' && sinceWarning >= 0.38 && sinceWarning < 1.05) {
      input.left = warningSide === 'right' && sinceWarning < 0.72;
      input.right = warningSide === 'left' && sinceWarning < 0.72;
    }
    if (mode === 'kick' && view.side === warningSide && sinceWarning >= 0.98 && !kickPose) {
      assert(game.action(warningSide));
      assert(!game.action(warningSide), '一次并排能连踢两次');
      assert.deepEqual(game.frame().bike, bike);
      assert.equal(gap(game.frame().pursuer, pursuer), 0);
      kickPose = { bike, pursuer, at: view.elapsed };
    }
    if (kickPose && !separating && view.elapsed >= kickPose.at + 0.4) {
      const dx = (pursuer.x - bike.x) - (kickPose.pursuer.x - kickPose.bike.x);
      const dz = (pursuer.z - bike.z) - (kickPose.pursuer.z - kickPose.bike.z);
      separating = (-dx * Math.cos(kickPose.bike.heading) - dz * Math.sin(kickPose.bike.heading)) *
        (warningSide === 'right' ? 1 : -1);
      assert(separating > 0.25);
    }
    if (patrol.phase === 'idle' && resolvedAt !== undefined) cooldownEnded ??= view.elapsed;
    if (view.near) {
      assert.equal(patrol.phase, 'idle');
      if (!doorMoving && bike.speed > 1) { assert(!game.action('interact')); doorMoving = true; }
      if (Math.abs(bike.speed) < 0.1) {
        game.tick(0.15, { handbrake: true });
        assert(!game.action('interact') && game.view().earned === 0, '楼下已结算');
        const receipt = deliverAt302(game, events);
        assert.deepEqual([receipt.earned, receipt.hp, receipt.spend], [24, 100, 0]);
        assert(doorMoving);
        if (mode === 'outrun') assert.equal(warningAt, undefined);
        else assert(cooldownEnded >= resolvedAt + 5 - 1e-7);
        assert.equal(events.filter(e => e === 'bump').length, ['hold', 'kick'].includes(mode) ? 1 : 0);
        assert.equal(game.view().pushCount, mode === 'kick' ? 1 : 0);
        if (mode === 'hold') assert(speedLoss > 0 && resolvedAt - firstReach >= 0.25);
        if (mode === 'dodge') assert(minimumGap > 1.1);
        return { mode, cap, outcome: outcome ?? 'clear', zone: warningAt === undefined ? null : zone,
          warningToResult: warningAt === undefined ? null : round(resolvedAt - warningAt), speedLoss: round(speedLoss),
          probeGap: Number.isFinite(minimumGap) ? round(contactGap ?? minimumGap) : null,
          kickSeparationGain: round(separating), delivery: round(receipt.elapsed) };
      }
    }
    // An independent copy takes the very same steering and solids step.
    const expected = { ...bike };
    stepVehicle(expected, input, dt, course);
    game.tick(dt, input);
    const next = game.frame();
    for (const field of ['x', 'z', 'heading', 'steer', 'sideSpeed']) {
      assert(Math.abs(next.bike[field] - expected[field]) < 1e-7, 'Player control changed: ' + field);
    }
    const guardSpeed = Math.max(Math.abs(pursuer.speed), Math.abs(next.pursuer.speed));
    const sideSpeed = Math.max(Math.abs(pursuer.sideSpeed), Math.abs(next.pursuer.sideSpeed));
    assert(gap(next.pursuer, pursuer) <= (guardSpeed + sideSpeed + 2) * dt + 1e-7);
    const loss = expected.speed - next.bike.speed;
    if (Math.abs(loss) > 1e-7) {
      assert(mode === 'hold' && !speedLoss && loss > 0 && loss <= 1.8 + 1e-7);
      assert.equal(next.patrolPressure.outcome, 'contact');
      contactGap = probeGap(next.bike, next.pursuer); assert(contactGap <= 1.1);
      speedLoss = loss;
    }
    if (patrol.side && next.patrolPressure.phase === 'cooldown') {
      assert.equal(resolvedAt, undefined);
      assert.equal(next.patrolPressure.outcome, outcome);
      resolvedAt = kickPose?.at ?? next.deliveryElapsed;
    }
  }
  assert.fail('Did not stop and deliver at building 7: ' + mode);
}

for (const cap of [10, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5]) console.log(ride('hold', cap));
for (const cap of [12, 13.5, 15, 15.5]) {
  for (const mode of ['dodge', 'kick']) console.log(ride(mode, cap));
}
console.log(ride('hold', 9, course.shortLine, 'gate'));
console.log(ride('outrun', 18.5));
console.log(ride('outrun', 12.5, course.shortLine));
