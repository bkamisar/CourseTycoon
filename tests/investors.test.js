import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { makeRng } from '../src/sim/rng.js';
import {
  REVIEW_EVERY, STARTING_CONFIDENCE, MEASURES,
  confidenceChange, thresholdFor, assessTarget, pickMeasure,
  startingInvestors, measureNow,
  SETTLEMENT_DAYS, buyoutPrice, payBuyout, forceLiquidation,
} from '../src/sim/investors.js';
import { totalRooms } from '../src/sim/rooms.js';

/**
 * A resort at the moment Act II begins: a hotel, and a crowd that will
 * actually stay in it. Measuring investors on a locals-only course is Act
 * II's version of the trap recorded in spec §15b — a thing measured where
 * it cannot work, reported as a property of the thing.
 */
function startOfActTwo(seed = 1) {
  const state = newGame(seed);
  state.act = 2;
  state.money = 200000;
  state.prestige = 65;
  state.resort.rooms = { standard: 12, suite: 6 };
  state.resort.pricing.roomRate = 95;
  state.investors = startingInvestors(state, makeRng(seed));
  return state;
}

/** The same resort, with the investors at a given level of patience. */
function atConfidence(level, seed = 2) {
  const state = startOfActTwo(seed);
  state.investors.confidence = level;
  return state;
}

test('confidence starts where it should and moves only at a review', () => {
  let state = startOfActTwo();
  assert.equal(state.investors.confidence, STARTING_CONFIDENCE);
  const due = state.investors.nextTarget.dueDay;
  while (state.day < due) {
    state = runDay(state, 700 + state.day).state;
    if (state.day < due) {
      assert.equal(state.investors.confidence, STARTING_CONFIDENCE,
        `confidence drifted on day ${state.day}; a number that moves on its own cannot be steered`);
    }
  }
});

test('THE TARGET IS KNOWN BEFORE THE PERIOD IT COVERS', () => {
  // The rule the weather forecast follows: unforecastable pressure is
  // noise that punishes at random.
  const state = startOfActTwo();
  const promised = state.investors.nextTarget;
  assert.ok(promised, 'a target must exist the moment they arrive');
  assert.ok(promised.dueDay > state.day, 'and it must be about the future');
  assert.ok(MEASURES.includes(promised.measure));
  assert.ok(promised.threshold > 0);
});

test('the target does not change under the player mid-period', () => {
  let state = startOfActTwo(3);
  const promised = { ...state.investors.nextTarget };
  while (state.day < promised.dueDay) {
    const r = runDay(state, 800 + state.day);
    state = r.state;
    if (state.day < promised.dueDay) {
      assert.deepEqual(r.report.investors.target, promised,
        'the target moved before it was assessed');
    }
  }
});

test('the measure assessed is the measure that was promised', () => {
  let state = startOfActTwo(4);
  const promised = state.investors.nextTarget.measure;
  let reviewed = null;
  while (!reviewed && state.day < 40) {
    const r = runDay(state, 900 + state.day);
    state = r.state;
    reviewed = r.report.investors.reviewed;
  }
  assert.ok(reviewed, 'a review should have happened within forty days');
  assert.equal(reviewed.measure, promised);
});

test('a new target is named the moment the old one is settled', () => {
  let state = startOfActTwo(5);
  let afterReview = null;
  while (!afterReview && state.day < 40) {
    const r = runDay(state, 1000 + state.day);
    state = r.state;
    if (r.report.investors.reviewed) afterReview = r.report.investors;
  }
  assert.ok(afterReview.target, 'the player must never sit in an unnamed period');
  assert.ok(afterReview.target.dueDay > state.day);
});

test('the same measure never comes up twice running', () => {
  let state = startOfActTwo(6);
  const asked = [];
  for (let d = 0; d < REVIEW_EVERY * 6; d++) {
    const r = runDay(state, 1100 + d);
    state = r.state;
    if (r.report.investors.reviewed) asked.push(r.report.investors.reviewed.measure);
  }
  assert.ok(asked.length >= 4, `only ${asked.length} reviews in six periods`);
  for (let i = 1; i < asked.length; i++) {
    assert.notEqual(asked[i], asked[i - 1], `asked about ${asked[i]} twice running`);
  }
});

test('pickMeasure avoids everything asked about lately', () => {
  for (let seed = 0; seed < 40; seed++) {
    assert.notEqual(pickMeasure(makeRng(seed), ['prestige']), 'prestige');
    const picked = pickMeasure(makeRng(seed), ['prestige', 'occupancy']);
    assert.ok(!['prestige', 'occupancy'].includes(picked));
    // With three spoken for, only one answer remains.
    assert.equal(pickMeasure(makeRng(seed), ['prestige', 'occupancy', 'satisfaction']),
      'revenuePerRoom');
  }
});

test('all four measures come up before any comes up twice', () => {
  // Blocking only the previous measure produced prestige, occupancy,
  // prestige, revenue, prestige across five reviews — legal, and useless,
  // because prestige moves least and was nearly free three times in five.
  let state = startOfActTwo(21);
  const asked = [];
  for (let d = 0; d < REVIEW_EVERY * 5; d++) {
    const r = runDay(state, 2100 + d);
    state = r.state;
    if (r.report.investors.reviewed) asked.push(r.report.investors.reviewed.measure);
  }
  assert.ok(asked.length >= 4, `only ${asked.length} reviews`);
  const firstFour = asked.slice(0, 4);
  assert.equal(new Set(firstFour).size, 4,
    `the first four reviews repeated a measure: ${firstFour.join(', ')}`);
});

test('an occupancy threshold is a number, not a float with a tail', () => {
  for (const beds of [4, 17, 33, 91, 240]) {
    const t = thresholdFor('occupancy', {
      rooms: { standard: beds, suite: 0 }, roomRate: 90, reviewIndex: 1,
    });
    assert.equal(t, Math.round(t * 100) / 100, `${beds} rooms gave ${t}`);
  }
});

test('meeting pays, and missing costs more', () => {
  assert.ok(confidenceChange('beat') > confidenceChange('met'));
  assert.ok(confidenceChange('met') > 0);
  assert.ok(confidenceChange('missed') < 0);
  assert.ok(confidenceChange('missedBadly') < confidenceChange('missed'));
  // A run of near-misses must be a slide, not a plateau.
  assert.ok(Math.abs(confidenceChange('missed')) > confidenceChange('met') * 0.8);
});

test('a small hotel is expected to be full and a big one is not', () => {
  // Reads backwards until you see the measurements in spec §8.1: 60 rooms
  // runs 100% full, 120 runs 63%, 240 runs 31%. A flat target would be
  // free while the resort is small and impossible once it is large.
  const small = thresholdFor('occupancy', {
    rooms: { standard: 10, suite: 2 }, roomRate: 90, reviewIndex: 1,
  });
  const large = thresholdFor('occupancy', {
    rooms: { standard: 160, suite: 80 }, roomRate: 90, reviewIndex: 1,
  });
  assert.ok(small > large, 'a boutique hotel should be held to a higher occupancy');
  assert.ok(small <= 0.92 && large >= 0.4, 'and both should stay inside sane bounds');
});

test('the first review is gentler than the ones after it', () => {
  const opts = { rooms: { standard: 20, suite: 10 }, roomRate: 90 };
  for (const measure of MEASURES) {
    const first = thresholdFor(measure, { ...opts, reviewIndex: 0 });
    const later = thresholdFor(measure, { ...opts, reviewIndex: 1 });
    assert.ok(first <= later, `${measure}: the first ask should not be the hardest`);
  }
});

test('A RESORT WITH NO HOTEL IS NOT JUDGED AS A FAILED ONE', () => {
  // "No rooms built" is not "a hotel running at 0%". Reading it as failure
  // would be the same category error as declaring marshals worthless on a
  // three-hole course; see spec §15b.
  const verdict = assessTarget(
    { measure: 'occupancy', threshold: 0.6 },
    {
      report: { hotel: { capacity: 0, rate: 0 }, revenue: { rooms: 0 } },
      state: newGame(1),
    }
  );
  assert.notEqual(verdict, 'missedBadly');
});

test('every measure reads what it claims to read', () => {
  const report = { hotel: { capacity: 20, rate: 0.75 }, revenue: { rooms: 1400 } };
  const state = { prestige: 62, satisfactionHistory: [60, 64, 62] };
  assert.equal(measureNow('occupancy', { report, state }), 0.75);
  assert.equal(measureNow('revenuePerRoom', { report, state }), 70);
  assert.equal(measureNow('prestige', { report, state }), 62);
  assert.equal(measureNow('satisfaction', { report, state }), 62);
});

test('confidence cannot leave its bounds in either direction', () => {
  let thriving = atConfidence(96, 7);
  for (let d = 0; d < REVIEW_EVERY * 4; d++) thriving = runDay(thriving, 1200 + d).state;
  assert.ok(thriving.investors.confidence <= 100);
  assert.ok(thriving.investors.confidence >= 0);

  let sinking = atConfidence(4, 8);
  sinking.resort.rooms = { standard: 200, suite: 100 }; // hopeless to fill
  for (let d = 0; d < REVIEW_EVERY * 3; d++) sinking = runDay(sinking, 1300 + d).state;
  assert.ok(sinking.investors.confidence >= 0);
});

test('a resort with no investors runs exactly as it did in Act I', () => {
  const { report } = runDay(newGame(9), 12);
  assert.equal(report.investors, null);
});

// --- The two ways out -------------------------------------------------

test('confidence at zero demands the money back rather than taking the hotel', () => {
  let state = atConfidence(0, 11);
  const before = { ...state.resort.rooms };
  const { report, state: next } = runDay(state, 1200);
  assert.ok(report.investors.buyoutDemand, 'they should call the loan');
  assert.equal(report.investors.buyoutDemand.kind, 'demand');
  assert.ok(report.investors.buyoutDemand.amount > 0);
  assert.deepEqual(next.resort.rooms, before,
    'the hotel is not confiscated; it is a debt, not a repossession');
});

test('the demand is visible for a fortnight before it lands', () => {
  // A player should never be surprised by the buyout, only unable to stop it.
  const { report } = runDay(atConfidence(0, 12), 1400);
  assert.ok(report.investors.buyoutDemand.dueDay >= report.day + SETTLEMENT_DAYS - 1);
});

test('the demand does not renew itself every morning', () => {
  let state = atConfidence(0, 13);
  const first = runDay(state, 1500);
  state = first.state;
  const raisedOn = state.investors.buyoutDemand.dueDay;
  for (let d = 0; d < 5; d++) state = runDay(state, 1501 + d).state;
  assert.equal(state.investors.buyoutDemand.dueDay, raisedOn,
    'the clock must not reset daily, or the fortnight never runs out');
});

test('paying it ends the act and leaves the hotel yours', () => {
  let state = atConfidence(0, 14);
  state = runDay(state, 1600).state;
  state.money = 500000;
  const owed = state.investors.buyoutDemand.amount;
  const paid = payBuyout(state);
  assert.equal(paid.investors.bought, true);
  assert.equal(paid.money, 500000 - owed, 'it must actually cost the money');
  assert.equal(paid.investors.buyoutDemand, null);
  // Reviews stop. This is the ending and it must actually end.
  const after = runDay(paid, 1700).report;
  assert.equal(after.investors.reviewed, null);
  assert.equal(after.investors.bought, true);
});

test('you cannot pay with money you do not have', () => {
  let state = atConfidence(0, 15);
  state = runDay(state, 1800).state;
  state.money = 10;
  const attempted = payBuyout(state);
  assert.notEqual(attempted.investors.bought, true,
    'a buyout you cannot afford must not go through');
  assert.equal(attempted.money, 10, 'and must not overdraw the bank');
});

test('failing to pay sells rooms at the demolition haircut', () => {
  let state = atConfidence(0, 16);
  state.resort.rooms = { standard: 30, suite: 15 };
  state = runDay(state, 1900).state;
  state.money = 0;
  const before = totalRooms(state.resort.rooms);
  const after = forceLiquidation(state);
  assert.ok(totalRooms(after.resort.rooms) < before, 'rooms should be sold to clear it');
  assert.ok(after.money >= 0, 'liquidation clears the debt rather than deepening it');
  assert.equal(after.investors.liquidated, true);
  assert.equal(after.investors.bought, true, 'and either way they are gone');
});

test('THE GOOD ENDING IS REACHABLE WITHOUT FAILING', () => {
  // The hole this task existed to close. The buyout fires at confidence
  // 0, a well-run resort sits at 100, and so the player doing everything
  // right never finished the act while the player doing badly got the
  // only exit.
  let state = startOfActTwo(17);
  state.investors.confidence = 95;
  state.investors.goodReviews = 2;
  const { report } = runDay(state, 2000);
  assert.ok(report.investors.buyoutDemand, 'a resort this healthy should be offered the door');
  assert.equal(report.investors.buyoutDemand.kind, 'offer');
});

test('the good ending costs more than the bad one', () => {
  // You are under no pressure and they know what the place is worth, so
  // the graduation should cost more than the rescue.
  const investors = { principal: 180000 };
  assert.ok(buyoutPrice(investors, { offered: true }) > buyoutPrice(investors));
});

test('a streak of good reviews is required, not one lucky fortnight', () => {
  let state = startOfActTwo(18);
  state.investors.confidence = 95;
  state.investors.goodReviews = 1;
  const { report } = runDay(state, 2100);
  assert.equal(report.investors.buyoutDemand, null,
    'one good review is not a track record');
});

test('CALIBRATION: targets are demanding but not absurd on a real resort', () => {
  // The test the threshold work should have had from the start.
  //
  // Everything else about thresholdFor checks SHAPE — small above large,
  // first below later — and every one of those passed while the numbers
  // were calibrated on the opening three-hole course, soft enough that a
  // 180-room hotel held 100 confidence for twelve weeks. A shape test
  // would pass with a prestige target of 5 or of 500.
  //
  // These are the measured figures for a resort being run properly.
  const running = { prestige: 80, satisfaction: 72, revenuePerRoom: 140, occupancy: 1.0 };
  const rooms = { standard: 20, suite: 10 };
  const roomRate = 95;

  for (const measure of MEASURES) {
    const early = thresholdFor(measure, { rooms, roomRate, reviewIndex: 1 });
    const late = thresholdFor(measure, { rooms, roomRate, reviewIndex: 8 });
    const actual = running[measure];

    assert.ok(early < actual,
      `${measure}: an early target of ${early} is unreachable against a real ${actual}`);
    // 0.72 rather than 0.5, because 0.5 does not bite. The first version
    // of this test used it and passed against the very ladder it was
    // written to catch: a prestige target of 53 against a real 80 is
    // free, and 53 > 40. A calibration test with a loose bound is a shape
    // test wearing a calibration test's clothes.
    assert.ok(early > actual * 0.72,
      `${measure}: an early target of ${early} is free against a real ${actual}`);
    assert.ok(late >= actual * 0.9,
      `${measure}: a late target of ${late} never catches up with ${actual} — standing still would never become failure`);
  }
});
