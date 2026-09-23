/**
 * Things that are still wrong tomorrow.
 *
 * Every consequence in this game used to land in a single instant: an
 * event moved money, prestige, turf or goodwill once, and the next
 * morning the resort was whole again. Goodwill was the only thing with
 * any duration at all, and it fades inside a fortnight.
 *
 * That is why nothing in Act I was hard to dig out of. Ruining the turf
 * outright and leaving $5,000 in the bank bottomed out at $3,210 and was
 * back above $120,000 thirty days later, because the damage was a number
 * subtracted once and everything that produced money kept producing it.
 *
 * A condition is damage with a duration. It sits on the state, does its
 * work every morning, counts down, and goes away. Four kinds, deliberately
 * different in what they attack, so that no single lever digs you out of
 * all of them:
 *
 *   - **`dailyMoney`** — a bill. Instalments on a fine, a loan taken to
 *     fix something, a rate rise. Hurts most when you are poor, which is
 *     precisely when these arrive.
 *   - **`turfPerDay`** — the ground itself is against you. Drainage gone,
 *     a blight, a chemical spill. Groundskeepers still work; they are
 *     just working uphill, so the fix is *more* wage for *longer*.
 *   - **`demandFactor`** — nobody wants to come. A bad write-up, an
 *     outbreak, a road closure. Money dries up at the source, and the
 *     usual answer of "run a busier day" is the one thing unavailable.
 *   - **`holesClosed`** — part of the course is shut. Shortens the round,
 *     which changes who the resort suits as well as what it earns.
 *
 * They stack, because two problems at once is the situation worth having
 * a mechanic for. `demandFactor` multiplies so a run of bad luck
 * compounds rather than saturating.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */
import { clamp } from './hole.js';

/** Nothing may last longer than this. A consequence the player cannot
 * see the end of is a punishment rather than a problem to solve. */
export const MAX_DURATION = 30;

/**
 * Adds a condition, or refreshes one already running.
 *
 * Re-imposing takes the longer of the two remaining durations rather than
 * adding them together: a second bad review while the first is still
 * biting should extend the misery, not double it into something nobody
 * can plan around.
 */
export function addCondition(conditions = [], condition) {
  if (!condition?.id) return conditions.slice();
  const days = clamp(condition.days ?? 1, 1, MAX_DURATION);
  const existing = conditions.find((c) => c.id === condition.id);
  if (existing) {
    return conditions.map((c) => (c.id === condition.id
      ? { ...c, ...condition, daysLeft: Math.max(c.daysLeft, days) }
      : c));
  }
  return [...conditions, { ...condition, days, daysLeft: days }];
}

/** One morning's countdown. Anything spent is dropped. */
export function tickConditions(conditions = []) {
  return conditions
    .map((c) => ({ ...c, daysLeft: c.daysLeft - 1 }))
    .filter((c) => c.daysLeft > 0);
}

/**
 * Everything currently wrong, combined into the handful of numbers the
 * day actually reads. Returned as one object so `day.js` asks once rather
 * than looping over conditions in four places and forgetting one.
 */
export function conditionEffects(conditions = []) {
  let dailyMoney = 0;
  let turfPerDay = 0;
  let holesClosed = 0;
  let demandFactor = 1;

  for (const c of conditions) {
    dailyMoney += c.dailyMoney ?? 0;
    turfPerDay += c.turfPerDay ?? 0;
    holesClosed += c.holesClosed ?? 0;
    demandFactor *= c.demandFactor ?? 1;
  }

  return {
    dailyMoney,
    turfPerDay,
    holesClosed,
    // Floored rather than allowed to reach zero: a resort nobody can
    // visit at all is a dead save, not a hard one.
    demandFactor: clamp(demandFactor, 0.15, 1),
  };
}

/** Whether anything is currently wrong, for the screens that only need
 * to know whether to show a warning at all. */
export function hasConditions(conditions = []) {
  return (conditions?.length ?? 0) > 0;
}
