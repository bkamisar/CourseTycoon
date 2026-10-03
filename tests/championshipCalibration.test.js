/**
 * The spec's shipping criteria for the judge (§11, items 1-4), on the real
 * field: the day's weather (at the field's half strength), turf, the
 * reacting host from tools/championshipPolicy.js.
 *
 * Forty-eight seeds rather than the tool's hundred and twenty, to keep the
 * suite quick, and thresholds with the slack that costs. A winner is noisy
 * enough that twenty-four seeds were a lottery (the same configuration
 * read 38% on one set and 8% on another), and at forty-eight four
 * different subsets of the 120 still moved a rate by up to fifteen points.
 * So each threshold sits outside the whole range those subsets showed,
 * and these tests guard against the judge breaking, not against a rate
 * drifting a few points; `node tools/calibrateWeek.js` is the
 * measurement. Rates on 120 seeds (2026-10-03), with the range across the
 * four 48-seed subsets:
 *
 *               reacting      fair        free ride    overcooked
 *   County      88 (85-92)    85 (83-90)  13 (10-17)   24 (21-31)
 *   Regional    83 (79-88)    72 (63-81)   1 (0-2)     24 (21-29)
 *   National    78 (75-85)    61 (54-69)   0           70, not judged
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

/*
 * The spec asks for 80% reacting at every rung. The National tops out at
 * about 77-79% whatever the policy's cut-offs (72 variants tried), and the
 * author accepted that as a stated limit: the lever is too weak at four
 * rounds, not the host too slow. So the National is held to 70 here.
 */
const REACTING_FLOOR = { countyOpen: 0.75, regional: 0.75, national: 0.7 };

for (const id of RUNG_IDS) {
  test(`${id}: the free ride is still dead`, () => {
    const rate = hitRate(id, { setup: 0, policy: POLICIES.brutal, seeds: FEWER });
    assert.ok(rate <= 0.25, `an unconditioned course with brutal pins hit the target ${pct(rate)} of the time`);
  });

  test(`${id}: a well-run week is reachable`, () => {
    const reacting = hitRate(id, { setup: mid(id), policy: POLICIES.reacting, seeds: FEWER });
    assert.ok(reacting >= REACTING_FLOOR[id], `reacting at the band midpoint hit ${pct(reacting)}`);
    const fair = hitRate(id, { setup: mid(id), policy: POLICIES.fair, seeds: FEWER });
    assert.ok(fair >= 0.5, `fair pins at the band midpoint hit ${pct(fair)}`);
  });
}

for (const id of ['countyOpen', 'regional']) {
  test(`${id}: overcooking still fails`, () => {
    // Not asserted at the National: its band tops out at 92 and the dial
    // at 100, so there is no room to overcook into. The spec records this.
    const rate = hitRate(id, { setup: 100, policy: POLICIES.easy, seeds: FEWER });
    assert.ok(rate <= 0.35, `setup 100 with easy pins hit ${pct(rate)}`);
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
