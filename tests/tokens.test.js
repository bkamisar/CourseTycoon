import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, openHoles } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { computeTokens, computeEffects, EFFECT_WINDOW_MINUTES } from '../src/render/tokens.js';

/** A resort-overview-shaped region list: one 'hole' rect per open hole,
 * arranged in a 3x3 grid the same way drawResort lays them out, but
 * computed by hand here so this test never depends on resortView.js. */
function gridRegions(holes, { x = 0, y = 20, width = 180, height = 280 } = {}) {
  const cols = 3;
  const cellW = width / cols;
  const cellH = height / Math.ceil(holes.length / cols);
  return holes.map((hole, i) => ({
    kind: 'hole',
    id: hole.id,
    x: x + (i % cols) * cellW,
    y: y + Math.floor(i / cols) * cellH,
    width: cellW,
    height: cellH,
  }));
}

test('computeTokens: no groups yet before the day starts', () => {
  const state = newGame(1);
  const holes = openHoles(state);
  const { timeline } = runDay(state, 1);
  const regions = gridRegions(holes);
  assert.deepEqual(computeTokens(timeline, holes, regions, 419), []);
});

test('computeTokens: a token appears once its group has teed off and disappears once finished', () => {
  const state = newGame(1);
  const holes = openHoles(state);
  const { timeline } = runDay(state, 1);
  const regions = gridRegions(holes);

  const teeOff = timeline.find((e) => e.type === 'teeOff');
  const finish = timeline.find((e) => e.type === 'finish' && e.groupIndex === teeOff.groupIndex);

  const before = computeTokens(timeline, holes, regions, teeOff.minute - 0.5);
  const during = computeTokens(timeline, holes, regions, teeOff.minute);
  const after = computeTokens(timeline, holes, regions, finish.minute + 0.5);

  assert.ok(!before.some((t) => t.groupIndex === teeOff.groupIndex));
  assert.ok(during.some((t) => t.groupIndex === teeOff.groupIndex));
  assert.ok(!after.some((t) => t.groupIndex === teeOff.groupIndex));
});

test('computeTokens: every token lands inside its hole’s own cell rect', () => {
  const state = newGame(1);
  const holes = openHoles(state);
  const { timeline } = runDay(state, 1);
  const regions = gridRegions(holes);
  const holeRects = new Map(regions.map((r) => [r.id, r]));

  // Sample a handful of minutes across the day.
  for (let minute = 420; minute <= 1080; minute += 15) {
    for (const tok of computeTokens(timeline, holes, regions, minute)) {
      const hole = holes[tok.holeIndex];
      const rect = holeRects.get(hole.id);
      assert.ok(rect, `no rect for hole ${hole.id}`);
      // toScreen may place a point fractionally outside the strict box due
      // to rounding at the very edges of the transform's margin; allow a
      // small tolerance rather than demanding pixel-exact containment.
      const tol = 2;
      assert.ok(tok.x >= rect.x - tol && tok.x <= rect.x + rect.width + tol,
        `token x ${tok.x} outside hole ${hole.id} rect [${rect.x}, ${rect.x + rect.width}]`);
      assert.ok(tok.y >= rect.y - tol && tok.y <= rect.y + rect.height + tol,
        `token y ${tok.y} outside hole ${hole.id} rect [${rect.y}, ${rect.y + rect.height}]`);
    }
  }
});

test('a tight tee interval produces visible bunching: multiple groups share a hole at once', () => {
  const state = newGame(1);
  state.resort.pricing.teeInterval = 7; // deliberately jams the course
  const holes = openHoles(state);
  const { timeline } = runDay(state, 1);
  const regions = gridRegions(holes);

  let sawBunching = false;
  for (let minute = 420; minute <= 1080 && !sawBunching; minute += 2) {
    const tokens = computeTokens(timeline, holes, regions, minute);
    const byHole = new Map();
    for (const t of tokens) byHole.set(t.holeIndex, (byHole.get(t.holeIndex) ?? 0) + 1);
    if ([...byHole.values()].some((count) => count >= 2)) sawBunching = true;
  }
  assert.ok(sawBunching, 'expected at least two groups on the same hole at once under a tight tee interval');
});

test('computeEffects: a water/sand event produces a marker only within its visibility window', () => {
  // water/sand carry a unique, continuously-varied `at` position (dispersed
  // shot landing spots), unlike `holed` (which always lands on the green's
  // fixed centre and so can coincide with another guest's holed event on
  // the same hole) -- picking one of these keeps this test's "is THIS
  // occurrence gone" check unambiguous.
  let state = newGame(1);
  let holes, timeline, event;
  for (let seed = 1; seed < 50; seed++) {
    state = newGame(seed);
    holes = openHoles(state);
    ({ timeline } = runDay(state, seed));
    event = timeline.find((e) => e.type === 'water' || e.type === 'sand');
    if (event) break;
  }
  const regions = gridRegions(holes);
  assert.ok(event, 'expected at least one water/sand event within 50 seeds');

  const during = computeEffects(timeline, holes, regions, event.minute + 0.1);
  const stale = computeEffects(timeline, holes, regions, event.minute + EFFECT_WINDOW_MINUTES + 1);

  const match = during.find((fx) => fx.type === event.type && fx.groupIndex === event.groupIndex);
  assert.ok(match, 'expected a marker for the event shortly after it fired');

  // Match by this specific event's own computed position (not just type +
  // group), since a group can fire the same event type more than once —
  // this isolates whether THIS occurrence has faded, not some other one.
  const stillThere = stale.some(
    (fx) => fx.type === match.type && Math.abs(fx.x - match.x) < 1e-6 && Math.abs(fx.y - match.y) < 1e-6
  );
  assert.ok(!stillThere, 'expected this occurrence\'s marker to be gone once its window has elapsed');
});

test('computeEffects: never returns a marker for an event still in the future', () => {
  const state = newGame(1);
  const holes = openHoles(state);
  const { timeline } = runDay(state, 1);
  const regions = gridRegions(holes);

  const event = timeline.find((e) => e.type === 'water' || e.type === 'sand' || e.type === 'holed');
  assert.ok(event);
  const beforeItFired = computeEffects(timeline, holes, regions, event.minute - 1);
  assert.ok(!beforeItFired.some((fx) => fx.type === event.type && fx.groupIndex === event.groupIndex));
});

test('service stops are collected as effects so the cart can be drawn', () => {
  // The cart is the only thing in a day that is neither a ball nor a
  // group. If cartStop never reaches computeEffects she is invisible, and
  // a food amenity nobody can see is the "visual pop" half of this slice
  // silently not shipping.
  const state = newGame(31);
  state.resort.amenities.push({ id: 'c', type: 'beverageCart', menu: ['draught', 'hotDog'] });
  const { timeline, state: after } = runDay(state, 9);
  const holes = openHoles(after);
  const stops = timeline.filter((e) => e.type === 'cartStop');
  assert.ok(stops.length > 0, 'the day should contain cart stops at all');

  const regions = holes.map((h, i) => ({
    kind: 'hole', id: h.id, x: i * 40, y: 0, width: 38, height: 38,
  }));
  const seen = stops.some((stop) =>
    computeEffects(timeline, holes, regions, stop.minute).some((fx) => fx.type === 'cartStop')
  );
  assert.ok(seen, 'a cart stop should be visible at the minute it happens');
});

test('the cart shows up on more than one hole over a day', () => {
  // What makes her read as working her way round rather than as a static
  // marker: she is drawn wherever a group has just been served.
  const state = newGame(32);
  state.resort.amenities.push({ id: 'c', type: 'beverageCart', menu: ['draught', 'hotDog'] });
  const { timeline } = runDay(state, 10);
  const holesServed = new Set(timeline.filter((e) => e.type === 'cartStop').map((e) => e.holeId));
  assert.ok(holesServed.size >= 1, 'she should serve at least one hole');
});
