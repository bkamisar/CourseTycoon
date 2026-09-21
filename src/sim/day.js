import { makeRng } from './rng.js';
import { holeStats, clamp } from './hole.js';
import { makeGroup, resetGuestIds } from './golfer.js';
import { playHole } from './round.js';
import { scheduleRounds } from './schedule.js';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue } from './economy.js';
import { guestSatisfaction, buildComplaints } from './satisfaction.js';
import { courseRating, nextPrestige } from './ratings.js';
import { actOneGate } from './acts.js';
import { openHoles } from './state.js';
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
  const hasHalfwayHouse = amenityTypes.includes('halfwayHouse');

  const rating = holes.length ? courseRating(holes, next.turfQuality) : 0;

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
        choices: picked.choices.map((c) => ({ label: c.label, cost: c.cost })),
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
