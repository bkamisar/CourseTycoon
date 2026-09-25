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

/**
 * How much of the grounds crew's turf care is diverted to conditioning
 * while a championship is being prepared for.
 *
 * This is the run-up's cost. The spec promises firm greens and thick
 * rough are "paid in full before anything is paid back," but one crew
 * both raises setup and holds the turf, so without a diversion the run-up
 * was free: trade while conditioning measured no lower than trade on an
 * ordinary day.
 *
 * Chosen by measurement, and NOT at the 7-12% target that was asked for.
 * `tools/operator.js`'s Act III sweep (prestige ~94, 71 rooms, 18 holes,
 * green fee 80, interval 14) is capacity- and catchment-bound: raw demand
 * ("wanted") ran 5-6x the tee sheet's ceiling even at turf 0 and setup
 * 100 together, so a lower course rating removes people who were never
 * going to fit on the sheet anyway. Green fees and room nights, the bulk
 * of a day's trade, do not move at all; only merchandise and food shift,
 * because they alone read `averageSatisfaction` rather than group count.
 * A full 100% diversion — the most this lever can do — measured trade
 * during the run-up only 0.4-2.5% below an ordinary day across eight
 * seeds, not 7-12%. This is the same capacity-bound demand that keeps
 * `tests/tournamentDay.test.js`'s "a conditioned course is a worse day
 * out" a todo (see docs/known-issues.md) — a course-quality lever cannot
 * out-argue a sold-out tee sheet, and no value of this constant changes
 * that.
 *
 * 0.4 is chosen against a different, checkable constraint instead: the
 * turf bonus (`TURF_EXPECTED`, 78) must stay reachable by a real crew.
 * Above roughly 0.5 it stops being reachable on eighteen holes by
 * anything under a dozen groundskeepers even on the easiest rung; at 0.4,
 * nine hold a national's band and turf together through the full 21-day
 * run-up (see `tests/tournamentDay.test.js`). It costs turf measurably
 * (double digits of turf quality against an identical non-conditioning
 * crew, also tested) without being punitive past the point this task was
 * asked to fix. Not the same lever as `SETUP_PER_KEEPER` or
 * `SETUP_DECAY_PER_DAY`, which stay exactly what they were.
 */
export const CARE_DIVERTED_WHILE_CONDITIONING = 0.4;

/** What one day of work adds, given the crew. */
export function setupClimb(keepers = 0) {
  return Math.max(0, keepers) * SETUP_PER_KEEPER;
}

/**
 * Tomorrow's setup.
 *
 * `conditioning` is whether the resort is working toward a championship
 * at all. When it is not, the course drifts back to being a course.
 *
 * A crew never conditions PAST what it was asked for. Without `target`
 * the climb was all-or-nothing -- full rate up, or full decay down -- so
 * a big crew slammed past the band and fell back through it, and the
 * course sat in a saw-tooth instead of at a level. Measured on a national
 * (band 80-92, target 86), nine groundskeepers left the course outside
 * the band on six days in twenty: a thirty per cent chance of losing the
 * largest bonus in the game on nothing but which day the event fell.
 *
 * Easing off on arrival is also what the job actually looks like. The
 * greens are brought to a condition and held there, not overshot every
 * Tuesday and allowed to relax back.
 */
export function nextSetup(setup = 0, { keepers = 0, conditioning = false, target = 100 } = {}) {
  if (!conditioning) return clamp(setup - SETUP_DECAY_PER_DAY, 0, 100);
  // Never past the asking. A crew with more hands than the target needs
  // arrives sooner and then holds, rather than overshooting by the
  // difference.
  const climbed = Math.min(setup + setupClimb(keepers), target);
  return clamp(climbed, 0, 100);
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

/**
 * What each condition pays, as a share of the gap between the base fee
 * and the advertised ceiling.
 *
 * Shares rather than absolute figures so the four conditions keep their
 * relative weight at every rung, and so a change to a rung's money does
 * not silently make the advertised ceiling a lie.
 */
const BONUS_SHARES = Object.freeze([
  { id: 'band', label: 'Course set as asked', share: 0.40 },
  { id: 'turf', label: 'Turf still standing', share: 0.27 },
  { id: 'pace', label: 'Rounds inside the pace target', share: 0.20 },
  { id: 'crowd', label: 'Crowd handled without complaint', share: 0.13 },
]);

/** The turf a championship expects to leave on. */
export const TURF_EXPECTED = 78;

/** What a rung offers, in full, before anybody agrees to anything. */
export function contractFor(rungId) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const pot = rung.purseCeiling - rung.baseFee;
  // Rounded to whole dollars, with the last share taking the remainder so
  // the advertised ceiling is exactly what the bonuses add up to. A
  // contract whose total does not match its own line items is the same
  // bug as a cost line that lies.
  let spent = 0;
  const bonuses = BONUS_SHARES.map((b, i) => {
    const amount = i === BONUS_SHARES.length - 1
      ? pot - spent
      : Math.round(pot * b.share);
    spent += amount;
    return { id: b.id, label: b.label, amount };
  });
  return { rung: rungId, baseFee: rung.baseFee, bonuses, ceiling: rung.purseCeiling };
}

/** Prestige a rung moves, won or lost. */
const PRESTIGE_SWING = Object.freeze({ countyOpen: 6, regional: 11, national: 18 });

/** How long a rung is given to somebody else after a shambles. */
export const BAR_DAYS = 120;

/**
 * How the week went.
 *
 * `met` names the conditions that were satisfied, which is what the
 * report shows: four named outcomes traceable to something the player
 * did, rather than one opaque score.
 */
export function scoreTournament(rungId, {
  setup = 0, turfQuality = 0, paceOnTarget = false, crowdHandled = false,
} = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const contract = contractFor(rungId);

  const met = [];
  if (withinBand(setup, rung.band)) met.push('band');
  if (turfQuality >= TURF_EXPECTED) met.push('turf');
  if (paceOnTarget) met.push('pace');
  if (crowdHandled) met.push('crowd');

  const paid = contract.bonuses.reduce(
    (sum, b) => sum + (met.includes(b.id) ? b.amount : 0),
    contract.baseFee
  );

  // Reputation follows the conditions rather than the money, so a resort
  // that ran a good week on a small rung is not punished for the rung
  // being small.
  const swing = PRESTIGE_SWING[rungId] ?? 6;
  const prestige = Math.round(((met.length / 4) * 2 - 1) * swing);

  return {
    rung: rungId,
    met,
    missed: contract.bonuses.map((b) => b.id).filter((id) => !met.includes(id)),
    paid,
    prestige,
    // Nothing below half the conditions is a week anybody wants repeated.
    barDays: met.length <= 1 ? BAR_DAYS : 0,
  };
}
