import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAGES, AMENITIES } from '../src/sim/economy.js';
import { newGame } from '../src/sim/state.js';
import { makeHole, courseDifficultyOf } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { newWeek, recordRound } from '../src/sim/championshipWeek.js';
import { CHAMPIONSHIP_EVENTS } from '../src/sim/championshipEvents.js';
import { applyEventChoice, runDay } from '../src/sim/day.js';
import { addCondition } from '../src/sim/conditions.js';
import {
  spendTheMorning, spendTheTournamentMorning, playActThree, FIELD_TEE_INTERVAL, FLOOR_MARGIN,
  championshipChoiceIndex, championshipChoiceScore,
} from '../tools/operator.js';

const operatorSource = readFileSync(new URL('../tools/operator.js', import.meta.url), 'utf8');

/**
 * A measurement has two configurations, and both must be capable of the
 * thing being measured:
 *
 *   the world  — is there congestion to relieve, a kitchen to run, a
 *                counter to staff? Guarded by tools/scenarios.js.
 *   the actor  — can the player-model actually pull this lever? Guarded
 *                here.
 *
 * Only the first was guarded, and the second failed immediately: the
 * competent operator hired groundskeepers, cooks and shop hands but never
 * a marshal, so it could not play the strategy that a marshal makes
 * possible — and the harness reported "Act I has exactly one winning
 * line" as a property of the game. It has four.
 *
 * These tests are deliberately crude source checks rather than behavioural
 * ones. The failure mode is an omission, and an omission is exactly what a
 * behavioural test cannot see: a lever nobody pulls produces no behaviour
 * to assert on.
 */

test('the operator can hire every role the game offers', () => {
  for (const role of Object.keys(WAGES)) {
    assert.ok(operatorSource.includes(`'${role}'`),
      `the operator never mentions ${role}, so any conclusion it reaches about `
      + `strategies involving ${role} is meaningless. Add it to the policy, or `
      + `add it to LEVERS_NOT_PULLED with a reason.`);
  }
});

test('the operator can build every amenity the game offers', () => {
  for (const type of Object.keys(AMENITIES)) {
    if (AMENITIES[type].build === 0) continue; // the clubhouse comes free
    assert.ok(operatorSource.includes(`'${type}'`),
      `the operator never builds ${type}, so it cannot measure any strategy `
      + `that depends on it`);
  }
});

test('the operator declares what it deliberately does not do', () => {
  // The honest half. An operator cannot model everything, and the danger
  // is not the gaps — it is forgetting they are there and reading a
  // limitation of the model as a fact about the game.
  assert.ok(operatorSource.includes('LEVERS_NOT_PULLED'),
    'the operator must state its own blind spots, or its numbers will be read as complete');
  const declared = operatorSource.slice(operatorSource.indexOf('LEVERS_NOT_PULLED'));
  assert.ok(declared.length > 200, 'the declaration should actually say something');
});

// --- Act III: hosting a championship week -------------------------------

function actThreeCourse(seed) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 600000;
  state.prestige = 90;
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

const openDifficulty = (state) => courseDifficultyOf(state.resort.courses[0].holes.filter((h) => h.open));

test('the operator narrows the course the night before the first round, not three weeks early', () => {
  // The floor is a planning hurdle, not a running cost: the locals pay for
  // a hard course on every day it stands, so a competent host keeps their
  // course until the last run-up morning and narrows then.
  const early = actThreeCourse(3);
  const before = openDifficulty(early);
  early.tournament = newWeek('regional', early.day + 10);
  spendTheTournamentMorning(early, { holesOpen: 18 });
  assert.equal(openDifficulty(early), before, 'ten days out, the course is left alone');

  const eve = actThreeCourse(3);
  eve.tournament = newWeek('regional', eve.day + 1);
  spendTheTournamentMorning(eve, { holesOpen: 18 });
  assert.ok(openDifficulty(eve) >= RUNGS.regional.minDifficulty + FLOOR_MARGIN,
    `the night before, it is narrowed to the floor and the margin (${openDifficulty(eve).toFixed(1)})`);
});

test('the bid morning of an ordinary three-week run-up leaves the course alone', () => {
  const state = actThreeCourse(3);
  const before = openDifficulty(state);
  assert.equal(spendTheTournamentMorning(state, { holesOpen: 18 }), true);
  assert.equal(openDifficulty(state), before);
});

test('the margin over the floor is a rounding margin, and a closure on the first morning cannot undo it', () => {
  // The floor is measured over every open hole (a championship ignores a
  // decision event's closures, decision of 2026-10-04), so the margin was
  // cut from +3, which covered a two-hole closure, to +1. A week narrowed
  // to the floor and the margin passes it with two holes closed on round 1.
  assert.equal(FLOOR_MARGIN, 1);
  for (const rung of ['countyOpen', 'regional', 'national']) {
    const state = actThreeCourse(7);
    state.tournament = newWeek(rung, state.day + 1);
    spendTheTournamentMorning(state, { holesOpen: 18 });
    const open = state.resort.courses[0].holes.filter((h) => h.open);
    const whole = courseDifficultyOf(open);
    assert.ok(whole >= RUNGS[rung].minDifficulty,
      `${rung}: narrowed to ${whole.toFixed(1)} against a floor of ${RUNGS[rung].minDifficulty}`);
    state.day = state.tournament.day;
    state.conditions = addCondition([], { id: 'stormDamage', days: 5, holesClosed: 2 });
    const { state: after } = runDay(state, 11);
    assert.equal(after.tournament.difficulty, whole, `${rung}: the closure did not shorten the judged course`);
    assert.equal(after.tournament.difficultyMet, true, `${rung}: and the floor is met`);
  }
});

test('on a round morning the operator spaces the field out, and the next ordinary morning puts it back', () => {
  const state = actThreeCourse(8);
  state.tournament = newWeek('national', state.day);
  spendTheMorning(state, { greenFee: 80, teeInterval: 14 });
  spendTheTournamentMorning(state, { holesOpen: 18 });
  assert.equal(state.resort.pricing.teeInterval, FIELD_TEE_INTERVAL);
  state.tournament = null;
  spendTheMorning(state, { greenFee: 80, teeInterval: 14 });
  assert.equal(state.resort.pricing.teeInterval, 14);
});

test('a stub narrowed past and built later is not widened back to nothing', () => {
  const state = actThreeCourse(9);
  const holes = state.resort.courses[0].holes;
  const last = holes.length - 1;
  holes[last] = { id: holes[last].id, open: false, corridor: [], corridorWidth: 0,
    greenPreset: null, features: [], teePos: null };
  const widths = new Map();
  state.tournament = newWeek('countyOpen', state.day + 1);
  spendTheTournamentMorning(state, { holesOpen: 17, widths });
  // Built after the narrowing, at its template width.
  holes[last] = { ...makeHole(TEMPLATE_NAMES[last % TEMPLATE_NAMES.length], holes[last].id), open: true };
  const built = holes[last].corridorWidth;
  state.tournament = null;
  state.tournamentsHosted = ['countyOpen', 'regional', 'national'];
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  assert.equal(holes[last].corridorWidth, built);
});

test('during the week the operator sets the pins from the leader', () => {
  const state = actThreeCourse(4);
  let week = newWeek('national', state.day - 1);
  // Two rounds in and far under: a host reading this toughens the pins.
  week = recordRound(week, { handicaps: [0], playerToPar: [-6], entry: {} });
  week = recordRound(week, { handicaps: [0], playerToPar: [-6], entry: {} });
  state.tournament = week;
  spendTheTournamentMorning(state, { holesOpen: 18 });
  assert.ok(['tough', 'brutal'].includes(state.tournament.roundSettings.pins));
});

test('a booked national makes the operator hire a crew that can hold the turf through it', () => {
  // The ordinary rule (spendTheMorning) sizes the crew to the public's
  // wear, about six on a full eighteen, and six lose the turf at every
  // rung once the run-up and the field are added. A measurement run with
  // six would report the turf failing as a property of the game.
  const state = actThreeCourse(5);
  state.tournament = newWeek('national', state.day + 10);
  spendTheTournamentMorning(state, { holesOpen: 18 });
  const keepers = state.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  assert.ok(keepers >= 8, `a booked national left the operator with ${keepers} groundskeepers`);
});

test('once nothing is booked the operator widens the fairways it narrowed back to where they were', () => {
  // A host narrows for the week and has no reason to keep a course the
  // locals find too hard once the ladder is done. Without this, a ladder
  // measurement charged hosting for a championship-hard course on every
  // ordinary day for the rest of the run.
  const state = actThreeCourse(6);
  const before = state.resort.courses[0].holes.map((h) => h.corridorWidth);
  const widths = new Map();
  state.tournament = newWeek('national', state.day + 1);
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  assert.notDeepEqual(state.resort.courses[0].holes.map((h) => h.corridorWidth), before);

  state.tournament = null;
  state.tournamentsHosted = ['countyOpen', 'regional', 'national'];
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  assert.deepEqual(state.resort.courses[0].holes.map((h) => h.corridorWidth), before);
});

test('a barred rung is neither built for nor bid for until the bar lifts, then retried', () => {
  // A missed rung is not hosted (day.js), so it stays the next rung and
  // the operator comes back to it. Until the bar lifts it must not spend
  // on the rung's buildings, which would carry upkeep for four months.
  const state = actThreeCourse(14);
  state.tournamentsHosted = ['countyOpen'];
  state.tournamentBars = { regional: state.day + 5 };
  const money = state.money;
  assert.equal(spendTheTournamentMorning(state, { holesOpen: 18 }), false, 'barred: no bid');
  assert.equal(state.tournament, null);
  assert.equal(state.money, money, 'and nothing built for it');

  state.day += 6;
  assert.equal(spendTheTournamentMorning(state, { holesOpen: 18 }), true,
    'the morning after the bar, the Regional is bid for again');
  assert.equal(state.tournament.rung, 'regional');
});

// --- playActThree's bookkeeping ------------------------------------------

const LEVERS = { greenFee: 80, teeInterval: 14, roomRate: 300 };

test('the never-bid baseline never bids, on a resort that could', () => {
  const hosted = playActThree(actThreeCourse(11), { ...LEVERS, days: 2, seed: 11 });
  assert.ok(hosted.bids >= 1, 'sanity: this resort is eligible for the County Open');
  const baseline = playActThree(actThreeCourse(11), { ...LEVERS, days: 2, seed: 11, host: false });
  assert.equal(baseline.bids, 0);
  assert.equal(baseline.tournaments.length, 0);
  assert.equal(baseline.runUpDays, 0);
});

test('round days are counted as the week, not as ordinary days', () => {
  // A County Open whose first round is today: two closed days, then two
  // ordinary ones. Folding the closed days into "ordinary" would drag the
  // ordinary figure down and hide what the week cost.
  const state = actThreeCourse(12);
  state.tournament = newWeek('countyOpen', state.day);
  const r = playActThree(state, { ...LEVERS, days: 4, seed: 12, host: false });
  assert.equal(r.weekDays, 2);
  assert.equal(r.ordinaryDays, 2);
  assert.equal(r.tournaments.length, 1, 'sanity: the week was played and judged');
});

test('the course is widened on the morning after a week even when the next rung is bid for at once', () => {
  // The next rung's run-up is three weeks of ordinary trade; it should be
  // played on the resort's own course, not the last week's narrowed one.
  const state = actThreeCourse(13);
  const before = state.resort.courses[0].holes.map((h) => h.corridorWidth);
  const widths = new Map();
  state.tournament = newWeek('countyOpen', state.day + 1);
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  state.tournament = null;
  state.tournamentsHosted = ['countyOpen'];
  assert.equal(spendTheTournamentMorning(state, { holesOpen: 18, widths }), true,
    'sanity: the Regional is bid for straight away');
  assert.deepEqual(state.resort.courses[0].holes.map((h) => h.corridorWidth), before);
});

// --- Championship events ---------------------------------------------------

test('the operator answers every championship event, at every rung, and the answer applies', () => {
  for (const rung of Object.keys(RUNGS)) {
    for (const event of CHAMPIONSHIP_EVENTS) {
      for (const fieldInterval of [14, 22]) {
        const index = championshipChoiceIndex(event, rung, { fieldInterval });
        assert.ok(Number.isInteger(index) && index >= 0 && index < event.choices.length,
          `${event.id} at ${rung}: a real choice`);
      }
      const state = actThreeCourse(21);
      state.tournament = newWeek(rung, state.day + 1);
      const index = championshipChoiceIndex(event, rung);
      const after = applyEventChoice(state, event.id, index);
      assert.ok(Number.isFinite(after.money), `${event.id} at ${rung}: money stays a number`);
    }
  }
});

test('the operator takes a money-positive choice with no risk over a costly one', () => {
  const event = {
    choices: [
      { stance: 'thorough', label: 'a', cost: '{money}', effects: { moneyDays: -2 } },
      { stance: 'thrifty', label: 'b', cost: '{money}', effects: { moneyDays: 3 } },
      { stance: 'pragmatic', label: 'c', cost: '{money}', effects: { moneyDays: 1, turf: -4 } },
    ],
  };
  assert.equal(championshipChoiceIndex(event, 'regional'), 1);
});

test('a pace-selling choice is taken on a wide field interval and refused on a tight one', () => {
  // champ-tv-tee-times: 5 prep days for 5% slower. Free money at 22 in
  // the operator's terms; at 14 it puts the pace bonus at risk, and the
  // operator takes the turn-down (index 2) instead.
  const event = CHAMPIONSHIP_EVENTS.find((e) => e.id === 'champ-tv-tee-times');
  assert.equal(championshipChoiceIndex(event, 'regional', { fieldInterval: 22 }), 0);
  assert.equal(championshipChoiceIndex(event, 'regional', { fieldInterval: 14 }), 2);
  assert.ok(championshipChoiceScore(event.choices[0], 'regional', { fieldInterval: 22 })
    > championshipChoiceScore(event.choices[2], 'regional', { fieldInterval: 22 }));
});

test('playActThree answers a pending championship event and the game goes on', () => {
  // A booked county week with a run-up long enough to draw its events: the
  // days must run without throwing and the plan must have been used.
  const state = actThreeCourse(22);
  state.tournament = newWeek('countyOpen', state.day + 6);
  const r = playActThree(state, { ...LEVERS, days: 12, seed: 22, host: false });
  assert.equal(r.days, 12);
  assert.ok(Number.isFinite(r.state.money));
});
