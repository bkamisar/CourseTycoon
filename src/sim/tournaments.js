/**
 * Championships: what they ask for, what they pay, and how they are judged.
 *
 * Act III's central idea is a shape of time the game has never had. Every
 * day in Acts I and II is the same shape — open, play, read the report,
 * decide. A championship is a spike the player sees coming, pays for in
 * advance, and then survives or does not.
 *
 * Three rungs, climbed in order. Bidding is deliberately NOT a dice roll:
 * the player applies and is accepted if the requirements are met, because
 * a management game should not hinge on luck for its central progression.
 * The uncertainty belongs in how the week goes.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */

import { clamp } from './hole.js';

/** The eighteen a championship needs. Named rather than inlined because
 * the Act I gate's nine and this are different numbers for different
 * reasons and should not drift into each other. */
export const CHAMPIONSHIP_HOLES = 18;

const LIST = [
  {
    id: 'countyOpen',
    label: 'County Open',
    blurb: 'Two hundred entries, a local paper, and a trophy somebody has to fetch from a cupboard. Nobody outside the county will hear about it, which is the point of starting here.',
    prestige: 55,
    requires: [],
    band: { low: 45, high: 60 },
    baseFee: 18000,
    purseCeiling: 48000,
  },
  {
    id: 'regional',
    label: 'Regional Championship',
    blurb: 'A field worth watching and a crowd worth seating. The first rung where people arrive who did not drive themselves, and the first where the course is expected to be a test rather than a nice day out.',
    prestige: 70,
    requires: ['grandstands', 'overflowParking'],
    band: { low: 62, high: 78 },
    baseFee: 45000,
    purseCeiling: 120000,
  },
  {
    id: 'national',
    label: 'National Open',
    blurb: 'Television, a press tent, and every hole photographed from the air. A week that makes a resort or files it permanently under "nearly".',
    prestige: 82,
    requires: ['mediaCentre', 'hospitalityPavilion'],
    band: { low: 80, high: 92 },
    baseFee: 110000,
    purseCeiling: 290000,
  },
];

export const RUNGS = Object.freeze(Object.fromEntries(
  LIST.map((r) => [r.id, Object.freeze({ ...r, band: Object.freeze(r.band) })])
));

/** In climbing order. */
export const RUNG_IDS = Object.freeze(LIST.map((r) => r.id));

/** Safe for an unknown id, the way every other lookup in this codebase is. */
export function rungFor(id) {
  return RUNGS[id] ?? null;
}

/**
 * Whether the resort could host this rung today.
 *
 * Prestige is a floor rather than the real gate: a resort leaving Act II
 * measures 78-85, so the buildings are what actually decides. That is
 * deliberate — the decision being asked for is whether to sink money into
 * things that do nothing most of the year.
 */
export function eligibleFor(rungId, { prestige = 0, resort, holesOpen = 0 }) {
  const rung = rungFor(rungId);
  if (!rung) return false;
  if (holesOpen < CHAMPIONSHIP_HOLES) return false;
  if (prestige < rung.prestige) return false;
  const built = new Set((resort?.amenities ?? []).map((a) => a.type));
  return rung.requires.every((type) => built.has(type));
}

/**
 * How much championship condition one groundskeeper adds in a day.
 *
 * Set so that six keepers reach a national's band (80) inside the
 * 21-day run-up and two cannot. Tuned to 0.8: six keepers add 4.8
 * per day, reaching 100.8 over 21 days; two keepers add 1.6 per day,
 * reaching only 33.6. Conditioning is the second job this staff has
 * ever had, which is the point: an existing lever gains a new reason
 * to matter rather than a parallel one being invented.
 */
export const SETUP_PER_KEEPER = 0.8;

/** And it falls back on its own, because firm greens do not stay firm. */
export const SETUP_DECAY_PER_DAY = 3.5;

/** What one day of work adds, given the crew. */
export function setupClimb(keepers = 0) {
  return Math.max(0, keepers) * SETUP_PER_KEEPER;
}

/**
 * Tomorrow's setup.
 *
 * `conditioning` is whether the resort is working toward a championship
 * at all. When it is not, the course drifts back to being a course.
 */
export function nextSetup(setup = 0, { keepers = 0, conditioning = false } = {}) {
  const moved = conditioning
    ? setup + setupClimb(keepers)
    : setup - SETUP_DECAY_PER_DAY;
  return clamp(moved, 0, 100);
}

/**
 * How much harder a conditioned course plays.
 *
 * Capped well below the range the player's own holes cover, because a
 * setup dial that could outweigh the course would make two acts of hole
 * design irrelevant in the third.
 */
export const MAX_SETUP_DIFFICULTY = 26;

export function setupDifficultyBonus(setup = 0) {
  return (clamp(setup, 0, 100) / 100) * MAX_SETUP_DIFFICULTY;
}

/** Whether the course is set the way this rung wants it. */
export function withinBand(setup, band) {
  return setup >= band.low && setup <= band.high;
}

/**
 * Days between winning a bid and the first round.
 *
 * Three weeks rather than the eight first sketched. A long run-up is a
 * grind rather than a sprint, and the cost of conditioning should be
 * visible and sharp rather than a two-month drag on the takings.
 */
export const RUN_UP_DAYS = 21;

/**
 * What a championship crowd will pay for a bed, as a multiple of what an
 * ordinary guest thinks a night here is worth.
 *
 * Generous — people travelling for a championship are not price-shopping
 * the way a golfing weekend does — but finite. A flat "the hotel sells
 * out" made the event night the only price in the game with no ceiling:
 * $9,999 a night still filled 28 of 28 rooms and took $407,956 off a
 * single evening.
 */
export const CHAMPIONSHIP_RATE_TOLERANCE = 3.2;

/**
 * Rooms sold on the night of a championship.
 *
 * The field, the officials, the press and the gallery are not the
 * resort's usual crowd and do not arrive by playing a round, so this does
 * not go through `occupancyFor` — but it keeps the same shape of price
 * sensitivity, so charging a championship premium is a decision rather
 * than free money.
 */
export function championshipRoomsSold(capacity, roomRate, valuePerRound = 60) {
  if (capacity <= 0) return 0;
  const fair = Math.max(1, valuePerRound * 1.6 * CHAMPIONSHIP_RATE_TOLERANCE);
  const fit = clamp(1.3 - (roomRate / fair) * 0.55, 0, 1);
  return Math.round(capacity * fit);
}

/** The next rung this resort is allowed to attempt, or null at the top. */
export function nextRungFor(hosted = []) {
  const done = new Set(hosted);
  return RUNG_IDS.find((id) => !done.has(id)) ?? null;
}

/**
 * Applies for a championship.
 *
 * Returns the booking, or null if the body says no. Refusal is never a
 * dice roll: every reason is a condition the player can read and fix.
 */
export function bidFor(state, rungId, { holesOpen = 0 } = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  // One week at a time.
  if (state.tournament && !state.tournament.resolved) return null;
  // Rungs are climbed, not skipped.
  if (nextRungFor(state.tournamentsHosted ?? []) !== rungId) return null;
  // A rung you embarrassed yourself at is given to somebody else for a while.
  const barredUntil = state.tournamentBars?.[rungId] ?? 0;
  if (state.day <= barredUntil) return null;
  if (!eligibleFor(rungId, {
    prestige: state.prestige,
    resort: state.resort,
    holesOpen,
  })) return null;

  return { rung: rungId, day: state.day + RUN_UP_DAYS, resolved: false };
}
