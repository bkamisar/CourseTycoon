import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHole, holeStats } from '../src/sim/hole.js';

test('makeHole copies the template without sharing references', () => {
  const a = makeHole('straightPar4', 1);
  const b = makeHole('straightPar4', 2);
  a.features[0].x = 999;
  assert.notEqual(b.features[0].x, 999, 'templates must not be shared by reference');
});

test('makeHole sets id and tee at the corridor start', () => {
  const hole = makeHole('straightPar4', 3);
  assert.equal(hole.id, 3);
  assert.deepEqual(hole.teePos, { x: 0, y: 0 });
});

test('unknown template throws rather than returning something broken', () => {
  assert.throws(() => makeHole('noSuchHole', 1), /unknown template/i);
});

test('length is derived from the corridor', () => {
  const hole = makeHole('straightPar4', 1);
  assert.ok(Math.abs(holeStats(hole).length - 390) < 1);
});

test('par is derived from length', () => {
  assert.equal(holeStats(makeHole('shortPar3', 1)).par, 3);
  assert.equal(holeStats(makeHole('straightPar4', 1)).par, 4);
  assert.equal(holeStats(makeHole('longPar5', 1)).par, 5);
});

test('adding bunkers raises difficulty and upkeep', () => {
  const plain = makeHole('straightPar4', 1);
  const loaded = makeHole('straightPar4', 1);
  loaded.features.push({ type: 'bunker', x: -10, y: 300, size: 10 });
  const a = holeStats(plain);
  const b = holeStats(loaded);
  assert.ok(b.difficulty > a.difficulty);
  assert.ok(b.upkeep > a.upkeep);
});

test('adding water raises scenery and upkeep more than a bunker does', () => {
  const base = holeStats(makeHole('straightPar4', 1));
  const watered = makeHole('straightPar4', 1);
  watered.features.push({ type: 'pond', x: -30, y: 300, size: 25 });
  const after = holeStats(watered);
  assert.ok(after.scenery > base.scenery);
  assert.ok(after.upkeep - base.upkeep >= 30);
});

test('narrowing the corridor raises difficulty', () => {
  const wide = makeHole('straightPar4', 1);
  const narrow = makeHole('straightPar4', 1);
  narrow.corridorWidth = 24;
  assert.ok(holeStats(narrow).difficulty > holeStats(wide).difficulty);
});

test('all derived stats stay within their documented ranges', () => {
  for (const name of ['shortPar3', 'waterPar3', 'straightPar4', 'doglegPar4', 'longPar5', 'reachablePar5']) {
    const s = holeStats(makeHole(name, 1));
    assert.ok(s.difficulty >= 0 && s.difficulty <= 100, `${name} difficulty ${s.difficulty}`);
    assert.ok(s.scenery >= 0 && s.scenery <= 100, `${name} scenery ${s.scenery}`);
    assert.ok(s.par >= 3 && s.par <= 5, `${name} par ${s.par}`);
    assert.ok(s.upkeep > 0, `${name} upkeep ${s.upkeep}`);
  }
});

test('a hazard in the landing zone counts for far more than one at the tee', () => {
  // The bug: difficulty asked only whether a hazard was near the centreline
  // sideways, never where along the hole it sat. A bunker 20 yards from the
  // tee, which no adult will reach, scored exactly as much as one in the
  // drive's landing zone - so a player could clutter the tee box, watch the
  // number climb, and believe they had made the hole harder.
  const base = holeStats(makeHole('straightPar4', 1)).difficulty;
  const at = (y) => {
    const h = makeHole('straightPar4', 1);
    h.features.push({ type: 'bunker', x: 8, y, size: 10 });
    return holeStats(h).difficulty - base;
  };
  const atTee = at(20);
  const inDriveZone = at(205);
  const greenside = at(385);

  assert.ok(inDriveZone > atTee * 2, `drive zone ${inDriveZone} vs tee ${atTee}`);
  assert.ok(greenside > atTee * 2, `greenside ${greenside} vs tee ${atTee}`);
  assert.ok(atTee > 0, 'a hazard is never worth literally nothing');
});

test('a hazard far offline still counts for less than one in the corridor', () => {
  const base = holeStats(makeHole('straightPar4', 1)).difficulty;
  const inCorridor = makeHole('straightPar4', 1);
  inCorridor.features.push({ type: 'bunker', x: 8, y: 205, size: 10 });
  const wayOffline = makeHole('straightPar4', 1);
  wayOffline.features.push({ type: 'bunker', x: 120, y: 205, size: 10 });

  assert.ok(
    holeStats(inCorridor).difficulty - base > holeStats(wayOffline).difficulty - base,
    'sideways proximity must still matter'
  );
});
