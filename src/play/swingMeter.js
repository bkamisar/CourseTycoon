/**
 * The three-tap swing meter, as a pure state machine over a clock the
 * caller supplies. Nothing here reads the time: every function takes
 * `nowMs`, so a test can play a swing by naming three instants and the
 * calibration bot (tools/playGolfBot.js) can play ten thousand of them
 * without waiting for any.
 *
 *   ready ──tap──▶ rising ──tap──▶ falling ──tap──▶ done
 *
 * RISING: the cursor climbs the bar from 0 at METER.SPEED. The second tap
 * fixes `power` where the cursor stands. Left alone it tops out at
 * METER.MAX (an overswing) and turns round by itself.
 *
 * FALLING: the cursor runs back down from `power` toward the strike line
 * at 0. The third tap fixes `accuracy` from how far the cursor is from the
 * line: above it is early (+, the ball goes right), below it is late (−,
 * left). Left alone it runs out at METER.LATE_LIMIT, a full miss.
 *
 * WHY THESE NUMBERS. A person tapping to a moving cursor is good to about
 * 35 ms. At SPEED 0.001/ms that is 3.5% of the bar: nine yards on a drive,
 * and — through ACC_WINDOW — a little under half of the worst possible
 * miss. tools/playGolfBot.js plays the six templates at that skill and
 * lands on par, which is the whole calibration target; see its table
 * before changing anything here.
 */
export const METER = Object.freeze({
  /** Bar units per millisecond, both directions. 0 → 1 takes one second. */
  SPEED: 0.001,
  /** Top of the bar. Everything above 1 is overswing. */
  MAX: 1.1,
  /** Softest swing the meter will accept — a tap-tap must still move the ball. */
  MIN_POWER: 0.05,
  /** How far below the strike line the cursor runs before the swing is a miss. */
  LATE_LIMIT: -0.1,
  /** Cursor distance from the strike line that counts as the worst miss (±1). */
  ACC_WINDOW: 0.08,
  /** Inside this distance of the line the strike is called perfect (accuracy 0). */
  PERFECT: 0.012,
});

export function newSwing() {
  return { phase: 'ready' };
}

/** Where the cursor is on the bar at `nowMs`. */
export function cursorAt(swing, nowMs) {
  switch (swing.phase) {
    case 'rising':
      return Math.min(METER.MAX, Math.max(0, (nowMs - swing.startedAt) * METER.SPEED));
    case 'falling':
      return Math.max(METER.LATE_LIMIT, swing.power - (nowMs - swing.turnedAt) * METER.SPEED);
    case 'done':
      return swing.cursor;
    default:
      return 0;
  }
}

/**
 * Advances a swing past anything that happens with nobody tapping: the
 * top of the bar, and the bottom of the miss zone. Call it every frame
 * before drawing, and before `tapSwing`.
 */
export function tickSwing(swing, nowMs) {
  if (swing.phase === 'rising') {
    const toppedAt = swing.startedAt + METER.MAX / METER.SPEED;
    if (nowMs >= toppedAt) {
      // Turned round at the instant it topped out, not at the frame that
      // noticed — otherwise a slow frame would hand the player free time.
      return tickSwing({ phase: 'falling', startedAt: swing.startedAt, power: METER.MAX, turnedAt: toppedAt }, nowMs);
    }
    return swing;
  }
  if (swing.phase === 'falling') {
    if (cursorAt(swing, nowMs) <= METER.LATE_LIMIT) {
      return { phase: 'done', power: swing.power, accuracy: -1, cursor: METER.LATE_LIMIT, perfect: false };
    }
  }
  return swing;
}

/** One tap. Returns the next swing; a tap on a finished swing changes nothing. */
export function tapSwing(swing, nowMs) {
  const current = tickSwing(swing, nowMs);
  switch (current.phase) {
    case 'ready':
      return { phase: 'rising', startedAt: nowMs };
    case 'rising':
      return {
        phase: 'falling',
        startedAt: current.startedAt,
        power: Math.max(METER.MIN_POWER, cursorAt(current, nowMs)),
        turnedAt: nowMs,
      };
    case 'falling': {
      const cursor = cursorAt(current, nowMs);
      const perfect = Math.abs(cursor) <= METER.PERFECT;
      const accuracy = perfect ? 0 : Math.max(-1, Math.min(1, cursor / METER.ACC_WINDOW));
      return { phase: 'done', power: current.power, accuracy, cursor, perfect };
    }
    default:
      return current;
  }
}

/**
 * The instants at which a perfect player would make the second and third
 * taps for a shot needing `needed` power, measured from the first tap.
 * The renderer does not need this; the bot and the tests do.
 */
export function idealTaps(needed) {
  const powerAt = needed / METER.SPEED;
  return { powerAt, strikeAt: powerAt + needed / METER.SPEED };
}
