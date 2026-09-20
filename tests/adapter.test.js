import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveAdapter } from '../src/save/adapter.js';

/** A trivial in-memory backend for adapter tests: never touches localStorage. */
function memoryBackend(initial = null) {
  let stored = initial;
  return {
    load: () => stored,
    save: (state) => {
      stored = state;
    },
  };
}

function throwingBackend(message = 'backend is unavailable') {
  return {
    load: () => {
      throw new Error(message);
    },
    save: () => {
      throw new Error(message);
    },
  };
}

test('the adapter picks the first available backend for load', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(memoryBackend({ tag: 'first' }));
  adapter.registerBackend(memoryBackend({ tag: 'second' }));
  assert.deepEqual(adapter.load(), { tag: 'first' });
});

test('the adapter picks the first available backend for save', () => {
  const adapter = createSaveAdapter();
  const first = memoryBackend();
  const second = memoryBackend();
  adapter.registerBackend(first);
  adapter.registerBackend(second);

  adapter.save({ tag: 'saved' });

  assert.deepEqual(first.load(), { tag: 'saved' });
  assert.equal(second.load(), null);
});

test('a backend that throws on load is skipped and the next one tried', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(throwingBackend());
  adapter.registerBackend(memoryBackend({ tag: 'rescued' }));
  assert.doesNotThrow(() => adapter.load());
  assert.deepEqual(adapter.load(), { tag: 'rescued' });
});

test('a backend that throws on save is skipped and the next one tried', () => {
  const adapter = createSaveAdapter();
  const doomed = throwingBackend();
  const working = memoryBackend();
  adapter.registerBackend(doomed);
  adapter.registerBackend(working);

  assert.doesNotThrow(() => adapter.save({ tag: 'ok' }));
  assert.deepEqual(working.load(), { tag: 'ok' });
});

test('load returns null rather than throwing when every backend fails', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(throwingBackend());
  adapter.registerBackend(throwingBackend('also broken'));
  assert.equal(adapter.load(), null);
});

test('load returns null when no backend has anything stored', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(memoryBackend(null));
  assert.equal(adapter.load(), null);
});

test('save reports failure rather than throwing when every backend fails', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(throwingBackend());
  let result;
  assert.doesNotThrow(() => {
    result = adapter.save({ tag: 'lost' });
  });
  assert.equal(result, false);
});

test('save reports success once a backend accepts the write', () => {
  const adapter = createSaveAdapter();
  adapter.registerBackend(memoryBackend());
  assert.equal(adapter.save({ tag: 'ok' }), true);
});

test('load with no backends registered at all returns null', () => {
  const adapter = createSaveAdapter();
  assert.equal(adapter.load(), null);
});
