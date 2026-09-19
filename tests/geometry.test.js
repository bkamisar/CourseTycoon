import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathLength, pointAtDistance, distanceToPath } from '../src/sim/geometry.js';

const straight = [{ x: 0, y: 0 }, { x: 0, y: 400 }];
const dogleg = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 60, y: 380 }];

test('pathLength measures a straight corridor', () => {
  assert.equal(pathLength(straight), 400);
});

test('pathLength sums dogleg segments', () => {
  const expected = 200 + Math.hypot(60, 180);
  assert.ok(Math.abs(pathLength(dogleg) - expected) < 0.001);
});

test('pointAtDistance walks along the path', () => {
  const p = pointAtDistance(straight, 100);
  assert.ok(Math.abs(p.x - 0) < 0.001);
  assert.ok(Math.abs(p.y - 100) < 0.001);
});

test('pointAtDistance past the end clamps to the final point', () => {
  const p = pointAtDistance(straight, 9999);
  assert.deepEqual(p, { x: 0, y: 400 });
});

test('pointAtDistance before the start clamps to the first point', () => {
  const p = pointAtDistance(straight, -50);
  assert.deepEqual(p, { x: 0, y: 0 });
});

test('pointAtDistance crosses into the second segment of a dogleg', () => {
  const p = pointAtDistance(dogleg, 200);
  assert.ok(Math.abs(p.x - 0) < 0.001);
  assert.ok(Math.abs(p.y - 200) < 0.001);
});

test('distanceToPath is zero on the line', () => {
  assert.ok(distanceToPath(straight, { x: 0, y: 150 }) < 0.001);
});

test('distanceToPath measures lateral offset', () => {
  assert.ok(Math.abs(distanceToPath(straight, { x: 25, y: 150 }) - 25) < 0.001);
});

test('distanceToPath handles points beyond a segment end', () => {
  // Level with the tee but 30 yards left: nearest path point is the tee itself.
  assert.ok(Math.abs(distanceToPath(straight, { x: 30, y: -0 }) - 30) < 0.001);
});
