/**
 * The officials' practice round: what the governing body reports when it
 * walks the course eleven days before the first round (run-up spec
 * 2026-10-04 §2).
 *
 * Two questions, two functions. `projectSetup` is where the crew will
 * have the course before the week; `practiceForecast` is where a field
 * would finish on it. Both are pure. The forecast plays the same week the
 * game plays (`simulateWeek` below, also the one `tools/calibrateWeek.js`
 * measures): the real `playField`, the real fixed field, and -- given the
 * crew -- the same round-morning `nextSetup` step `runDay` takes, with
 * that morning's weather. What it cannot know is the real weather, the
 * field's luck, and anything the player changes after it is read (the
 * crew, the target, the holes, the pins); the card says it is "on the
 * course as it stands" with fair pins.
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
 * The practice evening is this many days before the first round: the
 * run-up's middle evening (spec §2). Ten days of crew left to act on what
 * it says -- enough to move the target and have the crew get there, or to
 * rework a hole -- and late enough that the crew's climb is mostly done,
 * so the setup it projects is not a guess. On a 21-day run-up booked on
 * day D it is the evening of D + 10.
 */
export const PRACTICE_DAYS_BEFORE = 11;

/**
 * The forecast's own seed, from the save's seed and the practice day --
 * never from the day's `rng`, so holding the practice round cannot move
 * any other number in the day. The same mix `applyEventChoice` uses, plus
 * an offset so the two streams never coincide; cut to 32 bits like the
 * per-sample seeds in `practiceForecast`. A replay prints the same report.
 */
export function practiceSeed(stateSeed, day) {
  return ((stateSeed ?? 1) * 7919 + day * 104729 + 7) >>> 0;
}

/**
 * The setup the crew will have after `days` more setup updates, carried
 * forward day by day with `nextSetup` in neutral weather (climb 1,
 * soften 0).
 *
 * Booking semantics exactly as `runDay` applies them: the course is
 * booked (`hold`), and the crew is `conditioning` on any day it starts
 * below the target. So a big crew arrives and holds rather than
 * overshooting, a small one falls short, and a course above its target
 * eases down to it and stops.
 *
 * Counting `days`: on the evening of day d (after that day's update) the
 * updates still to come are the mornings of d + 1 through the first round
 * inclusive -- runDay updates the setup on the round-1 morning too,
 * before the field tees off -- so the round-1 setup is
 * `days = week.day - d`. The same count Task 1's weather calibration used
 * (a booking on day D gets updates on D through D + RUN_UP_DAYS; see the
 * note above CONDITIONS in weather.js). `practiceForecast` wants the
 * evening before round 1 instead, `days = week.day - d - 1`, because it
 * takes the round mornings itself, each in its own weather.
 *
 * Neutral weather because the forecast reaches only three days: the real
 * climb will usually be a little faster than this on dry days and slower
 * on wet ones, and the card says it is a projection.
 */
export function projectSetup({ setup = 0, target = 0, keepers = 0, days = 0 }) {
  let s = setup;
  for (let d = 0; d < days; d++) s = crewStep(s, { keepers, target });
  return s;
}

/** One morning's setup update for a booked course, exactly as runDay
 * makes it. Neutral weather unless `sky` is given. */
function crewStep(setup, { keepers, target }, sky = null) {
  return nextSetup(setup, {
    keepers,
    conditioning: setup < target,
    target,
    hold: true,
    climb: sky ? sky.setupClimb : 1,
    soften: sky ? sky.setupSoften : 0,
  });
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
 *
 * `crew: { keepers, target }` is the grounds crew the game would have.
 * With it, `setup` is the course the evening before round 1, and every
 * round morning steps it with `nextSetup` in that morning's weather, as
 * runDay does: rain on a round day softens a held course by 2 (a storm
 * by 4) and the crew climbs it back from the next morning. Without it
 * the setup is held fixed all week -- the calibration's default, and what
 * the rungs' targets were tuned on (2026-10-03, before setup weather
 * existed). Measured 2026-10-04 at each rung's band midpoint with the
 * smallest crew that reaches it (four, five, six keepers; seeds k * 101
 * for k = 1..400, minimum + 3 course), the round-morning step left the
 * median winner where it was at every rung (-1, +6, +17 either way),
 * changed the winning total in 26 / 42 / 59 of the 400 weeks, and moved
 * the mean by 0.00 / -0.10 / -0.00 strokes. A soft morning is about one
 * round in fourteen (rain 5%, storm 2%) and 2-4 points of setup is a
 * sixth to a third of a handicap point for one round. So the targets
 * stand on it.
 */
export function simulateWeek(holes, {
  rungId, setup, seed, policy = () => 'fair', weatherSeed = seed, firstDay = 100,
  turfQuality = 90, teeInterval = 14, crew = null,
}) {
  const rng = makeRng(seed);
  // One field for the whole week, as the game draws it on the first round.
  const handicaps = drawFieldHandicaps(rng);
  let week = newWeek(rungId, firstDay);
  let roundSetup = setup;
  for (let r = 0; r < week.rounds; r++) {
    const sky = effectsOf(weatherOn(weatherSeed, firstDay + r));
    if (crew) roundSetup = crewStep(roundSetup, crew, sky);
    week = withPins(week, policy({ week, spread: sky.spread }));
    const { playerToPar } = playField(rng, holes, {
      setup: roundSetup, turfQuality, teeInterval, handicaps,
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
 * so.
 *
 * With `keepers` and `target` (the crew and the target as they stand
 * today), `setup` is the course projected to the EVENING BEFORE round 1
 * (`projectSetup` with `days = week.day - d - 1`), and each simulated
 * round morning takes the game's `nextSetup` step in that sample's
 * weather -- so rain on a round day softens the course in the forecast as
 * it will in the week. `setupAtRoundOne` is that evening's setup taken
 * one neutral morning on, the figure the card prints. Without them the
 * setup is held fixed all week and reported back as given.
 *
 * Returns { setupAtRoundOne, difficulty, median, low, high, samples },
 * where low and high are the 10th and 90th percentile winning totals over
 * `samples` simulated weeks of the rung's rounds -- fair pins, one fixed
 * field per week, the real `playField`.
 *
 * The weather for sample i, round r is
 * `weatherOn((seed * 7919 + i) >>> 0, 100 + r)`: drawn from the real
 * weather table with its real odds, but from a seed of its own, so the
 * forecast never reads the actual days ahead and leaks nothing beyond the
 * three-day forecast. The field's seed is the same number. Cut to 32 bits
 * because `weatherOn` multiplies its seed by 7919 again and `makeRng`
 * keeps only 32 bits anyway: a large state seed would otherwise pass
 * 2^53 and lose precision before either saw it. Deterministic in `seed`,
 * so a replay prints the same report.
 */
export function practiceForecast(holes, {
  rungId, setup, keepers, target, turfQuality = 90, teeInterval = 14, seed, samples = 16,
}) {
  if (!Number.isFinite(seed)) {
    throw new Error(`practiceForecast: seed must be a finite number, got ${seed}`);
  }
  const crew = keepers != null && target != null ? { keepers, target } : null;
  const totals = [];
  for (let i = 0; i < samples; i++) {
    const sampleSeed = (seed * 7919 + i) >>> 0;
    totals.push(simulateWeek(holes, {
      rungId, setup, turfQuality, teeInterval, crew,
      seed: sampleSeed, weatherSeed: sampleSeed,
    }));
  }
  totals.sort((a, b) => a - b);
  return {
    setupAtRoundOne: crew ? crewStep(setup, crew) : setup,
    difficulty: courseDifficultyOf(holes),
    median: percentile(totals, 0.5),
    low: percentile(totals, 0.1),
    high: percentile(totals, 0.9),
    samples,
  };
}
