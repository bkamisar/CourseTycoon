/**
 * How a competent host plays the championship week. Shared by the
 * operator (tools/operator.js) and the calibration (tools/calibrateWeek.js)
 * so the two cannot measure different players.
 */
import { courseDifficultyOf } from '../src/sim/hole.js';
import { RUNGS } from '../src/sim/tournaments.js';
import { winningTotal } from '../src/sim/championshipWeek.js';

/** The narrowest fairway the hole editor allows (MIN_CORRIDOR_WIDTH in
 * src/ui/editor.js), and the step it narrows by. */
export const NARROWEST = 22;
const STEP = 2;

/**
 * Narrows fairways, widest first, until the course reaches `minimum`.
 *
 * The cheapest redesign there is: corridor width costs nothing to change
 * in the editor. What it costs is the locals, who want a course at 30.
 * Mutates `holes` the way the editor does. Returns the difficulty reached,
 * which may fall short if every fairway is already at its narrowest.
 */
export function narrowToDifficulty(holes, minimum) {
  const open = holes.filter((h) => h.open);
  while (courseDifficultyOf(open) < minimum) {
    const widest = open
      .filter((h) => h.corridorWidth - STEP >= NARROWEST)
      .sort((a, b) => b.corridorWidth - a.corridorWidth)[0];
    if (!widest) break;
    widest.corridorWidth -= STEP;
  }
  return courseDifficultyOf(open);
}

/** Spread at or above which a day counts as windy or wet for the pins.
 * Blowing hard is 1.45, heavy rain 1.28, storm 1.6 (weather.js). */
const ROUGH_SPREAD = 1.28;

/**
 * Tomorrow's pins, for a host who reads the leader each evening.
 *
 * Projects the leader's total onto the week's length and compares it with
 * the middle of the target. Running low means the field is taking the
 * course apart, so toughen up; running high, ease off. A rough day eases
 * off whatever the leader says, because wind does the pins' job for them
 * and brutal pins in a gale wreck the pace.
 */
export function reactivePins({ week, spread = 1 }) {
  const target = RUNGS[week.rung].target;
  const centre = (target.low + target.high) / 2;
  const rough = spread >= ROUGH_SPREAD;
  if (week.roundsPlayed === 0) return rough ? 'easy' : 'fair';
  const due = (centre * week.roundsPlayed) / week.rounds;
  const gap = winningTotal(week) - due;
  if (gap <= -3) return rough ? 'tough' : 'brutal';
  if (gap <= -1) return rough ? 'fair' : 'tough';
  if (gap >= 2 || rough) return 'easy';
  return 'fair';
}
