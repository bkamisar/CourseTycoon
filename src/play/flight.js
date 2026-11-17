/**
 * Where a struck ball is, some milliseconds after the strike.
 *
 * The outcome of a stroke is decided the instant it is struck
 * (playGolf.js#resolveStroke). This only replays it: a full shot as a
 * straight run from `from` to `to` with a hump of height for the eye, a
 * putt along the path the roll actually took, in the time it actually
 * took. Pure, so the screen can ask "where is it now?" every frame.
 *
 * A full shot leaves the club fast and slows as it falls (the ground it
 * covers is eased; its height is not), so the top of the arc comes past
 * halfway and the ball seems to hang there before it drops — the shape of
 * a real golf shot, and the moment the camera follows it down.
 */
const SWING_MS_BASE = 500;
const SWING_MS_PER_YARD = 5.5;
const SWING_MS_MIN = 600;
const SWING_MS_MAX = 2000;
/** How hard the ball slows over the ground: 1 is not at all. */
const CARRY_EASE = 1.5;
/** Peak height of the drawn arc, in canvas pixels. */
const LIFT_PX_PER_YARD = 0.12;
const LIFT_PX_MIN = 2;
const LIFT_PX_MAX = 30;
/** When a ball is going in, the last part of its journey plays slowed
 * down — from this fraction of the way, at this speed. */
const DROP_SLOW_FROM = 0.72;
const DROP_SLOW_RATE = 0.3;
/** A putt that stopped at once still gets a beat on screen. */
const PUTT_MS_MIN = 200;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function flightDuration(outcome) {
  if (outcome.kind === 'putt') {
    return outcome.path.length < 2 ? 0 : Math.max(PUTT_MS_MIN, outcome.seconds * 1000);
  }
  return clamp(SWING_MS_BASE + outcome.yards * SWING_MS_PER_YARD, SWING_MS_MIN, SWING_MS_MAX);
}

/** `{ x, y, lift, done }` — world yards, plus pixels of height to draw the ball above its shadow. */
export function flightAt(outcome, elapsedMs) {
  const duration = flightDuration(outcome);
  const t = duration <= 0 ? 1 : clamp(elapsedMs / duration, 0, 1);
  const done = t >= 1;

  if (outcome.kind === 'putt') {
    const path = outcome.path;
    if (path.length < 2) return { x: path[0].x, y: path[0].y, lift: 0, done: true };
    const f = t * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const k = f - i;
    return {
      x: path[i].x + (path[i + 1].x - path[i].x) * k,
      y: path[i].y + (path[i + 1].y - path[i].y) * k,
      lift: 0,
      done,
    };
  }

  const peak = clamp(outcome.yards * LIFT_PX_PER_YARD, LIFT_PX_MIN, LIFT_PX_MAX);
  // t is clamped, so sin(pi * 1) is ~1e-16 rather than 0: say 0.
  const lift = done || t === 0 ? 0 : Math.sin(Math.PI * t) * peak;
  const p = done ? 1 : 1 - Math.pow(1 - t, CARRY_EASE);
  return {
    x: outcome.from.x + (outcome.to.x - outcome.from.x) * p,
    y: outcome.from.y + (outcome.to.y - outcome.from.y) * p,
    lift,
    done,
  };
}

/**
 * The flight's own clock, `realMs` after the strike. The same as the real
 * one — except for a ball that is going in, whose last stretch runs slowed
 * down, so the moment it drops is a moment. Feed the result to `flightAt`.
 */
export function flightClock(outcome, realMs) {
  const duration = flightDuration(outcome);
  if (!outcome.holed || duration <= 0) return realMs;
  const knee = duration * DROP_SLOW_FROM;
  return realMs <= knee ? realMs : knee + (realMs - knee) * DROP_SLOW_RATE;
}
