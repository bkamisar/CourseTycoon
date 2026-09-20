import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, holeStats } from '../src/sim/hole.js';
import { expectedMinutes } from '../src/sim/round.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { newGame } from '../src/sim/state.js';
import {
  liveStats,
  minutesFor,
  deriveReadout,
  templateOptions,
  buildHole,
  HOLE_BUILD_COST,
} from '../src/ui/editor.js';

// --- The point of this task: the editor never computes its own numbers ----

test('liveStats on a freshly built hole is exactly holeStats for it', () => {
  const hole = makeHole('straightPar4', 1);
  assert.deepEqual(liveStats(hole), holeStats(hole));
});

test('moving a bunker changes liveStats exactly as it changes holeStats', () => {
  const hole = makeHole('straightPar4', 1);
  // Move the first bunker well off into the trees.
  hole.features[0].x = 200;
  hole.features[0].y = 200;
  assert.deepEqual(liveStats(hole), holeStats(hole));
});

test('digging a pond changes liveStats exactly as it changes holeStats', () => {
  const hole = makeHole('doglegPar4', 1);
  hole.features.push({ type: 'pond', x: -10, y: 300, size: 20 });
  assert.deepEqual(liveStats(hole), holeStats(hole));
});

test('minutesFor equals expectedMinutes for the same hole and carts setting', () => {
  const hole = makeHole('waterPar3', 1);
  assert.equal(minutesFor(hole, { carts: true }), expectedMinutes(hole, { carts: true }));
  assert.equal(minutesFor(hole, { carts: false }), expectedMinutes(hole, { carts: false }));
});

test('deriveReadout combines both sim calls without adding its own arithmetic', () => {
  const hole = makeHole('doglegPar4', 1);
  hole.features.push({ type: 'pond', x: -10, y: 300, size: 20 }); // dig a pond
  const readout = deriveReadout(hole, { carts: false });
  const stats = holeStats(hole);
  const minutes = expectedMinutes(hole, { carts: false });

  assert.equal(readout.par, stats.par);
  assert.equal(readout.length, stats.length);
  assert.equal(readout.difficulty, stats.difficulty);
  assert.equal(readout.scenery, stats.scenery);
  assert.equal(readout.upkeep, stats.upkeep);
  assert.equal(readout.minutes, minutes);
});

test('a moved bunker is reflected in the readout, minutes included', () => {
  const before = makeHole('straightPar4', 1);
  const after = makeHole('straightPar4', 1);
  after.features[0].x = 300; // drag it far away, out of the corridor entirely
  after.features[0].y = 500;

  const readoutBefore = deriveReadout(before, { carts: false });
  const readoutAfter = deriveReadout(after, { carts: false });

  assert.notEqual(readoutBefore.difficulty, readoutAfter.difficulty);
  assert.equal(readoutAfter.difficulty, holeStats(after).difficulty);
  assert.equal(readoutAfter.minutes, expectedMinutes(after, { carts: false }));
});

test('minutesOverride keeps showing the stale value instead of recomputing (the drag-in-progress case)', () => {
  const hole = makeHole('shortPar3', 1);
  const readout = deriveReadout(hole, { carts: true, minutesOverride: 42 });
  assert.equal(readout.minutes, 42);
  // The cheap stats still come through live even while minutes is stale.
  assert.equal(readout.par, holeStats(hole).par);
});

// --- Template options for an empty plot ------------------------------------

test('templateOptions lists all six templates with sim-derived par, length and the build cost', () => {
  const options = templateOptions();
  assert.equal(options.length, TEMPLATE_NAMES.length);
  for (const opt of options) {
    const hole = makeHole(opt.name, 0);
    const stats = holeStats(hole);
    assert.equal(opt.par, stats.par);
    assert.equal(Math.round(opt.length), Math.round(stats.length));
    assert.equal(opt.cost, HOLE_BUILD_COST);
  }
});

test('unknown template names are rejected', () => {
  assert.throws(() => makeHole('nope', 1), /unknown template/i);
});

// --- Building a hole on an empty plot ---------------------------------------

test('buildHole deducts the build cost and opens the plot', () => {
  const state = newGame(1);
  const emptyId = state.resort.courses[0].holes.find((h) => !h.open).id;
  const next = buildHole(state, emptyId, 'shortPar3');

  assert.equal(next.money, state.money - HOLE_BUILD_COST);
  const built = next.resort.courses[0].holes.find((h) => h.id === emptyId);
  assert.equal(built.open, true);
  assert.equal(built.template, 'shortPar3');
  // The original state object must not have been mutated.
  assert.equal(state.money, 25000);
  assert.equal(state.resort.courses[0].holes.find((h) => h.id === emptyId).open, false);
});

test('buildHole refuses when funds are short of the cost', () => {
  const state = newGame(1);
  state.money = 100;
  const emptyId = state.resort.courses[0].holes.find((h) => !h.open).id;
  assert.throws(() => buildHole(state, emptyId, 'shortPar3'), /insufficient|short/i);
});

test('buildHole refuses to rebuild an already-open hole', () => {
  const state = newGame(1);
  const openId = state.resort.courses[0].holes.find((h) => h.open).id;
  assert.throws(() => buildHole(state, openId, 'shortPar3'), /already/i);
});

test('buildHole refuses an unknown template', () => {
  const state = newGame(1);
  const emptyId = state.resort.courses[0].holes.find((h) => !h.open).id;
  assert.throws(() => buildHole(state, emptyId, 'nope'), /unknown template/i);
});
