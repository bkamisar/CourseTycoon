/**
 * The officials' practice round: what the governing body reports when it
 * walks the course eleven days before the first round (run-up spec
 * 2026-10-04 §2).
 *
 * Two questions, two functions. `projectSetup` is where the crew will
 * have the course on the first morning; `practiceForecast` is where a
 * field would finish on it. Both are pure, and the forecast is honest by
 * construction: it plays the same week the game plays (`simulateWeek`
 * below, which is also the one `tools/calibrateWeek.js` measures), so it
 * can only be wrong about the weather and the field's luck, never about
 * the mechanics.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */
import { makeRng } from './rng.js';
import { courseDifficultyOf } from './hole.js';
import { nextSetup } from './tournaments.js';
import { playField, drawFieldHandicaps } from './field.js';
import { weatherOn, effectsOf } from './weather.js';
import { newWeek, recordRound, winningTotal, withPins } from './championshipWeek.js';

/**
 * The setup the crew will have on the first morning, carried forward day
 * by day with `nextSetup` in neutral weather (climb 1, soften 0).
 *
 * Booking semantics exactly as `runDay` applies them: the course is
 * booked (`hold`), and the crew is `conditioning` on any day it starts
 * below the target. So a big crew arrives and holds rather than
 * overshooting, a small one falls short, and a course above its target
 * eases down to it and stops.
 *
 * `days` is the number of setup updates still to come before play. On the
 * evening of day d (after that day's update) they are the mornings of
 * d + 1 through the first round inclusive -- runDay updates the setup on
 * the round-1 morning too, before the field tees off -- so
 * `days = week.day - d`. The same count Task 1's weather calibration used
 * (a booking on day D gets updates on D through D + RUN_UP_DAYS; see the
 * note above CONDITIONS in weather.js).
 *
 * Neutral weather because the forecast reaches only three days: the real
 * climb will usually be a little faster than this on dry days and slower
 * on wet ones, and the card says it is a projection.
 */
export function projectSetup({ setup = 0, target = 0, keepers = 0, days = 0 }) {
  let s = setup;
  for (let d = 0; d < days; d++) {
    s = nextSetup(s, {
      keepers,
      conditioning: s < target,
      target,
      hold: true,
      climb: 1,
      soften: 0,
    });
  }
  return s;
}

/**
 * One championship week, start to finish, through the real `playField`
 * and the week's real bookkeeping. Returns the winning total.
 *
 * The one week simulator: `practiceForecast` uses it, and so does the
 * calibration (`tools/calibrateWeek.js`, which used to own it and now
 * imports it from here because src/sim must not depend on tools).
 *
 * `seed` drives the field and every shot; `weatherSeed` (defaulting to
 * `seed`, which is what the calibration has always measured) and
 * `firstDay` pick the sky for each round, handed over raw exactly as
 * day.js does -- `playField` damps the spread to the field's strength.
 * `policy({ week, spread })` names each round's pins; fair by default.
 */
export function simulateWeek(holes, {
  rungId, setup, seed, policy = () => 'fair', weatherSeed = seed, firstDay = 100,
  turfQuality = 90, teeInterval = 14,
}) {
  const rng = makeRng(seed);
  // One field for the whole week, as the game draws it on the first round.
  const handicaps = drawFieldHandicaps(rng);
  let week = newWeek(rungId, firstDay);
  for (let r = 0; r < week.rounds; r++) {
    const sky = effectsOf(weatherOn(weatherSeed, firstDay + r));
    week = withPins(week, policy({ week, spread: sky.spread }));
    const { playerToPar } = playField(rng, holes, {
      setup, turfQuality, teeInterval, handicaps,
      pins: week.roundSettings.pins, spread: sky.spread, pace: sky.pace,
    });
    week = recordRound(week, { handicaps, playerToPar, entry: { pins: week.roundSettings.pins } });
  }
  return winningTotal(week);
}

/**
 * Nearest-rank percentile of an ascending list: always one of the totals
 * actually played, so the card never quotes a score no simulated week
 * produced. With sixteen samples the 10th is the 2nd lowest, the median
 * the 8th, the 90th the 15th.
 */
function percentile(sorted, p) {
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/**
 * What the officials' practice round reports.
 *
 * `holes` are today's playable holes -- "the course as it stands"; a
 * redesign before the first round changes the real week and the card says
 * so. `setup` is the setup the week will be played at: the caller projects
 * it (`projectSetup`) and it is reported back as `setupAtRoundOne`, so the
 * card prints the figure the forecast was actually computed on.
 *
 * Returns { setupAtRoundOne, difficulty, median, low, high, samples },
 * where low and high are the 10th and 90th percentile winning totals over
 * `samples` simulated weeks of the rung's rounds -- fair pins, one fixed
 * field per week, the real `playField`.
 *
 * The weather for sample i, round r is `weatherOn(seed * 7919 + i, 100 + r)`:
 * drawn from the real weather table with its real odds, but from a seed of
 * its own, so the forecast never reads the actual days ahead and leaks
 * nothing beyond the three-day forecast. The field's seed is derived the
 * same way. Deterministic in `seed`, so a replay prints the same report.
 */
export function practiceForecast(holes, {
  rungId, setup, turfQuality = 90, teeInterval = 14, seed, samples = 16,
}) {
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const sampleSeed = seed * 7919 + i;
    totals.push(simulateWeek(holes, {
      rungId, setup, turfQuality, teeInterval,
      seed: sampleSeed, weatherSeed: sampleSeed,
    }));
  }
  totals.sort((a, b) => a - b);
  return {
    setupAtRoundOne: setup,
    difficulty: courseDifficultyOf(holes),
    median: percentile(totals, 0.5),
    low: percentile(totals, 0.1),
    high: percentile(totals, 0.9),
    samples,
  };
}
