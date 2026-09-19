import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { LIE } from '../src/sim/terrain.js';
import { fullRange, resolveShot, puttsToHole } from '../src/sim/shot.js';

test('a scratch golfer outdrives a high handicapper', () => {
  assert.ok(fullRange(0) > fullRange(28) + 60);
});

test('lie penalties reduce range in the documented order', () => {
  assert.ok(fullRange(10, LIE.FAIRWAY) > fullRange(10, LIE.ROUGH));
  assert.ok(fullRange(10, LIE.ROUGH) > fullRange(10, LIE.SAND));
  assert.ok(fullRange(10, LIE.SAND) > fullRange(10, LIE.TREES));
});

test('resolveShot returns a landing point, a lie and a distance travelled', () => {
  const hole = makeHole('straightPar4', 1);
  const shot = resolveShot(makeRng(1), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  assert.ok(typeof shot.to.x === 'number' && typeof shot.to.y === 'number');
  assert.ok(Object.values(LIE).includes(shot.lie));
  assert.ok(shot.travelled > 0);
});

test('the same seed and inputs give the identical shot', () => {
  const hole = makeHole('straightPar4', 1);
  const a = resolveShot(makeRng(5), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  const b = resolveShot(makeRng(5), hole, { x: 0, y: 0 }, LIE.TEE, 10);
  assert.deepEqual(a, b);
});

test('a shot never advances past the pin by more than a full range', () => {
  const hole = makeHole('straightPar4', 1);
  const rng = makeRng(8);
  for (let i = 0; i < 200; i++) {
    const shot = resolveShot(rng, hole, { x: 0, y: 340 }, LIE.FAIRWAY, 12);
    assert.ok(shot.travelled <= fullRange(12, LIE.FAIRWAY) + 1);
  }
});

test('low handicappers scatter less than high handicappers', () => {
  assert.ok(averageOffline(2) < averageOffline(30) - 5);
});

test('putts rise with distance and fall with skill', () => {
  const rng = makeRng(12);
  const near = averagePutts(rng, 6, 10, 1.0);
  const far = averagePutts(rng, 60, 10, 1.0);
  const skilled = averagePutts(rng, 30, 1, 1.0);
  const poor = averagePutts(rng, 30, 30, 1.0);
  assert.ok(far > near, `near ${near} far ${far}`);
  assert.ok(poor > skilled, `skilled ${skilled} poor ${poor}`);
});

test('a tiered green putts harder than a large one', () => {
  const rng = makeRng(13);
  assert.ok(averagePutts(rng, 30, 12, 1.3) > averagePutts(rng, 30, 12, 0.85));
});

test('putts are always at least one and never absurd', () => {
  const rng = makeRng(14);
  for (let i = 0; i < 1000; i++) {
    const p = puttsToHole(rng, rng.next() * 90, rng.int(30), 1.15);
    assert.ok(p >= 1 && p <= 5, `putts out of range: ${p}`);
  }
});

function averageOffline(handicap) {
  const hole = makeHole('straightPar4', 1);
  const rng = makeRng(21);
  let total = 0;
  for (let i = 0; i < 300; i++) {
    total += Math.abs(resolveShot(rng, hole, { x: 0, y: 0 }, LIE.TEE, handicap).to.x);
  }
  return total / 300;
}

function averagePutts(rng, feet, handicap, greenDifficulty) {
  let total = 0;
  for (let i = 0; i < 400; i++) total += puttsToHole(rng, feet, handicap, greenDifficulty);
  return total / 400;
}
