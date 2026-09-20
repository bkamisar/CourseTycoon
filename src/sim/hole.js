import { TEMPLATES } from './templates.js';
import { pathLength, pointAtDistance, distanceToPath } from './geometry.js';

/** Daily upkeep in dollars. */
const UPKEEP_BASE = 200;
const UPKEEP_PER_BUNKER = 25;
const UPKEEP_PER_POND = 45;

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

function difficultyOf(hole, length, bunkers, ponds, trees) {
  // Narrow corridors punish dispersion most, so width dominates.
  const widthPenalty = clamp((46 - hole.corridorWidth) * 1.6, -10, 40);

  // Hazards matter in proportion to how close they sit to the corridor —
  // a pond 80 yards offline is scenery, not a hazard.
  const hazardPressure = [...bunkers, ...ponds].reduce((sum, f) => {
    const offline = distanceToPath(hole.corridor, { x: f.x, y: f.y });
    const reach = hole.corridorWidth / 2 + f.size;
    return sum + (offline < reach ? (f.type === 'pond' ? 9 : 5) : 1.5);
  }, 0);

  const treePressure = trees.reduce((sum, f) => {
    const offline = distanceToPath(hole.corridor, { x: f.x, y: f.y });
    return sum + (offline < hole.corridorWidth / 2 + f.size ? 4 : 1);
  }, 0);

  const lengthPressure = clamp((length - 330) / 12, -8, 20);
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
