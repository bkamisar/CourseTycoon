import { holeStats, clamp } from './hole.js';

/**
 * Design quality across the nine, 0–100.
 *
 * Variety is weighted heavily so that nine copies of a good hole rate worse
 * than a mixed set, and fairness punishes a course that is brutal from end
 * to end - the player should not be able to max the rating by making
 * everything as hard as possible.
 */
export function courseRating(holes, turfQuality) {
  const stats = holes.map(holeStats);

  const pars = stats.map((s) => s.par);
  const parSpread = new Set(pars).size;                     // 1–3
  const lengths = stats.map((s) => s.length);
  const lengthSpread = Math.max(...lengths) - Math.min(...lengths);

  const variety =
    (parSpread / 3) * 22 + clamp(lengthSpread / 320, 0, 1) * 18;

  const scenery =
    (stats.reduce((s, x) => s + x.scenery, 0) / stats.length) * 0.28;

  // Mid handicappers want a test, not a punishment beating.
  const meanDifficulty =
    stats.reduce((s, x) => s + x.difficulty, 0) / stats.length;
  const fairness = 22 - Math.abs(meanDifficulty - 48) * 0.45;

  const condition = (turfQuality / 100) * 20;

  return clamp(variety + scenery + fairness + condition, 0, 100);
}

/**
 * Prestige is a slow exponential average, deliberately: a player should not
 * be able to buy their way out of a bad course with one good day.
 */
export function nextPrestige(current, rating, averageSatisfaction) {
  const target = rating * 0.45 + averageSatisfaction * 0.55;
  const RATE = 0.08;
  return clamp(current + (target - current) * RATE, 0, 100);
}
