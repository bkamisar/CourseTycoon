/**
 * The people who paid for the hotel, and what they want for it.
 *
 * Act I's failure mode is pace of play: you lose to arithmetic. Act II's
 * is **people**, which suits a game whose entire variety layer is
 * characters talking to you. The investors fund a hotel you could not
 * afford, and every fortnight they ask how it is going.
 *
 * Two rules do most of the work, and both exist because of mistakes this
 * project has already made.
 *
 * **Confidence moves only at a review.** No drift, no decay, nothing
 * between. A number that moves on its own cannot be steered, and steering
 * it is the game.
 *
 * **The target is named at the start of the period it covers, never at
 * the review.** This is the same rule the weather forecast follows: *"un-
 * forecastable pressure is noise that punishes at random"* (spec §15a.6).
 * A player who can see "occupancy above 62% by day 42" can discount the
 * rate, hold off building, and steer into it. A player ambushed at the
 * review can only be unlucky. And as with the forecast, the honesty is
 * structural rather than tested-for: `state.investors.nextTarget` **is**
 * the object the review reads, not a prediction of it. There is nothing
 * to drift.
 */
import { clamp } from './hole.js';
import { totalRooms } from './rooms.js';

/** A fortnight. Long enough to change something, short enough to feel it. */
export const REVIEW_EVERY = 14;

/** Enough rope to hang yourself with, not enough to relax. */
export const STARTING_CONFIDENCE = 55;

export const MEASURES = Object.freeze([
  'occupancy', 'revenuePerRoom', 'prestige', 'satisfaction',
]);

/** What each outcome does to confidence. Missing costs more than meeting
 * pays, so a run of near-misses is a slide rather than a plateau. */
const CONFIDENCE_CHANGE = Object.freeze({
  beat: 18, met: 10, missed: -12, missedBadly: -25,
});

export function confidenceChange(outcome) {
  return CONFIDENCE_CHANGE[outcome] ?? 0;
}

/** Plain-language names, for a card the player actually reads. */
export const MEASURE_LABEL = Object.freeze({
  occupancy: 'occupancy',
  revenuePerRoom: 'revenue per room',
  prestige: 'prestige',
  satisfaction: 'guest satisfaction',
});

/**
 * What they will ask for, given the hotel as it stands and how long they
 * have been waiting.
 *
 * Every number here was set from measurements of a resort being run
 * properly — a finished nine, staff, amenities — and **not** from the
 * opening three-hole course. The first version of this function was
 * calibrated on the opener and every target came out so soft that a
 * 180-room hotel held 100 confidence for twelve weeks. That is the same
 * error recorded six times in spec §15b, made again here.
 *
 * A working Act II resort measures: prestige 78-82, satisfaction 69-76,
 * about 1.5x the nightly rate per room, and near-full occupancy unless
 * the rate is high or the hotel is enormous.
 *
 * Two shapes matter. Occupancy runs **downward with hotel size**, because
 * a small hotel should be nearly full and a big one need not be — which
 * is how hotels actually work. And everything runs **upward with time**,
 * because an investor who wants the same thing forever is a formality:
 * standing still has to become failure eventually.
 */
export function thresholdFor(measure, { rooms, roomRate, reviewIndex }) {
  const beds = totalRooms(rooms);
  // The first ask is deliberately gentle: the hotel has barely opened.
  const ramp = reviewIndex === 0 ? 0.85 : 1;
  // And every one after climbs. An investor who wants the same thing
  // forever is a formality; the hotel has to keep getting better or the
  // same performance slides from "beat" to "missed" on its own.
  const step = Math.max(0, reviewIndex);

  switch (measure) {
    case 'occupancy':
      // Downward with size, upward with time. Rounded, because a
      // threshold printed as 0.8450000000000001 is the interface showing
      // the player a float instead of a number.
      return Math.round(clamp(
        (0.80 + step * 0.02 - Math.min(0.28, beds / 500)) * ramp, 0.45, 0.96
      ) * 100) / 100;
    case 'revenuePerRoom':
      // A full hotel with a third of its beds in suites takes about 1.5x
      // the nightly rate per room, so anything under that is free.
      return Math.round((roomRate ?? 0) * clamp(1.15 + step * 0.09, 1.15, 1.75) * ramp);
    case 'prestige':
      // A working Act II resort measures 78-82. Starting below that and
      // climbing past it is what makes the later reviews bite.
      return Math.round(clamp(62 + step * 4, 62, 90) * ramp);
    case 'satisfaction':
      // Measured at 69-76 on a resort that is being run properly.
      return Math.round(clamp(64 + step * 2.5, 64, 84) * ramp);
    default:
      return 0;
  }
}

/** Where a measure stands today, from a day's report and state. */
export function measureNow(measure, { report, state }) {
  switch (measure) {
    case 'occupancy':
      return report?.hotel?.rate ?? 0;
    case 'revenuePerRoom': {
      const beds = report?.hotel?.capacity ?? 0;
      return beds > 0 ? (report?.revenue?.rooms ?? 0) / beds : 0;
    }
    case 'prestige':
      return state?.prestige ?? 0;
    case 'satisfaction': {
      const recent = (state?.satisfactionHistory ?? []).slice(-REVIEW_EVERY);
      return recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
    }
    default:
      return 0;
  }
}

/**
 * How a review went.
 *
 * A resort with no hotel is never judged on the hotel. "No rooms built"
 * is not "a hotel running at 0%", and an investor reading it as failure
 * would be the same category error as a balance harness declaring
 * marshals worthless on a three-hole course.
 */
export function assessTarget(target, { report, state }) {
  const hotelMeasure = target.measure === 'occupancy' || target.measure === 'revenuePerRoom';
  if (hotelMeasure && (report?.hotel?.capacity ?? 0) === 0) return 'missed';

  const actual = measureNow(target.measure, { report, state });
  if (actual >= target.threshold * 1.15) return 'beat';
  if (actual >= target.threshold) return 'met';
  if (actual >= target.threshold * 0.8) return 'missed';
  return 'missedBadly';
}

/**
 * Picks the next measure. Seeded, and never the same one twice running —
 * the same no-repeat rule narration and decision events already use,
 * because being asked about occupancy four reviews in a row is a
 * mechanic that has stopped saying anything.
 */
export function pickMeasure(rng, recent = []) {
  // Avoids everything asked about lately, not merely the last one.
  //
  // Blocking only the previous measure was not enough: across five
  // reviews it produced prestige, occupancy, prestige, revenue, prestige
  // — legal under a no-consecutive rule and useless in practice, because
  // prestige is the measure that moves least and was therefore nearly
  // free three times out of five. The same no-repeat-while-unseen rule
  // narration and decision events use, applied properly.
  const seen = new Set(Array.isArray(recent) ? recent : [recent].filter(Boolean));
  const unseen = MEASURES.filter((m) => !seen.has(m));
  const pool = unseen.length > 0 ? unseen : MEASURES.filter((m) => m !== recent[recent.length - 1]);
  return pool[rng.int(pool.length)];
}

/**
 * Builds the target for the period that starts now.
 *
 * Called when a review ends and when the investors first arrive — never
 * at the moment of assessment, which is the whole point.
 */
export function nextTargetFor(state, rng, { recent = [], reviewIndex = 0 } = {}) {
  const measure = pickMeasure(rng, recent);
  return {
    measure,
    threshold: thresholdFor(measure, {
      rooms: state.resort.rooms,
      roomRate: state.resort.pricing.roomRate,
      reviewIndex,
    }),
    dueDay: state.day + REVIEW_EVERY,
    reviewIndex,
  };
}

/** The investors as they arrive, with the first target already named. */
export function startingInvestors(state, rng, { principal = 180000 } = {}) {
  return {
    confidence: STARTING_CONFIDENCE,
    principal,
    bought: false,
    // Which measures have come up since the whole set was last
    // exhausted, so the player is asked about all four before any repeats.
    recentMeasures: [],
    nextTarget: nextTargetFor(state, rng, { recent: [], reviewIndex: 0 }),
    buyoutDemand: null,
  };
}
