import { holeStats, clamp } from './hole.js';
import { crowdIdealDifficulty } from './segments.js';

/**
 * Design quality across the nine, 0–100.
 *
 * Variety is weighted heavily so that nine copies of a good hole rate worse
 * than a mixed set, and fairness punishes a course that is brutal from end
 * to end - the player should not be able to max the rating by making
 * everything as hard as possible.
 */
export function courseRating(holes, turfQuality, crowd = null) {
  const stats = holes.map(holeStats);

  const pars = stats.map((s) => s.par);
  const parSpread = new Set(pars).size;                     // 1–3
  const lengths = stats.map((s) => s.length);
  const lengthSpread = Math.max(...lengths) - Math.min(...lengths);

  const variety =
    (parSpread / 3) * 22 + clamp(lengthSpread / 320, 0, 1) * 18;

  const scenery =
    (stats.reduce((s, x) => s + x.scenery, 0) / stats.length) * 0.28;

  // Fairness asks whether the course suits the people actually playing it,
  // not whether it hits some universal number.
  //
  // This used to target a fixed difficulty of 48, which asserted that golf
  // courses have one correct difficulty - precisely what the segments deny.
  // It meant that building the course serious golfers want (they want 72)
  // cost about eleven points of rating for doing it on purpose, and rating
  // feeds value and prestige, so the player was paid less for succeeding.
  //
  // The crowd is yesterday's, because rating feeds demand and demand
  // decides today's crowd. The lag is welcome: change the course and the
  // rating dips until the clientele catches up, which is the awkward middle
  // of any pivot and ought to be felt.
  const meanDifficulty =
    stats.reduce((s, x) => s + x.difficulty, 0) / stats.length;
  const fairness = 22 - Math.abs(meanDifficulty - crowdIdealDifficulty(crowd)) * 0.45;

  const condition = (turfQuality / 100) * 20;

  return clamp(variety + scenery + fairness + condition, 0, 100);
}

/**
 * Prestige is a slow exponential average, deliberately: a player should not
 * be able to buy their way out of a bad course with one good day.
 *
 * And it is **asymmetric**. A reputation falls faster than it climbs,
 * which is both how reputations actually behave and the mechanism that
 * gives a mistake a cost worth avoiding. Before this, prestige moved at
 * one rate in both directions, so a bad week was undone by a good one and
 * there was no state a player could get into that was genuinely hard to
 * get out of. Ruining the turf outright and leaving $5,000 in the bank
 * bottomed out at $3,210 and was back to $125,340 thirty days later.
 *
 * The ratio is a little over two to one: roughly a fortnight to climb
 * what a week of neglect costs.
 */
export const PRESTIGE_RATE_UP = 0.06;
export const PRESTIGE_RATE_DOWN = 0.13;

export function nextPrestige(current, rating, averageSatisfaction) {
  const target = rating * 0.45 + averageSatisfaction * 0.55;
  const rate = target >= current ? PRESTIGE_RATE_UP : PRESTIGE_RATE_DOWN;
  return clamp(current + (target - current) * rate, 0, 100);
}
