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
// A cycle with championshipWeek.js, harmless: each side only uses the
// other's exports inside functions, at call time.
import { newWeek } from './championshipWeek.js';

/** The eighteen a championship needs. Named rather than inlined because
 * the Act I gate's nine and this are different numbers for different
 * reasons and should not drift into each other. */
export const CHAMPIONSHIP_HOLES = 18;

/*
 * `rounds`, `minDifficulty` and `target` are the championship week (see
 * docs/superpowers/specs/2026-10-03-course-tycoon-championship-week-design.md).
 *
 * `target` is the winning total to par after the last round, and each
 * range is a centre plus or minus three strokes. Measured on the real field
 * (`node tools/calibrateWeek.js`, 2026-10-03): each seed with its own
 * weather (its spread at the field's half strength, FIELD_WEATHER_EFFECT in
 * field.js), turf 90, on the template course narrowed to the rung's
 * minimum. "Median" is the winner with fair pins at the band's midpoint;
 * the four rates are how often each way of playing the week lands in range.
 *
 * The centres (and the host's pin cut-offs) were chosen on 120 tuning
 * seeds: centres from two under the median to two over were tried at each
 * rung, and County 0 and Regional +5 were the only ones that met every
 * criterion there; National +17 was the best of its five. Rates read on
 * the seeds they were chosen on flatter, so these are 120 HELD-OUT seeds
 * nothing was chosen on, each rate good to about four points (one
 * standard error of a fixed configuration on 120 seeds):
 *
 *                course  centre  median  reacting  fair  setup 0   setup 100
 *                                        (mid)     (mid) brutal    easy
 *   County        45.2      0      -1      92%     83%     8%       30%
 *   Regional      55.2     +5      +5      76%     68%     0%       24%
 *   National      65.0    +17     +16      75%     53%     0%       62%
 *
 * (On the tuning seeds: County 88/85/13/24, Regional 83/72/1/24, National
 * 78/61/0/70.)
 *
 * The spec asks for reacting >= 80%, fair >= 60%, setup 0 brutal <= 15%,
 * setup 100 easy <= 25% (County and Regional only: the National's band
 * tops out at 92, so there is no room to overcook into). Held out, four
 * fall short, and all four are stated limits in the spec (§8): the
 * County's overcooked week (30%), the Regional's and National's reacting
 * rates (76%, 75%) and the National's fair-pins rate (53%). The
 * National's reacting rate never reached 80% across 72 variants of the
 * host's pin cut-offs (best 79%, tuning seeds): pins move a four-round
 * week only so far.
 *
 * An earlier measurement on a simplified field (no weather, no turf
 * effect, 24 seeds) put the centres at -1, +5 and +15. With the day's
 * weather at full strength the County's free ride rose to 26% held out
 * (20% tuning) -- see FIELD_WEATHER_EFFECT.
 *
 * `minDifficulty` is the course's own design, `courseDifficultyOf`. The
 * template rotation an untouched resort is built from measures 40.8;
 * narrowing every fairway to 40 yards reaches 45.5, to 34 reaches 54, to 26
 * reaches 64.4. So each rung asks for some redesign and none asks for a
 * rebuild.
 *
 * `baseFee` and `purseCeiling` are the original purses times 1.6, every
 * rung by the same factor, rounded (2026-10-03): County $18k / $100k ->
 * $29k / $160k, Regional $30k / $240k -> $48k / $380k, National $55k /
 * $500k -> $88k / $800k. The author's rule: a ladder that hits all three
 * targets should roughly break even against never bidding, and one with
 * a miss should lose.
 *
 * Measured by `node tools/actThree.js` (8 settled resorts x 4 Act III
 * seeds = 32 ladders; the table is above `playActThree` in
 * tools/operator.js), with the operator playing as a competent player
 * would: narrowing the night before the first round and widening after,
 * a margin over the floor for hole closures, the field spaced out on
 * round mornings. The 13 ladders that hit all three targets finished at
 * a median of +$21k against never bidding (quartiles -$42k to +$101k,
 * range -$121k to +$189k); all 19 with a miss lost, $144k to $999k
 * (median -$635k).
 *
 * The factor was picked from the same samples at the purses before it
 * (twice the originals, briefly): there the all-hit median was +$338k,
 * and since the purse moves nothing but money (every score, pin and
 * per-day profit came out identical when it doubled) the factor that
 * zeroes that median is 2 x 0.784 = 1.57. Rounded to 1.6. An earlier
 * measurement with the operator narrowing from the bid morning and never
 * widening had asked for 2; that was the operator's play, not the game.
 *
 * One factor rather than weighting toward the National, because at 1.6
 * each rung nearly pays its own way already. Median per hosted week
 * across the 32 ladders: run-up cost against never-bid ordinary profit,
 * plus closed round days, plus required buildings, against what an
 * all-hit week was paid --
 *
 *   County     $108k + $56k            = $164k  against $160k
 *   Regional   $196k + $84k + $103k    = $383k  against $380k
 *   National   $253k + $113k + $200k   = $566k  against $707k
 *
 * The National's surplus on a hit is about what the ladder costs that
 * no single week carries (the buildings' upkeep, the extra keepers kept
 * on, the crowd stands bought on top of the requirements). Weighting
 * toward it would make the National a money-maker and the County a loss.
 *
 * The National's crowd bonus ($92,560 here) is not reachable by a
 * sensible resort. The National's gallery is 12,000; every championship
 * building plus the rest of a built-out property holds 11,600, and the
 * last 400 need the short course (`galleryFor`). Built on a settled
 * resort, the short course cost $0.99M-$1.25M over 240 days (median
 * $1.13M, 8 seeds) in golfers it takes off the main course -- ordinary
 * profit fell from about $26.6k to $22.0k a day -- so it would cost ten
 * times the bonus it unlocks. The all-hit ladders above earned target,
 * turf and usually pace at the National; none earned the crowd, and none
 * should. See docs/known-issues.md.
 *
 * Base stays the same share of the ceiling (18%, 12.6%, 11%), so a
 * missed target still pays well under half.
 */
const LIST = [
  {
    id: 'countyOpen',
    label: 'County Open',
    short: 'County',
    blurb: 'Two hundred entries, a local paper, and a trophy somebody has to fetch from a cupboard. Nobody outside the county will hear about it, which is the point of starting here.',
    prestige: 55,
    requires: [],
    band: { low: 45, high: 60 },
    rounds: 2,
    minDifficulty: 45,
    target: { low: -3, high: 3 },
    baseFee: 29000,
    purseCeiling: 160000,
    prepPerDay: 1600,
  },
  {
    id: 'regional',
    label: 'Regional Championship',
    short: 'Regional',
    blurb: 'A field worth watching and a crowd worth seating. The first rung where people arrive who did not drive themselves, and the first where the course is expected to be a test rather than a nice day out.',
    prestige: 70,
    requires: ['grandstands', 'overflowParking'],
    band: { low: 62, high: 78 },
    rounds: 3,
    minDifficulty: 55,
    target: { low: 2, high: 8 },
    baseFee: 48000,
    purseCeiling: 380000,
    prepPerDay: 3200,
  },
  {
    id: 'national',
    label: 'National Open',
    short: 'National',
    blurb: 'Television, a press tent, and every hole photographed from the air. A week that makes a resort or files it permanently under "nearly".',
    prestige: 82,
    requires: ['mediaCentre', 'hospitalityPavilion'],
    band: { low: 80, high: 92 },
    rounds: 4,
    minDifficulty: 65,
    target: { low: 14, high: 20 },
    baseFee: 88000,
    purseCeiling: 800000,
    prepPerDay: 5400,
  },
];

export const RUNGS = Object.freeze(Object.fromEntries(
  LIST.map((r) => [r.id, Object.freeze({
    ...r, band: Object.freeze(r.band), target: Object.freeze(r.target),
  })])
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
 * while a championship is being prepared for -- every day of the booking
 * with a target set, holding the course at the target included (see
 * `preparing` in day.js).
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

/**
 * On a round day the crew are cutting holes, mowing greens twice and
 * raking bunkers behind the field, so less of their time holds the turf.
 *
 * This REPLACES `CARE_DIVERTED_WHILE_CONDITIONING` on a round day rather
 * than stacking on it, and it is lower: with the public off the course
 * the crew have no tee sheet to work around. The round day's real cost
 * is carried by the field's traffic (`FIELD_WEAR_PER_SETUP`), not by
 * this. Tried at 0.5 (above the run-up's 0.4, which reads more naturally)
 * and rejected, measured 2026-10-03 on the national below: ten keepers
 * finished on 73-74 at the field wear set here and only 79-80 with it
 * cut to 1.0, so ten became the bare minimum rather than a crew with
 * margin, and the nine that hold a national's turf through the run-up
 * (tests/tournamentDay.test.js) would lose it in every week they hosted.
 */
export const CARE_DIVERTED_DURING_ROUNDS = 0.3;

/**
 * How much harder sixty championship players are on firm, fast greens
 * than the same traffic on a soft course. Field traffic is multiplied by
 * 1 + this x setup / 100.
 *
 * Set by measurement against tests/tournamentDay.test.js: six keepers who
 * arrive at a national with the turf just above TURF_EXPECTED must lose it
 * by the last round, and ten must hold it. 1.5 is the first value tried
 * for field wear; a 0.5 round-day diversion was tried and rejected, see
 * CARE_DIVERTED_DURING_ROUNDS above.
 * Measured 2026-10-03, a national held at setup 86 on its minimum course,
 * turf arriving at 80, final turf after the fourth round on seeds 90 / 91
 * / 92:
 *
 *    6 keepers   62  63  63   (8 to 9 lost on the first round)
 *    7 keepers   72  73  72
 *    8 keepers   81  82  82
 *    9 keepers   91  92  91
 *   10 keepers  100 100 100
 *
 * Roughly ten points of final turf per keeper, so the line falls between
 * seven and eight: the dial stays a dial on round days rather than a
 * cliff, and both tests clear it by a wide margin rather than a lucky one.
 *
 * The lower rungs, same seeds, turf arriving at 80: the County Open at
 * setup 52-60 loses it with six keepers (70-74) and holds with seven
 * (78-82); the Regional at setup 70-78 loses it with seven (74-77) and
 * holds with eight (83-86). So the crew a championship asks for is
 * nearly flat across the ladder, seven or eight. The extra rounds up the
 * ladder add little because the turf runs most of the way to the crew's
 * level within the first two (six keepers at the National: 71, 66, 64,
 * 62), so what separates the rungs is mostly the setup.
 */
export const FIELD_WEAR_PER_SETUP = 1.5;

/** What one day of work adds, given the crew. */
export function setupClimb(keepers = 0) {
  return Math.max(0, keepers) * SETUP_PER_KEEPER;
}

/**
 * Tomorrow's setup.
 *
 * `conditioning` is whether the crew is climbing toward the target today:
 * a championship is booked and the course is still below it. `hold` is
 * whether a championship is booked at all. With neither, the course
 * drifts back to being a course.
 *
 * A crew never conditions PAST what it was asked for. Without `target`
 * the climb was all-or-nothing -- full rate up, or full decay down -- so
 * a big crew slammed past the band and fell back through it, and the
 * course sat in a saw-tooth instead of at a level. Measured on a national
 * (band 80-92, target 86), nine groundskeepers left the course outside
 * the band on six days in twenty: a thirty per cent chance of losing the
 * largest bonus in the game on nothing but which day the event fell.
 *
 * Capping the climb at the target was only half of it. Arrival switched
 * `conditioning` off, so the next morning decayed the course a full day
 * below the target and the morning after climbed it back: measured
 * 2026-10-03 on a booked national held at 86, the course read 82.5, 86,
 * 82.5, 86 for ten days, a four-round week played at 83, 86, 83, 86, and
 * the prep bill ($5,400) landed on every other day. Harmless while a
 * championship was one day; a week of rounds made the round the verdict
 * fell on a coin toss again. `hold` is the fix: booked and already there,
 * the course eases down to the target and stops.
 *
 * Easing off on arrival is also what the job actually looks like. The
 * greens are brought to a condition and held there, not overshot every
 * Tuesday and allowed to relax back.
 */
export function nextSetup(setup = 0, {
  keepers = 0, conditioning = false, target = 100, hold = false,
} = {}) {
  // Never past the asking. A crew with more hands than the target needs
  // arrives sooner and then holds, rather than overshooting by the
  // difference.
  if (conditioning) return clamp(Math.min(setup + setupClimb(keepers), target), 0, 100);
  // Booked and already there (or above, because the target was lowered):
  // ease down to the target and stop, rather than falling one day's decay
  // below it and climbing back the next morning. Not booked, it falls all
  // the way.
  const floor = hold ? Math.min(setup, target) : 0;
  return clamp(Math.max(setup - SETUP_DECAY_PER_DAY, floor), 0, 100);
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

/** Whether a winning total is one the rung asked for. Null -- nobody has
 * finished a round -- is never a winner. */
export function withinTarget(total, target) {
  if (total === null || total === undefined) return false;
  return total >= target.low && total <= target.high;
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

/**
 * The daily bill for conditioning toward a rung.
 *
 * Charged every day of the booking that the crew has a target, climbing to
 * it or holding the course there (`preparing` in day.js). Keeping greens
 * firm is the same work as making them firm.
 *
 * Used to be derived from the contract itself — (baseFee + purseCeiling) /
 * 2 / RUN_UP_DAYS — so the bill scaled in lockstep with the purse. That
 * derivation died with the free-ride fix: `scoreTournament` now pays base
 * only when the gate is missed (the band then, the winning-score target
 * since 2026-10-03), which is what actually closes the exploit,
 * so the bill no longer has to do that job by being large. Deriving it from
 * the ceiling also stopped being affordable once the ceiling grew to make
 * the bonuses worth chasing — at the new national it would have billed
 * $23,810/day against a resort earning $18,460/day in profit, which is
 * ruinous rather than demanding.
 *
 * Instead each rung declares its own affordable daily figure (`prepPerDay`)
 * directly, chosen against a resort's ~$18,460/day of ordinary profit
 * rather than against its own purse: a bill a competent resort can carry
 * for three weeks without the run-up alone threatening bankruptcy, but
 * still large enough that skipping it (the free ride) has to beat paying it
 * only by losing the one bonus — the target — that gates all the others.
 */
export function conditioningCostPerDay(rungId) {
  const rung = rungFor(rungId);
  if (!rung) return 0;
  return rung.prepPerDay;
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

  return newWeek(rungId, state.day + RUN_UP_DAYS);
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
  { id: 'target', label: 'Winner inside the target', share: 0.40 },
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
 * `met` names the conditions that were individually satisfied — turf,
 * pace and crowd are reported honestly even when they end up unpaid, so
 * the tournament report can tell a player "your turf held, but the week
 * never tested the field" rather than silently zeroing a condition they
 * actually met.
 *
 * `target` is the gate, not one bonus among four. Three of the four
 * conditions are satisfied by ordinary operation — a normally-staffed
 * course clears turf, the default tee interval clears pace, and crowd is
 * hardcoded true — so paying them regardless of the gate is what made
 * bidding and never conditioning the best line in the game: base plus
 * three free bonuses, for a bill that was never paid. A week whose
 * winner landed outside the target was not delivered as a championship,
 * whatever else went right, so missing the target pays the base fee only.
 * The spec's own line is that a course set wrong is "worse than never
 * having bid" — true here because the run-up bill
 * (`conditioningCostPerDay`) is charged on every day the crew was
 * preparing, whether or not the target was ever hit.
 *
 * The gate moved on 2026-10-03 from the setup band to the winning total.
 * The band asked "is the dial in the right place", which the player
 * answered three weeks early and then watched; the target asks "did the
 * week test the field", which the player is steering right up to the last
 * round. The band survives as guidance on the sheet. And a course under
 * the rung's minimum difficulty fails the gate whatever the winner shot:
 * the field cannot be properly tested on a course too easy to be the venue.
 */
export function scoreTournament(rungId, {
  winningTotal = null,
  // False, not true: a caller that forgets to say the course was measured
  // fails the gate rather than quietly passing it, the same way `newWeek`
  // starts the measurement at null.
  difficultyMet = false,
  turfQuality = 0, paceOnTarget = false, crowdHandled = false,
} = {}) {
  const rung = rungFor(rungId);
  if (!rung) return null;
  const contract = contractFor(rungId);

  const met = [];
  if (difficultyMet && withinTarget(winningTotal, rung.target)) met.push('target');
  if (turfQuality >= TURF_EXPECTED) met.push('turf');
  if (paceOnTarget) met.push('pace');
  if (crowdHandled) met.push('crowd');

  // Everything past the base fee is withheld unless the winner landed
  // inside the target. Turf, pace and crowd stay in `met` when they were
  // individually earned — the report can still say so — but none of them
  // pay out without the target.
  const targetMet = met.includes('target');
  const paid = targetMet
    ? contract.bonuses.reduce(
      (sum, b) => sum + (met.includes(b.id) ? b.amount : 0),
      contract.baseFee
    )
    : contract.baseFee;

  // Reputation follows the conditions rather than the money, so a resort
  // that ran a good week on a small rung is not punished for the rung
  // being small.
  /*
   * The target governs reputation and the rung as well as the money.
   *
   * Prestige used to average the four conditions, so a venue that turned
   * up to a National with the course set to 12 -- having failed the one
   * thing the week was about -- still scored three of four and came away
   * NINE points of reputation better off. The result card noticed before
   * anybody else did: it was printing "a venue that turns up outside the
   * band has not staged a championship" and then, two sentences later,
   * "word gets round, and it gets round in your favour". That was the band,
   * when the band was the gate; the reasoning carried over to the target
   * unchanged.
   *
   * So a missed target costs the full swing, whatever else went right,
   * because the design's line is that a course set wrong is "worse than
   * never having bid". Turf, pace and crowd decide how much CREDIT a
   * delivered championship earns; they cannot rescue one that was not
   * delivered.
   */
  const swing = PRESTIGE_SWING[rungId] ?? 6;
  const earned = ['turf', 'pace', 'crowd'].filter((id) => met.includes(id)).length;
  const prestige = targetMet
    ? Math.round((earned / 3) * swing)
    : -swing;

  return {
    rung: rungId,
    met,
    missed: contract.bonuses.map((b) => b.id).filter((id) => !met.includes(id)),
    paid,
    prestige,
    // Carried so the report can say WHY a winner inside the target still
    // missed: the course was under the rung's minimum.
    difficultyMet,
    // Nothing below half the conditions is a week anybody wants repeated.
    // And they give the rung to somebody else. Same rule as the money and
    // the reputation: the target is whether a championship happened at
    // all, so missing it is what "a poor tournament" means. A week that hit
    // the target but fumbled the rest is a venue having a bad day, which is
    // not the same thing and is not barred for it.
    barDays: targetMet ? 0 : BAR_DAYS,
  };
}
