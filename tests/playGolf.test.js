import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, PUTT_RANGES, MAX_SWING_ANGLE, MAX_STROKES, HOLE_OUT_RADIUS, GIMME_YARDS,
  startHole, isFinished, reachFrom, clampTarget, defaultTarget, planShot,
  resolveStroke, applyStroke, scoreName, holeFingerprint, bestOn, recordPlay, parOf,
} from '../src/sim/playGolf.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { LIE, lieAt } from '../src/sim/terrain.js';
import { LIE_RANGE, LIE_SPREAD } from '../src/sim/shot.js';
import { newGame, serialize, deserialize } from '../src/sim/state.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { makeRng } from '../src/sim/rng.js';
import { botHole } from '../tools/playGolfBot.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const straight = () => makeHole('straightPar4', 1);      // tee (0,0), cup (0,390), fairway 44 wide
const perfect = (plan) => ({ power: plan.needed, accuracy: 0 });
const at = (hole, point, lie) => ({ ...startHole(hole), ball: point, lie: lie ?? lieAt(hole, point), strokes: 1 });

// --- Starting, aiming, clubbing -------------------------------------------

test('a hole starts on the tee with nothing on the card', () => {
  const hole = straight();
  const play = startHole(hole);
  assert.deepEqual(play.ball, hole.teePos);
  assert.equal(play.lie, LIE.TEE);
  assert.equal(play.strokes, 0);
  assert.equal(isFinished(play), false);
});

test('the caddie points down the corridor when the cup is out of reach, at the cup when it is not', () => {
  const hole = straight();
  const tee = defaultTarget(hole, startHole(hole));
  near(tee.x, 0);
  near(tee.y, 250);
  const approach = at(hole, { x: 0, y: 250 });
  assert.deepEqual(defaultTarget(hole, approach), greenCentre(hole));
});

test('the caddie plays round a dogleg, not through it', () => {
  const hole = makeHole('doglegPar4', 1);                // corner at (0,210)
  const target = defaultTarget(hole, startHole(hole));
  assert.ok(target.x > 5, `target ${JSON.stringify(target)} should be past the corner, to the right`);
  assert.equal(lieAt(hole, target), LIE.FAIRWAY);
});

test('a target is pulled back inside reach, and reach shrinks with the lie', () => {
  const hole = straight();
  const tee = startHole(hole);
  const far = clampTarget(hole, tee, { x: 0, y: 900 });
  near(far.y, 250);
  const sand = at(hole, { x: 0, y: 100 }, LIE.SAND);
  near(reachFrom(LIE.SAND), 250 * LIE_RANGE[LIE.SAND]);
  near(clampTarget(hole, sand, { x: 0, y: 900 }).y, 100 + 150);
});

test('a target on top of the ball is pointed at the cup instead', () => {
  const hole = straight();
  const play = at(hole, { x: 10, y: 100 });
  const t = clampTarget(hole, play, { x: 10, y: 100 });
  assert.ok(t.y > 100 && t.x < 10);
});

test('the caddie hands over the shortest club that reaches', () => {
  const hole = straight();
  const play = at(hole, { x: 0, y: 100 }, LIE.FAIRWAY);
  const plan = planShot(hole, play, { x: 0, y: 250 });   // 150 yards
  assert.equal(plan.kind, 'swing');
  assert.equal(plan.club.id, 'iron7');
  near(plan.needed, 150 / 165);
  // The same 150 from sand needs the driver, and all of it.
  const sand = planShot(hole, { ...play, lie: LIE.SAND }, { x: 0, y: 250 });
  assert.equal(sand.club.id, 'driver');
  near(sand.needed, 1);
});

test('the mark sits in the top half of the bar for every full-swing distance', () => {
  const hole = straight();
  const play = at(hole, { x: 0, y: 0 }, LIE.FAIRWAY);
  for (let yards = 25; yards <= 250; yards += 5) {
    const plan = planShot(hole, play, { x: 0, y: yards });
    assert.ok(plan.needed > 0.55 && plan.needed <= 1, `${yards}y with ${plan.club.name}: ${plan.needed}`);
  }
});

test('on the green the club is the putter and the bar is marked in putt ranges', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = at(hole, { x: cup.x, y: cup.y - 5 });
  assert.equal(play.lie, LIE.GREEN);
  const plan = planShot(hole, play, cup);
  assert.equal(plan.kind, 'putt');
  assert.equal(plan.club.id, 'putter');
  assert.equal(plan.full, 8);
  near(plan.needed, 5 / 8);
  assert.ok(PUTT_RANGES.includes(plan.full));
});

// --- Resolving a swing ----------------------------------------------------

test('no dice: the same taps always produce the same shot', () => {
  const hole = straight();
  const play = startHole(hole);
  const swing = { power: 0.93, accuracy: 0.4 };
  assert.deepEqual(resolveStroke(hole, play, { x: 0, y: 250 }, swing), resolveStroke(hole, play, { x: 0, y: 250 }, swing));
});

test('a perfectly timed swing finishes on the target', () => {
  const hole = straight();
  const play = startHole(hole);
  const plan = planShot(hole, play, { x: 5, y: 240 });
  const out = resolveStroke(hole, play, { x: 5, y: 240 }, perfect(plan));
  near(out.to.x, 5);
  near(out.to.y, 240);
  assert.equal(out.lie, LIE.FAIRWAY);
  assert.equal(out.penalty, null);
  assert.equal(out.holed, false);
});

test('power sets the carry: short of the mark is short, past 100% is long', () => {
  const hole = straight();
  const play = startHole(hole);
  const target = { x: 0, y: 250 };
  near(resolveStroke(hole, play, target, { power: 0.8, accuracy: 0 }).to.y, 200);
  near(resolveStroke(hole, play, target, { power: 1.1, accuracy: 0 }).to.y, 275);
});

test('an early strike goes right and a late one goes left, by MAX_SWING_ANGLE at the limit', () => {
  const hole = straight();
  const play = startHole(hole);
  const target = { x: 0, y: 250 };
  const right = resolveStroke(hole, play, target, { power: 1, accuracy: 1 });
  near(right.angle, MAX_SWING_ANGLE);
  near(right.to.x, 250 * Math.sin(MAX_SWING_ANGLE));
  const left = resolveStroke(hole, play, target, { power: 1, accuracy: -1 });
  near(left.to.x, -right.to.x);
});

test('a bad lie and bad weather both widen a mistimed strike, and neither moves a perfect one', () => {
  const hole = straight();
  const fairway = at(hole, { x: 0, y: 100 }, LIE.FAIRWAY);
  const rough = { ...fairway, lie: LIE.ROUGH };
  const target = { x: 0, y: 200 };
  const swing = { power: 0.9, accuracy: 0.5 };
  const base = resolveStroke(hole, fairway, target, swing).angle;
  near(resolveStroke(hole, rough, target, swing).angle, base * LIE_SPREAD[LIE.ROUGH]);
  near(resolveStroke(hole, fairway, target, swing, 1.45).angle, base * 1.45);
  assert.equal(resolveStroke(hole, rough, target, { power: 0.9, accuracy: 0 }, 1.6).angle, 0);
});

test('overswinging makes a mistimed strike wilder', () => {
  const hole = straight();
  const play = startHole(hole);
  const target = { x: 0, y: 250 };
  const flat = resolveStroke(hole, play, target, { power: 1, accuracy: 0.5 }).angle;
  const over = resolveStroke(hole, play, target, { power: 1.1, accuracy: 0.5 }).angle;
  near(over, flat * 1.5);
});

test('water costs a stroke and the ball goes back where it was hit from', () => {
  const hole = makeHole('waterPar3', 1);                 // pond at (0,120) r34, cup (0,178)
  const play = startHole(hole);
  const out = resolveStroke(hole, play, { x: 0, y: 120 }, { power: 120 / 135, accuracy: 0 });
  assert.equal(out.lie, LIE.WATER);
  assert.equal(out.penalty, 'water');
  const next = applyStroke(play, out);
  assert.equal(next.strokes, 2);
  assert.deepEqual(next.ball, hole.teePos);
  assert.equal(next.lie, LIE.TEE);
});

test('a ball deep in the woods is lost; one in the first trees is merely in the trees', () => {
  const hole = straight();                               // fairway half 22, rough to 44
  const play = at(hole, { x: 0, y: 100 }, LIE.FAIRWAY);
  const firstTrees = resolveStroke(hole, play, { x: 60, y: 100 }, { power: 60 / 70, accuracy: 0 });
  assert.equal(firstTrees.lie, LIE.TREES);
  assert.equal(firstTrees.penalty, null);
  const deep = resolveStroke(hole, play, { x: 100, y: 100 }, { power: 100 / 105, accuracy: 0 });
  assert.equal(deep.penalty, 'lost');
  assert.equal(applyStroke(play, deep).strokes, play.strokes + 2);
  assert.deepEqual(applyStroke(play, deep).ball, play.ball);
});

test('a tree clump inside the hole is never a lost ball', () => {
  const hole = straight();
  hole.features.push({ type: 'trees', x: 120, y: 100, size: 20 });
  const play = at(hole, { x: 0, y: 100 }, LIE.FAIRWAY);
  const out = resolveStroke(hole, play, { x: 120, y: 100 }, { power: 120 / 135, accuracy: 0 });
  assert.equal(out.lie, LIE.TREES);
  assert.equal(out.penalty, null);
});

test('a flown ball that finishes on the cup has gone in; a yard away has not', () => {
  const hole = makeHole('shortPar3', 1);                 // cup (0,155)
  const play = startHole(hole);
  const cup = greenCentre(hole);
  const plan = planShot(hole, play, cup);
  const ace = resolveStroke(hole, play, cup, perfect(plan));
  assert.equal(ace.holed, true);
  const done = applyStroke(play, ace);
  assert.equal(done.strokes, 1);
  assert.equal(isFinished(done), true);
  const close = resolveStroke(hole, play, { x: cup.x, y: cup.y - 1 }, { power: 154 / 165, accuracy: 0 });
  assert.equal(close.lie, LIE.GREEN);
  assert.equal(close.holed, false);
  assert.ok(HOLE_OUT_RADIUS < 1);
});

// --- Putting through the same door ----------------------------------------

test('a putt rolls rather than flies, and carries its path for the renderer', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = at(hole, { x: cup.x - 4, y: cup.y - 3 });
  const plan = planShot(hole, play, cup);
  const out = resolveStroke(hole, play, cup, { power: plan.needed, accuracy: 0 });
  assert.equal(out.kind, 'putt');
  assert.ok(out.path.length > 5);
  assert.deepEqual(out.path[0], play.ball);
  assert.ok(out.seconds > 0);
  const next = applyStroke(play, out);
  // Struck at exactly the needed pace it dies at the lip: a gimme, so the
  // tap-in is counted too.
  assert.equal(next.strokes, out.gimme ? 3 : 2);
});

test('a ball that stops on the green within three feet is a gimme: one more stroke, hole over', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = at(hole, { x: cup.x - 4, y: cup.y - 3 });
  const close = { kind: 'putt', from: play.ball, to: { x: cup.x + GIMME_YARDS * 0.9, y: cup.y }, lie: LIE.GREEN, holed: false, gimme: true, penalty: null };
  const next = applyStroke(play, close);
  assert.equal(next.strokes, 3);
  assert.equal(next.holed, true);
  assert.equal(next.conceded, true);
  assert.ok(isFinished(next));
  assert.deepEqual(next.ball, close.to, 'the ball stays where it stopped');
});

test('resolveStroke calls a gimme only on the green, inside three feet, and not when it dropped', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  // Putts from all round the cup at a range of paces: every outcome agrees with the rule.
  let gimmes = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const play = at(hole, { x: cup.x + Math.cos(a) * 3, y: cup.y + Math.sin(a) * 3 });
    const needed = planShot(hole, play, cup).needed;
    for (const pace of [0.5, 0.75, 0.9, 1, 1.3]) {
      const out = resolveStroke(hole, play, cup, { power: needed * pace, accuracy: 0 });
      const close = Math.hypot(out.to.x - cup.x, out.to.y - cup.y) <= GIMME_YARDS;
      assert.equal(out.gimme, !out.holed && out.lie === LIE.GREEN && close);
      if (out.gimme) gimmes += 1;
    }
  }
  assert.ok(gimmes > 0, 'some of them stopped close');
});

test('a gimme on the last stroke allowed still finishes at the cap, holed', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = { ...at(hole, { x: cup.x - 4, y: cup.y - 3 }), strokes: MAX_STROKES - 1 };
  const next = applyStroke(play, { kind: 'putt', from: play.ball, to: { x: cup.x + 0.5, y: cup.y }, lie: LIE.GREEN, holed: false, gimme: true, penalty: null });
  assert.equal(next.strokes, MAX_STROKES);
  assert.equal(next.holed, true);
  assert.ok(!next.pickedUp);
});

test('weather does not blow a putt about', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = at(hole, { x: cup.x - 4, y: cup.y - 3 });
  const swing = { power: 0.7, accuracy: 0.6 };
  assert.deepEqual(resolveStroke(hole, play, cup, swing, 1), resolveStroke(hole, play, cup, swing, 1.6));
});

test('a putt hit off the green is played from where it stopped, in that lie', () => {
  const hole = straight();
  const cup = greenCentre(hole);
  const play = at(hole, { x: cup.x, y: cup.y - 10 });
  const out = resolveStroke(hole, play, { x: cup.x, y: cup.y - 42 }, { power: 1.1, accuracy: 0 });
  assert.notEqual(out.lie, LIE.GREEN);
  const next = applyStroke(play, out);
  assert.equal(next.lie, out.lie);
  assert.equal(planShot(hole, next, cup).kind, 'swing');
});

// --- Finishing ------------------------------------------------------------

test('the hole is picked up at MAX_STROKES', () => {
  const hole = straight();
  let play = { ...startHole(hole), strokes: MAX_STROKES - 1 };
  const out = resolveStroke(hole, play, { x: 0, y: 100 }, { power: 1, accuracy: 0 });
  play = applyStroke(play, out);
  assert.equal(play.pickedUp, true);
  assert.equal(play.holed, false);
  assert.equal(play.strokes, MAX_STROKES);
  assert.equal(isFinished(play), true);
});

test('scores are named the way a golfer names them', () => {
  assert.equal(scoreName(1, 3), 'Hole in one');
  assert.equal(scoreName(2, 4), 'Eagle');
  assert.equal(scoreName(3, 4), 'Birdie');
  assert.equal(scoreName(4, 4), 'Par');
  assert.equal(scoreName(5, 4), 'Bogey');
  assert.equal(scoreName(6, 4), 'Double bogey');
  assert.equal(scoreName(9, 4), '+5');
});

// --- The scorecard in the save --------------------------------------------

test('a new game has an empty scorecard, and an old save gains one', () => {
  const state = newGame(7);
  assert.deepEqual(state.playRecords, {});
  const old = JSON.parse(serialize(state));
  delete old.playRecords;
  assert.deepEqual(deserialize(JSON.stringify(old)).playRecords, {});
});

test('a holed score is recorded, a better one replaces it, a worse one does not', () => {
  const state = newGame(7);
  const hole = state.resort.courses[0].holes[0];
  assert.equal(bestOn(state, hole), null);
  const five = recordPlay(state, hole, { ...startHole(hole), strokes: 5, holed: true });
  assert.equal(bestOn(five, hole), 5);
  assert.equal(bestOn(state, hole), null, 'the original state is not mutated');
  const four = recordPlay(five, hole, { ...startHole(hole), strokes: 4, holed: true });
  assert.equal(bestOn(four, hole), 4);
  assert.equal(recordPlay(four, hole, { ...startHole(hole), strokes: 6, holed: true }), four);
});

test('a picked-up hole sets no record', () => {
  const state = newGame(7);
  const hole = state.resort.courses[0].holes[0];
  const play = { ...startHole(hole), strokes: MAX_STROKES, pickedUp: true };
  assert.equal(recordPlay(state, hole, play), state);
});

test('redesigning the hole retires the record, and the next score on it counts afresh', () => {
  const state = newGame(7);
  const hole = state.resort.courses[0].holes[0];
  const before = holeFingerprint(hole);
  const scored = recordPlay(state, hole, { ...startHole(hole), strokes: 3, holed: true });
  const moved = scored.resort.courses[0].holes[0];
  moved.features.push({ type: 'bunker', x: 5, y: 60, size: 9 });
  assert.notEqual(holeFingerprint(moved), before);
  assert.equal(bestOn(scored, moved), null);
  const again = recordPlay(scored, moved, { ...startHole(moved), strokes: 6, holed: true });
  assert.equal(bestOn(again, moved), 6);
  moved.features.pop();
});

test('the scorecard survives a save and a load', () => {
  const state = newGame(7);
  const hole = state.resort.courses[0].holes[2];
  const scored = recordPlay(state, hole, { ...startHole(hole), strokes: 4, holed: true });
  const loaded = deserialize(serialize(scored));
  assert.equal(bestOn(loaded, loaded.resort.courses[0].holes[2]), 4);
});

test('par is the par the rest of the game shows', () => {
  assert.equal(parOf(makeHole('shortPar3', 1)), 3);
  assert.equal(parOf(straight()), 4);
  assert.equal(parOf(makeHole('longPar5', 1)), 5);
});

test('the bag is ordered shortest first, which planShot relies on', () => {
  for (let i = 1; i < CLUBS.length; i++) assert.ok(CLUBS[i].full > CLUBS[i - 1].full);
  for (let i = 1; i < PUTT_RANGES.length; i++) assert.ok(PUTT_RANGES[i] > PUTT_RANGES[i - 1]);
});

// --- Calibration: is it a game? -------------------------------------------
//
// tools/playGolfBot.js is the measurement; these pin its conclusions on a
// fresh set of seeds so a retune that breaks the feel fails loudly. The
// floors are loose on purpose (the table has -0.04 at 50 ms, -1.04 at
// 20 ms, +0.19 at 60 ms). Par moved from 35 ms to 41 ms when the meter
// was slowed 15% after the first playtest, and to about 50 ms when the
// second asked for a three-foot gimme and a wider strike window.

function averageOverPar(sd, plays = 120) {
  let over = 0;
  let n = 0;
  TEMPLATE_NAMES.forEach((name, t) => {
    const hole = makeHole(name, t + 1);
    for (let i = 0; i < plays; i++) {
      const r = botHole(makeRng(50000 + 977 * t + i), hole, { sd, read: true });
      over += r.strokes - r.par;
      n += 1;
    }
  });
  return over / n;
}

test('ordinary timing (50 ms) plays to about par', () => {
  const over = averageOverPar(50);
  assert.ok(over > -0.45 && over < 0.35, `50 ms averaged ${over.toFixed(2)} a hole`);
});

test('sharper timing scores lower and sloppier timing scores higher', () => {
  const sharp = averageOverPar(20);
  const sloppy = averageOverPar(60);
  assert.ok(sharp < -0.6, `20 ms averaged ${sharp.toFixed(2)}`);
  assert.ok(sloppy > 0 && sloppy < 0.9, `60 ms averaged ${sloppy.toFixed(2)}`);
});

test('every template can be finished by a sloppy player without picking up often', () => {
  TEMPLATE_NAMES.forEach((name, t) => {
    const hole = makeHole(name, t + 1);
    let pickedUp = 0;
    for (let i = 0; i < 100; i++) {
      if (!botHole(makeRng(90000 + 31 * t + i), hole, { sd: 80, read: false }).holed) pickedUp += 1;
    }
    assert.ok(pickedUp <= 3, `${name}: picked up ${pickedUp} of 100`);
  });
});
