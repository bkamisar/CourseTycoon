import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBackend } from '../src/save/local.js';
import { newGame, serialize } from '../src/sim/state.js';

/** A minimal in-memory stand-in for the real `localStorage`. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** A storage object that throws on every access, simulating private browsing. */
function throwingStorage() {
  return {
    getItem: () => {
      throw new DOMExceptionLike('access denied');
    },
    setItem: () => {
      throw new DOMExceptionLike('access denied');
    },
    removeItem: () => {
      throw new DOMExceptionLike('access denied');
    },
  };
}
function DOMExceptionLike(message) {
  return Object.assign(new Error(message), { name: 'SecurityError' });
}

test('a fresh backend with nothing stored yet returns null on load', () => {
  const backend = createLocalBackend(fakeStorage());
  assert.equal(backend.load(), null);
});

test('a save round-trips through the local backend', () => {
  const storage = fakeStorage();
  const backend = createLocalBackend(storage);
  const state = newGame(42);

  backend.save(state);
  assert.deepEqual(backend.load(), state);
});

test('save actually writes serialized JSON under a stable key', () => {
  const storage = fakeStorage();
  const backend = createLocalBackend(storage);
  const state = newGame(7);
  backend.save(state);

  const raw = storage.getItem('course-tycoon-save');
  assert.equal(typeof raw, 'string');
  assert.deepEqual(JSON.parse(raw), JSON.parse(serialize(state)));
});

test('a corrupt value under the save key is treated as no save, not a crash', () => {
  const storage = fakeStorage({ 'course-tycoon-save': 'not json at all' });
  const backend = createLocalBackend(storage);
  assert.doesNotThrow(() => backend.load());
  assert.equal(backend.load(), null);
});

test('load never throws when storage throws on every access (private browsing)', () => {
  const backend = createLocalBackend(throwingStorage());
  let result;
  assert.doesNotThrow(() => {
    result = backend.load();
  });
  assert.equal(result, null);
});

test('save on throwing storage fails loudly (throws) so the adapter can fall through', () => {
  const backend = createLocalBackend(throwingStorage());
  assert.throws(() => backend.save(newGame(1)));
});

test('a backend with no storage object at all behaves like an absent backend', () => {
  const backend = createLocalBackend(undefined);
  assert.doesNotThrow(() => backend.load());
  assert.equal(backend.load(), null);
  assert.throws(() => backend.save(newGame(1)));
});
