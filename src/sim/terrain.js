import { distanceToPath } from './geometry.js';
import { greenCentre } from './hole.js';

export const LIE = {
  TEE: 'tee',
  FAIRWAY: 'fairway',
  ROUGH: 'rough',
  SAND: 'sand',
  WATER: 'water',
  TREES: 'trees',
  GREEN: 'green',
};

/** Green radius in yards by preset. */
const GREEN_RADIUS = {
  small: 11,
  large: 16,
  tiered: 14,
  elevated: 12,
  island: 12,
};

export function greenRadius(hole) {
  return GREEN_RADIUS[hole.greenPreset] ?? 13;
}

/**
 * Classifies a landing point. Order matters: water drowns everything,
 * then sand, then trees, then the green, then the corridor bands.
 */
export function lieAt(hole, point) {
  for (const f of hole.features) {
    if (f.type === 'pond' && within(f, point)) return LIE.WATER;
  }
  for (const f of hole.features) {
    if (f.type === 'bunker' && within(f, point)) return LIE.SAND;
  }
  for (const f of hole.features) {
    if (f.type === 'trees' && within(f, point)) return LIE.TREES;
  }

  const centre = greenCentre(hole);
  if (Math.hypot(point.x - centre.x, point.y - centre.y) <= greenRadius(hole)) {
    return LIE.GREEN;
  }

  const offline = distanceToPath(hole.corridor, point);
  if (offline <= hole.corridorWidth / 2) return LIE.FAIRWAY;
  if (offline <= hole.corridorWidth / 2 + 22) return LIE.ROUGH;
  return LIE.TREES;
}

function within(feature, point) {
  return Math.hypot(point.x - feature.x, point.y - feature.y) <= feature.size;
}
