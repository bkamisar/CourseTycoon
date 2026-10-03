/**
 * The spec's shipping criteria for the judge (§11, items 1-4), on the real
 * field: the day's weather (its spread at the field's half strength),
 * turf, the reacting host from tools/championshipPolicy.js.
 *
 * These guard against the judge BREAKING, not against a rate drifting a
 * few points: `node tools/calibrateWeek.js` is the measurement, and its
 * held-out table is the one to quote. Forty-eight seeds keep the suite
 * quick, and forty-eight seeds are noisy, so the floors are wide.
 *
 * How they were set (2026-10-03): twenty fresh sets of forty-eight seeds,
 * from neither the tool's tuning seeds nor its held-out ones (seeds
 * (241 + i) * 101 for i < 960), each played at every rung. Each floor is
 * about two and a half standard deviations of those twenty rates from
 * their mean, rounded outward to a multiple of five, so a harmless
 * reshuffle of the rng is unlikely to flip one (about 5% across the file):
 *
 *               reacting       fair           free ride      overcooked
 *               mean  sd  >=   mean  sd  >=   mean  sd  <=   mean  sd  <=
 *   County       91   5  .75    87   5  .75    13   6  .30    26   5  .40
 *   Regional     77   5  .60    73   7  .55     0   0  .30    23   7  .40
 *   National     77   8  .55    63   7  .45     0   0  .30    not judged
 *
 * The free ride is held to 0.3 everywhere for one rule's sake; no seed of
 * the 960 got a Regional or National free ride into range.
 *
 * Every floor sits under the spec's own criteria, and three of the means
 * do too: the Regional's and National's reacting rates (about 77% against
 * 80%) and the County's overcooked week (about 26% against 25%). Those are
 * accepted limits, recorded in the spec (§8). The National's never reached
 * 80% across 72 variants of the host's pin cut-offs; pins move a
 * four-round week only so far.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_IDS, RUNGS } from '../src/sim/tournaments.js';
import { playField, drawFieldHandicaps } from '../src/sim/field.js';
import { makeRng } from '../src/sim/rng.js';
import { hitRate, POLICIES, SEEDS, courseFor } from '../tools/calibrateWeek.js';

const FEWER = SEEDS.slice(0, 48);
const mid = (id) => Math.round((RUNGS[id].band.low + RUNGS[id].band.high) / 2);
const pct = (rate) => `${Math.round(rate * 100)}%`;

const FLOORS = {
  countyOpen: { reacting: 0.75, fair: 0.75 },
  regional: { reacting: 0.6, fair: 0.55 },
  national: { reacting: 0.55, fair: 0.45 },
};
const FREE_RIDE_CEILING = 0.3;
const OVERCOOKED_CEILING = 0.4;

for (const id of RUNG_IDS) {
  test(`${id}: the free ride is still dead`, () => {
    const rate = hitRate(id, { setup: 0, policy: POLICIES.brutal, seeds: FEWER });
    assert.ok(rate <= FREE_RIDE_CEILING, `an unconditioned course with brutal pins hit the target ${pct(rate)} of the time`);
  });

  test(`${id}: a well-run week is reachable`, () => {
    const reacting = hitRate(id, { setup: mid(id), policy: POLICIES.reacting, seeds: FEWER });
    assert.ok(reacting >= FLOORS[id].reacting, `reacting at the band midpoint hit ${pct(reacting)}`);
    const fair = hitRate(id, { setup: mid(id), policy: POLICIES.fair, seeds: FEWER });
    assert.ok(fair >= FLOORS[id].fair, `fair pins at the band midpoint hit ${pct(fair)}`);
  });
}

for (const id of ['countyOpen', 'regional']) {
  test(`${id}: overcooking still fails`, () => {
    // Not asserted at the National: its band tops out at 92 and the dial
    // at 100, so there is no room to overcook into. The spec records this.
    const rate = hitRate(id, { setup: 100, policy: POLICIES.easy, seeds: FEWER });
    assert.ok(rate <= OVERCOOKED_CEILING, `setup 100 with easy pins hit ${pct(rate)}`);
  });
}

test('pins matter: brutal against easy moves the field by more than a stroke', () => {
  const holes = courseFor('regional');
  const handicaps = drawFieldHandicaps(makeRng(5));
  let gap = 0;
  for (const seed of [1, 2, 3, 4]) {
    const easy = playField(makeRng(seed), holes, { setup: 70, handicaps, pins: 'easy' }).averageToPar;
    const brutal = playField(makeRng(seed), holes, { setup: 70, handicaps, pins: 'brutal' }).averageToPar;
    gap += brutal - easy;
  }
  assert.ok(gap / 4 > 1, `brutal pins only cost the field ${(gap / 4).toFixed(2)} a round`);
});
