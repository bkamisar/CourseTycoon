import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
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
