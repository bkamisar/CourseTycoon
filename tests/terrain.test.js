import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole } from '../src/sim/hole.js';
import { lieAt, LIE } from '../src/sim/terrain.js';

const hole = makeHole('straightPar4', 1); // corridor x=0, y=0..390, width 44

test('a point on the centreline is fairway', () => {
  assert.equal(lieAt(hole, { x: 0, y: 200 }), LIE.FAIRWAY);
});

test('just outside the corridor is rough', () => {
  // y=100 sits clear of the tree clump at (34, 200).
  assert.equal(lieAt(hole, { x: 26, y: 100 }), LIE.ROUGH);
});

test('far offline is trees', () => {
  assert.equal(lieAt(hole, { x: 90, y: 200 }), LIE.TREES);
});

test('inside a bunker is sand', () => {
  // straightPar4 has a bunker at (-24, 250) size 11.
  assert.equal(lieAt(hole, { x: -24, y: 250 }), LIE.SAND);
});

test('inside a pond is water', () => {
  const watered = makeHole('waterPar3', 1); // pond at (0,120) size 34
  assert.equal(lieAt(watered, { x: 0, y: 120 }), LIE.WATER);
});

test('a tree clump gives a trees lie even inside the corridor band', () => {
  // straightPar4 has trees at (34, 200) size 20.
  assert.equal(lieAt(hole, { x: 34, y: 200 }), LIE.TREES);
});

test('near the green centre is green', () => {
  assert.equal(lieAt(hole, { x: 0, y: 388 }), LIE.GREEN);
});

test('water beats green when a pond overlaps the green edge', () => {
  const h = makeHole('straightPar4', 1);
  h.features.push({ type: 'pond', x: 0, y: 388, size: 12 });
  assert.equal(lieAt(h, { x: 0, y: 388 }), LIE.WATER);
});

test('greenRadius scales with the preset', () => {
  const small = makeHole('shortPar3', 1);   // small green
  const large = makeHole('straightPar4', 1); // large green
  // A point 14 yards from centre is on the large green but off the small one.
  assert.equal(lieAt(large, { x: 14, y: 390 }), LIE.GREEN);
  assert.notEqual(lieAt(small, { x: 14, y: 155 }), LIE.GREEN);
});
