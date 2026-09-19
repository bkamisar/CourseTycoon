import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../src/sim/state.js';

test('a new game starts on day one of act one', () => {
  const s = newGame(1234);
  assert.equal(s.day, 1);
  assert.equal(s.act, 1);
  assert.equal(s.seed, 1234);
});

test('a new game starts with the spec cash and three open holes', () => {
  const s = newGame(1);
  assert.equal(s.money, 25000);
  assert.equal(s.resort.courses[0].holes.filter((h) => h.open).length, 3);
});

test('there are nine hole slots, six of them empty', () => {
  const s = newGame(1);
  const holes = s.resort.courses[0].holes;
  assert.equal(holes.length, 9);
  assert.equal(holes.filter((h) => !h.open).length, 6);
});

test('the wide data model fields are present and narrow', () => {
  const s = newGame(1);
  assert.equal(s.resort.zones.length, 1);
  assert.equal(s.resort.zones[0].id, 'near');
  assert.equal(s.resort.courses.length, 1);
  assert.equal(s.properties.length, 1);
  assert.equal(s.resort.rooms.count, 0);
  assert.deepEqual(s.resort.shuttles, []);
  assert.equal(s.resort.pricing.roomRate, 0);
});

test('pricing starts at the spec defaults', () => {
  const s = newGame(1);
  assert.equal(s.resort.pricing.greenFee, 45);
  assert.equal(s.resort.pricing.teeInterval, 10);
});

test('a round trip through serialize and deserialize preserves the state', () => {
  const s = newGame(77);
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
});

test('serialize produces a string', () => {
  assert.equal(typeof serialize(newGame(1)), 'string');
});

test('deserialize rejects malformed input rather than returning junk', () => {
  assert.throws(() => deserialize('not json'), /save/i);
  assert.throws(() => deserialize(JSON.stringify({ nope: true })), /save/i);
});
