import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStartScreenData,
  startNewGame,
  loadSaveCode,
  applySaveCode,
} from '../src/ui/start.js';
import { newGame, openHoles } from '../src/sim/state.js';
import { encode } from '../src/save/code.js';
import { createSaveAdapter } from '../src/save/adapter.js';

/** A trivial in-memory backend, the same shape tests/adapter.test.js uses. */
function memoryBackend(initial = null) {
  let stored = initial;
  return {
    load: () => stored,
    save: (state) => {
      stored = state;
    },
  };
}

// --- Continue: only offered when a save exists --------------------------

test('start screen data reports no save when there is none', () => {
  assert.deepEqual(computeStartScreenData(null), { hasSave: false });
  assert.deepEqual(computeStartScreenData(undefined), { hasSave: false });
});

test('the start screen offers Continue only when a save exists', () => {
  assert.equal(computeStartScreenData(null).hasSave, false);
  assert.equal(computeStartScreenData(newGame(1)).hasSave, true);
});

test('start screen data summarizes an existing save: day, money, holes open', () => {
  const save = newGame(42);
  save.day = 7;
  save.money = 31000;
  save.resort.courses[0].holes[3] = { ...save.resort.courses[0].holes[3], open: true };
  const data = computeStartScreenData(save);
  assert.equal(data.hasSave, true);
  assert.equal(data.day, 7);
  assert.equal(data.money, 31000);
  assert.equal(data.holesOpen, openHoles(save).length);
  assert.equal(data.resortName, save.resort.courses[0].name);
});

// --- New game: a fresh day-one state -------------------------------------

test('a new game from the start screen produces a day-one state', () => {
  const state = startNewGame(123);
  assert.equal(state.day, 1);
  assert.equal(state.act, 1);
  assert.equal(state.seed, 123);
});

// --- Loading a save code --------------------------------------------------

test('loading a valid save code yields a state equal to the one it was made from', () => {
  const original = newGame(99);
  original.money = 5000;
  original.resort.pricing.greenFee = 40;
  const code = encode(original);
  const result = loadSaveCode(code);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, original);
});

test('an invalid save code is rejected with a plain error, not a thrown exception', () => {
  let result;
  assert.doesNotThrow(() => {
    result = loadSaveCode('not a real save code');
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /corrupt save code/i);
});

test('an empty or garbage paste is rejected the same way', () => {
  assert.equal(loadSaveCode('').ok, false);
  assert.equal(loadSaveCode('   ').ok, false);
});

// --- The adapter guard: a bad code must never touch the stored save -----

test('applying a valid code writes it through the adapter', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(memoryBackend());
  const original = newGame(3);
  const code = encode(original);

  const result = applySaveCode(code, adapter);

  assert.equal(result.ok, true);
  assert.deepEqual(adapter.load(), original);
});

test('an invalid code is rejected without clearing or corrupting the stored save', () => {
  const adapter = createSaveAdapter();
  const existing = newGame(5);
  existing.day = 11;
  existing.money = 9000;
  adapter.registerBackend(memoryBackend(existing));

  const result = applySaveCode('total garbage, not a save code', adapter);

  assert.equal(result.ok, false);
  assert.match(result.error, /corrupt save code/i);
  // The good save underneath must survive a bad paste untouched.
  assert.deepEqual(adapter.load(), existing);
});

test('a mangled (truncated) code is also rejected without touching the stored save', () => {
  const adapter = createSaveAdapter();
  const existing = newGame(2);
  adapter.registerBackend(memoryBackend(existing));
  const goodCode = encode(newGame(8));

  const result = applySaveCode(goodCode.slice(0, 10), adapter);

  assert.equal(result.ok, false);
  assert.deepEqual(adapter.load(), existing);
});
