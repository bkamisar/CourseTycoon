import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../src/save/code.js';
import { newGame, amenity } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { startingInvestors } from '../src/sim/investors.js';
import { makeRng } from '../src/sim/rng.js';

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

// --- Codes from games that were actually played ------------------------
//
// Everything above this line encodes a `newGame` with a couple of fields
// poked. That state is pure ASCII, and so it could never catch the bug
// that made every real save code unusable: the compressor's dictionary
// holds single bytes, the save JSON carries the Act I gate hint, and that
// hint contains an em dash. The lookup returned `undefined`, the framing
// wrote it as a zero, and the code failed to decode with a message about
// invalid JSON that pointed nowhere near the cause.
//
// This is the measurement trap in spec §15b, applied to a save: a thing
// measured where it cannot fail, reported as a property of the thing.

test('a save code survives prose — text outside ASCII does not poison the payload', () => {
  const state = newGame(3);
  state.narrative = 'Waiting hurts it more than anything else — widen the interval. "Quotes" too, and a café.';
  const revived = decode(encode(state));
  assert.equal(revived.narrative, state.narrative,
    'a non-ASCII character in a saved string must survive the round trip');
});

test('a save code round-trips a game that has actually been played', () => {
  let state = newGame(7);
  for (const type of ['proShop', 'snackShack']) state.resort.amenities.push(amenity(type));
  state.resort.staff.push({ role: 'shopStaff' }, { role: 'kitchenStaff' });
  for (let d = 0; d < 5; d++) state = runDay(state, 700 + d).state;

  const revived = decode(encode(state));
  assert.equal(revived.day, state.day);
  assert.equal(Math.round(revived.money), Math.round(state.money));
  assert.equal(revived.history.length, state.history.length,
    'the day reports are where the prose lives; they must come back');
  assert.deepEqual(
    revived.resort.amenities.map((a) => a.type),
    state.resort.amenities.map((a) => a.type),
  );
});

test('a save code round-trips a full Act II resort, hotel and investors and all', () => {
  // The state the fix was found against. Rooms, a rate, a standing
  // investor target and a confidence score all have to come back, or
  // moving a game between devices quietly ends the act.
  let state = newGame(11);
  state.act = 2;
  state.money = 250000;
  state.resort.rooms = { standard: 18, suite: 7 };
  state.resort.pricing.roomRate = 140;
  state.investors = startingInvestors(state, makeRng(11));
  state.investors.confidence = 71;
  state = runDay(state, 1100).state;

  const revived = decode(encode(state));
  assert.equal(revived.act, 2, 'the act itself must survive');
  assert.deepEqual(revived.resort.rooms, state.resort.rooms);
  assert.equal(revived.resort.pricing.roomRate, state.resort.pricing.roomRate);
  assert.equal(revived.investors.confidence, state.investors.confidence);
  assert.deepEqual(revived.investors.nextTarget, state.investors.nextTarget,
    'the standing target must come back, or the player loses the deadline they were playing to');
  assert.doesNotThrow(() => runDay(revived, 1101),
    'and a loaded save has to keep playing');
});
