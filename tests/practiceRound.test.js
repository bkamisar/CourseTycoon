/**
 * The officials' practice round (run-up spec 2026-10-04 §2, §7.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { courseDifficultyOf } from '../src/sim/hole.js';
import { RUNG_IDS, RUNGS, nextSetup } from '../src/sim/tournaments.js';
import { projectSetup, practiceForecast, simulateWeek } from '../src/sim/practiceRound.js';
import { playField, drawFieldHandicaps } from '../src/sim/field.js';
import { weatherOn, effectsOf } from '../src/sim/weather.js';
import { makeRng } from '../src/sim/rng.js';
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

test('practiceForecast: refuses a seed that is not a finite number', () => {
  const holes = course(RUNGS.countyOpen.minDifficulty + 3);
  for (const seed of [undefined, NaN, Infinity, '7']) {
    assert.throws(() => practiceForecast(holes, { rungId: 'countyOpen', setup: 53, seed, samples: 1 }), /seed/);
  }
});

test('practiceForecast: a huge seed still gives a deterministic forecast', () => {
  // seed * 7919 * 7919 would pass 2^53 here without the 32-bit cut.
  const holes = course(RUNGS.countyOpen.minDifficulty + 3);
  const args = { rungId: 'countyOpen', setup: 53, samples: 4 };
  const a = practiceForecast(holes, { ...args, seed: 2 ** 45 + 3 });
  assert.deepEqual(a, practiceForecast(holes, { ...args, seed: 2 ** 45 + 3 }));
  assert.ok(Number.isInteger(a.median));
});

test('practiceForecast: given the crew, the setup it prints is the evening setup one neutral morning on', () => {
  const holes = course(RUNGS.national.minDifficulty + 3);
  const args = { rungId: 'national', keepers: 6, target: 86, seed: 5, samples: 2 };
  // Still climbing: one more morning's work, 6 x 0.8.
  assert.equal(practiceForecast(holes, { ...args, setup: 80 }).setupAtRoundOne, 84.8);
  // Arrived: held.
  assert.equal(practiceForecast(holes, { ...args, setup: 86 }).setupAtRoundOne, 86);
  assert.equal(practiceForecast(holes, { ...args, setup: 80 }).setupAtRoundOne,
    projectSetup({ setup: 80, target: 86, keepers: 6, days: 1 }));
});

/** The first weather seed whose day-100 and day-101 skies pass `test`. */
function weatherSeedWhere(test) {
  for (let ws = 1; ws < 100000; ws++) {
    if (test(weatherOn(ws, 100), weatherOn(ws, 101))) return ws;
  }
  throw new Error('no such weather seed');
}

test('simulateWeek: with a crew, each round morning takes the setup step runDay takes, in its own weather', () => {
  // A County Open (two rounds) held at 53 by four keepers, a storm on the
  // first round morning: round 1 is played at 49 and round 2 at 49 plus a
  // day's climb in round 2's weather -- by hand, as runDay would.
  const holes = course(RUNGS.countyOpen.minDifficulty + 3);
  const crew = { keepers: 4, target: 53 };
  const ws = weatherSeedWhere((a) => a === 'storm');
  const seed = 31;
  const step = (s, key) => nextSetup(s, {
    ...crew, conditioning: s < crew.target, hold: true,
    climb: effectsOf(key).setupClimb, soften: effectsOf(key).setupSoften,
  });
  const rng = makeRng(seed);
  const handicaps = drawFieldHandicaps(rng);
  const totals = new Array(handicaps.length).fill(0);
  let s = 53;
  const played = [];
  for (const day of [100, 101]) {
    const key = weatherOn(ws, day);
    s = step(s, key);
    played.push(s);
    const sky = effectsOf(key);
    const { playerToPar } = playField(rng, holes, {
      setup: s, turfQuality: 90, teeInterval: 14, handicaps, pins: 'fair', spread: sky.spread, pace: sky.pace,
    });
    playerToPar.forEach((v, i) => { totals[i] += v; });
  }
  assert.equal(played[0], 49, 'the storm took four off a held course');
  assert.ok(played[1] > 49 && played[1] <= 53, `and the crew climbed back to ${played[1]}`);
  assert.equal(simulateWeek(holes, { rungId: 'countyOpen', setup: 53, seed, weatherSeed: ws, crew }), Math.min(...totals));
});

test('simulateWeek: a held course on dry round mornings plays exactly as a fixed setup', () => {
  const holes = course(RUNGS.countyOpen.minDifficulty + 3);
  const dry = (k) => effectsOf(k).setupSoften === 0;
  const ws = weatherSeedWhere((a, b) => dry(a) && dry(b));
  const args = { rungId: 'countyOpen', setup: 53, seed: 31, weatherSeed: ws };
  assert.equal(simulateWeek(holes, { ...args, crew: { keepers: 4, target: 53 } }), simulateWeek(holes, args));
});

/*
 * Honesty (spec §7.1): the real week -- fair pins, its own weather and its
 * own field -- must land inside the reported 10th-90th range about 80% of
 * the time (accept 70-90%).
 *
 * Measured 2026-10-04 on a course narrowed to each rung's minimum + 3,
 * held at the band midpoint by the thinnest crew that reaches it (CREW in
 * the helper: 4 / 5 / 6 keepers), forecast seed k * 37 and a real week on
 * seed k * 37 + 500009 starting day 200 (so neither its weather nor its
 * field shares anything with the forecast's). Forecast and real week both
 * take each round morning's setup step in their own weather, as runDay
 * does:
 *
 *               120 seeds   400 seeds   40-seed sets (of 10, /40)
 *   County        87.5%       86.3%      31-37
 *   Regional      83.3%       83.3%      31-36
 *   National      82.5%       83.0%      30-35
 *
 * Inside 70-90% at every rung on 120 seeds, so the criterion is met. Misses
 * fall on both sides (400 seeds: 99 below the range, 91 above), so the
 * range is not shifted, only as wide as sixteen samples make it. (Before
 * the round-morning step was added, with the setup held fixed and the
 * sample seeds not yet cut to 32 bits: 85.0 / 85.8 / 81.7% on 120.)
 *
 * Forty seeds a rung, the rungs on three worker threads, keep this to
 * under ten seconds alone (about seventeen in series). Forty are noisy
 * (one sd is about six points per rung, three pooled), so:
 *
 * - Each rung at least 27/40, 67.5%. The spec's 70% is the criterion for
 *   the true rate, measured above on 120 seeds; this floor sits one seed
 *   below it so 40 seeds' noise alone does not trip it (the lowest of
 *   thirty 40-seed sets was 30/40, and these seeds' own sets read 34, 32,
 *   34). A floor of 70% would be about 2.4 sd under the mean.
 * - The three pooled within 75-90%: the spec's ceiling, unwidened. The
 *   ten pooled sets ran 79-88%; these seeds read 83%.
 *
 * Checked by sabotage on these seeds: a forecast quoting the min and max
 * of four weeks covered 65 / 63 / 65% and fails the floor; one too wide
 * (min and max of all sixteen) covered 95 / 93 / 90%, 93% pooled, and
 * fails the ceiling. Dropping the round-morning setup step does NOT fail
 * this test -- it moves the winner too little to see on forty seeds (see
 * simulateWeek) -- so the two simulateWeek tests above guard it instead.
 */
const HONESTY_SEEDS = Array.from({ length: 40 }, (_, k) => (k + 1) * 37);
const RUNG_FLOOR = 27 / 40;
const POOLED = { low: 0.75, high: 0.9 };

/**
 * One rung's honesty hits, on a worker thread (see the helper for why).
 * Settles once: a worker that errors, or exits for any reason without
 * having posted its count, rejects rather than leaving the test waiting.
 */
function hitsOnWorker(rungId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => { if (!settled) { settled = true; fn(value); } };
    const worker = new Worker(new URL('./helpers/practiceHonesty.js', import.meta.url), {
      workerData: { honesty: true, rungId, seeds: HONESTY_SEEDS },
    });
    worker.once('message', (hits) => settle(resolve, hits));
    worker.once('error', (err) => settle(reject, err));
    worker.once('exit', (code) => settle(reject, new Error(`${rungId} worker exited (code ${code}) without a result`)));
  });
}

test('the forecast is honest: the real week lands inside the reported range', { timeout: 60_000 }, async () => {
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
