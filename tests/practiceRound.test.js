/**
 * The officials' practice round (run-up spec 2026-10-04 §2, §7.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { courseDifficultyOf } from '../src/sim/hole.js';
import { RUNG_IDS, RUNGS, nextSetup } from '../src/sim/tournaments.js';
import { projectSetup, practiceForecast } from '../src/sim/practiceRound.js';
import { course } from './helpers/practiceHonesty.js';

test('projectSetup: eight keepers bring a bare course to a National target in the run-up', () => {
  assert.equal(projectSetup({ setup: 0, target: 86, keepers: 8, days: 21 }), 86);
});

test('projectSetup: two keepers do not', () => {
  const s = projectSetup({ setup: 0, target: 86, keepers: 2, days: 21 });
  assert.ok(s < 86, `two keepers projected ${s}`);
  assert.ok(s > 0, 'and they still climb');
});

test('projectSetup: a course above its target eases down to it and stops', () => {
  assert.equal(projectSetup({ setup: 95, target: 86, keepers: 4, days: 21 }), 86);
  // Part way down on the first morning, not all the way.
  assert.equal(projectSetup({ setup: 95, target: 86, keepers: 4, days: 1 }), 91.5);
});

test('projectSetup: the same as stepping nextSetup by hand in neutral weather, booked', () => {
  for (const [setup, target, keepers, days] of [[10, 70, 5, 13], [0, 53, 4, 21], [60, 53, 3, 6], [40, 0, 6, 4]]) {
    let s = setup;
    for (let d = 0; d < days; d++) {
      s = nextSetup(s, { keepers, conditioning: s < target, target, hold: true, climb: 1, soften: 0 });
    }
    assert.equal(projectSetup({ setup, target, keepers, days }), s, `${setup} -> ${target}, ${keepers} keepers, ${days} days`);
  }
  assert.equal(projectSetup({ setup: 37, target: 86, keepers: 8, days: 0 }), 37, 'no days left, no change');
});

test('practiceForecast: deterministic in its seed, ordered, and measures the course it was given', () => {
  const holes = course(RUNGS.regional.minDifficulty + 3);
  const args = { rungId: 'regional', setup: 70, turfQuality: 90, teeInterval: 14, seed: 4242 };
  const a = practiceForecast(holes, args);
  const b = practiceForecast(holes, args);
  assert.deepEqual(a, b);
  assert.ok(a.low <= a.median && a.median <= a.high, `low ${a.low}, median ${a.median}, high ${a.high}`);
  assert.equal(a.difficulty, courseDifficultyOf(holes));
  assert.equal(a.setupAtRoundOne, 70);
  assert.equal(a.samples, 16);
});

test('practiceForecast: a harder setup forecasts a higher winning total', () => {
  const holes = course(RUNGS.national.minDifficulty + 3);
  const soft = practiceForecast(holes, { rungId: 'national', setup: 0, seed: 77 });
  const firm = practiceForecast(holes, { rungId: 'national', setup: 90, seed: 77 });
  assert.ok(firm.median > soft.median, `setup 90 median ${firm.median}, setup 0 median ${soft.median}`);
});

/*
 * Honesty (spec §7.1): the real week -- fair pins, its own weather and its
 * own field -- must land inside the reported 10th-90th range about 80% of
 * the time (accept 70-90%).
 *
 * Measured 2026-10-04 on a course narrowed to each rung's minimum + 3, at
 * the band midpoint, forecast seed k * 37 and a real week on seed
 * k * 37 + 500009 starting day 200 (so neither its weather nor its field
 * shares anything with the forecast's):
 *
 *               120 seeds   400 seeds   40-seed sets (of 10, /40)
 *   County        85.0%       86.8%      32-39
 *   Regional      85.8%       83.0%      29-36
 *   National      81.7%       82.5%      31-36
 *
 * Inside 70-90% at every rung on 120 seeds, so the criterion is met. Misses
 * fall on both sides (400 seeds: 97 below the range, 94 above), so the
 * range is not shifted, only as wide as sixteen samples make it.
 *
 * Forty seeds a rung, the rungs on three worker threads, keep this to
 * about eight and a half seconds alone (seventeen in series). Forty are
 * noisy (one sd is about six points per rung, three pooled), so the bounds
 * have margin: each rung at least 27/40 (the lowest set of ten was 29), and
 * the three pooled within 75-92% (the ten pooled sets ran 78-87%). Checked
 * by sabotage on these seeds: a forecast quoting the min and max of four
 * weeks covered 63 / 65 / 75% and fails the floor; one too wide (min and
 * max of all sixteen) covered 93% pooled and fails the ceiling, though
 * only just -- the ceiling is the looser guard of the two.
 */
const HONESTY_SEEDS = Array.from({ length: 40 }, (_, k) => (k + 1) * 37);
const RUNG_FLOOR = 27 / 40;
const POOLED = { low: 0.75, high: 0.92 };

/** One rung's honesty hits, on a worker thread (see the helper for why). */
function hitsOnWorker(rungId) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/practiceHonesty.js', import.meta.url), {
      workerData: { honesty: true, rungId, seeds: HONESTY_SEEDS },
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`worker exited ${code}`)); });
  });
}

test('the forecast is honest: the real week lands inside the reported range', async () => {
  const hits = await Promise.all(RUNG_IDS.map(hitsOnWorker));
  const rates = Object.fromEntries(RUNG_IDS.map((id, i) => [id, hits[i] / HONESTY_SEEDS.length]));
  const pooled = hits.reduce((a, b) => a + b, 0) / (HONESTY_SEEDS.length * RUNG_IDS.length);
  const shown = Object.entries(rates).map(([id, r]) => `${id} ${Math.round(r * 100)}%`).join(', ');
  for (const id of RUNG_IDS) {
    assert.ok(rates[id] >= RUNG_FLOOR, `${id} landed inside only ${Math.round(rates[id] * 100)}% (${shown})`);
  }
  assert.ok(pooled >= POOLED.low && pooled <= POOLED.high,
    `pooled ${Math.round(pooled * 100)}% outside ${POOLED.low}-${POOLED.high} (${shown})`);
});
