import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { makeRng } from '../src/sim/rng.js';
import {
  REVIEW_EVERY, STARTING_CONFIDENCE, MEASURES,
  confidenceChange, thresholdFor, assessTarget, pickMeasure,
  startingInvestors, measureNow,
} from '../src/sim/investors.js';

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
