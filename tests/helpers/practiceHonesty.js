/**
 * The practice round's honesty check for one rung (tests/practiceRound.test.js).
 *
 * Its own module so the test can run the three rungs on three worker
 * threads: played one after another they took about seventeen seconds and
 * nearly tripled the suite's wall-clock time (8.8 s to 23.6 s); in
 * parallel the slowest rung, the four-round National, sets the pace.
 */
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { makeHole } from '../../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../../src/sim/templates.js';
import { RUNGS } from '../../src/sim/tournaments.js';
import { practiceForecast, simulateWeek } from '../../src/sim/practiceRound.js';
import { narrowToDifficulty } from '../../tools/championshipPolicy.js';

/** The untouched resort's template rotation, narrowed the way a host
 * would to `difficulty`. */
export function course(difficulty) {
  const holes = Array.from({ length: 18 }, (_, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  narrowToDifficulty(holes, difficulty);
  return holes;
}

/**
 * The smallest crew that brings a bare course to the band midpoint in
 * RUN_UP_DAYS of neutral weather (Task 1's calibration, weather.js): the
 * thinnest crew a host would actually run, so the one that climbs back
 * slowest after a soft round morning.
 */
export const CREW = { countyOpen: 4, regional: 5, national: 6 };

/**
 * How many of `seeds` see the real week land inside the forecast's range,
 * on a course at the rung's minimum + 3, held at the band midpoint the
 * evening before round 1 by CREW's keepers. Both the forecast and the real
 * week take each round morning's setup step in their own weather. The
 * real week gets its own field and weather (seed + 500009, from day 200),
 * so it shares nothing with the forecast's samples.
 */
export function honestyHits(rungId, seeds) {
  const rung = RUNGS[rungId];
  const holes = course(rung.minDifficulty + 3);
  const setup = Math.round((rung.band.low + rung.band.high) / 2);
  const crew = { keepers: CREW[rungId], target: setup };
  let hits = 0;
  for (const seed of seeds) {
    const { low, high } = practiceForecast(holes, { rungId, setup, ...crew, seed });
    const realSeed = seed + 500009;
    const real = simulateWeek(holes, {
      rungId, setup, crew, seed: realSeed, weatherSeed: realSeed, firstDay: 200,
    });
    if (real >= low && real <= high) hits++;
  }
  return hits;
}

if (!isMainThread && workerData?.honesty) {
  parentPort.postMessage(honestyHits(workerData.rungId, workerData.seeds));
}
