import { clamp } from './hole.js';

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
}) {
  // Over nine holes a golfer expects roughly half their handicap.
  const expectedOverPar = handicap / 2;
  const scoreDelta = clamp((expectedOverPar - strokesOverPar) * 1.6, -22, 14);

  const waitPenalty = waitMinutes * 0.55;
  const priceDelta = clamp((perceivedValue - greenFee) * 0.22, -20, 12);
  const sceneryBonus = (scenery - 50) * 0.16;
  const turfBonus = (turfQuality - 60) * 0.22;

  return clamp(
    55 + scoreDelta - waitPenalty + priceDelta + sceneryBonus + turfBonus + amenityBonus,
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
    complaints.push('There is no restroom anywhere past the 6th.');
  }
  if (!amenityTypes.includes('snackShack') && !amenityTypes.includes('halfwayHouse')) {
    complaints.push('Nowhere to get a drink at the turn.');
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
