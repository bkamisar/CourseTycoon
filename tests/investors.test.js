import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { makeRng } from '../src/sim/rng.js';
import {
  REVIEW_EVERY, STARTING_CONFIDENCE, MEASURES, confidenceChange, thresholdFor, assessTarget, pickMeasure, startingInvestors, measureNow, SETTLEMENT_DAYS, buyoutPrice, payBuyout, forceLiquidation, nextTargetFor,
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
  //
  // Asked of the picker directly rather than by playing seventy days.
  // The day-loop version of this broke the moment confidence could
  // actually reach zero: the resort collapsed after three reviews and the
  // test reported a rotation failure, which is a fact about the resort
  // surviving rather than about the rotation. A test should not depend on
  // something it is not testing.
  const rng = makeRng(21);
  const asked = [];
  let recent = [];
  for (let review = 0; review < 4; review++) {
    const measure = pickMeasure(rng, recent, { hasHotel: true });
    asked.push(measure);
    recent = [...recent, measure];
    if (recent.length >= MEASURES.length) recent = [];
  }
  assert.equal(new Set(asked).size, 4,
    `the first four reviews repeated a measure: ${asked.join(', ')}`);
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
  // Driven from an OFFER. A demand raised because confidence hit zero
  // can no longer be paid at all -- see `settlementDue` -- so the payable
  // settlement is the one a well-run resort earns, not the one a failing
  // one is handed.
  let state = atConfidence(95, 14);
  state.investors.goodReviews = 2;
  state = runDay(state, 1600).state;
  if (!state.investors.buyoutDemand) return;
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

// --- Never judged on a hotel that does not exist -----------------------

test('the first target is never about a hotel the resort has not got', () => {
  // Reported from a first Act II playthrough: "they give me a threshold
  // to reach of revenue per room greater than 0".
  //
  // On arrival there are no rooms and no nightly rate, so
  // `revenuePerRoom` was `0 * something` -- a target of $0, which
  // `measureNow` then meets, handing out confidence for having no hotel.
  // Occupancy was the mirror image: a resort with no beds cannot fill
  // them, so it was a guaranteed miss. Both are questions about something
  // that does not exist yet.
  for (let seed = 1; seed <= 40; seed++) {
    const state = newGame(seed);
    state.act = 2;
    const investors = startingInvestors(state, makeRng(seed));
    const target = investors.nextTarget;
    assert.ok(target, `seed ${seed}: the investors must arrive with a target`);
    assert.ok(!['occupancy', 'revenuePerRoom'].includes(target.measure),
      `seed ${seed}: asked for ${target.measure} from a resort with no rooms`);
    assert.ok(target.threshold > 0,
      `seed ${seed}: ${target.measure} target of ${target.threshold} is no target at all`);
  }
});

test('hotel measures come back once there is a hotel', () => {
  // The other half: the guard must not permanently remove them.
  const state = newGame(4);
  state.act = 2;
  state.resort.rooms = { standard: 10, suite: 3 };
  state.resort.pricing.roomRate = 120;

  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(nextTargetFor(state, makeRng(500 + i), { recent: [], reviewIndex: i }).measure);
  }
  assert.ok(seen.has('occupancy') || seen.has('revenuePerRoom'),
    'a resort with rooms has to be asked about them');
});

test('no measure can ever produce a threshold of nothing', () => {
  // Including the states a player can reach by hand: rooms sold off, or a
  // nightly rate dragged to zero.
  const cases = [
    { rooms: {}, roomRate: 0 },
    { rooms: { standard: 0, suite: 0 }, roomRate: 0 },
    { rooms: { standard: 4, suite: 0 }, roomRate: 0 },
    { rooms: { standard: 40, suite: 20 }, roomRate: 250 },
  ];
  for (const { rooms, roomRate } of cases) {
    for (const measure of MEASURES) {
      for (const reviewIndex of [0, 1, 4]) {
        const threshold = thresholdFor(measure, { rooms, roomRate, reviewIndex });
        assert.ok(threshold > 0,
          `${measure} at rate ${roomRate} review ${reviewIndex} gave ${threshold}`);
      }
    }
  }
});

test('the cycle boundary never repeats a measure, on any seed', () => {
  // The no-repeat rule used to hold everywhere except the one place the
  // slate was cleared: emptying `recentMeasures` after all four had been
  // asked handed the next pick no memory at all, so it could ask the same
  // thing twice running. A one-in-four chance at each boundary, which is
  // why a single-seed test missed it for weeks.
  //
  // Driven through pickMeasure directly rather than through runDay, so it
  // sweeps every seed cheaply and does not depend on where a particular
  // rng stream happens to land.
  for (let seed = 0; seed < 200; seed++) {
    const rng = makeRng(seed);
    let recent = [];
    const asked = [];
    for (let i = 0; i < 12; i++) {
      const measure = pickMeasure(rng, recent, { hasHotel: true });
      asked.push(measure);
      const next = [...recent, measure];
      recent = next.length >= MEASURES.length ? [measure] : next;
    }
    for (let i = 1; i < asked.length; i++) {
      assert.notEqual(asked[i], asked[i - 1],
        `seed ${seed}: asked about ${asked[i]} twice running at ${i} (${asked.join(', ')})`);
    }
  }
});

test('EVERY MEASURE STOPS ASKING FOR MORE SOMEWHERE', () => {
  // Each target is "seven per cent better than you are doing now", which
  // has to stop somewhere or it stops being a relationship and becomes a
  // countdown. Occupancy, prestige and satisfaction had ceilings from the
  // start; revenue per room had Infinity, and so was the only one that
  // ratcheted forever. Measured across 622 reviews it was 58% of every
  // failure while the other three sat between 4% and 9% -- and after an
  // unrelated change made rooms scarcer, 87% against 0%.
  //
  // Driven by asking repeatedly for an improvement on what was just
  // delivered, which is exactly what the fortnightly review does.
  const rooms = { standard: 40, suite: 20 };
  const roomRate = 300;
  for (const measure of MEASURES) {
    let current = measureNow(measure, {
      report: { hotel: { rate: 0.8, capacity: 60 }, revenue: { rooms: 60 * 300 } },
      state: { prestige: 60, satisfactionHistory: Array(REVIEW_EVERY).fill(60) },
    });
    let previous = current;
    for (let review = 0; review < 40; review++) {
      const asked = thresholdFor(measure, { rooms, roomRate, reviewIndex: review, current });
      // A resort that delivers exactly what was asked, every time.
      current = asked;
      previous = asked;
    }
    // Forty fortnights of compounding is over three years. Nothing should
    // have run away to an unreachable number in that time.
    const fullHouse = (40 * 300 + 20 * 780) / 60;   // every bed sold, suites at 2.6x
    const limit = { occupancy: 1, prestige: 100, satisfaction: 100, revenuePerRoom: fullHouse };
    assert.ok(current <= limit[measure] + 1e-6,
      `${measure} ratcheted to ${current} after forty reviews, past any level a resort can reach `
      + `(${limit[measure]}) -- it has no ceiling`);
  }
});

test('and they stop at a full house rather than at a number', () => {
  // The ceiling for revenue per room is what the hotel earns with every
  // bed sold at the rate the player has chosen. Asking for more is asking
  // them to put the price up, which is their decision and not a target.
  const rooms = { standard: 40, suite: 20 };
  const cheap = thresholdFor('revenuePerRoom', { rooms, roomRate: 100, reviewIndex: 9, current: 100000 });
  const dear = thresholdFor('revenuePerRoom', { rooms, roomRate: 400, reviewIndex: 9, current: 100000 });
  assert.ok(dear > cheap,
    'a hotel charging more should be expected to take more per room');
  // A third in suites at 2.6x is about 1.5x the nightly rate per room.
  assert.ok(cheap > 100 && cheap < 250, `a $100 room capped at ${cheap}, which is not a full house`);
});
