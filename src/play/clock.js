/**
 * Playback clock: maps elapsed wall-clock time to simulated minutes.
 *
 * The one rule that matters here: speed changes must never retroactively
 * move the clock. A tempting-but-wrong implementation stores a start
 * timestamp and a speed, then computes `minute = dayStart + elapsedMs *
 * speed * rate` on every frame -- which silently reapplies the CURRENT
 * speed to time that was actually played back at a DIFFERENT speed the
 * moment the player taps 4x. This clock instead accumulates simulated
 * minutes directly: each `advance(dtMs)` call adds `dtMs` worth of
 * simulated time at whatever speed is active *right now*, onto whatever
 * minute the clock already holds. The speed is never multiplied against
 * anything but the delta it was actually active for.
 *
 * Pure: `advance(dtMs)` takes its delta from the caller (an animation loop
 * measuring real time with `performance.now()`), rather than reading a
 * clock itself. That keeps this module trivially testable and keeps
 * `Date.now()` out of anything resembling simulation code.
 */

/** The three speeds the plan calls for: 1x, 4x, 16x. */
export const PLAYBACK_SPEEDS = Object.freeze([1, 4, 16]);

/**
 * How many simulated minutes one second of real time represents at 1x.
 * Chosen so a typical day (660 simulated minutes, 7am-6pm) plays out in
 * roughly a minute of real time at 1x -- fast enough not to bore anyone
 * watching golf carts move, slow enough that bunching is actually visible
 * before 4x/16x is needed to skim ahead.
 */
const DEFAULT_MINUTES_PER_SECOND = 11;

export function createClock({
  dayStart = 420,
  dayEnd = 1080,
  speed = 1,
  minutesPerSecond = DEFAULT_MINUTES_PER_SECOND,
  speeds = PLAYBACK_SPEEDS,
} = {}) {
  let minute = dayStart;
  let currentSpeed = speed;
  let playing = false;

  function clampMinute(m) {
    return Math.min(dayEnd, Math.max(dayStart, m));
  }

  const clock = {
    get minute() {
      return minute;
    },
    get speed() {
      return currentSpeed;
    },
    get playing() {
      return playing;
    },
    get finished() {
      return minute >= dayEnd;
    },
    get speeds() {
      return speeds.slice();
    },

    play() {
      playing = true;
    },

    pause() {
      playing = false;
    },

    setSpeed(next) {
      // Deliberately just a label swap for future advances -- see the
      // module doc comment. The current minute is untouched.
      currentSpeed = next;
    },

    /**
     * Advances the clock by `dtMs` of REAL elapsed time, at the current
     * speed. A no-op while paused or once the day has finished.
     */
    advance(dtMs) {
      if (!playing || clock.finished) return minute;
      const simMinutes = (dtMs / 1000) * minutesPerSecond * currentSpeed;
      minute = clampMinute(minute + simMinutes);
      if (minute >= dayEnd) playing = false;
      return minute;
    },

    /** Jumps straight to the end -- the day is already computed, so this
     * is skipping a recording, not cancelling a simulation. */
    skip() {
      minute = dayEnd;
      playing = false;
      return minute;
    },

    reset() {
      minute = dayStart;
      playing = false;
      return minute;
    },
  };

  return clock;
}
