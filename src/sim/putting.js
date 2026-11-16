/**
 * A ball rolling on a green.
 *
 * The day simulation never needed this: a guest's putting is a number
 * (`puttsToHole`), because nobody watches four hundred guests putt. The
 * playable mode does need it — the player is the one holding the putter —
 * so this is the one piece of golf physics the game did not already have.
 *
 * The model is the smallest one that makes a green worth reading:
 *
 *   - constant friction, so a putt hit with speed v rolls v²/(2·FRICTION)
 *     yards on the flat and the power bar can be marked in yards;
 *   - one constant slope per green, so every putt on it breaks the same
 *     way and the player can learn it. The slope's strength comes from
 *     the green's own `GREEN_DIFFICULTY` — the same figure that costs a
 *     guest putts — so a tiered green is harder for the player for the
 *     same reason it is harder for everyone else;
 *   - a cup that only takes a ball arriving slowly enough.
 *
 * Deterministic, fixed time step, no rng: the same putt always rolls the
 * same way.
 */
import { GREEN_DIFFICULTY, greenCentre } from './hole.js';
import { greenRadius } from './terrain.js';
import { makeRng } from './rng.js';

/** Deceleration of a rolling ball, yards per second squared. At 2.5 a
 * thirty-foot putt takes just under three seconds — brisk, but watchable. */
export const FRICTION = 2.5;

/** The cup takes a ball within this many yards of its centre: twice the
 * size of a real one (0.06). At five pixels to the yard a real cup is a
 * third of a pixel wide, which is not a target, it is a rumour. */
export const CUP_RADIUS = 0.12;

/** ...but only one moving no faster than this (yards per second): a ball
 * that would have run about two feet past. Harder than that and it lips out. */
export const CAPTURE_SPEED = 1.8;

/** A ball this far past the green's edge has left it and stops there. */
const OFF_GREEN_MARGIN = 0.3;

const STEP_SECONDS = 1 / 240;
const SAMPLE_EVERY = 8;        // one path sample per 1/30 s
const MAX_SECONDS = 20;

/**
 * Slope strength as a fraction of friction, from the green's difficulty.
 * Measured on a ten-yard putt hit across the slope at dying pace: a large
 * green (0.85) breaks about half a foot, a small one (1.15) a foot and
 * three quarters, a tiered one (1.3) two and a quarter. Against a cup
 * 0.24 yards across, anything over a foot of break has to be allowed for.
 */
export function slopeFraction(greenPreset) {
  const difficulty = GREEN_DIFFICULTY[greenPreset] ?? 1;
  return Math.max(0.03, Math.min(0.2, (difficulty - 0.7) * 0.25));
}

/**
 * The green's slope as an acceleration vector in yards/s² — the direction
 * a ball at rest would want to roll. The direction belongs to the plot
 * (seeded by the hole's id), so rebuilding a green changes how much it
 * breaks but not which way the land falls.
 */
export function greenSlope(hole) {
  const angle = makeRng(hole.id * 7919 + 13).next() * Math.PI * 2;
  const magnitude = FRICTION * slopeFraction(hole.greenPreset);
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

/** The speed that rolls a ball exactly `yards` on a flat green. */
export function puttSpeedFor(yards) {
  return Math.sqrt(2 * FRICTION * Math.max(0, yards));
}

/**
 * Rolls one putt from `from`, starting along `direction` (any non-zero
 * vector) at `speed` yards per second.
 *
 * Returns `{ path, end, holed, offGreen, seconds }`. `path` is the ball's
 * position every thirtieth of a second, first point `from` and last point
 * `end`, for the renderer to replay in real time.
 */
export function rollPutt(hole, from, direction, speed) {
  const cup = greenCentre(hole);
  const radius = greenRadius(hole);
  const slope = greenSlope(hole);
  const length = Math.hypot(direction.x, direction.y) || 1;

  let x = from.x;
  let y = from.y;
  let vx = (direction.x / length) * speed;
  let vy = (direction.y / length) * speed;

  const path = [{ x, y }];
  let holed = false;
  let offGreen = false;
  let steps = 0;
  const maxSteps = Math.round(MAX_SECONDS / STEP_SECONDS);

  while (steps < maxSteps) {
    const v = Math.hypot(vx, vy);

    if (Math.hypot(x - cup.x, y - cup.y) <= CUP_RADIUS && v <= CAPTURE_SPEED) {
      holed = true;
      x = cup.x;
      y = cup.y;
      break;
    }
    if (Math.hypot(x - cup.x, y - cup.y) > radius + OFF_GREEN_MARGIN) {
      offGreen = true;
      break;
    }
    // Friction always beats the slope (slopeFraction caps at 0.2), so a
    // ball too slow to outlast one step of friction has stopped for good.
    if (v <= FRICTION * STEP_SECONDS) break;

    vx += (-(vx / v) * FRICTION + slope.x) * STEP_SECONDS;
    vy += (-(vy / v) * FRICTION + slope.y) * STEP_SECONDS;
    x += vx * STEP_SECONDS;
    y += vy * STEP_SECONDS;
    steps += 1;
    if (steps % SAMPLE_EVERY === 0) path.push({ x, y });
  }

  const end = { x, y };
  const last = path[path.length - 1];
  if (last.x !== end.x || last.y !== end.y) path.push(end);

  return { path, end, holed, offGreen, seconds: steps * STEP_SECONDS };
}
