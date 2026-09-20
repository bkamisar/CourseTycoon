import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, holeStats } from '../src/sim/hole.js';
import { expectedMinutes } from '../src/sim/round.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { newGame } from '../src/sim/state.js';
import { BUILD_COSTS } from '../src/sim/economy.js';
import {
  liveStats,
  minutesFor,
  deriveReadout,
  templateOptions,
  buildHole,
  HOLE_BUILD_COST,
  featureCost,
  refundFor,
  greenCycleCost,
  sizeBounds,
  sizedFeatureCost,
  resizeFeatureCost,
  NEW_FEATURE_SIZE,
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

// --- Hazard and green-upgrade charge/refund arithmetic ---------------------

test('featureCost reads straight off BUILD_COSTS for each hazard type', () => {
  assert.equal(featureCost('bunker'), BUILD_COSTS.bunker);
  assert.equal(featureCost('pond'), BUILD_COSTS.pond);
  assert.equal(featureCost('trees'), BUILD_COSTS.trees);
});

test('refundFor is half the cost, rounded down', () => {
  assert.equal(refundFor(800), 400);
  assert.equal(refundFor(2500), 1250);
  assert.equal(refundFor(300), 150);
  assert.equal(refundFor(801), 400); // rounds down, not to nearest
  assert.equal(refundFor(1), 0);
});

test('a refund is always strictly less than the original cost (never a profit)', () => {
  for (const cost of [BUILD_COSTS.bunker, BUILD_COSTS.pond, BUILD_COSTS.trees, BUILD_COSTS.greenUpgrade]) {
    assert.ok(refundFor(cost) < cost, `refund of ${cost} should be less than ${cost}`);
  }
});

test('greenCycleCost charges the upgrade price when moving to a harder preset', () => {
  // small (1.15) -> tiered (1.3) is strictly harder.
  assert.equal(greenCycleCost('small', 'tiered'), BUILD_COSTS.greenUpgrade);
});

test('greenCycleCost is free when moving to an easier or equally hard preset', () => {
  // tiered (1.3) -> elevated (1.1) is easier.
  assert.equal(greenCycleCost('tiered', 'elevated'), 0);
  // island (1.25) -> small (1.15) is easier too.
  assert.equal(greenCycleCost('island', 'small'), 0);
});

test('cycling every green preset in a full loop cannot generate money', () => {
  // Forward through the whole cycle, then confirm nothing downgrades ever
  // refunds: total cost of a full loop is the sum of the "harder" hops
  // only, and there is no way to recoup any of it by continuing to cycle.
  const order = ['small', 'large', 'tiered', 'elevated', 'island'];
  let totalCost = 0;
  for (let i = 0; i < order.length; i++) {
    const from = order[i];
    const to = order[(i + 1) % order.length];
    const cost = greenCycleCost(from, to);
    assert.ok(cost === 0 || cost === BUILD_COSTS.greenUpgrade);
    totalCost += cost;
  }
  assert.ok(totalCost > 0, 'at least one hop in a full loop must be an upgrade');
});

// --- Resizing a hazard: cost scales with area ------------------------------

test('sizedFeatureCost at the default NEW_FEATURE_SIZE is exactly the base BUILD_COSTS price', () => {
  for (const type of ['bunker', 'pond', 'trees']) {
    assert.equal(sizedFeatureCost(type, NEW_FEATURE_SIZE[type]), BUILD_COSTS[type]);
  }
});

test('sizedFeatureCost scales with area, not radius: doubling the radius quadruples the price', () => {
  for (const type of ['bunker', 'pond', 'trees']) {
    const base = NEW_FEATURE_SIZE[type];
    assert.equal(sizedFeatureCost(type, base * 2), BUILD_COSTS[type] * 4);
    // Halving the radius quarters the price too, the same relationship
    // run backwards.
    assert.equal(sizedFeatureCost(type, base / 2), Math.round(BUILD_COSTS[type] / 4));
  }
});

test('sizedFeatureCost grows monotonically with size', () => {
  const sizes = [4, 6, 9, 12, 18, 20];
  let previous = -Infinity;
  for (const size of sizes) {
    const cost = sizedFeatureCost('pond', size);
    assert.ok(cost > previous, `cost at size ${size} (${cost}) should exceed the previous size's (${previous})`);
    previous = cost;
  }
});

test('resizeFeatureCost charges the full area-scaled difference when growing', () => {
  const from = NEW_FEATURE_SIZE.bunker;
  const to = from + 4;
  const expected = sizedFeatureCost('bunker', to) - sizedFeatureCost('bunker', from);
  assert.ok(expected > 0, 'growing should cost something positive to sanity-check the fixture');
  assert.equal(resizeFeatureCost('bunker', from, to), expected);
});

test('resizeFeatureCost refunds half the area-scaled difference, rounded down, when shrinking', () => {
  const from = NEW_FEATURE_SIZE.pond;
  const to = from - 6;
  const fullDifference = sizedFeatureCost('pond', from) - sizedFeatureCost('pond', to);
  const charge = resizeFeatureCost('pond', from, to);
  assert.ok(charge < 0, 'shrinking should refund money (a negative charge)');
  assert.equal(-charge, Math.floor(fullDifference / 2));
});

test('resizeFeatureCost is zero for a same-size no-op resize', () => {
  for (const type of ['bunker', 'pond', 'trees']) {
    assert.equal(resizeFeatureCost(type, NEW_FEATURE_SIZE[type], NEW_FEATURE_SIZE[type]), 0);
  }
});

test('growing then shrinking straight back to the original size never turns a profit', () => {
  // Same "no round-trip profit" property greenCycleCost and refundFor
  // already guarantee, checked here for resizing: growing by a step and
  // then shrinking by that same step must cost strictly more than zero
  // net, never refund more than was charged.
  for (const type of ['bunker', 'pond', 'trees']) {
    const start = NEW_FEATURE_SIZE[type];
    const grown = start + 4;
    const up = resizeFeatureCost(type, start, grown);
    const down = resizeFeatureCost(type, grown, start);
    assert.ok(up > 0, `${type}: growing should cost money`);
    assert.ok(down < 0, `${type}: shrinking back should refund money`);
    assert.ok(up + down > 0, `${type}: the round trip should cost more than it refunds (up=${up}, down=${down})`);
  }
});

test('sizeBounds keeps the default NEW_FEATURE_SIZE strictly inside [min, max]', () => {
  for (const type of ['bunker', 'pond', 'trees']) {
    const bounds = sizeBounds(type);
    const base = NEW_FEATURE_SIZE[type];
    assert.ok(bounds.min > 0, `${type}: min size must be positive`);
    assert.ok(bounds.min < base, `${type}: min (${bounds.min}) should be below the default (${base})`);
    assert.ok(bounds.max > base, `${type}: max (${bounds.max}) should be above the default (${base})`);
  }
});
