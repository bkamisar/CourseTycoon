import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay, halfwayRestoreTo, cartRestoreTo, snackRestoreTo } from '../src/sim/day.js';
import { guestSatisfaction } from '../src/sim/satisfaction.js';
import { SEGMENTS, SEGMENT_KEYS } from '../src/sim/segments.js';
import { CONDITIONS, CONDITION_KEYS, effectsOf } from '../src/sim/weather.js';
import { occupancyFor, nightlyUpkeep, ROOM_TYPES } from '../src/sim/rooms.js';
import { kitchenCapacity, serviceFactor, BASE_CAPACITY, PER_COOK } from '../src/sim/kitchen.js';
import { shopCapacity, shopServiceFactor } from '../src/sim/shop.js';
import { GATE_THRESHOLDS } from '../src/sim/acts.js';

/**
 * CALIBRATION, as opposed to shape.
 *
 * Spec §15c: a shape test says the numbers are ordered; a calibration
 * test says they are the right size. The difference only shows when a
 * number is wrong in a way that preserves the ordering, which is most of
 * how numbers go wrong.
 *
 * Four balance constants in this game were wrong at some point while
 * every test about them stayed green:
 *
 *   - scenery moved satisfaction by 1.2 points across its entire range,
 *     and the whole built resort by 10, while the tee interval moved it
 *     by 32. Act I had one winning line as a direct result.
 *   - shopServiceFactor was threaded into guestSatisfaction and never
 *     used, so the pro shop complained about a queue it did not charge
 *     for.
 *   - investor thresholds were calibrated on the three-hole opener, soft
 *     enough that a 180-room hotel held maximum confidence for twelve
 *     weeks.
 *   - the green preset charged $3,000 to cycle back to where you started.
 *
 * Every one of those was found by looking at output. This file is the
 * attempt to catch the next one automatically. Each assertion below was
 * verified by breaking the constant on purpose and watching it fail —
 * which spec §15c calls the step that is not optional, because the first
 * calibration test written for the investors passed against the very
 * ladder it was written to catch.
 */

// --- Satisfaction: what you BUILD must be able to compete -------------

test('what the player builds can move satisfaction as much as what they dial', () => {
  // The Act I failure. Scenery, turf and amenities were worth ten points
  // between them while waiting, price and difficulty fit were worth
  // thirty each — so the tee interval was the only lever with reach and
  // every other strategy lost regardless of how well the resort was
  // built. Four viable strategies exist now; this is what stops it
  // sliding back to one.
  const base = {
    handicap: 14, strokesOverPar: 7, waitMinutes: 6, greenFee: 80,
    perceivedValue: 95, segment: 'locals', courseDifficulty: 45,
  };
  const neglected = guestSatisfaction({ ...base, scenery: 35, turfQuality: 30, amenityBonus: 0 });
  const excellent = guestSatisfaction({ ...base, scenery: 85, turfQuality: 100, amenityBonus: 9 });
  const built = excellent - neglected;

  assert.ok(built >= 14,
    `everything the player builds is worth only ${built.toFixed(1)} points of satisfaction; `
    + 'if it cannot compete with a tee-interval change there is only one strategy');
  assert.ok(built <= 45,
    `building is worth ${built.toFixed(1)} points, which drowns out pace and price`);
});

test('waiting still hurts more than anything else', () => {
  // The other half. Built things must compete, not win — pace of play is
  // Act I's central mechanic and must stay the biggest single lever.
  const base = {
    handicap: 14, strokesOverPar: 7, greenFee: 80, perceivedValue: 95,
    scenery: 60, turfQuality: 85, amenityBonus: 6,
    segment: 'locals', courseDifficulty: 45,
  };
  const flowing = guestSatisfaction({ ...base, waitMinutes: 0 });
  const jammed = guestSatisfaction({ ...base, waitMinutes: 35 });
  assert.ok(flowing - jammed > 20,
    `a jammed course costs only ${(flowing - jammed).toFixed(1)} points; pace must stay the biggest lever`);
});

test('a queue at the counter costs the guest something', () => {
  // shopServiceFactor was accepted as a parameter and never used: the pro
  // shop produced a complaint about a six-deep queue while the score
  // ignored it entirely.
  const base = {
    handicap: 14, strokesOverPar: 7, waitMinutes: 4, greenFee: 80,
    perceivedValue: 95, scenery: 60, turfQuality: 85, amenityBonus: 6,
    segment: 'locals', courseDifficulty: 45,
  };
  assert.ok(guestSatisfaction({ ...base, shopServiceFactor: 1 })
    > guestSatisfaction({ ...base, shopServiceFactor: 0.3 }) + 2,
    'a shop nobody can reach must cost more than a rounding error');
  assert.ok(guestSatisfaction({ ...base, kitchenServiceFactor: 1 })
    > guestSatisfaction({ ...base, kitchenServiceFactor: 0.3 }) + 6,
    'and queueing for food must cost more than queueing for a glove');
});

// --- Weather: a variance source has to actually vary ------------------

test('weather swings demand enough to be felt', () => {
  const best = Math.max(...CONDITION_KEYS.map((k) => effectsOf(k).demand));
  const worst = Math.min(...CONDITION_KEYS.map((k) => effectsOf(k).demand));
  assert.ok(best / worst > 5,
    `the best day is only ${(best / worst).toFixed(1)}x the worst; that is not a variance source`);
  assert.ok(worst < 0.25, 'a storm should nearly empty the course');
  assert.ok(best > 1.05, 'and a perfect day should visibly fill it');
});

test('most days are still golf', () => {
  // Bad weather must read as an event rather than as the climate.
  const playable = CONDITION_KEYS.filter((k) => effectsOf(k).demand >= 0.9);
  assert.ok(playable.length >= 2, 'there should be more than one kind of good day');
  assert.ok(CONDITIONS.rain.turf > 1, 'rain must visibly help the turf, or wet weeks are pure punishment');
});

// --- Staffing: capacity has to bind at a sane resort size -------------

test('a kitchen with no cooks binds on a real menu, and one cook fixes it', () => {
  // If capacity never binds, cooks are decoration; if one cook is never
  // enough, the mechanic is a tax. Act I's boards run 5 to 18 prep.
  assert.ok(BASE_CAPACITY < 6, `a kitchen with nobody in it copes with ${BASE_CAPACITY} prep, which is a whole halfway house`);
  assert.equal(serviceFactor(5, kitchenCapacity([])), kitchenCapacity([]) / 5,
    'a five-prep board must actually slow an unstaffed kitchen');
  assert.equal(serviceFactor(5, kitchenCapacity([{ role: 'kitchenStaff' }])), 1,
    'and one cook must be enough for a modest board');
  assert.ok(PER_COOK >= 3 && PER_COOK <= 6, `each cook covers ${PER_COOK} prep, which is either trivial or useless`);
});

test('the shop counter binds at a busy resort and not a quiet one', () => {
  const quiet = 15;
  const busy = 100;
  assert.equal(shopServiceFactor(quiet, shopCapacity([])), 1,
    'a quiet day must not need a shop hire');
  assert.ok(shopServiceFactor(busy, shopCapacity([])) < 0.55,
    'a busy day with nobody behind the counter must turn real money away');
  assert.equal(shopServiceFactor(busy, shopCapacity([{ role: 'shopStaff' }, { role: 'shopStaff' }])), 1,
    'and two hires must cover it');
});

// --- Rooms: a plausible hotel must be fillable by a plausible crowd ---

test('a plausible hotel is fillable, and an implausible one is not', () => {
  // Both directions matter. If nothing fills, occupancy targets are
  // unreachable; if everything fills, overbuilding is free.
  const crowd = { locals: 60, serious: 20, destination: 40 };
  const modest = occupancyFor({ rooms: { standard: 20, suite: 8 }, crowd, roomRate: 95, valuePerRound: 85 });
  const absurd = occupancyFor({ rooms: { standard: 300, suite: 150 }, crowd, roomRate: 95, valuePerRound: 85 });
  assert.ok(modest.rate > 0.6, `a 28-room hotel runs at ${(modest.rate * 100).toFixed(0)}% against a real crowd`);
  assert.ok(absurd.rate < 0.5, `a 450-room hotel runs at ${(absurd.rate * 100).toFixed(0)}%, so overbuilding is free`);
});

test('a room costs enough that an empty one hurts', () => {
  // The rule Act II rests on. Upkeep must be a real share of the nightly
  // rate or standing empty is survivable and occupancy means nothing.
  for (const kind of Object.keys(ROOM_TYPES)) {
    const spec = ROOM_TYPES[kind];
    const nightly = 95 * spec.rateMultiple;
    assert.ok(spec.upkeep > nightly * 0.25,
      `${kind}: $${spec.upkeep} a night against a $${nightly.toFixed(0)} rate is too cheap to stand empty`);
    assert.ok(spec.upkeep < nightly * 0.65,
      `${kind}: $${spec.upkeep} a night leaves too little margin to be worth building`);
  }
  assert.ok(nightlyUpkeep({ standard: 30, suite: 15 }) > 2000,
    'a substantial hotel must be a substantial bill');
});

// --- Refreshment: three amenities, three distinct jobs ----------------

test('the three refreshment stops stay distinct by a real margin', () => {
  // Cart sells and does not feed; the snack shack and halfway house feed.
  // A shape test would accept 68 / 69 / 70 and call the ordering correct.
  const board = ['burgerFries', 'draught'];
  const cart = cartRestoreTo(board);
  const shack = snackRestoreTo(board);
  const halfway = halfwayRestoreTo(board);
  assert.ok(shack - cart >= 5, `cart ${cart} and shack ${shack} are barely different`);
  assert.ok(halfway - shack >= 5, `shack ${shack} and halfway house ${halfway} are barely different`);
});

// --- The gate: Act II must actually be reachable ----------------------

test('the Act I gate is demanding without being out of reach', () => {
  // Three of four conditions were met by day 60 by any competent
  // operator while the fourth was never met at all, so the gate was one
  // condition wearing four hats.
  // The band moved deliberately. It used to be 55-70, on the reasoning
  // that above 70 was impossible -- but 70 was ALSO what the money
  // optimum produced, so every threshold inside that band was satisfied
  // for free by playing greedily and the gate opened on day 13.
  //
  // Measured on the current frontier, the money optimum sits at
  // satisfaction 69 and buying 76 costs roughly half the profit. So the
  // line belongs just above the optimum: high enough that clearing it
  // means deliberately leaving money on the table, low enough that the
  // money condition is still reachable while you do.
  assert.ok(GATE_THRESHOLDS.satisfaction > 70,
    `satisfaction ${GATE_THRESHOLDS.satisfaction} is at or below the money optimum, so it costs nothing to clear`);
  assert.ok(GATE_THRESHOLDS.satisfaction <= 78,
    `satisfaction ${GATE_THRESHOLDS.satisfaction} is above what any profitable line reaches`);
  assert.ok(GATE_THRESHOLDS.satisfactionDays >= 7,
    'holding it briefly would make the gate a lucky week');
  assert.equal(GATE_THRESHOLDS.holesOpen, 9,
    'Act I must not get harder because Act II laid out a back nine');
});

test('a day still produces sane numbers end to end', () => {
  // The cheapest possible guard against a constant being changed to
  // something that makes the simulation produce nonsense rather than
  // merely bad balance.
  let state = newGame(77);
  for (let d = 0; d < 12; d++) {
    const { state: next, report } = runDay(state, 7700 + d);
    state = next;
    assert.ok(Number.isFinite(report.revenue.total), `day ${d}: revenue was ${report.revenue.total}`);
    assert.ok(Number.isFinite(report.averageSatisfaction));
    assert.ok(report.averageSatisfaction >= 0 && report.averageSatisfaction <= 100);
    assert.ok(report.averageRoundMinutes > 0 && report.averageRoundMinutes < 600,
      `a round took ${report.averageRoundMinutes} minutes`);
    assert.ok(state.turfQuality >= 0 && state.turfQuality <= 100);
  }
});

test('every segment is actually reachable by some course', () => {
  // A crowd nobody can attract is a crowd that does not exist. Sweeps
  // difficulty, since that is the lever that decides who turns up.
  const reached = new Set();
  for (let difficulty = 15; difficulty <= 95; difficulty += 5) {
    let best = null;
    for (const key of SEGMENT_KEYS) {
      const fit = Math.abs(difficulty - SEGMENTS[key].idealDifficulty);
      if (!best || fit < best.fit) best = { key, fit };
    }
    reached.add(best.key);
  }
  for (const key of SEGMENT_KEYS) {
    assert.ok(reached.has(key), `no course difficulty makes ${key} the best-served crowd`);
  }
});
