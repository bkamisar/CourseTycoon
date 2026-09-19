import { LIE, lieAt } from './terrain.js';
import { pointAtDistance, greenCentre, clamp } from './hole.js';
import { pathLength, distanceToPath } from './geometry.js';

/** Multipliers applied to a golfer's full range by the lie they play from. */
const LIE_RANGE = {
  [LIE.TEE]: 1.0,
  [LIE.FAIRWAY]: 1.0,
  [LIE.GREEN]: 1.0,
  [LIE.ROUGH]: 0.85,
  [LIE.SAND]: 0.6,
  [LIE.TREES]: 0.45,
  [LIE.WATER]: 1.0, // played from the drop, never actually struck from water
};

/** Extra dispersion multiplier by lie — bad lies scatter as well as shorten. */
const LIE_SPREAD = {
  [LIE.TEE]: 1.0,
  [LIE.FAIRWAY]: 1.0,
  [LIE.GREEN]: 1.0,
  [LIE.ROUGH]: 1.35,
  [LIE.SAND]: 1.6,
  [LIE.TREES]: 1.9,
  [LIE.WATER]: 1.0,
};

/** Full-swing distance in yards: scratch ~265, 30 handicap ~160. */
export function fullRange(handicap, lie = LIE.TEE) {
  const base = 265 - handicap * 3.5;
  return Math.max(60, base) * (LIE_RANGE[lie] ?? 1.0);
}

/**
 * Resolves one full shot. Returns where the ball finished, the lie it
 * finished in, and how far it travelled.
 *
 * The ball is aimed along the corridor toward the green, so a dogleg is
 * played round rather than through - golfers are not suicidal.
 */
export function resolveShot(rng, hole, from, lie, handicap) {
  const range = fullRange(handicap, lie);
  const toPin = distanceRemaining(hole, from);
  const intended = Math.min(range, toPin);

  const spread = LIE_SPREAD[lie] ?? 1.0;
  const distanceSd = intended * (0.05 + handicap * 0.003) * spread;
  const lateralSd = intended * (0.035 + handicap * 0.0035) * spread;

  const travelled = Math.max(10, rng.normal(intended, distanceSd));
  const lateral = rng.normal(0, lateralSd);

  // Aim point: the corridor position `travelled` yards further along.
  const alongFrom = progressAlong(hole, from);
  const aim = pointAtDistance(hole.corridor, alongFrom + travelled);
  const heading = headingAt(hole, alongFrom + travelled);

  // Offset perpendicular to the corridor heading.
  const to = {
    x: aim.x + Math.cos(heading) * lateral,
    y: aim.y + Math.sin(heading) * lateral,
  };

  return { from: { ...from }, to, lie: lieAt(hole, to), travelled };
}

/**
 * Putts required to hole out, from feet. Never fewer than one, never more
 * than five - a six-putt is a story, not a simulation.
 */
export function puttsToHole(rng, feet, handicap, greenDifficulty) {
  const expected =
    (1.55 + 0.028 * feet + handicap * 0.012) * greenDifficulty;
  const rolled = Math.round(rng.normal(expected, 0.45));
  return clamp(rolled, 1, 5);
}

/** Straight-line yards from a point to the centre of the green. */
export function distanceRemaining(hole, point) {
  const centre = greenCentre(hole);
  return Math.max(0, Math.hypot(centre.x - point.x, centre.y - point.y));
}

/**
 * How far along the corridor a point sits, in yards.
 *
 * Computed by projecting onto each segment rather than by sampling the
 * path at intervals. Sampling would be both approximate and ruinously
 * slow: this runs on every shot, and the balance harness simulates
 * thousands of days.
 */
function progressAlong(hole, point) {
  const path = hole.corridor;
  let best = 0;
  let bestDist = Infinity;
  let cumulative = 0;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const segment = Math.sqrt(lengthSq);

    let t = lengthSq === 0
      ? 0
      : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const dist = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    if (dist < bestDist) {
      bestDist = dist;
      best = cumulative + t * segment;
    }
    cumulative += segment;
  }
  return best;
}

/** Perpendicular direction to the corridor at a given station, in radians. */
function headingAt(hole, along) {
  const a = pointAtDistance(hole.corridor, Math.max(0, along - 5));
  const b = pointAtDistance(hole.corridor, along + 5);
  return Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
}

export { distanceToPath };
