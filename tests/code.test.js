import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../src/save/code.js';
import { newGame } from '../src/sim/state.js';

test('a save code round-trips to an identical state', () => {
  const state = newGame(999);
  const code = encode(state);
  assert.equal(typeof code, 'string');
  assert.deepEqual(decode(code), state);
});

test('a save code round-trips a state with edits (built hole, changed pricing)', () => {
  const state = newGame(5);
  state.resort.pricing.greenFee = 55;
  state.money = 12345;
  state.resort.courses[0].holes[3] = {
    ...state.resort.courses[0].holes[3],
    open: true,
    template: 'shortPar3',
  };
  const code = encode(state);
  assert.deepEqual(decode(code), state);
});

test('the save code is shorter than a naive base64 of the raw JSON, i.e. actually compressed', () => {
  const state = newGame(1);
  const code = encode(state);
  const naiveLength = Buffer.from(JSON.stringify(state)).toString('base64').length;
  assert.ok(code.length < naiveLength, `expected ${code.length} < ${naiveLength}`);
});

test('a corrupt save code is rejected with a clear error', () => {
  assert.throws(() => decode('total garbage, not a save code'), /corrupt save code/i);
});

test('a save code with a mangled body is rejected rather than silently producing a broken game', () => {
  const state = newGame(3);
  const code = encode(state);
  // Flip a character in the middle of the payload.
  const mangled = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  assert.throws(() => decode(mangled), /corrupt save code/i);
});

test('an empty string is rejected, not treated as an empty save', () => {
  assert.throws(() => decode(''), /corrupt save code/i);
});

test('a truncated save code is rejected', () => {
  const state = newGame(2);
  const code = encode(state);
  assert.throws(() => decode(code.slice(0, Math.floor(code.length / 2))), /corrupt save code/i);
});

test('decoding a code from a different (wrong-version) save is rejected clearly', () => {
  const state = newGame(1);
  state.version = 999; // pretend this came from some future save format
  const code = encode(state);
  assert.throws(() => decode(code), /corrupt save code/i);
});
