import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';

test('same seed produces the same sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next() stays within [0, 1)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('normal() has roughly the requested mean and deviation', () => {
  const rng = makeRng(99);
  const samples = [];
  for (let i = 0; i < 20000; i++) samples.push(rng.normal(100, 15));
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance =
    samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  assert.ok(Math.abs(mean - 100) < 1, `mean was ${mean}`);
  assert.ok(Math.abs(Math.sqrt(variance) - 15) < 1, `sd was ${Math.sqrt(variance)}`);
});

test('int(n) returns integers in [0, n)', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 500; i++) {
    const v = rng.int(5);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5, `bad int: ${v}`);
  }
});

test('pick returns a member of the array', () => {
  const rng = makeRng(11);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(rng.pick(arr)));
});

test('chance(p) is deterministic and roughly correct', () => {
  const rng = makeRng(5);
  let hits = 0;
  for (let i = 0; i < 10000; i++) if (rng.chance(0.3)) hits++;
  assert.ok(Math.abs(hits / 10000 - 0.3) < 0.02, `rate was ${hits / 10000}`);
});
