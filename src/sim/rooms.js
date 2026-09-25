/**
 * The hotel: who stays, for how long, and what an empty bed costs.
 *
 * Act II's shift is from a course people visit to a place people travel
 * to. Everything here serves that, and one rule carries most of it:
 *
 * **Locals never book a room in their own town.**
 *
 * That is not a balance choice and it is not a gap to be filled later. A
 * model that let a regular who plays three times a week book a hotel
 * bed would be the first dishonest thing in this simulation, and it
 * would dissolve the act's whole point. What it creates is the central
 * squeeze of Act II: **the course that wins Act I is not the course that
 * fills a hotel.** A friendly, cheap, locals' course draws people who go
 * home at six, and the player who built one has a decision to make.
 *
 * The other load-bearing rule: **a room costs its upkeep whether or not
 * anybody sleeps in it.** That is the only reason occupancy is a real
 * target rather than a vanity figure, and the only thing that makes
 * "build more rooms" a decision instead of a ratchet.
 *
 * Pure, like everything in `src/sim/`.
 */
import { clamp } from './hole.js';
import { SEGMENTS, SEGMENT_KEYS } from './segments.js';

/**
 * The two things you can build, and what they cost.
 *
 * A suite is nearly three times a room to build and more than twice to
 * run, and charges a multiple of the same nightly rate rather than having
 * a slider of its own — one price decision for the player, not two.
 */
export const ROOM_TYPES = Object.freeze({
  standard: {
    label: 'Standard room',
    build: 9000,
    upkeep: 40,      // per room per NIGHT, occupied or not
    rateMultiple: 1,
    blurb: 'A bed, a shower and a view of the ninth. Serious golfers will take one for an early tee time; it will not impress anybody on holiday.',
  },
  suite: {
    label: 'Suite',
    build: 26000,
    upkeep: 95,
    rateMultiple: 2.6,
    blurb: 'Room enough for a family and a balcony worth standing on. What destination guests are actually travelling for — and dead weight if nobody is travelling.',
  },
});

export const ROOM_KINDS = Object.freeze(Object.keys(ROOM_TYPES));

/**
 * How likely each crowd is to stay, and for how long.
 *
 * Read from `segments.js` rather than kept here, because how long a crowd
 * stays is a property of the crowd — the same kind of fact as
 * `idealDifficulty` or `waitWeight`. A second copy here would be a
 * duplicate that can drift, and a golfer carrying `stayNights: 1` while
 * this module said locals never stay is exactly how that goes wrong: the
 * field sat there unread, contradicting the model, for as long as it took
 * somebody to notice.
 */
export const STAY_BEHAVIOUR = Object.freeze(
  Object.fromEntries(SEGMENT_KEYS.map((key) => [key, SEGMENTS[key].stays]))
);

/** Rooms of each kind currently built. Tolerates a missing hotel. */
export function roomCounts(rooms) {
  return {
    standard: rooms?.standard ?? 0,
    suite: rooms?.suite ?? 0,
  };
}

/** Total beds, of any kind. */
export function totalRooms(rooms) {
  const counts = roomCounts(rooms);
  return counts.standard + counts.suite;
}

/**
 * What a room costs to run as a share of what it charges.
 *
 * A $280 room is not a $95 room with a bigger number on it: the linen is
 * better, the breakfast is better, somebody turns the bed down. Upkeep
 * used to be a flat figure per room while the rate was a free variable,
 * which meant the cost of a night was fixed while its price was not --
 * so the answer to "what should I charge" was "as much as they will pay",
 * with no cost following it up.
 *
 * Measured before this existed: a sixty-room hotel at $280 took $20,608 a
 * night against $3,280 of upkeep. Act I's entire golf course makes three
 * to six thousand a day. Room revenue was not part of the economy, it
 * was standing outside it.
 */
export const SERVICE_SHARE = 0.42;

/**
 * What the hotel costs tonight, before anybody checks in.
 *
 * The load-bearing figure. Charged on every room built, every night, so
 * a wing nobody sleeps in is a wing that bleeds. `roomRate` is optional
 * so that callers asking "what does this hotel cost to stand there"
 * without a price in mind still get the base.
 */
export function nightlyUpkeep(rooms) {
  const counts = roomCounts(rooms);
  return ROOM_KINDS.reduce((sum, kind) => sum + counts[kind] * ROOM_TYPES[kind].upkeep, 0);
}

/**
 * What serving tonight's guests costs, as a share of what they paid.
 *
 * Charged against REVENUE rather than against rooms built, because linen,
 * breakfast and somebody turning the bed down follow the guest, not the
 * building. Charging it on empty rooms made overpricing lose money twice
 * -- once for the beds nobody took and again for servicing them -- which
 * is a punishment rather than a trade.
 *
 * The empty-wing pressure stays where it belongs, in `nightlyUpkeep`,
 * which bills whether anybody sleeps there or not.
 */
export function serviceCost(roomRevenue) {
  return Math.round(Math.max(0, roomRevenue) * SERVICE_SHARE);
}

/** What a room of `kind` costs to build. */
export function roomBuildCost(kind) {
  return ROOM_TYPES[kind]?.build ?? 0;
}

/** What a night in a room of `kind` is charged at, given the base rate. */
export function nightlyRate(kind, roomRate) {
  return Math.round((roomRate ?? 0) * (ROOM_TYPES[kind]?.rateMultiple ?? 1));
}

/**
 * How many room-nights each crowd wants tonight, before capacity.
 *
 * `crowd` is golfers per segment — the same units `menuRevenue` takes, so
 * the two cannot disagree about how many people are on the property.
 *
 * Price resistance is real but gentler than it is on a green fee: someone
 * who has driven three hours is not going to sleep in the car over twenty
 * dollars. It bites hard above roughly twice what a round is worth.
 */
export function roomDemand({ crowd, roomRate, valuePerRound = 60, extraNights = 0, valueBonus = 0 }) {
  const wanted = {};
  for (const key of SEGMENT_KEYS) {
    const behaviour = STAY_BEHAVIOUR[key];
    const heads = crowd?.[key] ?? 0;
    if (!behaviour || behaviour.chance <= 0 || heads <= 0) {
      wanted[key] = 0;
      continue;
    }
    // 1.0 at a rate equal to a round, falling away above it.
    //
    // `valueBonus` is what the hotel's own buildings add to that: a spa
    // and a dining room are the reason a room is worth $160 rather than
    // $120. Without it the nightly rate was a slider with nothing
    // supporting it -- the only way to charge more was to charge more,
    // and guests simply stopped coming.
    const fair = Math.max(1, valuePerRound * 1.6 + valueBonus);
    const priceFit = clamp(1.25 - (roomRate / fair) * 0.55, 0.05, 1.15);
    // A kids' club or a spa lengthens the trip rather than attracting
    // another one — the only way to raise occupancy without raising
    // demand. Locals are excluded by their zero chance above, so no
    // amenity can talk a local into a bed.
    const nights = behaviour.nights + extraNights;
    wanted[key] = heads * behaviour.chance * priceFit * nights;
  }
  return wanted;
}

/**
 * Fills the rooms.
 *
 * Suites go to whoever wants them first, then everybody spills into
 * standard rooms — a guest who wanted a suite will take a room rather
 * than drive home, but not happily, which is what `unmetSuiteDemand`
 * exists to let the rest of the game notice.
 */
export function occupancyFor({
  rooms, crowd, roomRate, valuePerRound = 60, extraNights = 0, valueBonus = 0,
}) {
  const counts = roomCounts(rooms);
  const capacity = counts.standard + counts.suite;
  const wanted = roomDemand({ crowd, roomRate, valuePerRound, extraNights, valueBonus });

  let suiteWanted = 0;
  let totalWanted = 0;
  for (const key of SEGMENT_KEYS) {
    const nights = wanted[key];
    totalWanted += nights;
    suiteWanted += nights * (STAY_BEHAVIOUR[key]?.prefersSuite ?? 0);
  }

  const suitesSold = Math.min(counts.suite, Math.round(suiteWanted));
  const remaining = Math.max(0, Math.round(totalWanted) - suitesSold);
  const standardSold = Math.min(counts.standard, remaining);
  const sold = suitesSold + standardSold;

  return {
    capacity,
    sold,
    suitesSold,
    standardSold,
    // 0 when there is no hotel: a resort with no rooms is not running at
    // 0% occupancy, it is not in the hotel business.
    rate: capacity > 0 ? sold / capacity : 0,
    turnedAway: Math.max(0, Math.round(totalWanted) - sold),
    unmetSuiteDemand: Math.max(0, Math.round(suiteWanted) - suitesSold),
  };
}

/** What the rooms took tonight. */
export function roomRevenue({ occupancy, roomRate }) {
  const suites = occupancy.suitesSold * nightlyRate('suite', roomRate);
  const standard = occupancy.standardSold * nightlyRate('standard', roomRate);
  return Math.round(suites + standard);
}

/**
 * How many rooms the place is allowed to have.
 *
 * Measured, room-building was close to a ratchet: the operator built to
 * ninety and they still ran at 100%, because the hotel feeds itself --
 * rooms widen the catchment, which brings more golfers, more of whom
 * stay, while a spa and a kids' club add nights to every stay that does
 * happen. There is a point where more rooms stop filling, but it sits far
 * past any sensible hotel.
 *
 * A limit on demand would have been the obvious fix and the wrong one:
 * building rooms is supposed to be good. This is a limit on BUILDING, in
 * the form the world already has one -- planning permission. It starts
 * small, and it grows with the resort's reputation, because a council
 * grants more to a place the town is glad of. So it is a goal rather than
 * a wall: the answer to "I want more rooms" is "be worth more rooms".
 */
export const ROOMS_AT_START = 26;
export const ROOMS_AT_BEST = 72;

export function roomLimit(prestige = 0) {
  const reach = clamp(prestige, 0, 100) / 100;
  return Math.round(ROOMS_AT_START + (ROOMS_AT_BEST - ROOMS_AT_START) * reach);
}

/** Whether another room of any kind may be built. */
export function canBuildRoom(rooms, prestige) {
  return totalRooms(rooms) < roomLimit(prestige);
}
