import { clamp } from './hole.js';
import { SEGMENTS, difficultyFit } from './segments.js';

/**
 * Ordinal for a hole number. Computed rather than looked up in a table of
 * nine, so complaints still read correctly if a course ever runs past the
 * front nine - a hard-coded list produced "The undefined takes forever."
 */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * A golfer's verdict on their round, 0–100.
 *
 * The dominant term is waiting, deliberately: a slow round is the thing
 * golfers resent most, and it is the consequence the player must feel when
 * they build a punishing course.
 *
 * `segment` (default `locals`, so every caller that predates segments keeps
 * its old behaviour) weighs the wait, price, scenery, turf and amenity
 * terms by that segment's own priorities, and adds a difficulty-fit term
 * from the exact same bell curve `segments.segmentAppeal` uses to score the
 * course's appeal — imported rather than re-derived, so the crowd that
 * turns up and the crowd that leaves happy can never disagree about what a
 * course's difficulty means. `courseDifficulty` is optional: omit it (as
 * every caller does until Task 5 wires it through) and the fit term is
 * simply left out rather than guessed at.
 */
export function guestSatisfaction({
  handicap,
  strokesOverPar,
  waitMinutes,
  greenFee,
  perceivedValue,
  scenery,
  turfQuality,
  amenityBonus,
  segment = 'locals',
  courseDifficulty,
  kitchenServiceFactor = 1,
}) {
  const seg = SEGMENTS[segment] ?? SEGMENTS.locals;

  // Over nine holes a golfer expects roughly half their handicap.
  const expectedOverPar = handicap / 2;
  const scoreDelta = clamp((expectedOverPar - strokesOverPar) * 1.6, -22, 14);

  const waitPenalty = waitMinutes * 0.55 * seg.waitWeight;
  const priceDelta = clamp((perceivedValue - greenFee) * 0.22 * seg.priceSensitivity, -20, 12);
  const sceneryBonus = (scenery - 50) * 0.16 * seg.sceneryWeight;
  const turfBonus = (turfQuality - 60) * 0.22 * seg.turfWeight;
  const amenityBonusWeighted = amenityBonus * seg.amenityWeight;

  // 1 at the segment's ideal difficulty, falling away either side — the
  // same shape that decides whether this segment even turns up.
  const difficultyBonus = courseDifficulty === undefined
    ? 0
    : (difficultyFit(courseDifficulty, seg) - 0.5) * 30;

  // Queueing for food you were promised. Proportional to how far past
  // capacity the kitchen is, so one item over is a shrug and a full
  // restaurant with no cooks is a bad afternoon.
  const kitchenPenalty = (1 - kitchenServiceFactor) * 18;

  return clamp(
    55 + scoreDelta - waitPenalty + priceDelta + sceneryBonus + turfBonus +
      amenityBonusWeighted + difficultyBonus - kitchenPenalty,
    0,
    100
  );
}

/**
 * Plain-language complaints for the evening report. These are authored
 * rather than generated so they stay funny and cost the player nothing.
 */
export function buildComplaints({
  waitTotalsByHole,
  groupsPlayed,
  turfQuality,
  amenityTypes,
  averageSatisfaction,
  nearActGate,
  kitchenServiceFactor = 1,
}) {
  const complaints = [];
  const groups = Math.max(1, groupsPlayed);

  // Pace, named by hole.
  const worst = waitTotalsByHole.indexOf(Math.max(...waitTotalsByHole));
  const worstPerGroup = waitTotalsByHole[worst] / groups;
  if (worstPerGroup > 6) {
    complaints.push(`The ${ordinal(worst + 1)} takes forever. We stood on that tee for ages.`);
  } else if (worstPerGroup > 3) {
    complaints.push(`Bit of a backup on the ${ordinal(worst + 1)}.`);
  }

  // Condition.
  if (turfQuality < 35) {
    complaints.push('The greens are shaggy and the bunkers were unraked.');
  } else if (turfQuality < 55) {
    complaints.push('Course could use some attention — fairways are patchy.');
  }

  // Missing amenities.
  if (!amenityTypes.includes('restrooms')) {
    // Name a hole the course actually has. Hard-coding "past the 6th"
    // told players about a hole that does not exist on a three-hole
    // resort, which reads as the game being broken rather than the
    // course being short of facilities.
    const holeCount = waitTotalsByHole.length;
    complaints.push(
      holeCount >= 4
        ? `There is no restroom anywhere past the ${ordinal(Math.ceil(holeCount / 2))}.`
        : 'There is nowhere out there to use a restroom.'
    );
  }
  if (!amenityTypes.includes('snackShack') && !amenityTypes.includes('halfwayHouse')) {
    complaints.push('Nowhere to get a drink at the turn.');
  }
  if (kitchenServiceFactor < 0.9) {
    complaints.push('Waited twenty minutes for food that never really arrived.');
  }

  // General mood.
  if (averageSatisfaction < 30) {
    complaints.push('Honestly? Would not come back.');
  }

  // Act II foreshadowing — the game asking for what it wants next.
  if (nearActGate) {
    complaints.push("I'd play again tomorrow, but the nearest motel is 40 minutes out.");
  }

  return complaints;
}
