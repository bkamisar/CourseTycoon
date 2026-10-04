import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, serialize, deserialize, playableHoles, playableHolesOn, openHoles,
} from '../src/sim/state.js';
import { runDay, applyEventChoice } from '../src/sim/day.js';
import { CHAMPIONSHIP_EVENTS, drawEventPlan, eventPlanSeed } from '../src/sim/championshipEvents.js';
import { makeRng } from '../src/sim/rng.js';
import { makeHole, courseDifficultyOf } from '../src/sim/hole.js';
import {
  RUNGS, RUN_UP_DAYS, TURF_EXPECTED, BAR_DAYS, conditioningCostPerDay, bidFor, nextRungFor,
} from '../src/sim/tournaments.js';
import { newWeek, withPins } from '../src/sim/championshipWeek.js';
import {
  PRACTICE_DAYS_BEFORE, projectSetup, practiceForecast, practiceSeed,
} from '../src/sim/practiceRound.js';
import { championshipCards } from '../src/ui/championshipCard.js';
import { computeChampionshipData, practiceNote } from '../src/ui/championship.js';
import { toParText } from '../src/ui/toPar.js';
import { narrowToDifficulty } from '../tools/championshipPolicy.js';
import { CONDITIONS } from '../src/sim/weather.js';
import { addCondition } from '../src/sim/conditions.js';

/** A resort that has finished Act II, which is where Act III begins. */
function actThreeResort(seed = 3) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 400000;
  state.prestige = 80;
  for (let i = 0; i < 6; i++) state.resort.staff.push({ role: 'groundskeeper' });
  return state;
}

/**
 * Opens all eighteen holes on a fresh template rotation.
 *
 * `newGame` starts with three built and fifteen unbuilt stubs (see
 * state.js) — fine for tests that don't care what `perceivedValue` comes
 * out to, but a countyOpen requires CHAMPIONSHIP_HOLES (18) to even be
 * bid for, and `perceivedValue`'s `completeness` term is what scales a
 * championship-night room rate's "fair" ceiling. A test asserting a rate
 * is fair or silly has to run on a course that could plausibly host the
 * event, not the three-hole stub `actThreeResort` leaves behind.
 */
const COURSE_TEMPLATES = [
  'shortPar3', 'waterPar3', 'straightPar4', 'doglegPar4', 'longPar5', 'reachablePar5',
];
function openFullCourse(state) {
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(COURSE_TEMPLATES[i % COURSE_TEMPLATES.length], i + 1),
    open: true,
  }));
  return state;
}

/**
 * Plays a booked championship to the end and returns the final day.
 *
 * A championship used to resolve on the day it was booked for. It is now
 * two to four rounds, so a test that ran one `runDay` and looked for a
 * result would find a round report and no verdict.
 */
function playWeek(state, seed) {
  let out = runDay(state, seed);
  for (let i = 1; i < 10 && out.state.tournament && !out.state.tournament.resolved; i++) {
    out = runDay(out.state, seed + i);
  }
  return out;
}

/** The course narrowed to a rung's minimum, the way a host would. */
function atMinimum(state, rungId) {
  narrowToDifficulty(state.resort.courses[0].holes, RUNGS[rungId].minDifficulty);
  return state;
}

test('a new game carries tournament state that survives a save', () => {
  const state = newGame(1);
  assert.equal(state.resort.setup, 0, 'a course starts unconditioned');
  assert.equal(state.resort.setupTarget, 0, 'and with nothing dialled in');
  assert.equal(state.tournament, null, 'and with nothing booked');
  assert.deepEqual(state.tournamentsHosted, [],
    'hosted rungs must exist from day one or a save/load loses the ladder');
  const revived = deserialize(serialize(state));
  assert.equal(revived.resort.setup, 0);
  assert.equal(revived.resort.setupTarget, 0);
  assert.equal(revived.tournament, null);
  assert.deepEqual(revived.tournamentsHosted, []);
});

test('a target set mid-game survives a save/load round trip', () => {
  const state = newGame(4);
  state.resort.setupTarget = 62;
  const revived = deserialize(serialize(state));
  assert.equal(revived.resort.setupTarget, 62,
    'the dial itself is exactly the kind of thing a save must not lose');
});

test('setup climbs while a championship is booked and falls back after', () => {
  let state = actThreeResort();
  state.tournament = { rung: 'countyOpen', day: state.day + 21, resolved: false };
  // The crew only climbs toward a target the player has set. Without one
  // there is nothing to aim at, so give it a target above where ten days
  // of a full crew could possibly overshoot.
  state.resort.setupTarget = 100;

  for (let d = 0; d < 10; d++) state = runDay(state, 3000 + d).state;
  const climbed = state.resort.setup;
  assert.ok(climbed > 20, `setup only reached ${climbed.toFixed(0)} in ten days`);

  state.tournament = null;
  for (let d = 0; d < 10; d++) state = runDay(state, 3100 + d).state;
  assert.ok(state.resort.setup < climbed, 'with nothing booked it must fall back');
});

test('a target holds a full crew inside the county band instead of running to 100', () => {
  // This is the defect itself: a crew big enough to overshoot every band
  // in the game used to drive setup to 100 because conditioning had no
  // target to stop at. actThreeResort's seven groundskeepers (one from
  // newGame plus six added) are exactly that crew.
  let state = actThreeResort(21);
  state.tournament = { rung: 'countyOpen', day: state.day + 21, resolved: false };
  state.resort.setupTarget = 52;

  for (let d = 0; d < 21; d++) state = runDay(state, 4000 + d).state;

  const band = RUNGS.countyOpen.band;
  assert.ok(state.resort.setup >= band.low && state.resort.setup <= band.high,
    `setup landed at ${state.resort.setup.toFixed(1)}, outside the county band [${band.low},${band.high}]`);
  // The explicit upper bound: this is the whole bug. A dial-less crew ran
  // this to 100 every time, overshooting even the top rung's band.
  assert.ok(state.resort.setup < 100,
    `setup reached ${state.resort.setup.toFixed(1)} — the crew must stop at the target, not run to 100`);
});

test('a target of zero keeps the course from conditioning at all', () => {
  let state = actThreeResort(22);
  state.tournament = { rung: 'countyOpen', day: state.day + 21, resolved: false };
  state.resort.setupTarget = 0;

  for (let d = 0; d < 21; d++) state = runDay(state, 4100 + d).state;

  // Both sides: not merely "stayed low", but held exactly at zero, with a
  // full crew and a live booking that would have climbed it under the old
  // all-or-nothing rule.
  assert.equal(state.resort.setup, 0,
    'with the target left at zero, a booked championship must not move the dial at all');
});

test('lowering the target lets a conditioned course fall back even while still booked', () => {
  let state = actThreeResort(23);
  state.tournament = { rung: 'countyOpen', day: state.day + 30, resolved: false };
  state.resort.setupTarget = 90;

  for (let d = 0; d < 10; d++) state = runDay(state, 4200 + d).state;
  const climbed = state.resort.setup;
  assert.ok(climbed > 30, `setup only reached ${climbed.toFixed(1)} in ten days aiming at 90`);

  // The player changes their mind with the championship still booked.
  // Reversibility has to answer to the target itself, not just to whether
  // a tournament exists — the crew must let a conditioned course fall
  // back the moment the target drops below where it already sits.
  state.resort.setupTarget = 10;
  for (let d = 0; d < 5; d++) state = runDay(state, 4300 + d).state;
  assert.ok(state.resort.setup < climbed,
    'setup must fall once the target is lowered below it, championship or not');
});

test('after the championship resolves, lowering the target still lets setup fall', () => {
  let state = actThreeResort(24);
  state.resort.setup = 90;
  state.resort.setupTarget = 90;
  state.turfQuality = 88;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };

  const resolved = playWeek(state, 4400).state;
  assert.equal(resolved.tournament, null, 'the booking is spent');

  resolved.resort.setupTarget = 10;
  let after = resolved;
  for (let d = 0; d < 5; d++) after = runDay(after, 4500 + d).state;
  assert.ok(after.resort.setup < resolved.resort.setup,
    'a lowered target after the event must still let setup fall');
});

/**
 * The run-up's cost, in the one place it is unambiguous: the turf itself.
 * `courseDifficulty` and satisfaction are muddied by self-selection (see
 * the todo test below), but care diverted away from the turf is a direct
 * subtraction with nothing else feeding it, so it is the cleanest place to
 * prove the mechanic actually fires.
 */
test('a crew conditioning the course holds less turf than an identical crew that is not', () => {
  function turfAfter(conditioning) {
    let state = openFullCourse(actThreeResort(30));
    if (conditioning) {
      // Any booked target diverts care, climbing or holding. 100 keeps the
      // crew climbing for the whole comparison, so the setup is not also
      // changing shape partway through.
      state.tournament = { rung: 'national', day: state.day + 21, resolved: false };
      state.resort.setupTarget = 100;
    }
    for (let d = 0; d < 15; d++) state = runDay(state, 5000 + d).state;
    return state.turfQuality;
  }
  const idle = turfAfter(false);
  const conditioning = turfAfter(true);
  assert.ok(conditioning < idle,
    `conditioning must cost turf: idle held ${idle.toFixed(1)}, conditioning only ${conditioning.toFixed(1)}`);
  // Not just "lower" — lower by more than the noise a run of ordinary days
  // could produce on its own, or this is testing rounding rather than the
  // mechanic. One-sided ("it went down") is exactly how a trivial or
  // rounding-error-sized effect would sneak past review.
  assert.ok(idle - conditioning > 10,
    `the cost has to be more than noise: only ${(idle - conditioning).toFixed(1)} points apart`);
});

/**
 * And the other direction, which the fix could just as easily have broken:
 * a diversion large enough to cost something can also be large enough that
 * no crew can outrun it, which would swap a free bonus for an impossible
 * one. Ten groundskeepers on eighteen holes is a real hire, not a maxed-out
 * fantasy roster — see the balance report for the sweep that chose it.
 */
test('a realistic crew still holds turf at or above the championship expectation through a full run-up', () => {
  let state = openFullCourse(actThreeResort(31));
  state.resort.staff.push({ role: 'groundskeeper' }, { role: 'groundskeeper' }, { role: 'groundskeeper' });
  const keepers = state.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  const band = RUNGS.national.band;
  state.tournament = { rung: 'national', day: state.day + RUN_UP_DAYS, resolved: false };
  state.resort.setupTarget = Math.round((band.low + band.high) / 2);

  let minTurf = 100;
  for (let d = 0; d < RUN_UP_DAYS; d++) {
    state = runDay(state, 6000 + d).state;
    minTurf = Math.min(minTurf, state.turfQuality);
  }
  assert.ok(minTurf >= TURF_EXPECTED,
    `${keepers} groundskeepers should hold turf at or above ${TURF_EXPECTED} through the run-up; `
    + `it fell to ${minTurf.toFixed(1)}`);
});

// TODO (see docs/known-issues.md, "Conditioning a course raises average
// satisfaction instead of costing it"): fails under the current demand
// model. Locals' appeal collapses as courseDifficulty rises, but total
// demand here is capacity-bound (prestige 80, a sold-out tee sheet), so
// the tee sheet simply refills with serious golfers who fit the harder
// course far better than locals fit the original one — and their
// individually higher satisfaction outweighs the locals lost. Average
// satisfaction of whoever actually shows up RISES with conditioning
// (measured ~20-25 points higher by day 2+ of this fixture) rather than
// falling. Marked todo rather than adjusted or deleted: the assertion
// below is exactly what the task specified and still describes the
test('conditioning a course costs it trade', () => {
  /*
   * The sacrifice. Locals want an easy course -- SEGMENTS.locals
   * idealDifficulty is 30 -- and championship condition is the opposite.
   * The run-up has to cost something or it is theatre.
   *
   * This asserted falling SATISFACTION and sat as a `todo` for days,
   * because satisfaction goes UP: a hard course keeps the golfers who
   * like hard courses, and the average is taken over whoever turned up.
   * That is self-selection working correctly. The premise was wrong, not
   * the simulation.
   *
   * What the design actually asks for is that the everyday business is
   * paid in full before anything is paid back, so this measures TAKINGS.
   * It became true when the catchment was split per population: the town
   * is a fixed number of groups, so the locals a hard course drives away
   * can no longer be replaced one-for-one by serious golfers conjured out
   * of a pool with no bottom.
   *
   * Setup is pinned rather than reached by booking a tournament, so this
   * measures the crowd effect alone and not the prep bill on top of it.
   */
  function takingsAt(setup) {
    let state = openFullCourse(actThreeResort(7));
    state.prestige = 88;
    state.resort.rooms = { standard: 44, suite: 18 };
    state.resort.pricing.roomRate = 220;
    let total = 0;
    for (let d = 0; d < 10; d++) {
      state.resort.setup = setup;
      const out = runDay(state, 3200 + d);
      state = out.state;
      total += out.report.revenue.total;
    }
    return total / 10;
  }
  const easy = takingsAt(0);
  const hard = takingsAt(86);

  assert.ok(hard < easy,
    `conditioning earned MORE than leaving the course alone ($${Math.round(hard)} against `
    + `$${Math.round(easy)}); the run-up is a bonus, not a sacrifice`);

  // And the other direction: a resort that simply stopped trading when
  // conditioned would pass the line above and be a worse bug.
  assert.ok(hard > easy * 0.75,
    `conditioning cost ${Math.round((1 - hard / easy) * 100)}% of takings, which is a collapse `
    + 'rather than a sacrifice');
});

test('the course closes for the championship week', () => {
  let state = actThreeResort(11);
  state.resort.rooms = { standard: 20, suite: 8 };
  state.resort.pricing.roomRate = 200;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };

  const { state: after, report } = runDay(state, 3300);
  assert.equal(report.tournamentDay, true, 'the report has to say what kind of day this was');
  assert.equal(report.groupsPlayed, 0, 'nobody is playing a casual round');
  assert.equal(report.revenue.greenFees, 0, 'and nobody is paying a green fee');
  assert.ok(report.revenue.rooms > 0, 'but the hotel is the fullest it will ever be');
  assert.ok(report.costs.total > 0, 'the bills do not stop');
  assert.equal(after.day, state.day + 1, 'and the day still advances');
});

test('a closed day does not break anything downstream', () => {
  // Every reader of a report — the HUD, the evening screen, the
  // investors, the gate — predates tournaments and must not need to know
  // about them.
  let state = actThreeResort(12);
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  const { state: after, report } = runDay(state, 3400);

  assert.ok(Number.isFinite(report.revenue.total));
  assert.ok(Number.isFinite(report.costs.total));
  assert.ok(Number.isFinite(report.profit));
  assert.ok(Number.isFinite(report.averageSatisfaction));
  assert.ok(report.gate, 'the gate readout still has to exist');
  assert.doesNotThrow(() => runDay(after, 3401), 'and the next day still plays');
});

test('a championship night is a premium, not a blank cheque', () => {
  function soldAt(roomRate) {
    const state = openFullCourse(actThreeResort(13));
    state.resort.rooms = { standard: 20, suite: 8 };
    state.resort.pricing.roomRate = roomRate;
    state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
    return runDay(state, 3600).report.hotel;
  }
  assert.equal(soldAt(150).sold, 28, 'a fair price fills the place');
  assert.ok(soldAt(900).sold < 28, 'a silly price does not');
  assert.equal(soldAt(4000).sold, 0, 'and an absurd one empties it');
  assert.ok(soldAt(150).rate <= 1, 'rate is an occupancy ratio, not a flag');
});

test('the championship resolves, pays, and does not happen twice', () => {
  let state = actThreeResort(15);
  state.resort.setup = 52;
  state.turfQuality = 88;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  const before = state.money;

  const first = playWeek(state, 3500);
  state = first.state;
  assert.ok(first.report.tournament, 'the report has to carry the result');
  assert.ok(state.money > before, 'and the contract has to pay');
  assert.equal(state.tournament, null, 'the booking is spent');
  // Not hosted: this is the three-hole stub, far under the County's
  // difficulty floor, so the week missed. This line used to assert the
  // opposite, because a miss counted as hosted -- which skipped the rung
  // past its own bar and could dead-end the ladder at a missed National.
  // The hit and miss cases are tested directly below.
  assert.equal(first.report.tournament.difficultyMet, false, 'sanity: three holes are under the floor');
  assert.ok(!(state.tournamentsHosted ?? []).includes('countyOpen'),
    'a missed week is not recorded as hosted');

  const second = runDay(state, 3510);
  assert.equal(second.report.tournament ?? null, null,
    'a championship must not resolve twice');
  assert.equal(second.report.tournamentDay, false, 'and the course reopens');
});

// --- Hosting, missing and coming back ---------------------------------

test('a missed County is not hosted, and can be bid for again once the bar lifts', () => {
  // The template course is under the County's floor, so this week misses
  // whatever the field shoots -- a miss that does not depend on the dice.
  const state = openFullCourse(actThreeResort(81));
  state.tournament = newWeek('countyOpen', state.day);
  const { state: after, report } = playWeek(state, 8300);
  assert.ok(!report.tournament.met.includes('target'), 'sanity: the week missed');

  assert.deepEqual(after.tournamentsHosted, [], 'a missed rung is not hosted');
  assert.equal(nextRungFor(after.tournamentsHosted), 'countyOpen',
    'so the County is still the next rung, not the Regional');
  const barredUntil = after.tournamentBars.countyOpen;
  assert.equal(barredUntil, after.day - 1 + BAR_DAYS, 'and it is barred for BAR_DAYS from the last round');

  // The miss cost prestige; put it back so the bar is the only thing
  // standing between the resort and the bid.
  const during = { ...after, prestige: 80, day: barredUntil };
  assert.equal(bidFor(during, 'countyOpen', { holesOpen: 18 }), null,
    'on the last day of the bar the County is still given to somebody else');
  const afterBar = { ...during, day: barredUntil + 1 };
  const booking = bidFor(afterBar, 'countyOpen', { holesOpen: 18 });
  assert.ok(booking, 'and the day after, the resort can bid for it again');
  assert.equal(booking.rung, 'countyOpen');
});

test('a County that hits its target is hosted and opens the Regional', () => {
  // Over seeds, because the winner of sixty is noisy: hosted exactly when
  // the target was met, and at least one week must hit. Measured
  // 2026-10-03: at the County minimum with setup 52, eleven of these
  // twelve seeds hit.
  let hits = 0;
  for (let seed = 100; seed < 106; seed++) {
    const state = atMinimum(openFullCourse(actThreeResort(seed)), 'countyOpen');
    state.resort.setup = 52;
    state.resort.setupTarget = 52;
    state.turfQuality = 92;
    state.tournament = newWeek('countyOpen', state.day);
    const { state: after, report } = playWeek(state, 9900 + seed);
    const hit = report.tournament.met.includes('target');
    assert.deepEqual(after.tournamentsHosted, hit ? ['countyOpen'] : [], `seed ${seed}`);
    assert.equal(nextRungFor(after.tournamentsHosted), hit ? 'regional' : 'countyOpen', `seed ${seed}`);
    if (hit) {
      hits += 1;
      assert.equal(after.tournamentBars?.countyOpen, undefined, 'a hit is not barred');
    }
  }
  assert.ok(hits > 0, 'a well-set County has to be hostable');
});

test('a missed National leaves the act open and the National biddable after the bar', () => {
  // The dead end this replaced: a missed National counted as hosted, the
  // sheet said "The ladder is climbed", and `actThreePassed` could never
  // become true for the rest of the save.
  const state = atMinimum(nationalReady(44), 'national');
  state.tournamentsHosted = ['countyOpen', 'regional'];
  state.resort.setup = 5;
  state.resort.setupTarget = 0;
  state.tournament = newWeek('national', state.day);
  const { state: after, report } = playWeek(state, 8400);
  assert.ok(!report.tournament.met.includes('target'), 'sanity: the botched week missed');

  assert.equal(after.actThreePassed, false, 'missing the National does not pass the act');
  assert.deepEqual(after.tournamentsHosted, ['countyOpen', 'regional'], 'and does not host it');
  assert.equal(nextRungFor(after.tournamentsHosted), 'national', 'so the ladder is not climbed');

  const barredUntil = after.tournamentBars.national;
  const ready = { ...after, prestige: 90 };
  assert.equal(bidFor({ ...ready, day: barredUntil }, 'national', { holesOpen: 18 }), null,
    'barred for BAR_DAYS');
  assert.ok(bidFor({ ...ready, day: barredUntil + 1 }, 'national', { holesOpen: 18 }),
    'and biddable again afterwards');
});

/**
 * A resort that neglected every lever it controls for the week: never
 * conditioned (setup stuck near zero), no
 * groundskeepers so the turf stays wrecked, and a tee interval left tight
 * enough that the field backs up behind itself. Before pace was wired to
 * the field this still cleared roughly 58% of the ceiling on the pace
 * bonus alone, because `report.averageRoundMinutes` was hardcoded 0 on a
 * closed course and 0 is never over target. It should now clear exactly
 * the base fee and nothing more: missing the target pays base only, even
 * though `crowd` (hardcoded true until Plan 2's infrastructure — see
 * docs/known-issues.md) is still individually "met".
 */
function neglectedResort(seed) {
  const state = actThreeResort(seed);
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'groundskeeper');
  state.resort.amenities.push(
    { type: 'grandstands' }, { type: 'overflowParking' },
    { type: 'mediaCentre' }, { type: 'hospitalityPavilion' },
  );
  openFullCourse(state);
  state.resort.setup = 5;       // outside every band, low or high
  state.turfQuality = 20;       // wrecked, and nothing is left to fix it today
  state.resort.pricing.teeInterval = 8; // tight enough to back the field up
  return state;
}

test('a botched championship pays close to base, not 58% of the ceiling', () => {
  for (const rungId of ['countyOpen', 'national']) {
    // Narrowed to the rung's minimum, so the course passes the floor and
    // the miss below is the winner's total. On the template course the
    // floor alone failed it, and this test stopped testing the judge.
    const state = atMinimum(neglectedResort(17), rungId);
    state.tournament = { rung: rungId, day: state.day, resolved: false };
    const { report } = playWeek(state, 3700);
    const result = report.tournament;
    const rung = RUNGS[rungId];

    assert.equal(result.difficultyMet, true, `${rungId}: sanity: the course is at the minimum`);
    assert.ok(!result.met.includes('target'),
      `${rungId}: an unconditioned, untended week must miss the target`);
    assert.ok(!result.met.includes('turf'), `${rungId}: wrecked turf must miss the turf bonus`);
    assert.ok(!result.met.includes('pace'),
      `${rungId}: a tight interval on a neglected week must fail pace too`);

    const ratio = result.paid / rung.purseCeiling;
    assert.ok(ratio < 0.5,
      `${rungId}: a three-condition failure still paid ${(ratio * 100).toFixed(1)}% of the ceiling`);
    // `crowd` is still individually "met" (hardcoded true — not this
    // task's fix), but the target is missed, and it gates everything
    // past the base fee. So the floor is the base fee exactly, not the
    // base fee plus crowd's own share.
    assert.equal(result.paid, rung.baseFee,
      `${rungId}: paid ${result.paid}, expected exactly the ${rung.baseFee} base fee`);
  }
});

// --- Act III's entry point --------------------------------------------

test('settling with the investors opens Act III, once', () => {
  for (const ending of ['bought', 'liquidated']) {
    const state = openFullCourse(actThreeResort(21));
    state.act = 2;
    state.prestige = 80;
    state.investors = { confidence: 50, principal: 200000, bought: false, liquidated: false };
    state.investors[ending] = true;

    const first = runDay(state, 5200);
    assert.equal(first.state.act, 3, `${ending} should open Act III`);
    assert.equal(first.report.actThreeArrived, true, `${ending} should announce it`);

    const second = runDay(first.state, 5201);
    assert.equal(second.state.act, 3);
    assert.equal(second.report.actThreeArrived ?? false, false,
      'the invitation must not arrive twice');
  }
});

test('an unsettled Act II stays in Act II', () => {
  const state = openFullCourse(actThreeResort(22));
  state.act = 2;
  state.investors = { confidence: 50, principal: 200000, bought: false, liquidated: false };
  const { state: after, report } = runDay(state, 5210);
  assert.equal(after.act, 2, 'still answering to the investors');
  assert.equal(report.actThreeArrived ?? false, false);
});

test('a three-hole resort is not invited, however well it is run', () => {
  const state = actThreeResort(23);
  state.act = 2;
  state.prestige = 90;
  state.investors = { confidence: 90, principal: 200000, bought: true, liquidated: false };
  const { state: after } = runDay(state, 5220);
  assert.equal(after.act, 2, 'three holes cannot host a championship');
});

test('the crowd bonus is earned by having somewhere to put them', () => {
  // Both directions. This condition spent its whole life hardcoded true,
  // so a test checking only the passing case would have agreed with the bug.
  function hostWith(types) {
    const state = openFullCourse(actThreeResort(31));
    state.prestige = 90;
    state.resort.setup = 86;
    state.resort.setupTarget = 86;
    state.turfQuality = 95;
    for (const type of types) state.resort.amenities.push({ id: type, type, menu: [] });
    state.tournament = { rung: 'national', day: state.day, resolved: false };
    return playWeek(state, 5300).report.tournament;
  }

  const four = ['grandstands', 'overflowParking', 'mediaCentre', 'hospitalityPavilion'];
  const bare = hostWith(four);
  assert.ok(!bare.met.includes('crowd'),
    'four buildings alone cannot hold a national gallery');

  const helped = hostWith([...four, 'shortCourse', 'brewPub', 'functionRoom']);
  assert.ok(helped.met.includes('crowd'), 'with the property helping, it can');
  // No money compared: both are under the National's floor, so base fee only (crowd's pay: tournaments.test.js).
});

test('the report records what the week was judged on, not only the verdict', () => {
  // setup starts decaying the morning after, so a report that reached
  // into state for it would describe a different course from the one the
  // field played. Recorded where the day settled it.
  // At the County minimum, so the verdict below turns on the winning total
  // rather than failing on the floor whatever the field shot.
  const state = atMinimum(openFullCourse(actThreeResort(51)), 'countyOpen');
  state.prestige = 90;
  // Above the target, so the course is easing down all week and the
  // course played is not the number on the dial.
  state.resort.setup = 64;
  state.resort.setupTarget = 53;
  state.turfQuality = 91;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };

  const { state: after, report } = playWeek(state, 5500);
  const t = report.tournament;

  // The course the field played, read from the day rather than the dial.
  // Started at the target, this test could not tell the two apart once a
  // booked course held its target exactly (`hold` in `nextSetup`): both
  // read 53. Started at 64 against a target of 53, the course eases down
  // 3.5 a day toward it -- measured 2026-10-03, round 1 at 60.5 and round 2
  // (the one judged) at 57 -- so a report that printed the target would
  // say 53 and be wrong.
  assert.equal(t.setup, Math.round(after.resort.setup),
    'the report must name the course the field actually played');
  assert.ok(t.setup > 53, `the report printed ${t.setup}, the target, not the course played`);

  // The invariant that matters: the numbers the report prints and the
  // verdict it prints beside them have to agree. A card saying "set to 50,
  // they wanted 45-60" next to "band missed" is this project's oldest bug,
  // and the judge moving to the winning total does not retire it.
  assert.equal(t.met.includes('target'),
    t.difficultyMet && t.week.winningTotal >= t.week.target.low && t.week.winningTotal <= t.week.target.high,
    'the verdict and the numbers printed beside it have to agree');

  // Floored, not rounded (it was rounded until 2026-10-03): the turf
  // condition is judged on the unrounded figure, so a 77.6 printed as 78
  // sat beside a failed turf condition.
  assert.equal(t.turfQuality, Math.floor(after.turfQuality), 'and what they left the turf at');
  assert.equal(t.met.includes('turf'), t.turfQuality >= TURF_EXPECTED,
    'and the turf printed agrees with the turf verdict');
  assert.equal(t.week.roundLog.at(-1).turfAfter, Math.floor(after.turfQuality),
    'the last round line prints the same floored figure');
  assert.deepEqual(t.band, RUNGS.countyOpen.band, 'and what was being asked for');
  assert.ok(t.field, 'and what they shot');
});

test('the reported profit and the revenue breakdown agree on a championship day', () => {
  // The purse is added to revenue.total long after `profit` is computed,
  // so the report used to announce a loss on the day a resort banked six
  // figures -- and then list the cheque in its own breakdown directly
  // underneath. The money was never wrong; the headline was.
  let state = openFullCourse(actThreeResort(61));
  state.prestige = 90;
  state.resort.setup = 53;
  state.resort.setupTarget = 53;
  state.turfQuality = 92;
  state.tournament = { rung: 'countyOpen', day: state.day, resolved: false };
  state = runDay(state, 5599).state;           // round 1 of 2

  const before = state.money;
  const { state: after, report } = runDay(state, 5600);   // round 2, the verdict

  assert.ok(report.tournament.paid > 0, 'sanity: the week paid something');
  assert.equal(report.profit, report.revenue.total - report.costs.total,
    'the headline must be the rows it sits above');
  assert.equal(Math.round(after.money - before), Math.round(report.profit),
    'and the bank must agree with both');
});

// --- Act III's gate ---------------------------------------------------

function nationalReady(seed) {
  const state = openFullCourse(actThreeResort(seed));
  state.act = 3;
  state.prestige = 90;
  state.turfQuality = 95;
  for (const type of ['grandstands', 'overflowParking', 'mediaCentre',
    'hospitalityPavilion', 'shortCourse', 'brewPub', 'functionRoom']) {
    state.resort.amenities.push({ id: type, type, menu: [] });
  }
  return state;
}

test('the act passes exactly when a national hits its target', () => {
  // Asserted as an invariant over seeds rather than on one lucky seed: the
  // winner of sixty is noisy, and a test that picked a seed where the
  // national happened to land would break the first time anybody tuned
  // the field.
  let passed = 0;
  for (const seed of [41, 42, 43, 44, 45, 46]) {
    const state = atMinimum(nationalReady(seed), 'national');
    state.resort.setup = 86;
    state.resort.setupTarget = 86;
    state.tournament = newWeek('national', state.day);
    const { state: after, report } = playWeek(state, 5400 + seed * 10);
    const hit = report.tournament.met.includes('target');
    assert.equal(Boolean(after.actThreePassed), hit, `seed ${seed}`);
    assert.equal(Boolean(report.actThreePassed), hit);
    if (hit) {
      passed += 1;
      // Announced once, then it stays passed without being announced again.
      const next = runDay(after, 5490 + seed);
      assert.equal(next.state.actThreePassed, true, 'it does not come undone');
      assert.equal(next.report.actThreePassed ?? false, false, 'and is not re-announced');
    }
  }
  assert.ok(passed > 0, 'a well-run national has to be passable');
});

test('a botched national never passes Act III', () => {
  // The other side. Hosting is not passing, or the gate is just an
  // attendance record.
  for (const seed of [42, 43, 44]) {
    const state = atMinimum(nationalReady(seed), 'national');
    state.resort.setup = 5;
    state.resort.setupTarget = 0;
    state.tournament = newWeek('national', state.day);
    const { state: after } = playWeek(state, 5500 + seed * 10);
    assert.ok(!after.actThreePassed, `seed ${seed}: turning up is not delivering`);
  }
});

test('a county open never passes Act III, however perfect', () => {
  // The gate is the national, not the ladder.
  for (const seed of [43, 44, 45]) {
    const state = atMinimum(nationalReady(seed), 'countyOpen');
    state.resort.setup = 52;
    state.resort.setupTarget = 52;
    state.tournament = newWeek('countyOpen', state.day);
    const { state: after } = playWeek(state, 5600 + seed * 10);
    assert.ok(!after.actThreePassed);
  }
});

test('the course is measured against the minimum on the first morning', () => {
  const under = openFullCourse(actThreeResort(80));
  under.tournament = newWeek('countyOpen', under.day);
  const raw = courseDifficultyOf(under.resort.courses[0].holes);
  assert.ok(raw < RUNGS.countyOpen.minDifficulty, 'sanity: the template course is under the County floor');
  const short = playWeek(under, 8000).report.tournament;
  assert.equal(short.difficultyMet, false);
  assert.ok(!short.met.includes('target'), 'under the minimum is a miss whatever the winner shot');
  assert.equal(short.paid, RUNGS.countyOpen.baseFee);

  const enough = atMinimum(openFullCourse(actThreeResort(80)), 'countyOpen');
  enough.tournament = newWeek('countyOpen', enough.day);
  assert.equal(playWeek(enough, 8000).report.tournament.difficultyMet, true);
});

test('a save taken mid-week before the course was measured is measured on its next round', () => {
  // Saves from before the measurement existed carry a week with rounds
  // played and no `difficulty`. Keyed on round 1, the measurement never
  // ran for them, and a null `difficultyMet` failed the floor on a course
  // that was well over it.
  let state = atMinimum(nationalReady(47), 'national');
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.tournament = newWeek('national', state.day);
  state = runDay(state, 8200).state;
  assert.equal(state.tournament.roundsPlayed, 1, 'sanity: one round in');
  delete state.tournament.difficulty;
  delete state.tournament.difficultyMet;

  const t = playWeek(state, 8201).report.tournament;
  assert.equal(t.difficultyMet, true, 'a course at the minimum passes the floor');
  assert.ok(t.difficulty >= RUNGS.national.minDifficulty,
    `and the report carries the measurement, not a zero (${t.difficulty})`);
});

test('a harder course plays harder', () => {
  /*
   * Averaged over seeds, because the design moves the winner only a little.
   * Measured 2026-10-03, a County week (two rounds, setup 60, fair pins) on
   * the template course (40.8) against the same course narrowed to 65:
   *
   *   - over 64 seeds the winner was 1.4 strokes higher at 65, and the
   *     field's two-round average 1.7 higher;
   *   - in blocks of eight seeds the field's gap stayed between +1.4 and
   *     +2.1, but the winner's ran from -1.0 (seeds 81-88, the ones this
   *     test first used) to +4.3. The winner of sixty is the noisiest
   *     number in the week.
   *
   * So the field's average is asserted, and the winner over 24 seeds
   * (+1.6 on these). An earlier version asserted a two-stroke gap on one
   * seed and passed by luck. The honest reading: difficulty barely moves
   * the winner. The rung's minimum works mainly as a floor -- a venue too
   * easy to be one -- and setup and pins are what steer the total.
   */
  const play = (narrowed, seed) => {
    const state = narrowed ? atMinimum(openFullCourse(actThreeResort(seed)), 'national')
      : openFullCourse(actThreeResort(seed));
    state.resort.setup = 60;
    state.resort.setupTarget = 60;
    state.tournament = newWeek('countyOpen', state.day);
    // Same seed, same setup, same pins: only the design differs.
    let out = runDay(state, 8100 + seed * 10);
    let fieldToPar = out.report.tournamentRound.averageToPar;
    for (let i = 1; i < 10 && out.state.tournament && !out.state.tournament.resolved; i++) {
      out = runDay(out.state, 8100 + seed * 10 + i);
      fieldToPar += out.report.tournamentRound.averageToPar;
    }
    return { winner: out.report.tournament.week.winningTotal, field: fieldToPar };
  };
  const seeds = Array.from({ length: 24 }, (_, i) => 81 + i);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const hard = seeds.map((s) => play(true, s));
  const easy = seeds.map((s) => play(false, s));
  const fieldGap = mean(hard.map((r) => r.field)) - mean(easy.map((r) => r.field));
  const winnerGap = mean(hard.map((r) => r.winner)) - mean(easy.map((r) => r.winner));
  assert.ok(fieldGap > 0, `the field averaged ${fieldGap.toFixed(2)} strokes higher on a course at 65 than at 41`);
  assert.ok(winnerGap > 0, `the winner averaged ${winnerGap.toFixed(2)} strokes higher on a course at 65 than at 41`);
});

test('each rung is a week of rounds, closed every day, resolved on the last', () => {
  for (const rungId of ['countyOpen', 'regional', 'national']) {
    let state = openFullCourse(actThreeResort(70));
    state.resort.setup = RUNGS[rungId].band.low + 5;
    state.resort.setupTarget = state.resort.setup;
    state.tournament = newWeek(rungId, state.day);
    const rounds = RUNGS[rungId].rounds;
    for (let r = 1; r <= rounds; r++) {
      const { state: after, report } = runDay(state, 7000 + r);
      assert.equal(report.tournamentDay, true, `${rungId} round ${r}: the course is shut`);
      assert.equal(report.groupsPlayed, 0);
      assert.equal(report.tournamentRound.round, r);
      assert.equal(report.tournamentRound.rounds, rounds);
      if (r < rounds) {
        assert.equal(report.tournament ?? null, null, `${rungId}: no verdict after round ${r}`);
        assert.equal(after.tournament.roundsPlayed, r);
      } else {
        assert.ok(report.tournament, `${rungId}: the verdict arrives with the last round`);
        assert.equal(after.tournament, null);
      }
      state = after;
    }
    assert.equal(runDay(state, 7100).report.tournamentDay, false, 'and then the course reopens');
  }
});

test('the same sixty play every round', () => {
  let state = openFullCourse(actThreeResort(71));
  state.tournament = newWeek('national', state.day);
  state = runDay(state, 7200).state;
  const handicaps = state.tournament.field.handicaps;
  const totalsAfterOne = state.tournament.field.totals;
  state = runDay(state, 7201).state;
  assert.deepEqual(state.tournament.field.handicaps, handicaps);
  assert.notDeepEqual(state.tournament.field.totals, totalsAfterOne, 'and their totals grow');
});

test('the pins set before a round are the pins it is played with', () => {
  let state = openFullCourse(actThreeResort(72));
  state.tournament = newWeek('regional', state.day);
  state = runDay(state, 7300).state;
  state.tournament = withPins(state.tournament, 'brutal');
  const { state: after, report } = runDay(state, 7301);
  assert.equal(report.tournamentRound.pins, 'brutal');
  assert.equal(after.tournament.roundSettings.pins, 'brutal', 'and they stay set');
});

test('each round is played in that day\'s weather and says so', () => {
  const state = openFullCourse(actThreeResort(73));
  state.tournament = newWeek('countyOpen', state.day);
  const { report } = runDay(state, 7400);
  assert.equal(report.tournamentRound.weather, report.weather.key);
});

test('the playback shows the field', () => {
  // A championship used to play to an empty course on screen.
  const state = openFullCourse(actThreeResort(74));
  state.tournament = newWeek('countyOpen', state.day);
  const { timeline } = runDay(state, 7500);
  assert.equal(timeline.filter((e) => e.type === 'teeOff').length, 20);
  assert.ok(timeline.some((e) => e.type === 'shot'));
});

test('nothing the playback needs is saved into the report history', () => {
  const state = openFullCourse(actThreeResort(75));
  state.tournament = newWeek('countyOpen', state.day);
  const { report } = playWeek(state, 7600);
  assert.equal(report.tournament.field.playback, undefined);
  assert.equal(report.tournament.field.playerToPar, undefined);
});

test('a save taken between rounds finishes the week identically', () => {
  let state = openFullCourse(actThreeResort(76));
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.tournament = newWeek('national', state.day);
  state = runDay(state, 7700).state;
  state = runDay(state, 7701).state;

  const straight = runDay(runDay(state, 7702).state, 7703).report.tournament;
  const reloaded = deserialize(serialize(state));
  const resumed = runDay(runDay(reloaded, 7702).state, 7703).report.tournament;
  assert.deepEqual(resumed, straight);
});

test('the week\'s pace is every round, not the last', () => {
  // A week whose slow round is not the last one, or judging only the last
  // round would pass too. The first version of this test had every round
  // on pace and could not fail. Found by search, 2026-10-03: a 10-minute
  // interval on this resort plays the clear first and fair last rounds at
  // 265 and 274 minutes against a target of 288, and the drizzly middle
  // round at 305.
  const state = openFullCourse(actThreeResort(78));
  state.resort.pricing.teeInterval = 10;
  state.tournament = newWeek('regional', state.day);
  const { report } = playWeek(state, 7800);
  const log = report.tournament.week.roundLog;
  assert.ok(log.slice(0, -1).some((r) => !r.paceOnTarget) && log.at(-1).paceOnTarget,
    `precondition: a slow early round and an on-pace last one, got ${log.map((r) => r.paceOnTarget)}`);
  assert.ok(!report.tournament.met.includes('pace'), 'one slow round is a slow week');
});

test('a booked course already at its target stays there, and holding it is billed', () => {
  // Arrival used to switch conditioning off, so the next morning decayed
  // the course 3.5 below its target and the morning after climbed it back
  // and billed the prep for it. Measured 2026-10-03 on this national held
  // at 86: 82.5, 86, 82.5, 86 for ten days, a week of rounds played at 83,
  // 86, 83, 86, and $5,400 of prep on every other day. Checked across the
  // run-up's last days and every round, because the bug showed only on
  // alternate days and a one-day test would have passed half the time.
  //
  // The bill is the other half. Holding the course was briefly free once
  // it stopped dipping; it is billed every day of the booking, because
  // keeping greens firm is the crew's job as much as making them firm.
  let state = openFullCourse(actThreeResort(80));
  // Heavy rain now softens a held course (weather.js, setupSoften), so
  // this is a claim about dry days. Weather seed 80 has none wetter than
  // blowing hard on days 1-7; asserted per day below so a change to the
  // weather roll fails loudly rather than as a mystery slip.
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.tournament = { rung: 'national', day: state.day + 3, resolved: false };
  for (let d = 0; d < 7; d++) {
    const { state: after, report } = runDay(state, 8000 + d);
    assert.equal(report.weather.key === 'rain' || report.weather.key === 'storm', false,
      `precondition: day ${d} is ${report.weather.key}, which softens the course by design`);
    assert.equal(after.resort.setup, 86, `day ${d}: the course slipped to ${after.resort.setup}`);
    assert.equal(report.costs.championshipPrep, conditioningCostPerDay('national'),
      `day ${d}: holding the course at its target went unbilled`);
    if (report.tournamentRound) assert.equal(report.tournamentRound.setup, 86, `round ${report.tournamentRound.round}`);
    state = after;
  }
  assert.equal(state.tournament, null, 'sanity: the week was played through');
});

// --- The turf during the week -----------------------------------------

/** A national on its first morning, turf at `turf`, `keepers` on the crew. */
function nationalWeekWith(keepers, turf, seed) {
  const state = atMinimum(nationalReady(seed), 'national');
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'groundskeeper');
  for (let i = 0; i < keepers; i++) state.resort.staff.push({ role: 'groundskeeper' });
  state.resort.setup = 86;
  state.resort.setupTarget = 86;
  state.turfQuality = turf;
  state.tournament = newWeek('national', state.day);
  return state;
}

test('greens that arrive only just good enough die by the last round', () => {
  // The Act III spec's promise: "greens that die by Saturday". The course
  // is shut to the public, so before this the week was the quietest the
  // turf had ever had and could only improve.
  for (const seed of [90, 91, 92]) {
    const t = playWeek(nationalWeekWith(6, TURF_EXPECTED + 2, seed), 9000 + seed).report.tournament;
    assert.ok(t.turfQuality < TURF_EXPECTED,
      `seed ${seed}: six keepers held the turf at ${t.turfQuality} through a national`);
    assert.ok(!t.met.includes('turf'));
  }
});

test('a crew with real margin holds the turf through the week', () => {
  for (const seed of [90, 91, 92]) {
    const t = playWeek(nationalWeekWith(10, TURF_EXPECTED + 2, seed), 9000 + seed).report.tournament;
    assert.ok(t.turfQuality >= TURF_EXPECTED,
      `seed ${seed}: ten keepers let the turf fall to ${t.turfQuality}`);
    assert.ok(t.met.includes('turf'));
  }
});

// --- Weather on the setup climb (run-up spec 2026-10-04 §3) ------------

test('a run of heavy rain slows the crew\'s climb toward a national', () => {
  // Weather seeds found by search: 11621 gives heavy rain on days 1-3 and
  // 6 gives fair on the same days. Asserted as a precondition so a change
  // to the weather roll cannot quietly turn this into a fair-against-fair
  // comparison that passes for the wrong reason.
  function climbIn(weatherSeed, expected) {
    let state = openFullCourse(actThreeResort(40));
    state.weatherSeed = weatherSeed;
    state.resort.staff = state.resort.staff.filter((m) => m.role !== 'groundskeeper');
    for (let i = 0; i < 8; i++) state.resort.staff.push({ role: 'groundskeeper' });
    state.resort.setup = 40;
    state.resort.setupTarget = 86;
    state.tournament = newWeek('national', state.day + RUN_UP_DAYS);
    const start = state.resort.setup;
    for (let d = 0; d < 3; d++) {
      const { state: after, report } = runDay(state, 4600 + d);
      assert.equal(report.weather.key, expected, `precondition: day ${state.day} under seed ${weatherSeed}`);
      state = after;
    }
    return state.resort.setup - start;
  }
  const fair = climbIn(6, 'fair');
  const rain = climbIn(11621, 'rain');
  assert.ok(Math.abs(fair - 3 * 8 * 0.8) < 1e-9, `three fair days with eight keepers climbed ${fair.toFixed(2)}`);
  assert.ok(rain < fair / 2,
    `three days of heavy rain climbed ${rain.toFixed(2)} against ${fair.toFixed(2)} in fair weather`);
});

test('heavy rain and storms soften a held course on the real day', () => {
  // Through runDay rather than nextSetup alone, so a day.js that stopped
  // passing the sky's softening on would fail here. Weather seeds found by
  // search: 14 rains on day 1, 81 storms on day 1; asserted as
  // preconditions. Held exactly at its target with a full crew, the course
  // reads target - setupSoften that evening (it is not climbing today, so
  // nothing is put back until tomorrow).
  for (const [weatherSeed, key] of [[14, 'rain'], [81, 'storm']]) {
    let state = openFullCourse(actThreeResort(41));
    state.weatherSeed = weatherSeed;
    for (let i = 0; i < 2; i++) state.resort.staff.push({ role: 'groundskeeper' });
    state.resort.setup = 86;
    state.resort.setupTarget = 86;
    state.tournament = newWeek('national', state.day + RUN_UP_DAYS);
    const { state: after, report } = runDay(state, 4700);
    assert.equal(report.weather.key, key, `precondition: weather seed ${weatherSeed} day ${state.day}`);
    const soften = CONDITIONS[key].setupSoften;
    assert.ok(soften > 0, `sanity: ${key} softens`);
    assert.equal(after.resort.setup, 86 - soften,
      `${key}: a course held at 86 read ${after.resort.setup} that evening`);
  }
});

// --- The officials' practice round (run-up spec 2026-10-04 §2) ---------

/** A National booked today, with the crew asked for the middle of its band. */
function nationalRunUp(seed, runUp = RUN_UP_DAYS) {
  const state = atMinimum(nationalReady(seed), 'national');
  state.resort.setup = 30;
  state.resort.setupTarget = 86;
  state.tournament = newWeek('national', state.day + runUp);
  return state;
}

test('the officials play the course once, eleven days before the first round', () => {
  let state = nationalRunUp(61);
  // Three keepers, who will not have the course at 86 by round 1, so the
  // projection has something to say and an off-by-one in its day count
  // shows (a crew that arrives early holds at the target either way).
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'groundskeeper');
  for (let i = 0; i < 3; i++) state.resort.staff.push({ role: 'groundskeeper' });
  const roundOne = state.tournament.day;
  const practiceDay = roundOne - PRACTICE_DAYS_BEFORE;
  // The run-up's middle evening: on a 21-day run-up booked today, the
  // evening of day + 10, with ten days left to act on it.
  assert.equal(practiceDay, state.day + 10);
  let seen = 0;
  let practiced = null;
  for (let i = 0; state.day < roundOne; i++) {
    const before = state;
    const { state: after, report } = runDay(state, 6100 + i);
    if (report.day === practiceDay) {
      seen += report.practiceRound ? 1 : 0;
      practiced = { before, after, report };
    } else {
      assert.equal(report.practiceRound, undefined, `no practice round on day ${report.day}`);
      if (report.day < practiceDay) assert.equal(after.tournament.practice, null);
    }
    state = after;
  }
  assert.equal(seen, 1, 'exactly one practice round');
  assert.equal(state.tournament.day, roundOne, 'sanity: the run-up ended on the eve of round 1');

  const { after, report } = practiced;
  const p = report.practiceRound;
  assert.equal(p.rung, 'national');
  assert.deepEqual(p.target, RUNGS.national.target);
  assert.equal(p.minDifficulty, RUNGS.national.minDifficulty);
  // Stored on the week, as the report has it, and carried to round 1.
  const { rung, target, minDifficulty, ...forecast } = p;
  assert.deepEqual(after.tournament.practice, { day: practiceDay, ...forecast });
  assert.deepEqual(state.tournament.practice, after.tournament.practice,
    'the forecast is kept, not recomputed, for the rest of the run-up');
  // Survives a save.
  assert.deepEqual(deserialize(serialize(after)).tournament.practice, after.tournament.practice);

  // The setup it assumed is this evening's course taken forward to the
  // round-1 morning: eleven more updates (the mornings of d+1 through
  // round 1). Off by one either way and the card quotes the wrong figure.
  const keepers = after.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  assert.equal(p.setupAtRoundOne, projectSetup({
    setup: after.resort.setup, target: after.resort.setupTarget, keepers, days: PRACTICE_DAYS_BEFORE,
  }));
  assert.ok(p.setupAtRoundOne > after.resort.setup, 'sanity: the crew is still climbing');
  assert.ok(p.setupAtRoundOne < 86, `sanity: and will fall short (${p.setupAtRoundOne})`);
  // The course as it will be laid out on the first morning.
  assert.equal(p.difficulty, courseDifficultyOf(playableHolesOn(after, roundOne)));
  // And the whole forecast is the documented call on the evening's state:
  // the course projected to the evening before round 1 (ten more updates),
  // the crew and target as they stand, and a seed from the save and the
  // day rather than from the day's rng.
  assert.deepEqual(forecast, practiceForecast(playableHolesOn(after, roundOne), {
    rungId: 'national',
    setup: projectSetup({
      setup: after.resort.setup, target: after.resort.setupTarget, keepers,
      days: PRACTICE_DAYS_BEFORE - 1,
    }),
    keepers,
    target: after.resort.setupTarget,
    turfQuality: after.turfQuality,
    teeInterval: after.resort.pricing.teeInterval,
    seed: practiceSeed(after.seed, practiceDay),
  }));
  assert.ok(p.low <= p.median && p.median <= p.high);

  // The card prints the report's numbers, and the sheet the stored ones.
  const card = championshipCards(report, after).find((c) => c.id === `practice-round-${practiceDay}`);
  assert.ok(card, 'the practice round has a card');
  assert.ok(card.prompt.includes(`about ${toParText(p.median)}`), card.prompt);
  assert.ok(card.prompt.includes(`${toParText(p.low)} to ${toParText(p.high)}`), card.prompt);
  const sheet = computeChampionshipData(after).booked;
  assert.deepEqual(sheet.practice, after.tournament.practice);
  assert.ok(practiceNote(sheet).includes(`about ${toParText(p.median)}`));
});

test('a booking made five days before round 1 never gets a practice round', () => {
  let state = nationalRunUp(62, 5);
  const roundOne = state.tournament.day;
  for (let i = 0; state.day < roundOne; i++) {
    const { state: after, report } = runDay(state, 6200 + i);
    assert.equal(report.practiceRound, undefined, `day ${report.day}`);
    assert.equal(after.tournament.practice, null);
    state = after;
  }
});

test('the practice round changes no other number in the day', () => {
  // The same practice evening run twice: once as it is, and once with the
  // practice already recorded so the day skips it. The forecast runs on a
  // seed of its own, so the day's rng -- and everything drawn from it --
  // must not notice.
  let state = nationalRunUp(63);
  const practiceDay = state.tournament.day - PRACTICE_DAYS_BEFORE;
  for (let i = 0; state.day < practiceDay; i++) state = runDay(state, 6300 + i).state;
  const skipped = structuredClone(state);
  skipped.tournament.practice = { day: practiceDay, setupAtRoundOne: 0, difficulty: 0, median: 0, low: 0, high: 0, samples: 0 };

  const held = runDay(state, 6399);
  const notHeld = runDay(skipped, 6399);
  assert.ok(held.report.practiceRound, 'sanity: the first run holds the practice round');
  assert.equal(notHeld.report.practiceRound, undefined, 'and a week that has had one is never given another');
  assert.deepEqual(notHeld.state.tournament.practice, skipped.tournament.practice);

  assert.equal(held.report.revenue.total, notHeld.report.revenue.total);
  const { practiceRound, ...heldReport } = held.report;
  assert.deepEqual(heldReport, notHeld.report);
  const strip = (s) => ({ ...s, tournament: { ...s.tournament, practice: null }, history: s.history.slice(0, -1) });
  assert.deepEqual(strip(held.state), strip(notHeld.state));
  // And the day after, with the forecast on the week, plays the same too.
  assert.deepEqual(
    runDay(held.state, 6400).report.revenue,
    runDay(notHeld.state, 6400).report.revenue,
  );
});

test("the practice round measures the course the field will meet, not tonight's closures", () => {
  // A closure added on the practice morning with `days` left is in force
  // that day and the next days - 1: eleven days ends on the eve of round 1,
  // twelve reaches round 1 itself. Only the second is on the course the
  // field meets, so only the second may move the forecast's difficulty.
  let state = nationalRunUp(64);
  const roundOne = state.tournament.day;
  const practiceDay = roundOne - PRACTICE_DAYS_BEFORE;
  for (let i = 0; state.day < practiceDay; i++) state = runDay(state, 6400 + i).state;
  function difficultyWith(days) {
    const s = structuredClone(state);
    if (days) s.conditions = addCondition(s.conditions ?? [], { id: 'greensWorks', days, holesClosed: 3 });
    const { report } = runDay(s, 6499);
    assert.ok(report.practiceRound, `sanity: a practice round with a ${days}-day closure`);
    return report.practiceRound.difficulty;
  }
  const whole = difficultyWith(0);
  assert.equal(difficultyWith(2), whole, 'a two-day closure is over long before round 1');
  assert.equal(difficultyWith(11), whole, 'nor one that reopens on the eve of round 1');
  const shut = difficultyWith(12);
  assert.equal(shut, courseDifficultyOf(openHoles(state).slice(0, 15)),
    'a closure still running on round 1 is the course they will play');
  assert.notEqual(shut, whole, 'and the closure has to matter for this to mean anything');
});

// --- Championship events reach the course and the next round --------------

/** Every championship choice whose effects are exactly `wanted`, as
 * { id, index }, so these tests follow the library rather than its ids. */
function choicesWith(wanted) {
  const found = [];
  for (const event of CHAMPIONSHIP_EVENTS) {
    event.choices.forEach((choice, index) => {
      if (JSON.stringify(choice.effects) === JSON.stringify(wanted)) found.push({ id: event.id, index });
    });
  }
  return found;
}

/** A regional with round 1 played today, so tonight is a week evening. */
function regionalAfterRoundOne(seed) {
  let state = openFullCourse(actThreeResort(seed));
  state.resort.setup = 70;
  state.resort.setupTarget = 70;
  state.tournament = newWeek('regional', state.day);
  return runDay(state, seed * 100).state;
}

test('a week event\'s handicap plays the very next round, on the pins\' scale, then clears', () => {
  // Two events tonight that each ease the next round by half a pin
  // setting sum to a whole one, and a whole one is easy pins: the round
  // must be the one easy pins would have played, shot for shot. That is
  // the proof it reached `playField` at the scale the card promised.
  const easing = choicesWith({ nextRound: { handicap: -0.375 } });
  assert.ok(easing.length >= 2, `need two pure half-setting easings, found ${easing.length}`);
  const tonight = regionalAfterRoundOne(81);
  let evented = applyEventChoice(tonight, easing[0].id, easing[0].index);
  evented = applyEventChoice(evented, easing[1].id, easing[1].index);
  assert.equal(evented.tournament.roundSettings.eventHandicap, -0.75);

  const twin = { ...tonight, tournament: withPins(tonight.tournament, 'easy') };
  const withEvents = runDay(evented, 8101);
  const withPinsOnly = runDay(twin, 8101);
  const strip = ({ pins, eventHandicap, eventPace, ...rest }) => rest;
  assert.deepEqual(strip(withEvents.report.tournamentRound), strip(withPinsOnly.report.tournamentRound));
  assert.deepEqual(withEvents.state.tournament.field.totals, withPinsOnly.state.tournament.field.totals);
  assert.equal(withEvents.report.tournamentRound.eventHandicap, -0.75, 'the round says what it was played with');

  // And only that round.
  assert.equal(withEvents.state.tournament.roundSettings.eventHandicap, 0);
  assert.equal(withEvents.state.tournament.roundSettings.eventPace, 1);
  assert.equal(withEvents.state.tournament.roundSettings.pins, 'fair', 'the player\'s pins are untouched');
});

test('a week event\'s pace slows the very next round, then clears', () => {
  const slowing = CHAMPIONSHIP_EVENTS.flatMap((e) => e.choices.map((c, index) => ({ id: e.id, index, c })))
    .find(({ c }) => Object.keys(c.effects).join() === 'nextRound' && c.effects.nextRound.pace > 1
      && c.effects.nextRound.handicap === undefined);
  assert.ok(slowing, 'need a choice that only slows the next round');
  const tonight = regionalAfterRoundOne(82);
  // Tee times far enough apart that nothing queues, so the round is the
  // sum of its holes and the multiplier shows exactly.
  tonight.resort.pricing.teeInterval = 30;
  const evented = applyEventChoice(tonight, slowing.id, slowing.index);
  const slowed = runDay(evented, 8201);
  const plain = runDay(tonight, 8201);
  const ratio = slowed.report.tournamentRound.averageRoundMinutes / plain.report.tournamentRound.averageRoundMinutes;
  assert.ok(Math.abs(ratio - slowing.c.effects.nextRound.pace) < 0.01,
    `pace ${slowing.c.effects.nextRound.pace} made the round ${ratio.toFixed(3)} times as long`);
  assert.equal(slowed.report.tournamentRound.averageToPar, plain.report.tournamentRound.averageToPar);
  assert.equal(slowed.report.tournamentRound.eventPace, slowing.c.effects.nextRound.pace);
  assert.equal(slowed.state.tournament.roundSettings.eventPace, 1);

  const after = runDay(slowed.state, 8202);
  assert.equal(after.report.tournamentRound.eventPace, 1, 'the round after is back to normal');
});

test('a pending next-round effect survives a save', () => {
  const easing = choicesWith({ nextRound: { handicap: -0.375 } })[0];
  const evented = applyEventChoice(regionalAfterRoundOne(83), easing.id, easing.index);
  const reloaded = deserialize(serialize(evented));
  assert.deepEqual(reloaded.tournament.roundSettings, evented.tournament.roundSettings);
  assert.deepEqual(runDay(reloaded, 8301).report.tournamentRound, runDay(evented, 8301).report.tournamentRound);
});

test('a championship event\'s setup lands on the course now, inside 0-100', () => {
  const event = CHAMPIONSHIP_EVENTS.find((e) => e.choices.some((c) => c.effects.setup > 0));
  const index = event.choices.findIndex((c) => c.effects.setup > 0);
  const { setup, moneyDays = 0 } = event.choices[index].effects;
  const state = openFullCourse(actThreeResort(84));
  state.tournament = newWeek('countyOpen', state.day + 15);
  state.resort.setup = 40;
  const after = applyEventChoice(state, event.id, index);
  assert.equal(after.resort.setup, 40 + setup);
  assert.equal(after.money, state.money + moneyDays * RUNGS.countyOpen.prepPerDay,
    'and the rest of the choice with it, priced at the booked rung');
  assert.equal(state.resort.setup, 40, 'without touching the state it was given');

  state.resort.setup = 99;
  assert.equal(applyEventChoice(state, event.id, index).resort.setup, 100);
  const softening = CHAMPIONSHIP_EVENTS.find((e) => e.choices.some((c) => c.effects.setup < 0));
  const soft = softening.choices.findIndex((c) => c.effects.setup < 0);
  state.resort.setup = 1;
  assert.equal(applyEventChoice(state, softening.id, soft).resort.setup, 0);
});

test('a next-round effect answered with nothing booked is dropped, not stored', () => {
  // Cannot happen in play (week events fire only on week evenings before a
  // round), but a choice must never throw or invent a booking.
  const easing = choicesWith({ nextRound: { handicap: -0.375 } })[0];
  const state = actThreeResort(85);
  state.tournament = null;
  assert.equal(applyEventChoice(state, easing.id, easing.index).tournament, null);
});

test('the sheet shows a pending next-round effect beside the pins', () => {
  // The player sets the pins the morning after answering the event, and
  // the event moves the same round: the sheet has to say so, read off the
  // week playField will be handed.
  const easing = choicesWith({ nextRound: { handicap: -0.375 } })[0];
  const slowing = CHAMPIONSHIP_EVENTS.flatMap((e) => e.choices.map((c, index) => ({ id: e.id, index, c })))
    .find(({ c }) => Object.keys(c.effects).join() === 'nextRound' && c.effects.nextRound.pace > 1);
  const tonight = regionalAfterRoundOne(86);
  const before = computeChampionshipData(tonight).booked;
  assert.equal(before.inWeek, true);
  assert.equal(before.pendingEffect, null, 'nothing pending, nothing said');
  assert.equal(before.eventHandicap, 0);
  assert.equal(before.eventPace, 1);

  let evented = applyEventChoice(tonight, easing.id, easing.index);
  evented = applyEventChoice(evented, slowing.id, slowing.index);
  const pending = computeChampionshipData(evented).booked;
  assert.equal(pending.eventHandicap, -0.375);
  assert.equal(pending.eventPace, slowing.c.effects.nextRound.pace);
  assert.equal(pending.pendingEffect, `Called for this round: it plays half a pin setting easier, `
    + `and every hole plays ${Math.round((slowing.c.effects.nextRound.pace - 1) * 100)}% slower.`);

  // And gone once the round has used it.
  const played = runDay(evented, 8601).state;
  assert.equal(computeChampionshipData(played).booked.pendingEffect, null);
});

// --- The championship's rhythm (run-up spec 2026-10-04 §4) ----------------

const CHAMPIONSHIP_BY_ID = new Map(CHAMPIONSHIP_EVENTS.map((e) => [e.id, e]));
const RHYTHM_SEEDS = 30;

/**
 * A booking at `rungId` made this morning, three weeks out, played from
 * the booked day to the verdict. Every championship card is answered, with
 * a choice that moves the next round where the event has one (so a test
 * can follow it there); ordinary cards are left, as a player who ignores
 * them would leave them. Each evening keeps the state the day ended on,
 * before any answer.
 *
 * `practice: false` books the week with its practice round already on it,
 * so the evening skips the forecast -- half the cost of a run-up in this
 * test -- while still being the practice evening: what keeps ordinary
 * events off it is the day, not whether the forecast has been taken.
 */
function playRhythm(rungId, seed, { practice = true } = {}) {
  let state = atMinimum(nationalReady(seed), rungId);
  state.resort.setup = 40;
  state.resort.setupTarget = Math.round((RUNGS[rungId].band.low + RUNGS[rungId].band.high) / 2);
  state.tournament = newWeek(rungId, state.day + RUN_UP_DAYS);
  if (!practice) {
    state.tournament.practice = { day: 0, setupAtRoundOne: 0, difficulty: 0, median: 0, low: 0, high: 0, samples: 0 };
  }
  const booking = { bookedDay: state.day, firstRoundDay: state.tournament.day, rounds: state.tournament.rounds };
  let plan = null;
  const evenings = [];
  for (let i = 0; state.tournament && i < 40; i++) {
    const { state: after, report } = runDay(state, seed * 1000 + i);
    plan = plan ?? after.tournament?.eventPlan ?? null;
    const pending = report.pendingEvent;
    const event = pending ? CHAMPIONSHIP_BY_ID.get(pending.id) : null;
    let next = after;
    let champ = null;
    if (event) {
      const moving = event.choices.findIndex((c) => c.effects.nextRound);
      const index = moving >= 0 ? moving : 0;
      next = applyEventChoice(after, pending.id, index);
      champ = { id: event.id, phase: event.phase, index, nextRound: event.choices[index].effects.nextRound ?? null };
    }
    evenings.push({ day: report.day, report, after, champ, ordinary: Boolean(pending && !event) });
    state = next;
  }
  return { ...booking, seed, practice, plan, evenings, final: state };
}

/** Every rung, played over RHYTHM_SEEDS seeds; computed once and shared.
 * The first five per rung hold the real practice round. */
let rhythmRuns = null;
function rhythm() {
  if (!rhythmRuns) {
    rhythmRuns = [];
    for (const rungId of ['countyOpen', 'regional', 'national']) {
      for (let seed = 1; seed <= RHYTHM_SEEDS; seed++) {
        rhythmRuns.push({ rungId, ...playRhythm(rungId, 700 + seed, { practice: seed <= 5 }) });
      }
    }
  }
  return rhythmRuns;
}

test('every championship gets its events, on the rhythm the plan drew', () => {
  const tally = {};
  for (const run of rhythm()) {
    const { rungId, bookedDay, firstRoundDay, rounds, plan, evenings, seed } = run;
    const where = `${rungId} seed ${seed}`;
    const lastRound = firstRoundDay + rounds - 1;
    assert.equal(evenings.at(-1).day, lastRound, `${where}: sanity, played to the verdict`);
    assert.ok(evenings.at(-1).report.tournament, `${where}: sanity, and judged`);

    // The plan is the documented draw, on a seed of its own.
    assert.deepEqual(plan, drawEventPlan(makeRng(eventPlanSeed(seed, firstRoundDay)),
      { bookedDay, firstRoundDay, rounds }), where);

    const champDays = evenings.filter((e) => e.champ).map((e) => e.day);
    assert.deepEqual(champDays, [...plan.runUp, ...plan.week], `${where}: a card on every planned evening, and only then`);
    const runUp = evenings.filter((e) => e.champ?.phase === 'runUp');
    const week = evenings.filter((e) => e.champ?.phase === 'week');
    assert.ok(runUp.length === 1 || runUp.length === 2, `${where}: ${runUp.length} run-up events`);
    assert.ok(week.length >= 1, `${where}: a week with no event`);

    for (const e of evenings) {
      const isRound = e.day >= firstRoundDay;
      // A run-up evening shows a run-up event and a week evening a week
      // one, so a next-round effect can never wait three weeks for round 1.
      if (e.champ) {
        assert.equal(e.champ.phase, e.day <= firstRoundDay - 2 ? 'runUp' : 'week', `${where}, day ${e.day}`);
      }
      // No ordinary event on a round day, the practice evening, or any
      // evening the championship had a card (one slot, so one card).
      if (e.ordinary) {
        assert.ok(!isRound, `${where}: an ordinary event on round day ${e.day}`);
        assert.notEqual(e.day, firstRoundDay - PRACTICE_DAYS_BEFORE, `${where}: on the practice evening`);
      }
      if (run.practice && e.day === firstRoundDay - PRACTICE_DAYS_BEFORE) {
        assert.ok(e.report.practiceRound, `${where}: sanity, practice held`);
      }
      // Nothing on the final round's evening: there is no round left to
      // affect, and the booking has already gone.
      if (e.day === lastRound) assert.equal(e.report.pendingEvent, null, `${where}: a card after the verdict`);
    }

    // A week event's next-round effect lands on the very next round.
    for (const e of evenings.filter((x) => x.champ?.nextRound)) {
      const tomorrow = evenings.find((x) => x.day === e.day + 1);
      assert.ok(tomorrow?.report.tournamentRound, `${where}: no round the day after ${e.day}`);
      assert.equal(tomorrow.report.tournamentRound.eventHandicap, e.champ.nextRound.handicap ?? 0, where);
      assert.equal(tomorrow.report.tournamentRound.eventPace, e.champ.nextRound.pace ?? 1, where);
    }

    const t = (tally[rungId] ??= { runs: 0, runUp: 0, week: 0, ordinaryRunUp: 0, runUpTwo: 0, nextRound: 0 });
    t.runs += 1;
    t.runUp += runUp.length;
    t.week += week.length;
    t.runUpTwo += runUp.length === 2 ? 1 : 0;
    t.ordinaryRunUp += evenings.filter((e) => e.ordinary).length;
    t.nextRound += evenings.filter((e) => e.champ?.nextRound).length;
  }
  // Ordinary run-up days are still ordinary days.
  for (const [rungId, t] of Object.entries(tally)) {
    assert.ok(t.ordinaryRunUp > 0, `${rungId}: no ordinary event in any run-up`);
    assert.ok(t.nextRound > 0, `${rungId}: sanity, a next-round effect was followed`);
  }
  if (process.env.RHYTHM_REPORT) console.log(JSON.stringify(tally));
});

test('no championship event repeats within a booking, and the save remembers each', () => {
  for (const run of rhythm()) {
    const ids = run.evenings.filter((x) => x.champ).map((x) => x.champ.id);
    assert.equal(new Set(ids).size, ids.length, `${run.rungId} seed ${run.seed}: ${ids}`);
    assert.deepEqual(run.final.championshipEventsSeen, ids);
    // The ordinary memory never hears of them.
    for (const id of ids) assert.ok(!run.final.eventsSeen.includes(id), id);
  }
});

test('a ladder\'s second booking draws from what the first left unseen', () => {
  // The County's events, remembered on the save, are not offered at the
  // Regional while the Regional has others to show.
  const county = rhythm().find((r) => r.rungId === 'countyOpen' && r.seed === 702);
  const shownAtCounty = new Set(county.final.championshipEventsSeen);
  let state = atMinimum(nationalReady(702), 'regional');
  state.championshipEventsSeen = [...county.final.championshipEventsSeen];
  state.tournament = newWeek('regional', state.day + RUN_UP_DAYS);
  for (let i = 0; state.tournament && i < 40; i++) {
    const { state: after, report } = runDay(state, 70200 + i);
    const event = report.pendingEvent && CHAMPIONSHIP_BY_ID.get(report.pendingEvent.id);
    if (event) assert.ok(!shownAtCounty.has(event.id), `${event.id} again at the Regional`);
    state = event ? applyEventChoice(after, event.id, 0) : after;
  }
});

test('a plan is drawn once, the same every time, and survives a save', () => {
  const a = playRhythm('regional', 731);
  const b = playRhythm('regional', 731);
  assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(a.evenings.map((e) => e.report.pendingEvent), b.evenings.map((e) => e.report.pendingEvent));
  // Stored on the booking from the first evening, and never redrawn.
  for (const e of a.evenings.slice(0, -1)) assert.deepEqual(e.after.tournament.eventPlan, a.plan, `day ${e.day}`);

  // A save on every run-up and week evening reloads and plays on the same.
  for (const [i, e] of a.evenings.entries()) {
    if (!e.after.tournament) continue;
    const reloaded = deserialize(serialize(e.after));
    assert.deepEqual(reloaded.tournament.eventPlan, a.plan);
    const seed = 731 * 1000 + i + 1;
    const fromSave = runDay(reloaded, seed);
    const straight = runDay(e.after, seed);
    assert.deepEqual(fromSave.report.pendingEvent, straight.report.pendingEvent, `after day ${e.day}`);
    assert.deepEqual(fromSave.state.championshipEventsSeen, straight.state.championshipEventsSeen);
  }
});

test('a save taken with a championship card unanswered reloads and answers the same', () => {
  let checked = 0;
  for (const run of rhythm().filter((r) => r.seed <= 705)) {
    for (const e of run.evenings.filter((x) => x.champ)) {
      const reloaded = deserialize(serialize(e.after));
      const pending = reloaded.history.at(-1).pendingEvent;
      assert.deepEqual(pending, e.report.pendingEvent, 'the card is still waiting');
      pending.choices.forEach((choice, index) => {
        assert.deepEqual(applyEventChoice(reloaded, pending.id, index), applyEventChoice(e.after, pending.id, index),
          `${pending.id} choice ${index}`);
      });
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `sanity: ${checked} cards checked`);
});

test('drawing the plan changes no other number in the day', () => {
  // The booked day run twice: once drawing its plan, and once with that
  // plan already on the booking. The plan has a seed of its own, so the
  // day's rng -- and everything drawn from it -- must not notice.
  for (const seed of [741, 742, 743, 744]) {
    const state = atMinimum(nationalReady(seed), 'regional');
    state.tournament = newWeek('regional', state.day + RUN_UP_DAYS);
    const drawn = runDay(state, seed * 3);
    const planned = structuredClone(state);
    planned.tournament.eventPlan = drawn.state.tournament.eventPlan;
    const again = runDay(planned, seed * 3);
    assert.deepEqual(again.report, drawn.report);
    assert.deepEqual(again.state, drawn.state);
  }
});

test('a planned evening\'s card takes the ordinary event\'s slot and leaves the rest of the day alone', () => {
  // Same state, booked: once with tonight in the plan, once with a plan
  // that leaves tonight alone. The ordinary roll is drawn from the day's
  // rng at the same point either way, so on the day it is left alone the
  // ordinary event is the one a resort with no championship card would
  // roll -- checked by finding an evening whose ordinary roll came up.
  let rolled = 0;
  for (let seed = 751; seed < 791 && rolled < 3; seed++) {
    const state = atMinimum(nationalReady(seed), 'regional');
    state.tournament = newWeek('regional', state.day + RUN_UP_DAYS);
    const day = state.day;
    state.tournament.eventPlan = { runUp: [day + 5], week: [state.tournament.day] };
    const ordinary = runDay(state, seed);
    if (!ordinary.report.pendingEvent) continue;
    rolled += 1;
    assert.ok(!CHAMPIONSHIP_BY_ID.has(ordinary.report.pendingEvent.id), 'an ordinary event');
    // And with tonight planned, the championship's card takes the slot.
    state.tournament.eventPlan = { runUp: [day], week: [state.tournament.day] };
    const planned = runDay(state, seed);
    assert.equal(CHAMPIONSHIP_BY_ID.get(planned.report.pendingEvent.id)?.phase, 'runUp');
    assert.deepEqual(planned.state.eventsSeen, state.eventsSeen, 'and the ordinary memory is untouched');
    // Everything else the day computed is the same.
    assert.deepEqual(planned.report.revenue, ordinary.report.revenue);
    assert.deepEqual(planned.report.narration, ordinary.report.narration);
  }
  assert.equal(rolled, 3, 'sanity: found evenings whose ordinary roll came up');
});
