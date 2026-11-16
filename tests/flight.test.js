import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightDuration, flightAt } from '../src/play/flight.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const swing = (yards) => ({ kind: 'swing', from: { x: 0, y: 0 }, to: { x: 30, y: yards }, yards });
const putt = { kind: 'putt', seconds: 2, from: { x: 0, y: 0 }, to: { x: 4, y: 0 },
  path: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3.5, y: 0 }, { x: 4, y: 0 }] };

test('a longer shot is in the air longer, within fixed limits', () => {
  assert.ok(flightDuration(swing(250)) > flightDuration(swing(120)));
  assert.equal(flightDuration(swing(5)), 450);
  assert.equal(flightDuration(swing(2000)), 1500);
});

test('a swing starts at the ball, ends at the landing point, and is done only at the end', () => {
  const out = swing(200);
  const d = flightDuration(out);
  assert.deepEqual(flightAt(out, 0), { x: 0, y: 0, lift: 0, done: false });
  const end = flightAt(out, d);
  near(end.x, 30); near(end.y, 200); near(end.lift, 0); assert.equal(end.done, true);
  assert.equal(flightAt(out, d + 5000).done, true);
  near(flightAt(out, d + 5000).y, 200);
});

test('a swing is highest at the middle of its flight', () => {
  const out = swing(200);
  const d = flightDuration(out);
  const mid = flightAt(out, d / 2);
  near(mid.x, 15); near(mid.y, 100);
  assert.ok(mid.lift > flightAt(out, d / 4).lift);
  assert.ok(mid.lift > 2 && mid.lift <= 24);
});

test('a putt never leaves the ground and takes as long as it really rolled', () => {
  assert.equal(flightDuration(putt), 2000);
  for (const t of [0, 500, 1000, 1999]) assert.equal(flightAt(putt, t).lift, 0);
});

test('a putt follows its path: fast at first, slow at the end', () => {
  near(flightAt(putt, 0).x, 0);
  near(flightAt(putt, 500).x, 2);      // a quarter of the time, half the distance
  near(flightAt(putt, 750).x, 2.5);    // halfway between two samples
  const end = flightAt(putt, 2000);
  near(end.x, 4); assert.equal(end.done, true);
});

test('a putt whose path is a single point is over at once', () => {
  const still = { kind: 'putt', seconds: 0, path: [{ x: 1, y: 1 }], from: { x: 1, y: 1 }, to: { x: 1, y: 1 } };
  assert.deepEqual(flightAt(still, 0), { x: 1, y: 1, lift: 0, done: true });
});
