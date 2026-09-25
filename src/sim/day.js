import { makeRng } from './rng.js';
import { holeStats, clamp } from './hole.js';
import { makeGroup, resetGuestIds } from './golfer.js';
import { playHole } from './round.js';
import { scheduleRounds } from './schedule.js';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, menuRevenue } from './economy.js';
import { guestSatisfaction, buildComplaints } from './satisfaction.js';
import { courseRating, nextPrestige } from './ratings.js';
import { actOneGate } from './acts.js';
import { HISTORY_LIMIT, SATISFACTION_HISTORY_LIMIT } from './state.js';
import {
  addCondition, tickConditions, conditionEffects,
} from './conditions.js';
import { openHoles } from './state.js';
import { menuBestEnergy } from './menu.js';
import { kitchenCapacity, kitchenLoad, serviceFactor } from './kitchen.js';
import { narrationContext, pickNarration, rememberNarration } from './narration.js';
import { SEGMENT_KEYS } from './segments.js';
import { emptyGoodwill, applyGoodwill, decayGoodwill } from './goodwill.js';
import { EVENTS, SPEAKERS as EVENT_SPEAKERS, eventContext, pickEvent, rememberEvent } from './events.js';
import { shopCapacity, shopServiceFactor, hasShopCounter } from './shop.js';
import { weatherOn, forecast, effectsOf } from './weather.js';
import {
  REVIEW_EVERY, MEASURES, OFFER_CONFIDENCE,
  assessTarget, confidenceChange, nextTargetFor, measureNow, settlementDue,
  REPRIEVE_CONFIDENCE,
  forceLiquidation,
  startingInvestors,
} from './investors.js';
import { totalRooms, nightlyUpkeep, occupancyFor, roomRevenue, serviceCost } from './rooms.js';
import {
  hotelUpkeep, extraNightsFrom, divertedShare, HOTEL_AMENITIES,
  caddiePaceFactor, roomValueBonus, indoorTrade,
} from './hotelAmenities.js';
import { nextSetup, setupDifficultyBonus } from './tournaments.js';

const DAY_START = 420;  // 7:00am
const DAY_END = 1080;   // 6:00pm

/** Roughly one decision event per week: a 1-in-7 chance each day, checked
 * once, so an event is never offered more than once on the same day. */
/**
 * How often a decision lands.
 *
 * Was 1/7, and measured across 2,400 days it delivered exactly that --
 * 13.4%, one every 7.5 days. It still read as sparse in play, because a
 * day takes half a minute and a week of them goes past in no time.
 *
 * Raised now rather than earlier because the library has just gone from
 * sixteen events to thirty-one. At one in four, a ninety-day act draws
 * about twenty-two from thirty-one, which is varied. At one in four from
 * sixteen it would have been the same handful three times over, and a
 * decision you have already made is not a decision.
 */
const EVENT_CHANCE_PER_DAY = 1 / 4;

/** Warm-up benefit, in effective handicap strokes, on the first two holes. */
const RANGE_WARMUP = -4;
const PRACTICE_GREEN_WARMUP = -5;
const WARMUP_HOLES = 2;

/**
 * The turn: which hole a halfway house sits before. Derived from how many
 * holes are actually open, not fixed, so that a player who builds one on a
 * short course still gets something for their money. A fixed index 5 left
 * it inert on the three-hole starting resort - another fake decision.
 */
function turnHoleIndex(holeCount) {
  return Math.floor(holeCount / 2);
}

/**
 * How much of a tiring golfer a stop at the halfway house gives back,
 * decided by the best thing on its board.
 *
 * This was a flat 82 whatever it served. Menu-driven, it is what stops
 * food being a revenue system that happens to sit on a golf course:
 * energy feeds `tiredMinutes` in round.js, which feeds round time, which
 * feeds the flow-shop rule in schedule.js that is the entire pace-of-play
 * mechanic. A board with a hot meal on it lands near the old 82; a board
 * of nothing but beer does not.
 */
/**
 * How often the cart gets round to a group: every third hole.
 *
 * Not every hole, because she is one cart covering a whole course and
 * cannot be everywhere. Not once, because then she would just be a worse
 * halfway house. Every third is what makes her a *coverage* amenity
 * rather than a *stop* — the thing that scales if a later act lets you
 * run two of her.
 */
export const CART_REACHES_EVERY = 3;

/**
 * What a visit from the cart restores a tiring golfer to, decided by
 * what is on her board.
 *
 * Deliberately well below `halfwayRestoreTo`'s ceiling: 68 against 88.
 * She hands you a drink through a window; the halfway house sits you
 * down. Her value is the money she takes and the time she does not cost,
 * not the break she gives — feeding a tiring golfer is what the snack
 * shack and the halfway house are for.
 *
 * Hot food on her still matters (an all-drinks cart restores to 54, one
 * with a hot dog to 67), because otherwise there would be no reason to
 * put any on her. It just cannot rival sitting down.
 */
/**
 * What a stop at the snack shack restores to, from what is on its board.
 *
 * Between the cart's 68 and the halfway house's 88, and costing no time
 * because you pick something up on your way past the second hole rather
 * than sitting down at the turn. Its ceiling is lower than the halfway
 * house's because you are eating it walking.
 */
export function snackRestoreTo(menu) {
  return clamp(52 + menuBestEnergy(menu) * 1.8, 52, 76);
}

export function cartRestoreTo(menu) {
  return clamp(48 + menuBestEnergy(menu) * 1.6, 48, 68);
}

export function halfwayRestoreTo(menu) {
  return clamp(60 + menuBestEnergy(menu) * 2, 60, 88);
}

/** Each marshal shaves this fraction off hole times, capped in total. */
const MARSHAL_EFFECT = 0.04;
const MARSHAL_CAP = 0.12;

/**
 * How much marshals shorten hole times, as a multiplier.
 *
 * Exported because the pricing sheet needs to forecast the same pace the
 * day will actually run at. It previously predicted from raw hole times
 * and ignored marshals entirely, so hiring one never moved the forecast
 * even though the day itself ran faster - the interface contradicting
 * the simulation.
 */
export function marshalPaceFactor(marshals) {
  return 1 - Math.min(MARSHAL_CAP, marshals * MARSHAL_EFFECT);
}

/**
 * Runs one full day and returns the next state, the evening report, and a
 * timeline of timestamped events for the renderer to play back.
 *
 * Pure: the state passed in is never mutated.
 */
export function runDay(state, seed) {
  const rng = makeRng(seed);
  const next = structuredClone(state);
  // What is still wrong from before today. Read once, up front, because
  // it closes holes and that has to happen before anything measures the
  // course. See src/sim/conditions.js.
  next.conditions = next.conditions ?? [];
  const wrong = conditionEffects(next.conditions);

  /**
   * Turf: one groundskeeper holds roughly three holes steady, plus the
   * traffic of a modest day.
   *
   * Play used to wear the course at 0.12 per group against 1.4 per hole,
   * so at a busy optimum all the golfers in the world accounted for 2.8
   * of 15.4 wear and the rest was just having holes. Golf did not damage
   * a golf course, which left Act I with no cost that grows as the resort
   * succeeds -- the thing that makes a busy day a decision rather than a
   * reward. Traffic now costs about as much as the course does at a full
   * tee sheet, so a crowd you cannot afford to maintain is a crowd that
   * ruins the greens, and the greens are what the crowd came for.
   *
   * Also feeds Act III's setup climb below: the same crew that holds the
   * turf steady is the crew that conditions a course for a championship,
   * one job with two demands on it rather than two staffs to hire.
   */
  const keepers = next.resort.staff.filter((m) => m.role === 'groundskeeper').length;

  // Act III. The course hardens while a championship is booked and drifts
  // back when one is not.
  next.resort.setup = nextSetup(next.resort.setup ?? 0, {
    keepers,
    conditioning: Boolean(next.tournament && !next.tournament.resolved),
  });

  const allOpen = openHoles(next);
  // Closures take the last holes first, so the course shortens from the
  // far end rather than leaving a gap in the middle that the flow-shop
  // scheduler would have to reason about.
  const holes = wrong.holesClosed > 0
    ? allOpen.slice(0, Math.max(1, allOpen.length - wrong.holesClosed))
    : allOpen;

  // A day's fade back toward neutral, for whichever segments a past
  // decision event has coloured. Runs every day regardless of whether one
  // fires today, and copes with a save from before goodwill existed.
  next.goodwill = decayGoodwill(next.goodwill ?? emptyGoodwill());

  const { greenFee, teeInterval } = next.resort.pricing;
  const amenityTypes = next.resort.amenities.map((a) => a.type);
  const carts = amenityTypes.includes('cartBarn');
  const hasRange = amenityTypes.includes('drivingRange');
  const hasPracticeGreen = amenityTypes.includes('practiceGreen');
  // The snack shack catches them early - it sits by the clubhouse, so it
  // is the second or third hole, not the turn. A smaller top-up than the
  // halfway house and it costs no time, because you grab something on the
  // way past rather than sitting down. It did nothing at all for energy
  // before, which left it as the one food amenity with no identity: the
  // author's framing is that the cart sells and the shack and halfway
  // house feed, and this is the shack's half of that.
  const snackShack = next.resort.amenities.find((a) => a.type === 'snackShack');
  const snackEnergy = snackShack ? snackRestoreTo(snackShack.menu) : 0;
  const snackHoleIndex = Math.min(1, Math.max(0, holes.length - 1));

  // The sky, decided once. A pure function of the resort's weather seed
  // and the day number, so the forecast the player saw two days ago is
  // this exact value rather than a prediction of it (see weather.js).
  const weatherKey = weatherOn(next.weatherSeed ?? 1, next.day);
  const sky = effectsOf(weatherKey);

  const beverageCart = next.resort.amenities.find((a) => a.type === 'beverageCart');
  const cartEnergy = beverageCart ? cartRestoreTo(beverageCart.menu) : 0;
  const halfwayHouse = next.resort.amenities.find((a) => a.type === 'halfwayHouse');
  const hasHalfwayHouse = Boolean(halfwayHouse);
  const halfwayEnergy = halfwayRestoreTo(halfwayHouse?.menu);

  // Rated against yesterday's crowd: rating feeds demand and demand decides
  // today's crowd, so today's is not knowable yet. The lag is the point -
  // change the course and the rating dips until the clientele catches up.
  const yesterdayCrowd = next.history.at(-1)?.crowd ?? null;
  const rating = holes.length ? courseRating(holes, next.turfQuality, yesterdayCrowd) : 0;

  // The mean difficulty across every open hole is what the segments react
  // to — both when deciding whether to turn up (economy.demandGroups) and
  // when deciding how they felt about the round (satisfaction.
  // guestSatisfaction). Computed once here and threaded through both, so
  // the crowd that arrives and the crowd that leaves happy can never
  // disagree about what this course's difficulty actually is.
  const baseDifficulty = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length
    : 0;
  // Firm greens and thick rough are what a championship wants and what a
  // Tuesday fourball hates. This is the whole cost of the run-up: the
  // course the regulars are paying for gets worse for weeks before
  // anybody is paid anything.
  const courseDifficulty = clamp(baseDifficulty + setupDifficultyBonus(next.resort.setup ?? 0), 0, 100);
  const averageScenery = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).scenery, 0) / holes.length
    : 0;
  // Destination guests are mostly an Act II crowd; Act I has no rooms yet.
  const hasRooms = totalRooms(next.resort.rooms) > 0;

  // Word of mouth from the last few days. No history yet (day one) is
  // neutral, so the resort isn't punished or rewarded before it has played.
  const recentHistory = next.satisfactionHistory.slice(-3);
  const recentSatisfaction = recentHistory.length
    ? recentHistory.reduce((s, v) => s + v, 0) / recentHistory.length
    : 50;

  // Nobody comes to a resort with no golf. Otherwise, each segment's own
  // appeal for this exact course decides its own slice of the tee sheet
  // (see economy.demandGroups); `share` is that same appeal expressed as
  // proportions, and is what decides which segment each guest belongs to
  // below.
  const demand = holes.length
    ? demandGroups({
        weather: sky.demand,
        courseRating: rating,
        prestige: next.prestige,
        amenities: next.resort.amenities,
        greenFee,
        teeInterval,
        recentSatisfaction,
        holesOpen: holes.length,
        courseDifficulty,
        scenery: averageScenery,
        turfQuality: next.turfQuality,
        hasRooms,
        rooms: next.resort.rooms,
        // A bad write-up, an outbreak, a road shut. Folded in with the
        // weather because it is the same kind of thing: a multiplier on
        // how many people want to come that the player cannot argue with
        // today, only outlast.
        conditionFactor: wrong.demandFactor,
      })
    : {
        total: 0,
        share: Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0])),
        ceiling: 0,
        wanted: 0,
        limitedBy: 'demand',
      };
  // A short course takes the beginners and the families off the main
  // course. The only thing in the game that helps pace by subtraction —
  // everything else draws a crowd onto a course that then has to flow.
  // They still pay, they simply play somewhere that does not queue.
  const diverted = divertedShare(next.resort.amenities);
  const groupCount = Math.max(0, Math.round(demand.total * (1 - diverted)));
  const divertedGroups = demand.total - groupCount;

  resetGuestIds();
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push(makeGroup(rng, { prestige: next.prestige, greenFee, share: demand.share }, i));
  }

  // Play every group through every open hole, recording strokes and time.
  const perGroupHoleMinutes = [];
  const perGroupScores = [];
  const rawEvents = [];

  for (const group of groups) {
    const minutes = [];
    const scores = [];
    holes.forEach((hole, holeIndex) => {
      const warming = holeIndex < WARMUP_HOLES;
      const played = playHole(rng, hole, group, {
        carts,
        handicapAdjust: warming && hasRange ? RANGE_WARMUP : 0,
        puttAdjust: warming && hasPracticeGreen ? PRACTICE_GREEN_WARMUP : 0,
        spread: sky.spread,
        refuel: hasHalfwayHouse && holeIndex === turnHoleIndex(holes.length),
        refuelTo: halfwayEnergy,
        // Every third hole, and never on the same hole as the turn — a
        // group that has just sat down for a burger does not need a drink
        // handed to them thirty seconds later, and stacking the two would
        // make the pair look better together than either is apart.
        cartStop:
          Boolean(beverageCart)
          && (holeIndex + 1) % CART_REACHES_EVERY === 0
          && holeIndex !== turnHoleIndex(holes.length),
        cartStopTo: cartEnergy,
        // Reuses the cart's time-free stop: grabbing a roll on the way
        // past costs the group nothing on the clock either. Whichever of
        // the two restores more on this hole is the one that counts.
        ...(snackShack && holeIndex === snackHoleIndex
          ? { cartStop: true, cartStopTo: Math.max(cartEnergy, snackEnergy) }
          : {}),
      });
      minutes.push(played.minutes);
      scores.push(played.scores);
      rawEvents.push({ groupIndex: group.id, holeIndex, events: played.events });
    });
    perGroupHoleMinutes.push(minutes);
    perGroupScores.push(scores);
  }

  // Average hole times drive the tee sheet.
  const averageHoleMinutes = holes.map((_, h) =>
    groupCount
      ? perGroupHoleMinutes.reduce((s, m) => s + m[h], 0) / groupCount
      : 0
  );

  // Marshals move slow groups along. Capped, deliberately: staffing must not
  // be a way to buy your way out of a badly designed course.
  const marshals = next.resort.staff.filter((m) => m.role === 'marshal').length;
  // Marshals push from behind; caddies pull from the front. Multiplied
  // rather than added so the two stack without either becoming free.
  const marshalFactor = marshalPaceFactor(marshals)
    * caddiePaceFactor(next.resort.amenities);
  const pacedHoleMinutes = averageHoleMinutes.map((m) => m * marshalFactor);

  const schedule = groupCount
    ? scheduleRounds({
        groupCount,
        teeInterval,
        holeMinutes: pacedHoleMinutes,
        dayStart: DAY_START,
        dayEnd: DAY_END,
      })
    : { rounds: [], waitTotalsByHole: new Array(Math.max(1, holes.length)).fill(0),
        bottleneckHoleIndex: null, overrunGroups: 0, averageRoundMinutes: 0 };

  // Satisfaction, once each group's waiting is known.
  const value = perceivedValue({
    courseRating: rating, prestige: next.prestige, amenities: next.resort.amenities,
    holesOpen: holes.length,
  });
  const amenityBonus = amenityTypes.length * 1.5;

  // The kitchen, once per day: how much prep every board on the resort
  // demands, against what the staff can actually turn around. Computed
  // before satisfaction and revenue because both read it — a slow
  // kitchen is felt in the wait AND in what actually gets sold.
  const kitchen = {
    load: kitchenLoad(next.resort.amenities),
    capacity: kitchenCapacity(next.resort.staff),
  };
  kitchen.serviceFactor = serviceFactor(kitchen.load, kitchen.capacity);

  // The counter, measured the same way the kitchen is: how many people
  // turned up against how many can be served.
  const shop = {
    open: hasShopCounter(next.resort.amenities),
    golfers: groupCount * 4,
    capacity: shopCapacity(next.resort.staff),
  };
  shop.serviceFactor = shop.open ? shopServiceFactor(shop.golfers, shop.capacity) : 1;

  const satisfactions = [];
  const crowdCount = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0]));
  const crowdSatisfactionSum = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0]));

  groups.forEach((group, gi) => {
    const wait = schedule.rounds[gi]?.waitMinutes ?? 0;
    group.guests.forEach((guest, idx) => {
      const strokes = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].strokes, 0);
      const par = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].par, 0);
      const guestSat = guestSatisfaction({
        handicap: guest.handicap,
        strokesOverPar: strokes - par,
        waitMinutes: wait,
        greenFee,
        perceivedValue: value,
        scenery: averageScenery,
        turfQuality: next.turfQuality,
        amenityBonus,
        segment: guest.segment,
        courseDifficulty,
        kitchenServiceFactor: kitchen.serviceFactor,
        shopServiceFactor: shop.serviceFactor,
      });
      satisfactions.push(guestSat);
      crowdCount[guest.segment] += 1;
      crowdSatisfactionSum[guest.segment] += guestSat;
    });
  });

  const averageSatisfaction = satisfactions.length
    ? satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length
    : 50;

  // Who came, and what each of them made of it — the report's answer to
  // "which crowd am I running", per segment rather than as one blended
  // average that hides the composition.
  const crowd = Object.fromEntries(SEGMENT_KEYS.map((key) => [
    key,
    {
      count: crowdCount[key],
      averageSatisfaction: crowdCount[key] > 0 ? crowdSatisfactionSum[key] / crowdCount[key] : null,
    },
  ]));

  // Money.
  const holeUpkeep = holes.reduce((s, h) => s + holeStats(h).upkeep, 0);
  const revenue = groupCount
    ? dailyRevenue({
        groupsPlayed: groupCount, greenFee,
        amenities: next.resort.amenities, averageSatisfaction,
        shopService: shop.serviceFactor,
      })
    : { greenFees: 0, merchandise: 0, food: 0, total: 0 };
  const costs = dailyCosts({
    holeUpkeep, staff: next.resort.staff, amenities: next.resort.amenities,
  });

  // Food revenue replaces dailyRevenue's old flat contribution: it reads
  // the actual board per segment (crowdCount, in golfers — the guests who
  // actually turned up, already tallied above) rather than a flat
  // spendPerGuest applied to whoever the amenity happens to be. A day with
  // nobody on the tee sheet earns nothing here either.
  const food = groupCount
    ? menuRevenue({
        amenities: next.resort.amenities,
        crowd: crowdCount,
        serviceFactor: kitchen.serviceFactor,
      })
    : { revenue: 0, foodCost: 0 };
  revenue.food = food.revenue;
  revenue.total = revenue.greenFees + revenue.merchandise + revenue.food;
  costs.foodCost = food.foodCost;
  costs.total += food.foodCost;

  // The hotel. Fed the same per-segment golfer counts the menus are, so
  // the two can never disagree about how many people are on the property
  // — and so locals, who never book a room, cannot accidentally fill one.
  const hotel = occupancyFor({
    rooms: next.resort.rooms,
    crowd: crowdCount,
    roomRate: next.resort.pricing.roomRate,
    valuePerRound: value,
    extraNights: extraNightsFrom(next.resort.amenities),
    valueBonus: roomValueBonus(next.resort.amenities),
  });
  revenue.rooms = roomRevenue({ occupancy: hotel, roomRate: next.resort.pricing.roomRate });
  revenue.total += revenue.rooms;

  // Charged on every room built, every night, whether anybody slept in it
  // or not. This is the only thing that makes occupancy a real number
  // rather than a vanity one, and the only thing that makes "build more
  // rooms" a decision rather than a ratchet.
  // The building, whether anybody slept in it or not, plus what serving
  // the people who did actually cost.
  costs.rooms = nightlyUpkeep(next.resort.rooms)
    + hotelUpkeep(next.resort.amenities)
    + serviceCost(revenue.rooms);
  costs.total += costs.rooms;

  // Instalments on whatever went wrong. Its own line, because a player
  // watching the bank drain deserves to see which of their problems is
  // doing it.
  if (wrong.dailyMoney !== 0) {
    costs.consequences = wrong.dailyMoney;
    costs.total += wrong.dailyMoney;
  }

  // The one thing that earns on a day the course is shut. Weather takes
  // demand down to a tenth in a storm and leaves every other building
  // idle; a range under a roof takes money anyway, so it smooths the
  // variance rather than merely adding to the total.
  const indoors = Math.round(indoorTrade(next.resort.amenities, sky.demand));
  if (indoors > 0) {
    revenue.indoors = indoors;
    revenue.total += indoors;
  } else {
    revenue.indoors = 0;
  }

  const profit = revenue.total - costs.total;

  /**
   * Wear scales with how much turf there is left to wear.
   *
   * Without this the whole system was a step function. `care` is flat and
   * the wear rate is near-constant, so the daily net was either positive
   * or negative and the turf ran to one end or the other: measured, two
   * groundskeepers on a nine gave turf 1 and three gave turf 100, with
   * nothing in between at any tee interval. A balance sweep found every
   * strategy bankrupt or stalled with mean final turf of 0.1, because the
   * operator's hiring rule sat on the wrong side of a cliff it could not
   * see.
   *
   * Bare ground cannot be worn out further, so damage tapers as the
   * course degrades and the turf settles at a level instead of crashing.
   * That turns "how many groundskeepers" from a threshold into a dial:
   * each one is worth roughly thirty points of equilibrium turf, and the
   * player can read the answer off the number rather than discovering a
   * cliff edge by falling off it.
   */
  const wearRate = holes.length * 1.4 + groupCount * 0.45;
  const wear = wearRate * (next.turfQuality / 100);
  const care = keepers * 6.8;
  // Rain waters the course for free; a run of clear days bakes it. A wet
  // week costs money and leaves the turf better than it found it, which
  // is a trade rather than a punishment.
  // `wrong.turfPerDay` is negative for damage: drainage gone, a blight, a
  // spill. The groundskeepers still work, they are just working uphill,
  // so the answer is more wage for longer rather than one payment.
  next.turfQuality = clamp(
    next.turfQuality - wear + care + sky.turf + wrong.turfPerDay, 0, 100
  );

  next.prestige = nextPrestige(next.prestige, rating, averageSatisfaction);
  next.money += profit;

  const gate = actOneGate({
    holesOpen: holes.length,
    money: next.money,
    prestige: next.prestige,
    satisfactionHistory: [...next.satisfactionHistory, averageSatisfaction],
  });

  const complaints = buildComplaints({
    waitTotalsByHole: schedule.waitTotalsByHole,
    groupsPlayed: groupCount,
    turfQuality: next.turfQuality,
    amenityTypes,
    averageSatisfaction,
    nearActGate: gate.nearGate,
    kitchenServiceFactor: kitchen.serviceFactor,
    shopServiceFactor: shop.serviceFactor,
  });

  const report = {
    day: next.day,
    groupsPlayed: groupCount,
    revenue,
    costs,
    profit,
    averageSatisfaction,
    averageRoundMinutes: schedule.averageRoundMinutes,
    bottleneckHoleIndex: schedule.bottleneckHoleIndex,
    overrunGroups: schedule.overrunGroups,
    courseRating: rating,
    courseDifficulty,
    prestige: next.prestige,
    turfQuality: next.turfQuality,
    crowd,
    kitchen,
    shop,
    hotel,
    divertedGroups,
    weather: {
      key: weatherKey,
      label: sky.label,
      note: sky.note,
      // Tomorrow onward. Two to three days is what spec §15a.6 asked for:
      // long enough to schedule around, short enough to still be a
      // forecast. It is `weatherOn` asked early, not a prediction, so it
      // cannot disagree with the days when they arrive.
      forecast: forecast(next.weatherSeed ?? 1, next.day + 1, 3),
    },
    complaints,
    gate,
  };

  // What the world says about all this. Positioning here is emergent - the
  // course decides who turns up, the player never declares a market - and an
  // emergent system nobody can read feels arbitrary rather than earned. This
  // is how the resort tells its owner what it has become.
  const seen = next.narrationSeen ?? [];
  const narration = pickNarration(
    narrationContext({ report, previousReport: next.history.at(-1), state: next }),
    rng,
    seen
  );
  report.narration = narration;
  next.narrationSeen = rememberNarration(seen, narration?.id);

  // A decision event, roughly once a week. Checked with one more draw off
  // the same day's rng, after everything narration needed it for, so this
  // addition cannot change any number the rest of the day already computed.
  // A decision event must never be dismissable with a default — the choice
  // sits in report.pendingEvent until the player answers it; nothing here
  // applies it automatically.
  const seenEvents = next.eventsSeen ?? [];
  let pendingEvent = null;
  if (rng.chance(EVENT_CHANCE_PER_DAY)) {
    const picked = pickEvent(
      eventContext({ report, previousReport: next.history.at(-1), state: next }),
      rng,
      seenEvents
    );
    if (picked) {
      pendingEvent = {
        id: picked.id,
        speaker: EVENT_SPEAKERS[picked.speaker],
        prompt: picked.prompt,
        // Label, cost and stance — everything the card needs to be read,
        // and nothing the card could act on. The effects deliberately stay
        // behind in the library: applyEventChoice looks them up by id, so
        // a report that has been round-tripped through a save cannot apply
        // numbers that no longer match the event as written.
        choices: picked.choices.map((c) => ({
          label: c.label, cost: c.cost, stance: c.stance,
        })),
      };
    }
  }
  report.pendingEvent = pendingEvent;
  next.eventsSeen = rememberEvent(seenEvents, pendingEvent?.id);

  // The investors. Nothing here touches confidence except a review, and
  // the target assessed is the object the player was shown a fortnight
  // ago — not a recomputation of it, which is what makes the promise
  // structurally impossible to break.
  if (next.investors && !next.investors.bought) {
    const target = next.investors.nextTarget;
    report.investors = { target, reviewed: null, confidence: next.investors.confidence };
    if (target && next.day >= target.dueDay) {
      const outcome = assessTarget(target, { report, state: next });
      const change = confidenceChange(outcome);
      next.investors.confidence = clamp(next.investors.confidence + change, 0, 100);

      /**
       * The last chance, taken.
       *
       * A final demand cannot be paid off, so the fortnight it runs for
       * is the resort's opportunity to perform rather than to settle.
       * Exactly one review falls inside it, and this is that review: pass
       * it and they stay, on very little confidence and watching.
       */
      /**
       * And it has to be BEATEN, not merely met.
       *
       * Targets are measured against what the resort is already doing, so
       * a neglected hotel still meets about three reviews in four -- its
       * bar has fallen with it. That made the last chance a formality and
       * nought resorts in eight were ever liquidated even after their
       * confidence hit zero. People who have stopped trusting you are not
       * reassured by the minimum.
       */
      const standing = next.investors.buyoutDemand;
      if (standing?.final && outcome === 'beat') {
        next.investors.buyoutDemand = null;
        next.investors.confidence = Math.max(next.investors.confidence, REPRIEVE_CONFIDENCE);
        report.investors.reprieved = true;
      }
      report.investors.reviewed = {
        measure: target.measure,
        threshold: target.threshold,
        actual: measureNow(target.measure, { report, state: next }),
        outcome,
        change,
      };
      report.investors.confidence = next.investors.confidence;
      // The next target is named the moment this one is settled, so the
      // player is never in a period whose target they have not seen.
      const recent = [...(next.investors.recentMeasures ?? []), target.measure];
      // Once all four have been asked, the slate clears and they start
      // round again — so no measure is ever stale and none is ever
      // skipped.
      next.investors.recentMeasures = recent.length >= MEASURES.length ? [] : recent;
      next.investors.nextTarget = nextTargetFor(next, rng, {
        recent: next.investors.recentMeasures,
        reviewIndex: (target.reviewIndex ?? 0) + 1,
        // The day's own report, so the next ask is measured against what
        // this resort is actually doing rather than against a ladder
        // written before it existed.
        report,
      });
      report.investors.target = next.investors.nextTarget;

      // A run of good reviews is what earns the offer to buy them out.
      // Reset by any review that is not at least met, so the good ending
      // is a streak rather than a high-water mark.
      const good = outcome === 'beat' || outcome === 'met';
      next.investors.goodReviews = good
        && next.investors.confidence >= OFFER_CONFIDENCE
        ? (next.investors.goodReviews ?? 0) + 1
        : 0;
    }

    // Either ending. Raised once and then held on the state until it is
    // settled, so the player has the full fortnight to find the money
    // rather than a fresh demand every morning.
    const settlement = settlementDue(next.investors, next.day);
    if (settlement && !next.investors.buyoutDemand) {
      next.investors.buyoutDemand = settlement;
      // The day it is raised, as opposed to the fortnight it then stands
      // for. The card that announces it must fire once, not every
      // morning until the deadline.
      report.investors.demandRaised = settlement.kind;
    }

    // And the deadline actually arriving.
    //
    // Without this the act had no ending at all: `settlementDue` raised a
    // demand, the report announced it, and then the day it was due came
    // and went with nothing on either side of it. `payBuyout` and
    // `forceLiquidation` were both written and tested and neither was
    // ever called.
    //
    // The two kinds are not symmetrical and must not be treated as one.
    // A `demand` is the investors pulling out, and letting it lapse sells
    // rooms to pay them. An `offer` is them agreeing to sell their stake
    // to a resort that has earned it, and the penalty for not having the
    // cash to hand cannot be losing the hotel — it simply lapses, and a
    // continued run of good reviews will raise it again.
    const standing = next.investors.buyoutDemand;
    if (standing && next.day >= standing.dueDay) {
      if (standing.kind === 'demand') {
        const after = forceLiquidation(next);
        next.resort.rooms = after.resort.rooms;
        next.money = after.money;
        next.investors = after.investors;
        next.investors.buyoutAnnounced = true;
        report.investors.liquidated = true;
      } else {
        next.investors.buyoutDemand = null;
        // The streak has to restart, or the offer returns the next
        // morning and the deadline means nothing.
        next.investors.goodReviews = 0;
        report.investors.offerLapsed = true;
      }
    }

    report.investors.buyoutDemand = next.investors.buyoutDemand ?? null;
    report.investors.bought = next.investors.bought ?? false;
  } else {
    // Already bought out. The purchase itself happens on the hotel sheet,
    // outside a day, so this is where the game first gets a chance to
    // notice it and say something -- once, hence the flag kept on the
    // state rather than a comparison against yesterday.
    if (next.investors?.bought) {
      const firstTime = !next.investors.buyoutAnnounced;
      if (firstTime) next.investors.buyoutAnnounced = true;
      report.investors = {
        target: null,
        reviewed: null,
        confidence: 100,
        bought: true,
        // Liquidation announces itself on the day it happens, in the
        // branch above; this is only for a buyout the player paid for.
        boughtToday: firstTime && !next.investors.liquidated,
      };
    } else {
      report.investors = null;
    }
  }

  // Yesterday's problems are one day closer to over. Ticked after the
  // day has been played, so a condition with one day left still does its
  // work today and is gone tomorrow.
  next.conditions = tickConditions(next.conditions);
  report.conditions = next.conditions.map((c) => ({
    id: c.id, label: c.label, note: c.note, daysLeft: c.daysLeft,
  }));

  next.history.push(report);
  // Bounded, because nothing reads further back than the day before
  // last and an unbounded array is a save that grows forever. See
  // HISTORY_LIMIT in state.js.
  if (next.history.length > HISTORY_LIMIT) {
    next.history = next.history.slice(-HISTORY_LIMIT);
  }
  if (next.satisfactionHistory.length > SATISFACTION_HISTORY_LIMIT) {
    next.satisfactionHistory = next.satisfactionHistory.slice(-SATISFACTION_HISTORY_LIMIT);
  }
  next.satisfactionHistory.push(averageSatisfaction);
  next.day += 1;
  if (gate.passed) {
    next.act = 2;
    // The investors arrive the moment the gate opens, with their first
    // target already named. Not optional and not declinable: a mechanic
    // you can refuse is one half the players never meet, and this
    // mechanic is the act.
    if (!next.investors) {
      next.investors = startingInvestors(next, rng);
      report.investorsArrived = true;
      // And the report has to describe them, not just note that they
      // turned up. They did not exist while the day ran, so the block
      // above left `report.investors` null -- which meant the evening
      // they arrived was the one evening the report said nothing about
      // them, and their first target went unannounced until the next
      // day. A report describes the state at the end of the day, and at
      // the end of this one they are here with a target already set.
      report.investors = {
        target: next.investors.nextTarget,
        reviewed: null,
        confidence: next.investors.confidence,
        buyoutDemand: null,
        bought: false,
      };
    }
  }

  return {
    state: next,
    report,
    timeline: buildTimeline(schedule, rawEvents, pacedHoleMinutes),
  };
}

/**
 * Applies a decision event's outcome: the player answered `report.
 * pendingEvent` and picked `choiceIndex`. Pure, like everything else here —
 * returns a new state, and the one passed in is never mutated.
 *
 * Looked up from the full event library rather than trusting whatever the
 * report carried, so a stale or tampered id/index cannot silently apply
 * the wrong numbers.
 */
export function applyEventChoice(state, eventId, choiceIndex) {
  const event = EVENTS.find((e) => e.id === eventId);
  if (!event) throw new Error(`applyEventChoice: unknown event "${eventId}"`);
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error(`applyEventChoice: "${eventId}" has no choice at index ${choiceIndex}`);

  const next = structuredClone(state);
  const effects = choice.effects ?? {};
  next.money = (next.money ?? 0) + (effects.money ?? 0);
  next.prestige = clamp((next.prestige ?? 0) + (effects.prestige ?? 0), 0, 100);
  next.turfQuality = clamp((next.turfQuality ?? 0) + (effects.turf ?? 0), 0, 100);
  next.goodwill = applyGoodwill(next.goodwill ?? emptyGoodwill(), effects.goodwill ?? {});

  // And anything that is still wrong tomorrow. This is what makes a
  // choice something to live with rather than a number subtracted once —
  // see src/sim/conditions.js for why every consequence used to land in a
  // single instant.
  if (effects.condition) {
    next.conditions = addCondition(next.conditions ?? [], effects.condition);
  }

  /**
   * And a record of having decided, so a later event can be about it.
   *
   * Every event until now stood alone: it could read the resort's numbers
   * but never what the player had actually chosen, so nothing could ever
   * come back. A decision that cannot come back is an incident rather
   * than a decision, and the cheerful ones are exactly where that shows
   * -- saying yes to something ill-advised should be able to cost you
   * later rather than only at the moment you say it.
   *
   * The day is kept alongside the index because a reckoning wants
   * distance: the events that read this ask for it weeks afterwards, when
   * the money has been spent and the choice feels settled.
   */
  /**
   * And whether it is going to come back.
   *
   * Rolled here, at the moment of the choice, rather than weeks later
   * when the follow-up asks. That keeps `when` a pure predicate over
   * state -- it reads a fact rather than rolling a die every time the
   * event pool is filtered, which would make a reckoning that appears and
   * disappears from one day to the next.
   *
   * Seeded off the save, the day and the event, so a replayed game plays
   * out the same way. `Math.random` has never been called in src/sim and
   * is not going to start here.
   *
   * A cheap fix that ALWAYS comes back is not a gamble, it is a wrong
   * answer with a longer explanation. The probability is what makes
   * taking the cheap way a judgement about odds rather than a mistake.
   */
  const risk = choice.effects?.fallout ?? 0;
  let haunted = false;
  if (risk > 0) {
    let hash = 0;
    for (let i = 0; i < eventId.length; i++) hash = (hash * 31 + eventId.charCodeAt(i)) >>> 0;
    const rng = makeRng((next.seed ?? 1) * 7919 + (next.day ?? 0) * 104729 + hash + choiceIndex);
    haunted = rng.chance(risk);
  }

  next.choicesMade = {
    ...(next.choicesMade ?? {}),
    [eventId]: { index: choiceIndex, day: next.day ?? 0, haunted },
  };
  return next;
}

/**
 * Flattens per-hole events onto the day's clock. The renderer plays this
 * back; the simulation has already finished before the first frame draws.
 *
 * A group reaches hole h having both waited AND played every hole before
 * it, so the offset must accumulate both. Counting only the waits would
 * stamp every event on the closing holes near the tee time and play the
 * whole day back as one bunched-up mess.
 */
function buildTimeline(schedule, rawEvents, holeMinutes) {
  const timeline = [];

  for (const round of schedule.rounds) {
    timeline.push({ minute: round.teeTime, type: 'teeOff', groupIndex: round.groupIndex });
  }

  for (const bundle of rawEvents) {
    const round = schedule.rounds[bundle.groupIndex];
    if (!round) continue;

    let minute = round.teeTime;
    for (let h = 0; h < bundle.holeIndex; h++) {
      minute += (round.waitByHole[h] ?? 0) + (holeMinutes[h] ?? 0);
    }
    minute += round.waitByHole[bundle.holeIndex] ?? 0;

    // Spread this hole's events across the time the hole actually took.
    const duration = holeMinutes[bundle.holeIndex] ?? 12;
    const span = Math.max(1, bundle.events.length);
    bundle.events.forEach((e, i) => {
      timeline.push({
        ...e,
        minute: minute + (i / span) * duration,
        groupIndex: bundle.groupIndex,
      });
    });
  }

  for (const round of schedule.rounds) {
    timeline.push({ minute: round.finishMinute, type: 'finish', groupIndex: round.groupIndex });
  }

  return timeline.sort((a, b) => a.minute - b.minute);
}
