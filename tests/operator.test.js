import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAGES, AMENITIES } from '../src/sim/economy.js';
import { newGame } from '../src/sim/state.js';
import { makeHole, courseDifficultyOf } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { newWeek, recordRound } from '../src/sim/championshipWeek.js';
import { spendTheTournamentMorning } from '../tools/operator.js';

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

test('during the run-up the operator redesigns the course up to the rung\'s floor', () => {
  const state = actThreeCourse(3);
  state.tournament = newWeek('regional', state.day + 10);
  spendTheTournamentMorning(state, { holesOpen: 18 });
  const holes = state.resort.courses[0].holes.filter((h) => h.open);
  assert.ok(courseDifficultyOf(holes) >= RUNGS.regional.minDifficulty);
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
  state.tournament = newWeek('national', state.day + 10);
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  assert.notDeepEqual(state.resort.courses[0].holes.map((h) => h.corridorWidth), before);

  state.tournament = null;
  state.tournamentsHosted = ['countyOpen', 'regional', 'national'];
  spendTheTournamentMorning(state, { holesOpen: 18, widths });
  assert.deepEqual(state.resort.courses[0].holes.map((h) => h.corridorWidth), before);
});
