import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slopeMarks, slopeArrowAnchors, dottedPoints } from '../src/render/playView.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { greenRadius } from '../src/sim/terrain.js';
import { slopeFraction } from '../src/sim/putting.js';

test('a steeper green gets a longer arrow', () => {
  assert.equal(slopeMarks(slopeFraction('large')), 1);
  assert.equal(slopeMarks(slopeFraction('small')), 2);
  assert.equal(slopeMarks(slopeFraction('tiered')), 3);
});

test('slope arrows sit on the green and clear of the cup', () => {
  const hole = makeHole('shortPar3', 1);
  const cup = greenCentre(hole);
  const anchors = slopeArrowAnchors(hole);
  assert.equal(anchors.length, 4);
  for (const a of anchors) {
    const d = Math.hypot(a.x - cup.x, a.y - cup.y);
    assert.ok(d > 3 && d < greenRadius(hole), `anchor ${d} yards from the cup`);
  }
});

test('a dotted line runs from one end to the other in even steps', () => {
  const pts = dottedPoints({ x: 0, y: 0 }, { x: 0, y: 20 }, 4);
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts.at(-1), { x: 0, y: 20 });
  assert.equal(pts.length, 6);
  assert.deepEqual(dottedPoints({ x: 3, y: 3 }, { x: 3, y: 3 }, 4), [{ x: 3, y: 3 }]);
});
