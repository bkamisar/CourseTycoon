import { TEMPLATES } from './templates.js';
import { pathLength, pointAtDistance, distanceToPath, progressAlongPath } from './geometry.js';

/**
 * Daily upkeep in dollars. Exported so UI copy (the glossary, in
 * particular) can quote the real rate instead of retyping it — a number
 * written twice is a number that silently drifts the first time this file
 * retunes it.
 */
export const UPKEEP_BASE = 200;
export const UPKEEP_PER_BUNKER = 25;
export const UPKEEP_PER_POND = 45;

/** Relative putting difficulty by green preset. */
export const GREEN_DIFFICULTY = {
  small: 1.15,
  large: 0.85,
  tiered: 1.3,
  elevated: 1.1,
  island: 1.25,
};

export function makeHole(templateName, id) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`unknown template: ${templateName}`);
  return {
    id,
    template: templateName,
    // structuredClone keeps templates immutable across holes.
    corridor: structuredClone(template.corridor),
    corridorWidth: template.corridorWidth,
    greenPreset: template.greenPreset,
    // The hardest green ever paid for on this hole. Re-configuring down
    // to something easier and back up again is then free, because the
    // construction was already bought. See greenCycleCost in the editor
    // for why charging per change was a trap.
    greenPaidTo: GREEN_DIFFICULTY[template.greenPreset],
    features: structuredClone(template.features),
    teePos: { ...template.corridor[0] },
  };
}

/** Centre of the green: the far end of the corridor. */
export function greenCentre(hole) {
  return { ...hole.corridor[hole.corridor.length - 1] };
}

/**
 * Every statistic shown in the editor is derived here, never stored.
 * Expected playing minutes is NOT included — that comes from simulating
 * a representative group (see round.js in a later task), because it
 * depends on how the hole actually plays rather than on a formula over
 * its parts.
 */
export function holeStats(hole) {
  const length = pathLength(hole.corridor);
  const bunkers = hole.features.filter((f) => f.type === 'bunker');
  const ponds = hole.features.filter((f) => f.type === 'pond');
  const trees = hole.features.filter((f) => f.type === 'trees');

  return {
    length,
    par: parFor(length),
    difficulty: difficultyOf(hole, length, bunkers, ponds, trees),
    scenery: sceneryOf(ponds, trees),
    upkeep:
      UPKEEP_BASE +
      bunkers.length * UPKEEP_PER_BUNKER +
      ponds.length * UPKEEP_PER_POND,
  };
}

function parFor(length) {
  if (length < 260) return 3;
  if (length < 470) return 4;
  return 5;
}


/**
 * Where balls actually come to rest on a hole, in yards from the tee.
 *
 * A representative player covers roughly 205 yards a swing, so they stop
 * near 205, then 410, and so on, until they reach the green - which is
 * always a landing zone, because every approach finishes there. A par 3
 * therefore has one zone (the green) and a par 5 has three.
 */
function landingStations(length) {
  const stations = [];
  let d = 0;
  while (d < length - 30) {
    d += 205;
    stations.push(Math.min(d, length));
  }
  stations.push(length);
  return stations;
}

/** How near a point on the hole is to any landing zone, 0 to 1. */
const ZONE_REACH = 100;
function landingProximity(along, length) {
  let best = 0;
  for (const station of landingStations(length)) {
    best = Math.max(best, clamp(1 - Math.abs(along - station) / ZONE_REACH, 0, 1));
  }
  return best;
}

function difficultyOf(hole, length, bunkers, ponds, trees) {
  // Narrow corridors punish dispersion - but only in proportion to the club
  // being swung. Thirty yards is tight for a driver and generous for a
  // wedge, so the same corridor is a different hole at 150 yards and at 500.
  //
  // Treating width as an absolute made a 155 yard par 3 (44.6) score harder
  // than a 526 yard par 5 (43.8), because the short holes happen to have the
  // narrowest corridors. That squashed every template into an eight point
  // band, and a band that narrow cannot express the difference between what
  // a beginner wants and what a scratch player wants.
  const clubFactor = clamp(length / 390, 0.35, 1.35);
  const widthPenalty = clamp((46 - hole.corridorWidth) * 1.6 * clubFactor, -10, 45);

  // A hazard threatens in two dimensions, and the second one used to be
  // missing. Sideways: a pond 80 yards offline is scenery. Along the hole:
  // a bunker 20 yards from the tee, which no adult will reach, is also
  // scenery - yet it used to score exactly as much as one planted in the
  // landing zone. Play was always right, because shots land where they
  // land and lieAt catches them; it was this number that lied, rewarding
  // a player for cluttering the tee box.
  const hazardScore = (f, base) => {
    const point = { x: f.x, y: f.y };
    const offline = distanceToPath(hole.corridor, point);
    const sideways = offline < hole.corridorWidth / 2 + f.size ? 1 : 0.2;
    const inPlay = landingProximity(progressAlongPath(hole.corridor, point), length);
    // Floor of a quarter: even a hazard nobody reaches is still something
    // to look at and think about from the tee.
    return base * sideways * (0.25 + 0.75 * inPlay);
  };

  const hazardPressure = [...bunkers, ...ponds].reduce(
    (sum, f) => sum + hazardScore(f, f.type === 'pond' ? 9 : 5),
    0
  );

  const treePressure = trees.reduce((sum, f) => sum + hazardScore(f, 4), 0);

  const lengthPressure = clamp((length - 330) / 10, -10, 26);
  const greenPressure = (GREEN_DIFFICULTY[hole.greenPreset] - 1) * 30;

  return clamp(
    20 + widthPenalty + hazardPressure + treePressure + lengthPressure + greenPressure,
    0,
    100
  );
}

function sceneryOf(ponds, trees) {
  // Diminishing returns: the second pond adds less than the first.
  const water = 22 * Math.sqrt(ponds.length);
  const wood = 12 * Math.sqrt(trees.length);
  return clamp(30 + water + wood, 0, 100);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { pointAtDistance };
