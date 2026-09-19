import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole, holeStats } from '../src/sim/hole.js';
import { makeGroup, resetGuestIds } from '../src/sim/golfer.js';
import { playHole, expectedMinutes } from '../src/sim/round.js';

function group(seed = 1) {
  resetGuestIds();
  return makeGroup(makeRng(seed), { prestige: 50, greenFee: 45 }, 1);
}

test('every golfer finishes with a score and the group takes time', () => {
  const hole = makeHole('straightPar4', 1);
  const result = playHole(makeRng(1), hole, group(), { carts: false });
  assert.equal(result.scores.length, 4);
  for (const s of result.scores) {
    assert.ok(s.strokes >= 2 && s.strokes <= 14, `implausible score: ${s.strokes}`);
  }
  assert.ok(result.minutes > 5 && result.minutes < 40, `minutes: ${result.minutes}`);
});

test('the same seed replays identically', () => {
  const hole = makeHole('doglegPar4', 1);
  const a = playHole(makeRng(4), hole, group(), { carts: false });
  const b = playHole(makeRng(4), hole, group(), { carts: false });
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.minutes, b.minutes);
});

test('a par 3 plays faster than a par 5', () => {
  const short = expectedMinutes(makeHole('shortPar3', 1), { carts: false });
  const long = expectedMinutes(makeHole('longPar5', 1), { carts: false });
  assert.ok(long > short + 3, `short ${short} long ${long}`);
});

test('carts speed the hole up', () => {
  const hole = makeHole('longPar5', 1);
  const walking = expectedMinutes(hole, { carts: false });
  const riding = expectedMinutes(hole, { carts: true });
  assert.ok(riding < walking, `walking ${walking} riding ${riding}`);
});

test('adding water slows the hole down', () => {
  const plain = makeHole('straightPar4', 1);
  const watered = makeHole('straightPar4', 1);
  watered.features.push({ type: 'pond', x: 0, y: 250, size: 30 });
  assert.ok(
    expectedMinutes(watered, { carts: false }) > expectedMinutes(plain, { carts: false })
  );
});

test('a representative par 4 plays in a believable time', () => {
  const minutes = expectedMinutes(makeHole('straightPar4', 1), { carts: false });
  assert.ok(minutes > 10 && minutes < 22, `par 4 took ${minutes} minutes`);
});

test('tired golfers are slower than fresh ones', () => {
  const hole = makeHole('straightPar4', 1);
  const fresh = group(2);
  const tired = group(2);
  for (const g of tired.guests) g.energy = 10;
  const a = playHole(makeRng(6), hole, fresh, { carts: false });
  const b = playHole(makeRng(6), hole, tired, { carts: false });
  assert.ok(b.minutes > a.minutes, `fresh ${a.minutes} tired ${b.minutes}`);
});

test('playing a hole drains energy', () => {
  const hole = makeHole('longPar5', 1);
  const g = group(3);
  playHole(makeRng(7), hole, g, { carts: false });
  assert.ok(g.guests.every((x) => x.energy < 100));
});

test('events are emitted for water and sand', () => {
  const hole = makeHole('waterPar3', 1);
  let sawWater = false;
  for (let seed = 1; seed < 40 && !sawWater; seed++) {
    const r = playHole(makeRng(seed), hole, group(seed), { carts: false });
    if (r.events.some((e) => e.type === 'water')) sawWater = true;
  }
  assert.ok(sawWater, 'a par 3 over water should find water within 40 seeds');
});

test('scores stay sane on the hardest template', () => {
  const hole = makeHole('waterPar3', 1);
  const par = holeStats(hole).par;
  const r = playHole(makeRng(9), hole, group(), { carts: false });
  for (const s of r.scores) {
    assert.ok(s.strokes >= par - 1, `impossible score ${s.strokes} on par ${par}`);
  }
});
