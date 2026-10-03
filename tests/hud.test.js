import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { newWeek, recordRound } from '../src/sim/championshipWeek.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { toParText } from '../src/ui/toPar.js';
import { computeHudData } from '../src/ui/hud.js';

test('the HUD says nothing about tournaments when none is booked', () => {
  assert.equal(computeHudData(newGame(1)).tournament, null);
});

test('the HUD counts down to a booked championship', () => {
  const state = newGame(2);
  state.day = 40;
  state.resort.setup = 70;
  state.resort.setupTarget = 70;
  state.tournament = { rung: 'regional', day: 61, resolved: false };

  const data = computeHudData(state);
  assert.ok(data.tournament, 'a booking has to reach the HUD');
  assert.equal(data.tournament.daysLeft, 21);
  assert.equal(data.tournament.label, 'Regional Championship');
  assert.equal(data.tournament.setup, 70);
  // The band is the decision. A countdown that does not say whether the
  // course is set right is a clock, not information. Asserted on both
  // sides, because a readout that always says "fine" is worse than none.
  assert.equal(data.tournament.inBand, true, '70 is inside the regional band of 62-78');

  state.resort.setup = 61;
  assert.equal(computeHudData(state).tournament.inBand, false,
    '61 is one under the band and must not read as ready');
});

test('the countdown says when the championship is today', () => {
  const state = newGame(3);
  state.day = 61;
  state.tournament = { rung: 'countyOpen', day: 61, resolved: false };
  assert.equal(computeHudData(state).tournament.daysLeft, 0);
});

test('a resolved championship leaves the HUD', () => {
  const state = newGame(4);
  state.day = 62;
  state.tournament = { rung: 'countyOpen', day: 61, resolved: true };
  assert.equal(computeHudData(state).tournament, null);
});

test('an unknown rung does not crash the HUD', () => {
  // A save from a future version, or a hand-edited one. The HUD is drawn
  // every frame and must not be the thing that takes the game down.
  const state = newGame(5);
  state.tournament = { rung: 'inventedRung', day: state.day + 3, resolved: false };
  assert.equal(computeHudData(state).tournament, null);
});

function eighteen(state) {
  state.resort.courses[0].holes = state.resort.courses[0].holes.map((h, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  return state;
}

test('a score to par reads like golf', () => {
  assert.equal(toParText(0), 'E');
  assert.equal(toParText(3), '+3');
  assert.equal(toParText(-2), '-2');
  assert.equal(toParText(null), '—');
});

test('the run-up readout says whether the course is hard enough', () => {
  const state = eighteen(newGame(5));
  state.day = 40;
  state.tournament = newWeek('national', 61);
  const t = computeHudData(state).tournament;
  assert.equal(t.inWeek, false);
  assert.equal(t.minDifficulty, RUNGS.national.minDifficulty);
  assert.ok(t.difficulty < t.minDifficulty, 'the template course is under the national floor');
  assert.equal(t.difficultyMet, false);
});

test('during the week the readout is the round and the leader', () => {
  const state = eighteen(newGame(6));
  state.day = 61;
  let week = newWeek('regional', 61);
  week = recordRound(week, { handicaps: [0, 0], playerToPar: [1, -2], entry: {} });
  state.tournament = week;
  state.day = 62;
  const t = computeHudData(state).tournament;
  assert.equal(t.inWeek, true);
  assert.equal(t.round, 2);
  assert.equal(t.rounds, 3);
  assert.equal(t.leaderToPar, -2);
  assert.equal(t.projectedTotal, -6, 'one round of three at -2 is on pace for -6');
  assert.equal(t.short, 'Regional');
  assert.deepEqual(t.target, RUNGS.regional.target);
});
