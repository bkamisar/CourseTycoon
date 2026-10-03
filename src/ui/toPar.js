/** A score to par as a golfer says it: E, +3, -2. A dash before anybody
 * has a score. */
export function toParText(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}

/**
 * A field's average to par in words: "6.2 over par", "0.4 under par".
 * Rounded to a tenth first, and the sign decided from the rounded value,
 * so an average that rounds to nothing reads "even par" rather than
 * "0.0 over par". The evening report and the result card both use this,
 * so the two cannot word the same number differently.
 */
export function averageToParText(n) {
  const tenth = Math.round(n * 10) / 10;
  if (tenth === 0) return 'even par';
  return `${Math.abs(tenth).toFixed(1)} ${tenth > 0 ? 'over' : 'under'} par`;
}
