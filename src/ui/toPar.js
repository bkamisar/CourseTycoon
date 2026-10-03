/** A score to par as a golfer says it: E, +3, -2. A dash before anybody
 * has a score. */
export function toParText(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}
