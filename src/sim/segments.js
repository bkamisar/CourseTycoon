import { clamp } from './hole.js';
import { goodwillFactor } from './goodwill.js';

/**
 * Three crowds who want incompatible things.
 *
 * `idealDifficulty` is the point each segment enjoys most, and `tolerance`
 * how far from it they will stray before losing interest. Locals and
 * serious golfers sit far apart on that axis deliberately: it is the
 * central tension of the game and no course can satisfy both.
 */
export const SEGMENTS = {
  locals: {
    label: 'Locals',
    shortLabel: 'Locals',   // the HUD bar has no room for the full name
    idealDifficulty: 30,
    tolerance: 26,
    priceSensitivity: 1.6,   // how hard an overpriced round drives them off
    sceneryWeight: 0.15,
    turfWeight: 0.35,
    amenityWeight: 0.2,
    waitWeight: 1.5,         // multiplier on the wait penalty in satisfaction
    spendMultiplier: 0.8,    // relative wallet
  },
  serious: {
    label: 'Serious golfers',
    shortLabel: 'Serious',   // the HUD bar has no room for the full name
    idealDifficulty: 72,
    tolerance: 24,
    priceSensitivity: 0.5,
    sceneryWeight: 0.3,
    turfWeight: 1.4,         // the only segment that really notices turf
    amenityWeight: 0.3,
    waitWeight: 1.3,
    spendMultiplier: 1.5,
  },
  destination: {
    label: 'Destination guests',
    shortLabel: 'Guests',   // the HUD bar has no room for the full name
    idealDifficulty: 52,
    tolerance: 40,           // forgiving about the test itself
    priceSensitivity: 0.35,
    sceneryWeight: 1.3,
    turfWeight: 0.7,
    amenityWeight: 1.4,
    waitWeight: 0.8,
    spendMultiplier: 2.1,
  },
};

export const SEGMENT_KEYS = Object.keys(SEGMENTS);

/** Bell-shaped preference: 1 at the ideal, falling away either side. */
export function difficultyFit(difficulty, { idealDifficulty, tolerance }) {
  const d = (difficulty - idealDifficulty) / tolerance;
  return Math.exp(-(d * d));
}

/**
 * How attractive this course is to one segment, 0–1.
 *
 * `courseDifficulty`, `scenery` and `turfQuality` are 0–100. `valueRatio`
 * is green fee over perceived value — 1 means priced exactly at worth.
 *
 * `goodwill` is optional — how this crowd currently feels about the resort,
 * from a decision event's consequence (see `goodwill.js`). Omitting it
 * leaves every existing caller's behaviour exactly as before; passing it
 * multiplies the result by `goodwillFactor`, deliberately kept narrow
 * enough that it cannot manufacture a universal course on its own (see the
 * grid-sweep test in `tests/segments.test.js` re-run with goodwill maxed).
 */
export function segmentAppeal(key, {
  courseDifficulty, scenery, turfQuality, amenityScore, valueRatio, hasRooms,
}, goodwill) {
  const seg = SEGMENTS[key];
  const fit = difficultyFit(courseDifficulty, seg);

  const overpriced = Math.max(0, valueRatio - 1);
  const priceFit = clamp(1 - overpriced * seg.priceSensitivity, 0, 1);

  const quality = clamp(
    (scenery / 100) * seg.sceneryWeight +
    (turfQuality / 100) * seg.turfWeight +
    amenityScore * seg.amenityWeight,
    0, 1.2
  ) / 1.2;

  // Destination guests are largely an Act II crowd: without beds they are
  // day-trippers and far rarer.
  const lodging = key === 'destination' && !hasRooms ? 0.25 : 1;

  const mood = goodwill ? goodwillFactor(goodwill, key) : 1;

  return clamp(fit * priceFit * (0.45 + 0.55 * quality) * lodging * mood, 0, 1);
}

/** Appeal for every segment, plus each one's share of the crowd. */
export function crowdMix(conditions, goodwill) {
  const appeal = {};
  for (const key of SEGMENT_KEYS) appeal[key] = segmentAppeal(key, conditions, goodwill);
  const total = SEGMENT_KEYS.reduce((s, k) => s + appeal[k], 0);
  const share = {};
  for (const key of SEGMENT_KEYS) share[key] = total > 0 ? appeal[key] / total : 0;
  return { appeal, share, total };
}

/**
 * The difficulty the crowd currently playing here would most enjoy — the
 * share-weighted average of their individual ideals.
 *
 * Course rating uses this rather than a fixed number. A fixed ideal asserts
 * there is one correct difficulty for a golf course, which is exactly what
 * the rest of this file denies: locals want 30, serious golfers want 72,
 * and no course satisfies both. Rating a course against a universal ideal
 * meant building the course serious golfers wanted cost you about eleven
 * points of rating for doing it deliberately.
 *
 * With no crowd yet - day one - it falls back to the unweighted mean of the
 * three ideals rather than a magic number.
 */
export function crowdIdealDifficulty(crowd) {
  let total = 0;
  let weighted = 0;
  for (const key of SEGMENT_KEYS) {
    const count = crowd?.[key]?.count ?? 0;
    total += count;
    weighted += count * SEGMENTS[key].idealDifficulty;
  }
  if (total === 0) {
    const sum = SEGMENT_KEYS.reduce((s, k) => s + SEGMENTS[k].idealDifficulty, 0);
    return sum / SEGMENT_KEYS.length;
  }
  return weighted / total;
}
