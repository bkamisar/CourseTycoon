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
 */
export const CONDITIONS = {
  clear: {
    label: 'Clear', short: 'Clear',
    demand: 1.12, pace: 0.98, spread: 0.95, turf: -0.9,
    note: 'Perfect golfing weather. The course will take a pounding.',
  },
  fair: {
    label: 'Fair', short: 'Fair',
    demand: 1.00, pace: 1.00, spread: 1.00, turf: -0.2,
    note: 'Nothing to complain about.',
  },
  breezy: {
    label: 'Breezy', short: 'Breezy',
    demand: 0.94, pace: 1.03, spread: 1.18, turf: -0.4,
    note: 'Enough wind to make people think about their club.',
  },
  blowy: {
    label: 'Blowing hard', short: 'Windy',
    demand: 0.78, pace: 1.09, spread: 1.45, turf: -0.6,
    note: 'Scores will be high and rounds will be slow.',
  },
  drizzle: {
    label: 'Drizzle', short: 'Drizzle',
    demand: 0.70, pace: 1.07, spread: 1.10, turf: 1.6,
    note: 'Thin sheet, but the greens will thank you.',
  },
  rain: {
    label: 'Heavy rain', short: 'Rain',
    demand: 0.42, pace: 1.16, spread: 1.28, turf: 2.8,
    note: 'Most people will stay at home. The course drinks it in.',
  },
  storm: {
    label: 'Storm', short: 'Storm',
    demand: 0.10, pace: 1.28, spread: 1.60, turf: 1.2,
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
