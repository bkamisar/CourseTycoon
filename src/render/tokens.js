/**
 * Draws day-playback tokens over the resort overview: one small marker per
 * group in play, moving through the course as the day plays out, plus
 * brief effect markers for water/sand/holed events firing near the current
 * minute.
 *
 * Deliberately one token per GROUP, not one per ball (see the Task 8 plan:
 * forty groups of four balls each is unreadable at 180x320 and buries the
 * one thing worth watching -- how groups bunch up behind a slow hole).
 * Individual ball flight belongs to a future zoomed single-hole view, built
 * on `guestBallPositionAt` from `src/play/interpolate.js`, not here.
 *
 * A token's screen position is computed with the exact same
 * `computeHoleTransform` the hole itself was drawn with (via `regions`, the
 * tappable-region list `drawResort` already returns), so a token can never
 * drift off the fairway it is meant to be walking down.
 */
import { PALETTE } from './palette.js';
import { computeHoleTransform } from './holeView.js';
import { greenCentre } from '../sim/hole.js';
import { pathLength, pointAtDistance } from '../sim/geometry.js';
import { groupCourseProgressAt } from '../play/interpolate.js';

/** How long a water/sand/holed marker stays visible after it fires. */
export const EFFECT_WINDOW_MINUTES = 2.5;

const EFFECT_COLOR = {
  water: PALETTE.WATER_DEEP,
  sand: PALETTE.SAND,
  holed: PALETTE.ACCENT,
};

const EFFECT_TYPES = new Set(Object.keys(EFFECT_COLOR));

function holeRegionMap(regions) {
  return new Map(regions.filter((r) => r.kind === 'hole').map((r) => [r.id, r]));
}

/**
 * One token per group currently on course at `minute` (teed off, not yet
 * finished): `{ groupIndex, holeIndex, x, y }` in the same coordinate space
 * `regions` was computed in (i.e. the canvas `drawResort` drew into).
 * Groups that have not teed off yet, or have already finished, are simply
 * absent -- nothing to draw, rather than a token parked at an edge.
 */
export function computeTokens(timeline, holes, regions, minute) {
  const groupIndexes = [...new Set(
    timeline.filter((e) => e.type === 'teeOff').map((e) => e.groupIndex)
  )];
  const holeRegions = holeRegionMap(regions);
  const tokens = [];

  for (const groupIndex of groupIndexes) {
    const progress = groupCourseProgressAt(timeline, groupIndex, holes, minute);
    if (progress === null) continue;

    const holeIndex = Math.min(holes.length - 1, Math.floor(progress));
    const fraction = Math.min(1, Math.max(0, progress - holeIndex));
    const hole = holes[holeIndex];
    const rect = hole && holeRegions.get(hole.id);
    if (!hole || !rect || !hole.corridor || hole.corridor.length < 2) continue;

    const t = computeHoleTransform(hole, rect);
    const along = fraction * pathLength(hole.corridor);
    const world = pointAtDistance(hole.corridor, along);
    const screen = t.toScreen(world);

    tokens.push({ groupIndex, holeIndex, x: screen.x, y: screen.y });
  }

  return tokens;
}

/**
 * Small effect markers -- a splash on water, a puff on sand, a flash on a
 * holed putt -- for every matching event in the recent past of `minute`.
 * Positioned via the same hole transform as `computeTokens`, so an effect
 * lands on the hazard it actually happened in.
 */
export function computeEffects(timeline, holes, regions, minute, window = EFFECT_WINDOW_MINUTES) {
  const holeRegions = holeRegionMap(regions);
  const holesById = new Map(holes.map((h) => [h.id, h]));
  const effects = [];

  for (const e of timeline) {
    if (!EFFECT_TYPES.has(e.type)) continue;
    if (e.minute > minute) continue;
    const age = minute - e.minute;
    if (age > window) continue;

    const hole = holesById.get(e.holeId);
    const rect = hole && holeRegions.get(hole.id);
    if (!hole || !rect || !hole.corridor || hole.corridor.length < 2) continue;

    const t = computeHoleTransform(hole, rect);
    // 'holed' carries no position of its own -- it happened at the green.
    const at = e.at ?? greenCentre(hole);
    const screen = t.toScreen(at);

    effects.push({ type: e.type, groupIndex: e.groupIndex, x: screen.x, y: screen.y, age });
  }

  return effects;
}

/** Draws a small pixel marker for every active group token. */
export function drawTokens(ctx, tokens) {
  for (const tok of tokens) {
    const x = Math.round(tok.x);
    const y = Math.round(tok.y);
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = PALETTE.WHITE;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Draws every active effect marker, fading out over its window. */
export function drawEffects(ctx, effects, window = EFFECT_WINDOW_MINUTES) {
  for (const fx of effects) {
    const color = EFFECT_COLOR[fx.type] ?? PALETTE.WHITE;
    const x = Math.round(fx.x);
    const y = Math.round(fx.y);
    const fade = Math.max(0.2, 1 - fx.age / window);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }
}
