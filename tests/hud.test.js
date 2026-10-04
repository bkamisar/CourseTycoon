import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { newWeek, recordRound } from '../src/sim/championshipWeek.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { toParText, averageToParText } from '../src/ui/toPar.js';
import { computeHudData } from '../src/ui/hud.js';
import { narrowToDifficulty } from '../tools/championshipPolicy.js';

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
  // The band is information now, not the decision (the winning score is
  // judged), but the readout still reports it truthfully on both sides.
  assert.equal(data.tournament.inBand, true, '70 is inside the regional band of 62-78');

  state.resort.setup = 61;
  assert.equal(computeHudData(state).tournament.inBand, false,
    '61 is one under the band');
});

test('the countdown warns on the difficulty floor, not on the band', () => {
  // The row used to turn amber whenever the setup sat outside the band,
  // which told a player on a course well past the minimum that they were
  // failing. The floor is the only thing on the line that is a gate.
  const state = eighteen(newGame(6));
  state.day = 40;
  state.tournament = { rung: 'countyOpen', day: 61, resolved: false };
  const raw = computeHudData(state).tournament;
  assert.equal(raw.difficultyMet, false, 'sanity: the template course is under the County floor');
  assert.equal(raw.warning, true, 'under the floor warns');

  narrowToDifficulty(state.resort.courses[0].holes, RUNGS.countyOpen.minDifficulty);
  for (const setup of [10, 52, 95]) {
    state.resort.setup = setup;
    const t = computeHudData(state).tournament;
    assert.equal(t.difficultyMet, true);
    assert.equal(t.warning, false, `setup ${setup} on a course at the floor must not warn`);
  }
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

test('a field average reads in words, from the rounded tenth', () => {
  assert.equal(averageToParText(6.2), '6.2 over par');
  assert.equal(averageToParText(-0.4), '0.4 under par');
  assert.equal(averageToParText(0), 'even par');
  assert.equal(averageToParText(0.04), 'even par', 'rounds to nothing, so no sign');
  assert.equal(averageToParText(-0.04), 'even par', 'and no "-0.0"');
  assert.equal(averageToParText(0.05), '0.1 over par');
  assert.equal(averageToParText(9), '9.0 over par');
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
