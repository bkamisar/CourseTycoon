import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenRouter, SCREEN_NAMES } from '../src/ui/screens.js';
import { createSheetStack } from '../src/ui/sheet.js';
import { computeHudData } from '../src/ui/hud.js';
import { newGame } from '../src/sim/state.js';

// --- Screens --------------------------------------------------------------

test('there are exactly the four documented screens', () => {
  assert.deepEqual(SCREEN_NAMES, ['overview', 'editor', 'playback', 'report']);
});

test('a router starts on overview by default', () => {
  const router = createScreenRouter();
  assert.equal(router.current, 'overview');
});

test('a router can start on a named screen', () => {
  const router = createScreenRouter('editor');
  assert.equal(router.current, 'editor');
});

test('the active screen changes on request', () => {
  const router = createScreenRouter();
  router.go('editor');
  assert.equal(router.current, 'editor');
  router.go('playback');
  assert.equal(router.current, 'playback');
  router.go('report');
  assert.equal(router.current, 'report');
});

test('an unknown screen name is rejected with an error rather than silently blanking the game', () => {
  const router = createScreenRouter();
  router.go('editor');
  assert.throws(() => router.go('nonsense'), /unknown screen/i);
  // The rejected switch must not have blanked or changed the active screen.
  assert.equal(router.current, 'editor');
});

test('constructing a router with an unknown initial screen also throws', () => {
  assert.throws(() => createScreenRouter('nonsense'), /unknown screen/i);
});

test('screen subscribers are notified in order, only on real changes', () => {
  const router = createScreenRouter();
  const seen = [];
  router.subscribe((name) => seen.push(name));
  router.go('editor');
  router.go('editor'); // no-op, same screen again
  router.go('playback');
  assert.deepEqual(seen, ['editor', 'playback']);
});

test('unsubscribing stops further notifications', () => {
  const router = createScreenRouter();
  const seen = [];
  const unsubscribe = router.subscribe((name) => seen.push(name));
  router.go('editor');
  unsubscribe();
  router.go('playback');
  assert.deepEqual(seen, ['editor']);
});

// --- Sheets -----------------------------------------------------------------

test('a freshly created sheet stack is empty', () => {
  const stack = createSheetStack();
  assert.equal(stack.top, null);
  assert.equal(stack.size, 0);
  assert.deepEqual(stack.stack, []);
});

test('opening a sheet makes it the top of the stack', () => {
  const stack = createSheetStack();
  stack.open({ id: 'build' });
  assert.equal(stack.top.id, 'build');
  assert.equal(stack.size, 1);
});

test('sheets stack: a second sheet opened on top covers the first', () => {
  const stack = createSheetStack();
  stack.open({ id: 'build' });
  stack.open({ id: 'confirm' });
  assert.equal(stack.top.id, 'confirm');
  assert.equal(stack.size, 2);
});

test('dismissing one of two sheets returns to the first, not to none', () => {
  const stack = createSheetStack();
  stack.open({ id: 'build' });
  stack.open({ id: 'confirm' });
  stack.dismiss();
  assert.equal(stack.top.id, 'build', 'should fall back to the sheet underneath, not close everything');
  assert.equal(stack.size, 1);
});

test('dismissing the last sheet empties the stack', () => {
  const stack = createSheetStack();
  stack.open({ id: 'build' });
  stack.dismiss();
  assert.equal(stack.top, null);
  assert.equal(stack.size, 0);
});

test('dismissing an empty stack is a harmless no-op', () => {
  const stack = createSheetStack();
  assert.equal(stack.dismiss(), null);
  assert.equal(stack.size, 0);
});

test('dismissAll clears every sheet in one call', () => {
  const stack = createSheetStack();
  stack.open({ id: 'a' });
  stack.open({ id: 'b' });
  stack.open({ id: 'c' });
  stack.dismissAll();
  assert.equal(stack.top, null);
  assert.equal(stack.size, 0);
});

test('sheet stack subscribers receive the current stack on every change', () => {
  const stack = createSheetStack();
  const snapshots = [];
  stack.subscribe((s) => snapshots.push(s.map((i) => i.id)));
  stack.open({ id: 'build' });
  stack.open({ id: 'confirm' });
  stack.dismiss();
  assert.deepEqual(snapshots, [['build'], ['build', 'confirm'], ['build']]);
});

// --- HUD --------------------------------------------------------------------

test('HUD data is read from the simulation, never computed by the UI', () => {
  const state = newGame(1);
  const data = computeHudData(state);
  assert.equal(data.money, state.money);
  assert.equal(data.day, state.day);
  assert.equal(data.prestige, Math.round(state.prestige));
  assert.equal(data.turfQuality, Math.round(state.turfQuality));
  // courseRating comes from src/sim/ratings.js over the open holes, not from
  // any HUD arithmetic.
  assert.ok(data.courseRating >= 0 && data.courseRating <= 100);
});

test('HUD course rating is exactly what ratings.courseRating reports for the open holes', async () => {
  const { courseRating } = await import('../src/sim/ratings.js');
  const { openHoles } = await import('../src/sim/state.js');
  const state = newGame(1);
  const data = computeHudData(state);
  const expected = Math.round(courseRating(openHoles(state), state.turfQuality));
  assert.equal(data.courseRating, expected);
});
