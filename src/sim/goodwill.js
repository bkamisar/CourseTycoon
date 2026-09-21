import { SEGMENT_KEYS } from './segments.js';
import { clamp } from './hole.js';

/**
 * Per-segment goodwill: how a crowd feels about the resort right now,
 * separate from and layered on top of whether the course itself suits them.
 *
 * A decision event's consequence lands here rather than straight on money
 * or prestige, so a choice colours one segment's opinion for a while without
 * touching the others and without warping the game forever — see
 * `decayGoodwill`.
 */

/** Roughly a month's worth of one segment's opinion, at the extremes. */
export const GOODWILL_MIN = -25;
export const GOODWILL_MAX = 25;

/** Multiplicative decay per day. Chosen so +25 fades below "noticeable"
 * (< 1) in a little over two weeks — inside the one-to-three-week window
 * the design calls for, and never overshooting zero because it is always a
 * fraction of the current value, never a fixed subtraction. */
const DECAY_RATE = 0.2;

/** Below this, treat goodwill as spent rather than let it trail forever. */
const SNAP_TO_ZERO = 0.05;

/**
 * How far `goodwillFactor` can move appeal at the extremes. Deliberately
 * modest: goodwill is a thumb on the scale, not a way to override what the
 * course itself is. Kept low enough that even maxed goodwill for every
 * segment at once cannot manufacture a universal course — see
 * `tests/segments.test.js`'s grid sweep re-run with goodwill maxed.
 */
const FACTOR_SPAN = 0.15;

/** Every segment starts with no opinion either way. */
export function emptyGoodwill() {
  const gw = {};
  for (const key of SEGMENT_KEYS) gw[key] = 0;
  return gw;
}

/**
 * Applies a decision's consequence. `changes` is a partial map of segment
 * key to a delta (positive or negative); segments not mentioned are left
 * untouched. Returns a new object — the goodwill passed in is never mutated.
 */
export function applyGoodwill(goodwill, changes = {}) {
  const next = { ...goodwill };
  for (const key of SEGMENT_KEYS) {
    if (!(key in changes) || changes[key] == null) continue;
    next[key] = clamp((next[key] ?? 0) + changes[key], GOODWILL_MIN, GOODWILL_MAX);
  }
  return next;
}

/**
 * One day's fade back toward neutral. Multiplicative, so a segment already
 * at zero stays at zero and decay can never cross past zero to the other
 * side.
 */
export function decayGoodwill(goodwill) {
  const next = {};
  for (const key of SEGMENT_KEYS) {
    const value = (goodwill[key] ?? 0) * (1 - DECAY_RATE);
    next[key] = Math.abs(value) < SNAP_TO_ZERO ? 0 : value;
  }
  return next;
}

/**
 * The multiplier `segmentAppeal` applies for how this segment currently
 * feels about the resort. 1 at zero goodwill (no change from today's
 * behaviour, so every caller that never touches goodwill is unaffected).
 */
export function goodwillFactor(goodwill, key) {
  const value = clamp(goodwill?.[key] ?? 0, GOODWILL_MIN, GOODWILL_MAX);
  return 1 + (value / GOODWILL_MAX) * FACTOR_SPAN;
}
