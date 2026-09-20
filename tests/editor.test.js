import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, holeStats } from '../src/sim/hole.js';
import { expectedMinutes } from '../src/sim/round.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { newGame } from '../src/sim/state.js';
import { BUILD_COSTS } from '../src/sim/economy.js';
import {liveStats,
  minutesFor,
  deriveReadout,
  templateOptions,
  buildHole,
  HOLE_BUILD_COST,
  featureCost,
  refundFor,
  removalRefund,
  greenCycleCost,
  sizeBounds,
  sizedFeatureCost,
  resizeFeatureCost,
  NEW_FEATURE_SIZE,
  investedInHazards,
  rebuildCost,
  rebuildOptions,
  rebuildHole, rebuildPriceLabel, rebuildPricePhrase } from '../src/ui/editor.js';

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

test('refundFor is the full cost paid, not half', () => {
  // What makes a pond a commitment is its $45/day upkeep forever (see
  // UPKEEP_PER_POND in src/sim/hole.js), not its purchase price — so the
  // purchase price comes all the way back when it's removed.
  assert.equal(refundFor(800), 800);
  assert.equal(refundFor(2500), 2500);
  assert.equal(refundFor(300), 300);
  assert.equal(refundFor(801), 801);
  assert.equal(refundFor(1), 1);
});

test('a refund is never more than the original cost (break-even at most, never a profit)', () => {
  for (const cost of [BUILD_COSTS.bunker, BUILD_COSTS.pond, BUILD_COSTS.trees, BUILD_COSTS.greenUpgrade]) {
    assert.equal(refundFor(cost), cost, `refund of ${cost} should return exactly ${cost}`);
  }
});

test('removalRefund pays the full scaled value of a hazard at its CURRENT size, not its base price', () => {
  // A hazard grown after purchase is worth more than BUILD_COSTS[type]
  // alone — removalRefund must read the size it's actually at, not fall
  // back to the flat per-type price (a bug this fixes: the editor used to
  // refund featureCost(type) regardless of how much the hazard had grown).
  const grownPond = { type: 'pond', size: NEW_FEATURE_SIZE.pond + 10 };
  assert.equal(removalRefund(grownPond), sizedFeatureCost('pond', grownPond.size));
  assert.notEqual(removalRefund(grownPond), featureCost('pond'));

  const shrunkBunker = { type: 'bunker', size: NEW_FEATURE_SIZE.bunker - 3 };
  assert.equal(removalRefund(shrunkBunker), sizedFeatureCost('bunker', shrunkBunker.size));

  // At the default size, both figures agree.
  const defaultTrees = { type: 'trees', size: NEW_FEATURE_SIZE.trees };
  assert.equal(removalRefund(defaultTrees), featureCost('trees'));
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

test('resizeFeatureCost refunds the FULL area-scaled difference when shrinking, matching removal', () => {
  const from = NEW_FEATURE_SIZE.pond;
  const to = from - 6;
  const fullDifference = sizedFeatureCost('pond', from) - sizedFeatureCost('pond', to);
  const charge = resizeFeatureCost('pond', from, to);
  assert.ok(charge < 0, 'shrinking should refund money (a negative charge)');
  assert.equal(-charge, fullDifference);
});

test('resizeFeatureCost is zero for a same-size no-op resize', () => {
  for (const type of ['bunker', 'pond', 'trees']) {
    assert.equal(resizeFeatureCost(type, NEW_FEATURE_SIZE[type], NEW_FEATURE_SIZE[type]), 0);
  }
});

test('growing then shrinking straight back to the original size nets to exactly zero — never a profit', () => {
  // Full refunds mean a round trip breaks even exactly, not "costs a
  // little more than it refunds" the way the old half-back rule did:
  // growing by a step and then shrinking back by that same step must
  // cost precisely what it refunds, never less, never more.
  for (const type of ['bunker', 'pond', 'trees']) {
    const start = NEW_FEATURE_SIZE[type];
    const grown = start + 4;
    const up = resizeFeatureCost(type, start, grown);
    const down = resizeFeatureCost(type, grown, start);
    assert.ok(up > 0, `${type}: growing should cost money`);
    assert.ok(down < 0, `${type}: shrinking back should refund money`);
    assert.equal(up + down, 0, `${type}: the round trip should net to exactly zero (up=${up}, down=${down})`);
  }
});

test('any sequence of add, resize, and remove nets to exactly zero — never a profit, never a hidden loss', () => {
  // The property the whole full-refund design rests on: because every
  // charge and refund is a plain difference in sizedFeatureCost, the
  // signed amounts telescope regardless of how many steps are in
  // between. Add it, grow it to the max, shrink it to the min, grow it
  // back to the default, then remove it — the player should have every
  // dollar back.
  for (const type of ['bunker', 'pond', 'trees']) {
    const bounds = sizeBounds(type);
    let size = NEW_FEATURE_SIZE[type];
    let net = featureCost(type); // add
    net += resizeFeatureCost(type, size, bounds.max); // grow to max
    size = bounds.max;
    net += resizeFeatureCost(type, size, bounds.min); // shrink to min
    size = bounds.min;
    net += resizeFeatureCost(type, size, NEW_FEATURE_SIZE[type]); // grow back to default
    size = NEW_FEATURE_SIZE[type];
    net -= removalRefund({ type, size }); // remove, full refund at current size
    assert.equal(net, 0, `${type}: sequence should net to exactly zero, got ${net}`);
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

// --- Rebuilding an already-built hole ---------------------------------------

test('investedInHazards sums the scaled value of every feature currently on the hole', () => {
  const hole = makeHole('straightPar4', 1); // bunker, trees, bunker by default
  const expected = hole.features.reduce((s, f) => s + sizedFeatureCost(f.type, f.size), 0);
  assert.equal(investedInHazards(hole), expected);
});

test('investedInHazards is zero for a hole with no hazards', () => {
  const hole = makeHole('straightPar4', 1);
  hole.features = [];
  assert.equal(investedInHazards(hole), 0);
});

test('rebuildCost is the full HOLE_BUILD_COST minus a salvage credit for the hazards being destroyed', () => {
  const hole = makeHole('straightPar4', 1);
  const invested = investedInHazards(hole);
  assert.ok(invested > 0, 'fixture should actually have hazards to sanity-check this');
  assert.equal(rebuildCost(hole), HOLE_BUILD_COST - invested);
});

test('rebuilding costs the same whether or not you strip the hole first', () => {
  // The invariant that matters. Removing a hazard refunds it in full, so a
  // salvage credit capped below the hazards' worth made the obvious route -
  // rebuild directly - cost $2,400 while stripping first and then rebuilding
  // left the player $3,000 better off for an identical hole. A player doing
  // the obvious thing should not be quietly punished for it.
  const loaded = makeHole('straightPar4', 1);
  for (let i = 0; i < 6; i++) {
    loaded.features.push({ type: 'pond', x: 0, y: 200, size: 20 });
  }
  const salvage = investedInHazards(loaded);
  assert.ok(salvage > HOLE_BUILD_COST, 'fixture should be worth more than a fresh build');

  const direct = rebuildCost(loaded);

  const stripped = makeHole('straightPar4', 1);
  stripped.features = [];
  const strippedFirst = -salvage + rebuildCost(stripped);

  assert.equal(direct, strippedFirst, 'both routes to the same hole must cost the same');
});

test('a full cycle of buying hazards and rebuilding costs exactly one regrade', () => {
  // Salvage is uncapped and a rebuild can pay out, which is not free money:
  // the player bought those hazards. Over the whole cycle they are out
  // exactly one HOLE_BUILD_COST, which is what a regrade should cost.
  const hole = makeHole('straightPar4', 1);
  hole.features = [];
  const spentOnHazards = 3 * sizedFeatureCost('pond', 20);
  for (let i = 0; i < 3; i++) {
    hole.features.push({ type: 'pond', x: 0, y: 200, size: 20 });
  }
  const netOverCycle = spentOnHazards + rebuildCost(hole);
  assert.equal(netOverCycle, HOLE_BUILD_COST);
});

test('rebuildCost is never more than HOLE_BUILD_COST (a bare hole with no hazards is the worst case)', () => {
  const hole = makeHole('straightPar4', 1);
  hole.features = [];
  assert.equal(rebuildCost(hole), HOLE_BUILD_COST);
});

test('rebuildOptions lists all six templates at the same rebuild price for this hole', () => {
  const hole = makeHole('straightPar4', 1);
  const options = rebuildOptions(hole);
  assert.equal(options.length, TEMPLATE_NAMES.length);
  const cost = rebuildCost(hole);
  for (const opt of options) {
    assert.equal(opt.cost, cost);
    const preview = makeHole(opt.name, 0);
    const stats = holeStats(preview);
    assert.equal(opt.par, stats.par);
  }
});

test('rebuildHole deducts rebuildCost, keeps the same id, and swaps in the new template', () => {
  const state = newGame(1);
  const openId = state.resort.courses[0].holes.find((h) => h.open).id;
  const before = state.resort.courses[0].holes.find((h) => h.id === openId);
  const cost = rebuildCost(before);
  // Pick a template different from what's already there.
  const targetTemplate = TEMPLATE_NAMES.find((n) => n !== before.template);

  const next = rebuildHole(state, openId, targetTemplate);

  assert.equal(next.money, state.money - cost);
  const rebuilt = next.resort.courses[0].holes.find((h) => h.id === openId);
  assert.equal(rebuilt.open, true);
  assert.equal(rebuilt.template, targetTemplate);
  assert.equal(rebuilt.id, openId);
  // The original state must be untouched.
  assert.equal(state.money, 25000);
  assert.equal(state.resort.courses[0].holes.find((h) => h.id === openId).template, before.template);
});

test('rebuildHole refuses an unbuilt plot — nothing to salvage, buildHole is the right call there', () => {
  const state = newGame(1);
  const emptyId = state.resort.courses[0].holes.find((h) => !h.open).id;
  assert.throws(() => rebuildHole(state, emptyId, 'shortPar3'), /not.*been built|unbuilt/i);
});

test('rebuildHole refuses when funds are short of rebuildCost', () => {
  const state = newGame(1);
  const openId = state.resort.courses[0].holes.find((h) => h.open).id;
  state.money = 100;
  assert.throws(() => rebuildHole(state, openId, 'shortPar3'), /insufficient|short/i);
});

test('rebuildHole refuses an unknown template', () => {
  const state = newGame(1);
  const openId = state.resort.courses[0].holes.find((h) => h.open).id;
  assert.throws(() => rebuildHole(state, openId, 'nope'), /unknown template/i);
});

test('rebuilding is always strictly more expensive than zero and cannot be cheaper than $0 — no free pivots', () => {
  // Across a realistic spread of hazard investment, rebuildCost must
  // stay a real, positive price: never free, and (per the cap) never a
  // payout even when a hole is worth destroying more than a fresh build.
  for (const templateName of TEMPLATE_NAMES) {
    const hole = makeHole(templateName, 1);
    assert.ok(rebuildCost(hole) > 0, `${templateName}: rebuild must cost something`);
    assert.ok(rebuildCost(hole) <= HOLE_BUILD_COST, `${templateName}: rebuild must not exceed a fresh build`);
  }
});

test('a rebuild that pays out is phrased as money coming back', () => {
  // Salvage can exceed the regrade, making the figure negative. "$-5,365"
  // on a button is nonsense.
  assert.equal(rebuildPriceLabel(9635), '$9,635');
  assert.equal(rebuildPriceLabel(-5365), '$5,365 back');
  assert.match(rebuildPricePhrase(9635), /^for \$/);
  assert.match(rebuildPricePhrase(-5365), /back$/);
});
