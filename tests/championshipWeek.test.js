import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, newGame, openHoles, playableHoles } from '../src/sim/state.js';
import { makeHole, courseDifficultyOf } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { runDay } from '../src/sim/day.js';
import { addCondition } from '../src/sim/conditions.js';
import { RUNGS, setupDifficultyBonus } from '../src/sim/tournaments.js';
import {
  PINS, PIN_IDS, pinHandicap, newWeek, normaliseWeek, recordRound,
  winningTotal, weekFinished, weekUnderWay, withPins, championshipStatus, projectTotal,
} from '../src/sim/championshipWeek.js';

test('four pin settings, harder in order, fair changing nothing', () => {
  assert.deepEqual(PIN_IDS, ['easy', 'fair', 'tough', 'brutal']);
  assert.equal(pinHandicap('fair'), 0);
  const steps = PIN_IDS.map(pinHandicap);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1]);
  assert.equal(pinHandicap('nonsense'), 0, 'an unknown setting plays as fair');
  for (const id of PIN_IDS) assert.ok(PINS[id].label.length > 2);
});

test('the pins span less than the setup dial does', () => {
  // The free-ride rule from the spec: brutal pins on an unconditioned
  // course must not reach a conditioned one. The County band's floor, in
  // handicap points on the pins' scale, is what a properly set course
  // demands; brutal on its own has to be well under half of it, and the
  // pins' whole span well under three quarters.
  const countyFloor = setupDifficultyBonus(RUNGS.countyOpen.band.low) / 3;
  assert.ok(pinHandicap('brutal') < countyFloor / 2,
    `brutal pins are worth ${pinHandicap('brutal')}, the County floor ${countyFloor}`);
  const span = pinHandicap('brutal') - pinHandicap('easy');
  assert.ok(span < countyFloor * 0.75, `the pins span ${span} handicap points`);
});

test('a new week carries everything the rung decides', () => {
  const week = newWeek('national', 120);
  assert.equal(week.rung, 'national');
  assert.equal(week.day, 120);
  assert.equal(week.resolved, false);
  assert.equal(week.rounds, RUNGS.national.rounds);
  assert.equal(week.roundsPlayed, 0);
  assert.deepEqual(week.roundSettings, { pins: 'fair' });
  assert.equal(week.field, null);
  assert.deepEqual(week.roundLog, []);
});

test('an old-shaped booking is filled in rather than refused', () => {
  // Saves and tests from before the week existed carry { rung, day,
  // resolved } and nothing else.
  const week = normaliseWeek({ rung: 'countyOpen', day: 40, resolved: false });
  assert.equal(week.rounds, 2);
  assert.equal(week.roundSettings.pins, 'fair');
  assert.deepEqual(week.roundLog, []);
  assert.equal(normaliseWeek(null), null);
});

test('normalising a week in progress changes nothing', () => {
  let week = newWeek('national', 5);
  week = recordRound(week, { handicaps: [1, 2], playerToPar: [3, -2], entry: { pins: 'tough' } });
  week = withPins(week, 'brutal');
  assert.deepEqual(normaliseWeek(week), week);
});

test('an old-shaped booking in a save comes back filled in', () => {
  const state = newGame(3);
  state.tournament = { rung: 'countyOpen', day: 40, resolved: false };
  const revived = deserialize(serialize(state));
  assert.equal(revived.tournament.rounds, 2);
  assert.deepEqual(revived.tournament.roundLog, []);
});

test('recording rounds adds each player\'s score to their own total', () => {
  let week = newWeek('regional', 10);
  const handicaps = [0, 3, 6];
  week = recordRound(week, { handicaps, playerToPar: [2, -1, 5], entry: { pins: 'fair' } });
  week = recordRound(week, { handicaps, playerToPar: [-3, 4, 0], entry: { pins: 'tough' } });
  assert.deepEqual(week.field.totals, [-1, 3, 5]);
  assert.deepEqual(week.field.handicaps, handicaps, 'the same field every round');
  assert.equal(week.roundsPlayed, 2);
  assert.equal(winningTotal(week), -1, 'the lowest total, not the lowest round');
  assert.equal(week.roundLog.length, 2);
  assert.equal(week.roundLog[1].round, 2);
  assert.equal(week.roundLog[1].pins, 'tough');
  assert.equal(week.roundLog[1].leaderToPar, -1);
  assert.equal(weekFinished(week), false, 'a regional is three rounds');
  week = recordRound(week, { handicaps, playerToPar: [0, 0, 0], entry: {} });
  assert.equal(weekFinished(week), true);
});

test('the first round\'s handicaps are kept, whatever later rounds pass in', () => {
  let week = newWeek('countyOpen', 10);
  week = recordRound(week, { handicaps: [1, 2], playerToPar: [0, 0], entry: {} });
  week = recordRound(week, { handicaps: [9, 9], playerToPar: [0, 0], entry: {} });
  assert.deepEqual(week.field.handicaps, [1, 2]);
});

test('recording a round refuses what would corrupt the week', () => {
  const week = newWeek('countyOpen', 10);
  assert.throws(() => recordRound(week, { handicaps: [], playerToPar: [] }), /no players/);
  const one = recordRound(week, { handicaps: [1, 2], playerToPar: [0, 0] });
  assert.throws(() => recordRound(one, { handicaps: [1, 2, 3], playerToPar: [0, 0, 0] }),
    /field of 2/);
  const done = recordRound(one, { handicaps: [1, 2], playerToPar: [0, 0] });
  assert.throws(() => recordRound(done, { handicaps: [1, 2], playerToPar: [0, 0] }),
    /already finished/);
});

test('the field keeps its own copy of the handicaps', () => {
  const handicaps = [1, 2];
  const week = recordRound(newWeek('countyOpen', 10), { handicaps, playerToPar: [0, 0] });
  handicaps[0] = 99;
  assert.deepEqual(week.field.handicaps, [1, 2]);
});

test('a missing week is not finished', () => {
  assert.equal(weekFinished(null), false);
});

test('no winner before anybody has finished a round', () => {
  assert.equal(winningTotal(newWeek('countyOpen', 1)), null);
});

test('the week is under way from the first round\'s morning until it resolves', () => {
  const state = newGame(1);
  state.day = 50;
  assert.equal(weekUnderWay(state), false, 'nothing booked');
  state.tournament = newWeek('countyOpen', 60);
  assert.equal(weekUnderWay(state), false, 'still the run-up');
  state.day = 60;
  assert.equal(weekUnderWay(state), true, 'the first round is today');
  state.day = 61;
  assert.equal(weekUnderWay(state), true, 'between rounds');
  state.tournament = { ...state.tournament, resolved: true };
  assert.equal(weekUnderWay(state), false);
});

test('setting the pins keeps everything else and refuses nonsense', () => {
  const week = newWeek('national', 5);
  assert.equal(withPins(week, 'brutal').roundSettings.pins, 'brutal');
  assert.equal(withPins(week, 'brutal').rounds, 4);
  assert.equal(withPins(week, 'sideways').roundSettings.pins, 'fair');
  assert.equal(week.roundSettings.pins, 'fair', 'and does not mutate');
});

test('a week survives a save', () => {
  const state = newGame(2);
  let week = newWeek('national', 5);
  week = recordRound(week, { handicaps: [1, 2], playerToPar: [3, -2], entry: { pins: 'tough' } });
  state.tournament = withPins(week, 'easy');
  const revived = deserialize(serialize(state));
  assert.deepEqual(revived.tournament, state.tournament);
});

// --- championshipStatus: the one answer the HUD and the sheet both read ---

function statusResort(seed = 11) {
  const state = newGame(seed);
  state.act = 3;
  state.money = 500000;
  state.prestige = 84;
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

function narrow(state, width) {
  for (const hole of state.resort.courses[0].holes) hole.corridorWidth = width;
}

test('nothing booked, nothing to report', () => {
  assert.equal(championshipStatus(statusResort()), null);
  const state = statusResort();
  state.tournament = { rung: 'nonsense', day: 5, resolved: false };
  assert.equal(championshipStatus(state), null, 'an unknown rung is not a crash');
});

test('in the run-up the difficulty is live and follows the course', () => {
  const state = statusResort();
  state.day = 40;
  state.tournament = newWeek('countyOpen', 61);
  const before = championshipStatus(state);
  assert.equal(before.difficultyFrozen, false);
  assert.equal(before.inWeek, false);
  assert.equal(before.difficulty, courseDifficultyOf(openHoles(state)));
  assert.equal(before.difficultyMet, false, 'the template course is under the County floor');

  narrow(state, 34);
  const after = championshipStatus(state);
  assert.ok(after.difficulty > before.difficulty, 'a redesign moves the run-up figure');
  assert.equal(after.difficultyMet, true);
});

test('once the week has measured the course the figure is frozen', () => {
  const state = statusResort();
  state.tournament = newWeek('countyOpen', state.day);
  const morning = championshipStatus(state);
  const out = runDay(state, 7).state;
  assert.ok(out.tournament && !out.tournament.resolved, 'a two-round week is still going');

  const frozen = championshipStatus(out);
  assert.equal(frozen.difficultyFrozen, true);
  assert.equal(frozen.difficulty, morning.difficulty,
    'what the judge settled is what the morning view said');
  assert.equal(frozen.difficultyMet, false);

  // A later redesign (the editor is locked in play, but a save or a tool is
  // not) must not change what the judge already decided.
  narrow(out, 34);
  const later = championshipStatus(out);
  assert.equal(later.difficulty, frozen.difficulty);
  assert.equal(later.difficultyMet, false, 'the frozen verdict ignores the new corridors');
});

test('a closure from a decision event moves the figure the way the judge sees it', () => {
  const state = statusResort();
  state.tournament = newWeek('countyOpen', state.day);
  const whole = championshipStatus(state).difficulty;

  state.conditions = addCondition([], { id: 'stormDamage', days: 5, holesClosed: 4 });
  assert.equal(playableHoles(state).length, 14);
  const closed = championshipStatus(state);
  assert.equal(closed.difficulty, courseDifficultyOf(openHoles(state).slice(0, 14)));
  assert.notEqual(closed.difficulty, whole, 'the closure has to matter for this test to mean anything');

  const judged = runDay(state, 3).state.tournament.difficulty;
  assert.equal(closed.difficulty, judged, 'the morning view is the number the judge uses');
});

test("the leader's pace is projected over the whole week", () => {
  const state = statusResort();
  state.tournament = newWeek('regional', state.day);
  const morning = championshipStatus(state);
  assert.equal(morning.leaderToPar, null);
  assert.equal(morning.projectedTotal, null, 'no round in, no pace');
  assert.equal(morning.round, 1);

  state.tournament = recordRound(state.tournament, { handicaps: [0, 0], playerToPar: [3, 1], entry: {} });
  const after = championshipStatus(state);
  assert.equal(after.leaderToPar, 1);
  assert.equal(after.projectedTotal, 3, 'one under-the-line round in three, three times over');
  assert.equal(after.round, 2);
  assert.equal(after.rounds, 3);
});

test("projectTotal carries the leader's pace over the week, rounded", () => {
  assert.equal(projectTotal(-2, 1, 2), -4);
  assert.equal(projectTotal(7, 2, 4), 14);
  assert.equal(projectTotal(5, 2, 3), 8, '7.5 rounds up');
  assert.equal(projectTotal(0, 1, 4), 0);
  assert.equal(projectTotal(-3, 3, 3), -3, 'the last round projects to itself');
});

test('projectTotal has no pace to project before a leader or a round', () => {
  assert.equal(projectTotal(null, 1, 4), null);
  assert.equal(projectTotal(undefined, 1, 4), null);
  assert.equal(projectTotal(3, 0, 4), null);
});
