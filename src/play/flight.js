/**
 * Where a struck ball is, some milliseconds after the strike.
 *
 * The outcome of a stroke is decided the instant it is struck
 * (playGolf.js#resolveStroke). This only replays it: a full shot as a
 * straight run from `from` to `to` with a hump of height for the eye, a
 * putt along the path the roll actually took, in the time it actually
 * took. Pure, so the screen can ask "where is it now?" every frame.
 */
const SWING_MS_BASE = 350;
const SWING_MS_PER_YARD = 4.5;
const SWING_MS_MIN = 450;
const SWING_MS_MAX = 1500;
/** Peak height of the drawn arc, in canvas pixels. */
const LIFT_PX_PER_YARD = 0.1;
const LIFT_PX_MIN = 2;
const LIFT_PX_MAX = 24;
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
  return {
    x: outcome.from.x + (outcome.to.x - outcome.from.x) * t,
    y: outcome.from.y + (outcome.to.y - outcome.from.y) * t,
    lift,
    done,
  };
}
