import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS, RUNG_IDS, rungFor, eligibleFor, SETUP_DECAY_PER_DAY, setupClimb, nextSetup, setupDifficultyBonus, withinBand } from '../src/sim/tournaments.js';

test('there are three rungs, each fully specified', () => {
  assert.equal(RUNG_IDS.length, 3);
  for (const id of RUNG_IDS) {
    const rung = RUNGS[id];
    assert.equal(rung.id, id, `${id}: id does not match its key`);
    assert.ok(rung.label && rung.blurb && rung.blurb.length > 30, `${id}: thin copy`);
    assert.ok(rung.prestige > 0, `${id}: needs a prestige floor`);
    assert.ok(rung.band.low < rung.band.high, `${id}: band is inverted`);
    assert.ok(rung.band.low >= 0 && rung.band.high <= 100, `${id}: band outside 0-100`);
    assert.ok(rung.baseFee > 0 && rung.purseCeiling > rung.baseFee,
      `${id}: the ceiling must beat the base or the bonuses are decoration`);
    assert.ok(Array.isArray(rung.requires), `${id}: requires must be a list`);
  }
});

test('the rungs escalate', () => {
  const order = RUNG_IDS.map((id) => RUNGS[id]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].prestige > order[i - 1].prestige, 'prestige floor must rise');
    assert.ok(order[i].baseFee > order[i - 1].baseFee, 'the money must rise');
    assert.ok(order[i].band.low > order[i - 1].band.low, 'the course must be asked for more');
  }
});

test('eligibility needs the prestige AND the buildings', () => {
  const resort = { amenities: [], rooms: {} };
  assert.equal(eligibleFor('countyOpen', { prestige: 40, resort, holesOpen: 18 }), false,
    'prestige 40 is below every floor');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 9 }), false,
    'nine holes cannot host a championship');
  assert.equal(eligibleFor('countyOpen', { prestige: 60, resort, holesOpen: 18 }), true);

  assert.equal(eligibleFor('regional', { prestige: 75, resort, holesOpen: 18 }), false,
    'no grandstands, no regional');
  const built = { amenities: [{ type: 'grandstands' }, { type: 'overflowParking' }], rooms: {} };
  assert.equal(eligibleFor('regional', { prestige: 75, resort: built, holesOpen: 18 }), true);
});

test('rungFor tolerates nonsense', () => {
  assert.equal(rungFor('nope'), null);
  assert.equal(rungFor(undefined), null);
});

test('the grounds crew decides how fast the course hardens', () => {
  // Groundskeepers have had one job since Act I. This is their second,
  // and a thin crew physically cannot get a course ready in three weeks.
  assert.equal(setupClimb(0), 0, 'nobody working means nothing happens');
  assert.ok(setupClimb(4) > setupClimb(2), 'more staff, faster');
  // Three weeks is the run-up, so a full crew must be able to reach a
  // national's band inside it or the top rung is unreachable.
  const crew = 6;
  let setup = 0;
  for (let d = 0; d < 21; d++) setup = nextSetup(setup, { keepers: crew, conditioning: true });
  assert.ok(setup >= 80, `six keepers reached only ${setup.toFixed(0)} in 21 days`);
});

test('setup falls back when nobody is working on it', () => {
  let setup = 90;
  for (let d = 0; d < 10; d++) setup = nextSetup(setup, { keepers: 6, conditioning: false });
  assert.ok(setup < 90, 'it has to decay');
  assert.ok(setup >= 0, 'and never go below zero');
  assert.equal(nextSetup(0, { keepers: 0, conditioning: false }), 0);
});

test('a hard setup makes the course play harder', () => {
  assert.equal(setupDifficultyBonus(0), 0, 'an unconditioned course plays as itself');
  assert.ok(setupDifficultyBonus(100) > setupDifficultyBonus(50));
  assert.ok(setupDifficultyBonus(100) <= 30,
    'setup must not be able to outweigh the course the player actually built');
});

test('the band is a band, not a threshold', () => {
  assert.equal(withinBand(52, RUNGS.countyOpen.band), true);
  assert.equal(withinBand(30, RUNGS.countyOpen.band), false, 'under-prepared');
  assert.equal(withinBand(85, RUNGS.countyOpen.band), false,
    'a county open tricked up like a national is also wrong');
});
