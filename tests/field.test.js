import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { playField, FIELD_SIZE } from '../src/sim/field.js';

function course(count = 18) {
  return Array.from({ length: count }, (_, i) =>
    ({ ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true }));
}

test('a field plays the course and reports how it played', () => {
  const round = playField(makeRng(1), course(), { setup: 60, turfQuality: 80 });
  assert.equal(round.players, FIELD_SIZE);
  assert.ok(Number.isFinite(round.averageToPar), 'the headline number must be a number');
  assert.ok(round.best <= round.averageToPar, 'somebody has to be better than average');
  assert.ok(round.worst >= round.averageToPar);
  assert.equal(round.hardestHole >= 1 && round.hardestHole <= 18, true,
    'the hardest hole must be one of the holes');
  assert.ok(round.underPar >= 0 && round.underPar <= FIELD_SIZE);
});

test('a harder setup produces higher scores', () => {
  // The read-out for the whole act. If the field shoots the same however
  // the course is set, the setup dial is decoration and the player has no
  // way to find the band.
  const soft = playField(makeRng(2), course(), { setup: 20, turfQuality: 85 });
  const hard = playField(makeRng(2), course(), { setup: 95, turfQuality: 85 });
  assert.ok(hard.averageToPar > soft.averageToPar + 1,
    `setup 95 (${hard.averageToPar.toFixed(1)}) barely beat setup 20 (${soft.averageToPar.toFixed(1)})`);
  assert.ok(hard.underPar <= soft.underPar, 'fewer should break par on a harder course');
});

test('a championship field is better than a Tuesday fourball', () => {
  // They are not the resort's usual guests. A field of 14-handicappers
  // would make every setup look brutal and the band unfindable.
  const round = playField(makeRng(3), course(), { setup: 55, turfQuality: 85 });
  assert.ok(round.averageToPar < 12,
    `the field averaged ${round.averageToPar.toFixed(1)} over par, which is not a championship field`);
});

test('the same seed plays the same championship', () => {
  const a = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  const b = playField(makeRng(9), course(), { setup: 70, turfQuality: 75 });
  assert.deepEqual(a, b, 'a replayed game must play out identically');
});
