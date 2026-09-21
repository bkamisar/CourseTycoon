import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAGES, AMENITIES } from '../src/sim/economy.js';

const operatorSource = readFileSync(new URL('../tools/operator.js', import.meta.url), 'utf8');

/**
 * A measurement has two configurations, and both must be capable of the
 * thing being measured:
 *
 *   the world  — is there congestion to relieve, a kitchen to run, a
 *                counter to staff? Guarded by tools/scenarios.js.
 *   the actor  — can the player-model actually pull this lever? Guarded
 *                here.
 *
 * Only the first was guarded, and the second failed immediately: the
 * competent operator hired groundskeepers, cooks and shop hands but never
 * a marshal, so it could not play the strategy that a marshal makes
 * possible — and the harness reported "Act I has exactly one winning
 * line" as a property of the game. It has four.
 *
 * These tests are deliberately crude source checks rather than behavioural
 * ones. The failure mode is an omission, and an omission is exactly what a
 * behavioural test cannot see: a lever nobody pulls produces no behaviour
 * to assert on.
 */

test('the operator can hire every role the game offers', () => {
  for (const role of Object.keys(WAGES)) {
    assert.ok(operatorSource.includes(`'${role}'`),
      `the operator never mentions ${role}, so any conclusion it reaches about `
      + `strategies involving ${role} is meaningless. Add it to the policy, or `
      + `add it to LEVERS_NOT_PULLED with a reason.`);
  }
});

test('the operator can build every amenity the game offers', () => {
  for (const type of Object.keys(AMENITIES)) {
    if (AMENITIES[type].build === 0) continue; // the clubhouse comes free
    assert.ok(operatorSource.includes(`'${type}'`),
      `the operator never builds ${type}, so it cannot measure any strategy `
      + `that depends on it`);
  }
});

test('the operator declares what it deliberately does not do', () => {
  // The honest half. An operator cannot model everything, and the danger
  // is not the gaps — it is forgetting they are there and reading a
  // limitation of the model as a fact about the game.
  assert.ok(operatorSource.includes('LEVERS_NOT_PULLED'),
    'the operator must state its own blind spots, or its numbers will be read as complete');
  const declared = operatorSource.slice(operatorSource.indexOf('LEVERS_NOT_PULLED'));
  assert.ok(declared.length > 200, 'the declaration should actually say something');
});
