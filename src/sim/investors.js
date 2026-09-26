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
import { totalRooms, ROOM_TYPES, roomCounts, nightlyRate } from './rooms.js';

/** What a sold room fetches, as a share of what it cost. The same haircut
 * demolishing an amenity takes — a mistake should cost something without
 * being ruinous. */
export const LIQUIDATION_RETURN = 0.6;

/** A fortnight. Long enough to change something, short enough to feel it. */
export const REVIEW_EVERY = 14;

/** Enough rope to hang yourself with, not enough to relax. */
export const STARTING_CONFIDENCE = 55;

/** The two that only mean anything once beds exist. */
const HOTEL_MEASURES = new Set(['occupancy', 'revenuePerRoom']);

/**
 * The lowest nightly rate the investors will reason about, so an unset
 * rate cannot become a target of nothing. A resort that has just reached
 * Act II has no rooms and no rate, and `0 * anything` is a target of $0
 * — which a resort with no hotel at all then satisfies.
 */
const MIN_JUDGED_RATE = 60;

export const MEASURES = Object.freeze([
  'occupancy', 'revenuePerRoom', 'prestige', 'satisfaction',
]);

/** What each outcome does to confidence. Missing costs more than meeting
 * pays, so a run of near-misses is a slide rather than a plateau. */
/**
 * What a review does to how much they trust you.
 *
 * Was beat +18, met +10, missed -12. At the pass rate a competent
 * operator actually achieves -- about three in four -- that is +7.5 a
 * review, so confidence climbed relentlessly and pinned at 100. Measured
 * across thirty-two runs of Act II, the lowest reading ever seen was 53
 * against a starting 55, and the investors pulled out of exactly nought
 * resorts. The failure mode the act is built around could not happen.
 *
 * Meeting a target is now worth much less than missing one costs, which
 * is how trust works. At three in four the balance is roughly flat; at
 * one in two it drains; at one in three the hotel is gone inside four
 * months. That is friction for a careful operator and a real ending for
 * a careless one.
 */
const CONFIDENCE_CHANGE = Object.freeze({
  beat: 13, met: 7, missed: -15, missedBadly: -30,
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
/**
 * How high each measure can realistically go.
 *
 * A target above these is not a demand, it is a trick: a hotel cannot run
 * at 105% and no resort reaches prestige 100. When a modest improvement
 * would cross one of these the investors ask the resort to HOLD instead,
 * which is what a reasonable person does when the thing they wanted more
 * of has run out of room.
 */
/**
 * The point at which they stop asking for more.
 *
 * Every target is "seven per cent better than you are doing now", which
 * has to stop somewhere or it becomes a countdown rather than a
 * relationship. Occupancy, prestige and satisfaction all had a ceiling
 * from the start. Revenue per room had `Infinity`, and was therefore the
 * only measure that ratcheted forever -- which is why, measured across
 * 622 reviews, it accounted for 58% of all failures while the other three
 * sat between 4% and 9%.
 *
 * That made the fortnightly meeting one problem wearing four hats: three
 * measures you pass by existing, and one that grinds up until it cannot
 * be met.
 */
const CEILING = Object.freeze({
  occupancy: 0.95,
  prestige: 90,
  satisfaction: 86,
});

/**
 * What a full house is worth per room, at the rate the player is
 * charging.
 *
 * Revenue per room has no natural maximum the way a percentage does, but
 * it does have an obvious stopping point: every bed sold. Asking for more
 * than that is not asking the player to run the hotel better, it is
 * asking them to put the price up -- which is their decision to make and
 * not a target to be set.
 *
 * Suites let for 2.6x a standard room, so a hotel with a third of its
 * beds in suites takes about 1.5x its nightly rate per room. Computed
 * from the actual mix rather than assumed, so a resort that builds
 * nothing but suites is judged on what its own hotel can earn.
 */
function fullHousePerRoom({ rooms, roomRate }) {
  const counts = roomCounts(rooms);
  const total = counts.standard + counts.suite;
  if (total <= 0) return Infinity;
  const takings = counts.standard * nightlyRate('standard', roomRate)
    + counts.suite * nightlyRate('suite', roomRate);
  return takings / total;
}

/** How much better than today they want it. */
const IMPROVEMENT = 1.07;

/** The absolute ladder, used as a floor so a badly run resort still gets
 * a real number rather than 7% more of nothing. */
function absoluteThreshold(measure, { rooms, roomRate, reviewIndex }) {
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
    case 'revenuePerRoom': {
      // A full hotel with a third of its beds in suites takes about 1.5x
      // the nightly rate per room, so anything under that is free.
      //
      // Floored against a nightly rate of zero, which is what an unset
      // rate is. `0 * anything` is a target of $0, and a target of $0 is
      // met by a resort with no hotel at all.
      const rate = Math.max(roomRate ?? 0, MIN_JUDGED_RATE);
      return Math.round(rate * clamp(1.15 + step * 0.09, 1.15, 1.75) * ramp);
    }
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

/**
 * What they will ask for next, measured against what the resort is
 * actually doing.
 *
 * The ladder above is fixed, and a fixed ladder is why the first
 * measurement of Act II found one policy passing 51 reviews out of 51 and
 * confidence never falling below 52 from a starting 55. A target the
 * resort clears without noticing is a formality, and a formality every
 * fortnight is worse than no review at all.
 *
 * So the ask is a modest improvement on today: 7% better, floored by the
 * old ladder so a failing hotel still gets a real number, and capped by
 * what the measure can actually reach. A resort already at the ceiling is
 * asked to hold it, which is friction rather than punishment -- the
 * difference the author asked for.
 */
export function thresholdFor(measure, { rooms, roomRate, reviewIndex, current = null }) {
  const floor = absoluteThreshold(measure, { rooms, roomRate, reviewIndex });
  if (current === null || !Number.isFinite(current) || current <= 0) return floor;

  const ceiling = measure === 'revenuePerRoom'
    ? fullHousePerRoom({ rooms, roomRate })
    : (CEILING[measure] ?? Infinity);
  const asked = Math.min(Math.max(current * IMPROVEMENT, floor), ceiling);

  // Occupancy is a ratio and everything else is a number the player reads
  // as a whole one.
  return measure === 'occupancy'
    ? Math.round(asked * 100) / 100
    : Math.round(asked);
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
 * A hotel measure standing against a resort with no rooms counts as a
 * miss, and that is now only reachable one way: by selling every room
 * while the target was already set. `pickMeasure` will not name a hotel
 * measure before there is a hotel, so "no rooms built" is never asked
 * about in the first place -- which is the distinction the old wording
 * here claimed and the line below it did not make.
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
export function pickMeasure(rng, recent = [], { hasHotel = true } = {}) {
  // Avoids everything asked about lately, not merely the last one.
  //
  // Blocking only the previous measure was not enough: across five
  // reviews it produced prestige, occupancy, prestige, revenue, prestige
  // — legal under a no-consecutive rule and useless in practice, because
  // prestige is the measure that moves least and was therefore nearly
  // free three times out of five. The same no-repeat-while-unseen rule
  // narration and decision events use, applied properly.
  //
  // And never a hotel measure before there is a hotel. On the day the
  // investors arrive the player has no rooms and no room rate, which made
  // `revenuePerRoom` a threshold of `0 * something` -- a target of $0
  // that `measureNow` then meets, handing out confidence for nothing --
  // and made `occupancy` a guaranteed failure, since a resort with no
  // beds cannot fill them. The first thing they ask for is now always
  // something the resort can actually be judged on.
  const available = MEASURES.filter((m) => hasHotel || !HOTEL_MEASURES.has(m));
  const seen = new Set(Array.isArray(recent) ? recent : [recent].filter(Boolean));
  const unseen = available.filter((m) => !seen.has(m));
  const pool = unseen.length > 0
    ? unseen
    : available.filter((m) => m !== recent[recent.length - 1]);
  return (pool.length > 0 ? pool : available)[rng.int(Math.max(1, pool.length || available.length))];
}

/**
 * Builds the target for the period that starts now.
 *
 * Called when a review ends and when the investors first arrive — never
 * at the moment of assessment, which is the whole point.
 */
export function nextTargetFor(state, rng, { recent = [], reviewIndex = 0, report = null } = {}) {
  const hasHotel = totalRooms(state.resort.rooms) > 0;
  const measure = pickMeasure(rng, recent, { hasHotel });
  const current = report ? measureNow(measure, { report, state }) : null;
  return {
    measure,
    threshold: thresholdFor(measure, {
      rooms: state.resort.rooms,
      roomRate: state.resort.pricing.roomRate,
      reviewIndex,
      // What the resort is doing right now, so the ask is about this
      // hotel rather than about a ladder written before it existed.
      current,
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

// ---------------------------------------------------------------------
// The two ways out
//
// Confidence 0 and they demand their money back. Confidence high enough,
// for long enough, and they offer to sell you their stake instead.
//
// Both endings exist because building the reviews showed that only one
// did: the buyout fired at zero, a well-run resort sat at 100, and so the
// player doing everything right never finished the act while the player
// doing badly got the only exit. Symmetry matters more here than either
// number — the good path has to be a door, not a consolation.
// ---------------------------------------------------------------------

/** Held at or above this for two reviews running and they will sell. */
export const OFFER_CONFIDENCE = 85;

/** Days to find the money, either way. Long enough to sell something. */
export const SETTLEMENT_DAYS = 14;

/**
 * What it costs to be rid of them.
 *
 * A demand is the principal plus a modest penalty: they want out and they
 * are not negotiating. An offer costs *more*, because you are under no
 * pressure and they know what the place is worth now — which is the right
 * shape, since the good ending should feel earned rather than cheap.
 */
export function buyoutPrice(investors, { offered = false } = {}) {
  const principal = investors?.principal ?? 0;
  return Math.round(offered ? principal * 1.45 : principal * 1.15);
}

/**
 * Whether the investors want to settle today, and on whose terms.
 *
 * Returns null when nothing is happening, which is most days.
 */
export function settlementDue(investors, day) {
  if (!investors || investors.bought) return null;
  if (investors.buyoutDemand) return investors.buyoutDemand;

  if (investors.confidence <= 0) {
    return {
      kind: 'demand',
      amount: buyoutPrice(investors),
      dueDay: day + SETTLEMENT_DAYS,
      /**
       * They are not taking your money.
       *
       * A demand used to be payable, which meant losing the hotel
       * required being out of favour AND out of cash at the same time --
       * and a hotel makes money even when it is badly run, so the second
       * never happened. Measured, a neglected resort drove confidence to
       * zero and then simply bought its way out: nought liquidations in
       * thirty-two runs of a mechanic the act is built around.
       *
       * Once trust is gone it is gone, so the fortnight is a last chance
       * to PERFORM rather than to pay. One review falls inside it. Pass
       * it and they stay; miss it and the rooms are sold.
       */
      final: true,
    };
  }
  if ((investors.goodReviews ?? 0) >= 2 && investors.confidence >= OFFER_CONFIDENCE) {
    return {
      kind: 'offer',
      amount: buyoutPrice(investors, { offered: true }),
      dueDay: day + SETTLEMENT_DAYS,
    };
  }
  return null;
}

/**
 * Pays them off. Pure, like everything here.
 *
 * Afterwards the hotel is yours: reviews stop, confidence stops mattering,
 * and the act's pressure is over. Refuses rather than overdrawing if the
 * money is not there.
 */
export function payBuyout(state) {
  const settlement = state.investors?.buyoutDemand;
  if (!settlement || (state.money ?? 0) < settlement.amount) return state;
  // A final demand is not an invoice. See `settlementDue`.
  if (settlement.final) return state;
  const next = structuredClone(state);
  next.money -= settlement.amount;
  next.investors = {
    ...next.investors,
    bought: true,
    boughtOnDay: next.day,
    buyoutDemand: null,
    nextTarget: null,
  };
  return next;
}

/**
 * When the money is not there and the clock has run out.
 *
 * Rooms are sold off at the same 60% haircut demolishing an amenity
 * takes, for the same reason — a mistake should cost something without
 * being ruinous. Suites go first: they are worth most and are the thing a
 * struggling hotel least needs.
 */
export function forceLiquidation(state) {
  const settlement = state.investors?.buyoutDemand;
  if (!settlement) return state;
  const next = structuredClone(state);
  let owed = settlement.amount - (next.money ?? 0);

  for (const kind of ['suite', 'standard']) {
    const unitValue = Math.round(ROOM_TYPES[kind].build * LIQUIDATION_RETURN);
    while (owed > 0 && (next.resort.rooms[kind] ?? 0) > 0) {
      next.resort.rooms[kind] -= 1;
      owed -= unitValue;
    }
  }

  // Whatever the rooms fetched clears the debt; anything over stays in
  // the bank. The player is left poor and free rather than in a hole they
  // cannot climb out of.
  next.money = Math.max(0, -owed);
  next.investors = {
    ...next.investors,
    bought: true,
    liquidated: true,
    buyoutDemand: null,
    nextTarget: null,
  };
  return next;
}

/**
 * Confidence a resort is handed back if it passes its last-chance review.
 *
 * Low on purpose. They stay, and they are still barely persuaded, so the
 * next review matters as much as the one just survived.
 */
export const REPRIEVE_CONFIDENCE = 22;
