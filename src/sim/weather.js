/**
 * What the sky is doing, today and for the next few days.
 *
 * Spec §15a.6 settled the design before any of this was written, and one
 * line of it decides the architecture: *"Unforecastable weather is noise
 * that punishes at random."* Weather that arrives unannounced is a tax on
 * the player rather than a thing they can play around. So the forecast is
 * the feature, and the weather is what makes the forecast worth reading.
 *
 * Which creates the obvious trap. A forecast that disagrees with the day
 * that follows is the exact bug this project produces most — the renderer
 * against `lieAt`, prices in the UI against the sim, a pace forecast that
 * ignored marshals, a pro shop that complained about a queue it did not
 * charge for. A forecast is that bug waiting to happen, because it is
 * literally a claim about a number computed somewhere else.
 *
 * So it is made impossible rather than tested for: **weather is a pure
 * function of the resort's weather seed and the day number.** Forecasting
 * is not prediction, it is asking the same function about a day that has
 * not arrived yet. The forecast cannot drift from the weather because it
 * IS the weather, read early.
 */
import { makeRng } from './rng.js';

/**
 * What each condition does. Multipliers on demand, pace and shot spread;
 * a daily delta on turf.
 *
 * Rain is the interesting one: it drives golfers away and slows the ones
 * who come, and it waters the course for free. A wet week costs money and
 * leaves the turf better than it found it, which is a real trade rather
 * than a punishment.
 *
 * `demand` is the harshest lever and deliberately so — it is the one that
 * makes a bad run of weather a genuine threat to a thin bankroll, which
 * is the whole reason this exists. Bankruptcy has sat at exactly 0%
 * across every balance run ever done on this game, because with no
 * variance source each seed plays out near-identically.
 *
 * `setupClimb` and `setupSoften` are Act III's (run-up spec 2026-10-04
 * §3). `setupClimb` multiplies the grounds crew's daily climb toward a
 * championship setup: wet greens cannot be firmed, and a hard wind dries
 * them faster than a still day, so blowing hard firms slightly better than
 * fair. `setupSoften` is how many points of setup a booked course loses
 * that day, climbing or holding — heavy rain undoes some of the work, and
 * the crew climbs it back from the next morning. Neither touches an
 * unbooked course, which is decaying on its own already.
 *
 * Calibrated against the spec's fairness bar (§7.2): the smallest crew
 * that reaches a rung's band midpoint in RUN_UP_DAYS of neutral weather
 * must still reach it by the first round in at least 90% of 120 weather
 * seeds' real weather. Measured 2026-10-04 by replaying nextSetup over the
 * real days (booked on day 1; RUN_UP_DAYS + 1 setup updates, because
 * runDay updates the setup on the round-1 morning before play):
 *
 *                 target  crew   start values   final (rain 0.35)
 *    County Open     53     4       91.7%           91.7%
 *    Regional        70     5       90.0%           91.7%
 *    National        86     6       88.3%           91.7%
 *
 * The spec's starting rain climb of 0.25 failed the National, so it was
 * raised one step to 0.35, the smallest change that clears all three;
 * nothing else moved. Pooled over ten booking days (1, 48, ... 424) the
 * final figures are 95.3 / 94.0 / 93.5%. Softening while climbing is what
 * hurts most: a rain day costs a four-keeper crew about 1.3 days of work
 * and a storm 2.3, which is also why the thinnest rung fails as often as
 * the heaviest.
 *
 * "Reach" means arrive at the target on some morning up to and including
 * round 1. A course already held at its target can still be softened by
 * rain ON the round-1 morning, and only climbs back the day after, so the
 * share that is AT the target as round 1 is played is lower: 81.7 / 83.3 /
 * 83.3% on the same seeds. That gap is weather on the day, which the
 * 3-day forecast shows the player, not a crew that failed to get there,
 * and no climb multiplier can close it: it was ~7% of weeks (the share of
 * rain and storm days) with the softening left at 2 and 4. Cutting the
 * softening to 1 and 2 (with rain 0.4, drizzle 0.75) only lifted it to
 * 88-92% while gutting the feature, so the softening was left as the
 * spec has it and the gap is recorded here instead.
 */
export const CONDITIONS = {
  clear: {
    label: 'Clear', short: 'Clear',
    demand: 1.12, pace: 0.98, spread: 0.95, turf: -0.9,
    setupClimb: 1.15, setupSoften: 0,
    note: 'Perfect golfing weather. The course will take a pounding.',
  },
  fair: {
    label: 'Fair', short: 'Fair',
    demand: 1.00, pace: 1.00, spread: 1.00, turf: -0.2,
    setupClimb: 1.0, setupSoften: 0,
    note: 'Nothing to complain about.',
  },
  breezy: {
    label: 'Breezy', short: 'Breezy',
    demand: 0.94, pace: 1.03, spread: 1.18, turf: -0.4,
    setupClimb: 1.0, setupSoften: 0,
    note: 'Enough wind to make people think about their club.',
  },
  blowy: {
    label: 'Blowing hard', short: 'Windy',
    demand: 0.78, pace: 1.09, spread: 1.45, turf: -0.6,
    setupClimb: 1.1, setupSoften: 0,
    note: 'Scores will be high and rounds will be slow.',
  },
  drizzle: {
    label: 'Drizzle', short: 'Drizzle',
    demand: 0.70, pace: 1.07, spread: 1.10, turf: 1.6,
    setupClimb: 0.6, setupSoften: 0,
    note: 'Thin sheet, but the greens will thank you.',
  },
  rain: {
    label: 'Heavy rain', short: 'Rain',
    demand: 0.42, pace: 1.16, spread: 1.28, turf: 2.8,
    setupClimb: 0.35, setupSoften: 2,
    note: 'Most people will stay at home. The course drinks it in.',
  },
  storm: {
    label: 'Storm', short: 'Storm',
    demand: 0.10, pace: 1.28, spread: 1.60, turf: 1.2,
    setupClimb: 0, setupSoften: 4,
    note: 'Almost nobody is playing golf today.',
  },
};

export const CONDITION_KEYS = Object.freeze(Object.keys(CONDITIONS));

/**
 * How often each condition comes up. Weighted toward playable golf —
 * three days in four are fair or better — so bad weather reads as an
 * event rather than as the climate.
 */
const WEIGHTS = {
  clear: 30, fair: 30, breezy: 16, blowy: 8, drizzle: 9, rain: 5, storm: 2,
};
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);

/**
 * The weather on `day`, for a resort with this `weatherSeed`.
 *
 * Pure and stable: the same day always has the same weather, which is
 * what makes a forecast possible without a second source of truth. Days
 * are 1-based to match `state.day`.
 */
export function weatherOn(weatherSeed, day) {
  const rng = makeRng(weatherSeed * 7919 + day * 104729);
  let roll = rng.next() * TOTAL_WEIGHT;
  for (const key of CONDITION_KEYS) {
    roll -= WEIGHTS[key];
    if (roll <= 0) return key;
  }
  return 'fair';
}

/**
 * The next `days` days, starting with `fromDay`.
 *
 * This is the forecast, and it is simply `weatherOn` asked early. There
 * is no prediction model to drift from the truth because there is no
 * prediction.
 */
export function forecast(weatherSeed, fromDay, days = 3) {
  return Array.from({ length: days }, (_, i) => ({
    day: fromDay + i,
    key: weatherOn(weatherSeed, fromDay + i),
  }));
}

/** The effects of a condition, safe for an unknown key. */
export function effectsOf(key) {
  return CONDITIONS[key] ?? CONDITIONS.fair;
}

/** Whether a condition is bad enough to be worth warning about. */
export function isRough(key) {
  return effectsOf(key).demand < 0.8;
}
