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

const DAY_START = 420;  // 7:00am
const DAY_END = 1080;   // 6:00pm

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
 * Runs one full day and returns the next state, the evening report, and a
 * timeline of timestamped events for the renderer to play back.
 *
 * Pure: the state passed in is never mutated.
 */
export function runDay(state, seed) {
  const rng = makeRng(seed);
  const next = structuredClone(state);
  const holes = openHoles(next);

  const { greenFee, teeInterval } = next.resort.pricing;
  const amenityTypes = next.resort.amenities.map((a) => a.type);
  const carts = amenityTypes.includes('cartBarn');
  const hasRange = amenityTypes.includes('drivingRange');
  const hasPracticeGreen = amenityTypes.includes('practiceGreen');
  const hasHalfwayHouse = amenityTypes.includes('halfwayHouse');

  const rating = holes.length ? courseRating(holes, next.turfQuality) : 0;

  // Word of mouth from the last few days. No history yet (day one) is
  // neutral, so the resort isn't punished or rewarded before it has played.
  const recentHistory = next.satisfactionHistory.slice(-3);
  const recentSatisfaction = recentHistory.length
    ? recentHistory.reduce((s, v) => s + v, 0) / recentHistory.length
    : 50;

  // Nobody comes to a resort with no golf.
  const groupCount = holes.length
    ? demandGroups({
        courseRating: rating,
        prestige: next.prestige,
        amenities: next.resort.amenities,
        greenFee,
        teeInterval,
        recentSatisfaction,
      })
    : 0;

  resetGuestIds();
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push(makeGroup(rng, { prestige: next.prestige, greenFee }, i));
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
  const marshalFactor = 1 - Math.min(MARSHAL_CAP, marshals * MARSHAL_EFFECT);
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
  });
  const amenityBonus = amenityTypes.length * 1.5;
  const averageScenery = holes.length
    ? holes.reduce((s, h) => s + holeStats(h).scenery, 0) / holes.length
    : 0;

  const satisfactions = [];
  groups.forEach((group, gi) => {
    const wait = schedule.rounds[gi]?.waitMinutes ?? 0;
    group.guests.forEach((guest, idx) => {
      const strokes = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].strokes, 0);
      const par = perGroupScores[gi].reduce((s, holeScores) => s + holeScores[idx].par, 0);
      satisfactions.push(
        guestSatisfaction({
          handicap: guest.handicap,
          strokesOverPar: strokes - par,
          waitMinutes: wait,
          greenFee,
          perceivedValue: value,
          scenery: averageScenery,
          turfQuality: next.turfQuality,
          amenityBonus,
        })
      );
    });
  });

  const averageSatisfaction = satisfactions.length
    ? satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length
    : 50;

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
  const care = keepers * 4.6;
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
    prestige: next.prestige,
    turfQuality: next.turfQuality,
    complaints,
    gate,
  };

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
