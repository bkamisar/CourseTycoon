import { makeRng } from './rng.js';
import { holeStats, clamp } from './hole.js';
import { makeGroup, resetGuestIds } from './golfer.js';
import { playHole } from './round.js';
import { scheduleRounds } from './schedule.js';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, menuRevenue } from './economy.js';
import { guestSatisfaction, buildComplaints } from './satisfaction.js';
import { courseRating, nextPrestige } from './ratings.js';
import { actOneGate } from './acts.js';
import { openHoles } from './state.js';
import { menuBestEnergy } from './menu.js';
import { kitchenCapacity, kitchenLoad, serviceFactor } from './kitchen.js';
import { narrationContext, pickNarration, rememberNarration } from './narration.js';
import { SEGMENT_KEYS } from './segments.js';
import { emptyGoodwill, applyGoodwill, decayGoodwill } from './goodwill.js';
import { EVENTS, SPEAKERS as EVENT_SPEAKERS, eventContext, pickEvent, rememberEvent } from './events.js';

const DAY_START = 420;  // 7:00am
const DAY_END = 1080;   // 6:00pm

/** Roughly one decision event per week: a 1-in-7 chance each day, checked
 * once, so an event is never offered more than once on the same day. */
const EVENT_CHANCE_PER_DAY = 1 / 7;

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
 * Capped below `halfwayRestoreTo`'s ceiling on purpose. She costs no time
 * at all (round.js's `cartStop`), so if she could also match a sit-down
 * stop for energy she would simply be better than the halfway house and
 * there would be no decision between them. An all-drinks cart restores to
 * 60; put a hot dog on her and it is 74, against the halfway house's 88
 * for the same food and three and a half minutes.
 */
export function cartRestoreTo(menu) {
  return clamp(50 + menuBestEnergy(menu) * 2, 50, 76);
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
  const holes = openHoles(next);

  // A day's fade back toward neutral, for whichever segments a past
  // decision event has coloured. Runs every day regardless of whether one
  // fires today, and copes with a save from before goodwill existed.
  next.goodwill = decayGoodwill(next.goodwill ?? emptyGoodwill());

  const { greenFee, teeInterval } = next.resort.pricing;
  const amenityTypes = next.resort.amenities.map((a) => a.type);
  const carts = amenityTypes.includes('cartBarn');
  const hasRange = amenityTypes.includes('drivingRange');
  const hasPracticeGreen = amenityTypes.includes('practiceGreen');
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
  const courseDifficulty = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).difficulty, 0) / holes.length
    : 0;
  const averageScenery = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).scenery, 0) / holes.length
    : 0;
  // Destination guests are mostly an Act II crowd; Act I has no rooms yet.
  const hasRooms = (next.resort.rooms?.count ?? 0) > 0;

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
      })
    : { total: 0, share: Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0])) };
  const groupCount = demand.total;

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
  const marshalFactor = marshalPaceFactor(marshals);
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

  const profit = revenue.total - costs.total;

  // Turf: one groundskeeper holds roughly three holes steady.
  const keepers = next.resort.staff.filter((m) => m.role === 'groundskeeper').length;
  const wear = holes.length * 1.4 + groupCount * 0.12;
  const care = keepers * 6.8;
  next.turfQuality = clamp(next.turfQuality - wear + care, 0, 100);

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

  next.history.push(report);
  next.satisfactionHistory.push(averageSatisfaction);
  next.day += 1;
  if (gate.passed) next.act = 2;

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
