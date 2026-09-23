/**
 * How many golfers could possibly turn up, regardless of how many tee
 * times you print.
 *
 * Act I had no such limit, and that was the single biggest reason it was
 * easy. Demand was `capacity * appeal * pull` — strictly proportional to
 * the size of the tee sheet — so a wider interval produced proportionally
 * more golfers, and a happy course produced more still. Measured, that
 * made a positive feedback loop with nothing pushing back on it:
 *
 *     tee every 10 min -> 13 groups/day, satisfaction 35, $500/day
 *     tee every 20 min -> 28 groups/day, satisfaction 70, $5,343/day
 *
 * Sitting on that optimum from day one with nothing in the bank passed
 * the Act I gate on **day 13** and finished ninety days with $495,420,
 * which is ten times what the gate asks for. There was no scarcity after
 * the second week and therefore nothing left to decide.
 *
 * A golf course sits in a place, and that place contains a finite number
 * of people who might play golf today. Reputation widens the circle —
 * first the town, then the county, then people who will drive two hours
 * for a course worth driving to — but it widens with diminishing returns,
 * because the second hour of driving persuades far fewer people than the
 * first.
 *
 * That ceiling is what turns "wider is always better" into a real
 * decision: print more tee times than your reputation can fill and the
 * empty slots cost you upkeep for nothing, while printing too few leaves
 * money on the table and a queue on the first tee.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */
import { clamp } from './hole.js';

/**
 * Groups a day the immediate area supplies on reputation alone.
 *
 * Set so that it does **not** bind on the opening course. The first draft
 * used 9, which put the ceiling at 13.3 groups against an opening resort
 * that naturally draws 13 -- so the cap bit from day one and flattened
 * every early decision, including making two completely different menus
 * earn the same money to the dollar. A ceiling is meant to stop a good
 * resort compounding without limit, not to stop a new one growing at all.
 */
export const LOCAL_GROUPS = 18;

/**
 * How many more groups a perfect reputation can reach, on top of the
 * locals. `LOCAL_GROUPS + REACH_GROUPS` is therefore the most a resort
 * can ever draw in a day without a hotel.
 */
export const REACH_GROUPS = 16;

/**
 * Curve on prestige. Below 1 so early reputation is worth more than late:
 * getting known at all roughly doubles your reach, while the last ten
 * points of prestige add very little. This is the shape that stops a good
 * resort compounding into an unbeatable one.
 */
export const REACH_CURVE = 0.75;

/**
 * Extra groups a bed brings, per room, up to a point.
 *
 * Somebody who can sleep at the resort will travel further to reach it,
 * which is the mechanical reason a hotel belongs in this game at all
 * rather than being a second money printer. Capped so a hotel widens the
 * market without removing the ceiling.
 */
export const GROUPS_PER_ROOM = 0.22;
export const MAX_ROOM_REACH = 12;

/**
 * The most groups that could turn up today.
 *
 * `rooms` is the resort's room counts, or undefined in Act I. Note this
 * is a ceiling on *interest*, not a target: a resort nobody likes will
 * not reach it, and a tee sheet too small to hold it will not seat it.
 */
export function catchmentGroups(prestige = 0, rooms = null) {
  const reach = REACH_GROUPS * (clamp(prestige, 0, 100) / 100) ** REACH_CURVE;

  let beds = 0;
  if (rooms) {
    const total = Object.values(rooms).reduce((sum, n) => sum + (n ?? 0), 0);
    beds = Math.min(total * GROUPS_PER_ROOM, MAX_ROOM_REACH);
  }

  return LOCAL_GROUPS + reach + beds;
}

/**
 * How full the local market is, 0..1, for telling the player whether the
 * thing holding them back is their reputation or their tee sheet.
 *
 * A screen that says "you are turning people away" and a screen that says
 * "nobody else is coming" call for opposite decisions, and until this
 * existed the game could not tell them apart.
 */
export function catchmentPressure(groupsWanted, ceiling) {
  if (ceiling <= 0) return 1;
  return clamp(groupsWanted / ceiling, 0, 1);
}
