import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole } from '../src/sim/hole.js';
import { computeHoleTransform } from '../src/render/holeView.js';

// toWorld exists for the hole editor's drag handling: given a pointer
// position in screen space, it must recover the same hole-yard point that
// toScreen would have mapped there. Without an exact inverse, dragging a
// feature would drift from the finger instead of tracking it.

test('toWorld is the exact inverse of toScreen for points inside the hole', () => {
  const hole = makeHole('doglegPar4', 1);
  const rect = { x: 0, y: 0, width: 180, height: 320 };
  const t = computeHoleTransform(hole, rect);

  for (const p of [...hole.corridor, ...hole.features, hole.teePos]) {
    const screen = t.toScreen(p);
    const back = t.toWorld(screen);
    assert.ok(Math.abs(back.x - p.x) < 1e-6, `x round-trip: ${back.x} vs ${p.x}`);
    assert.ok(Math.abs(back.y - p.y) < 1e-6, `y round-trip: ${back.y} vs ${p.y}`);
  }
});

test('toWorld round-trips an arbitrary screen point through toScreen', () => {
  const hole = makeHole('longPar5', 1);
  const rect = { x: 0, y: 0, width: 180, height: 320 };
  const t = computeHoleTransform(hole, rect);

  const screenPoint = { x: 90, y: 160 };
  const world = t.toWorld(screenPoint);
  const back = t.toScreen(world);
  assert.ok(Math.abs(back.x - screenPoint.x) < 1e-6);
  assert.ok(Math.abs(back.y - screenPoint.y) < 1e-6);
});
