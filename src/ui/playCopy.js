/**
 * Every line of text the play screen shows.
 *
 * Kept apart from the screen (playHole.js) for the usual reason: words
 * are worth testing and a DOM is not needed to test them. Nothing here
 * decides anything — it reports what playGolf.js already decided, in the
 * units a golfer uses: yards from the fairway, feet on the green.
 */
import { greenCentre } from '../sim/hole.js';
import { LIE } from '../sim/terrain.js';
import { scoreName, MAX_STROKES } from '../sim/playGolf.js';

const LIE_WORD = {
  [LIE.TEE]: 'Tee', [LIE.FAIRWAY]: 'Fairway', [LIE.ROUGH]: 'Rough', [LIE.SAND]: 'Bunker',
  [LIE.TREES]: 'Trees', [LIE.GREEN]: 'Green', [LIE.WATER]: 'Water',
};

const RESTING = {
  [LIE.TEE]: 'On the tee.', [LIE.FAIRWAY]: 'Fairway.', [LIE.ROUGH]: 'In the rough.',
  [LIE.SAND]: 'In the bunker.', [LIE.TREES]: 'In the trees.',
};

function yardsToCup(hole, point) {
  const cup = greenCentre(hole);
  return Math.hypot(cup.x - point.x, cup.y - point.y);
}

function feet(yards) {
  const n = Math.max(1, Math.round(yards * 3));
  return n === 1 ? '1 foot' : `${n} feet`;
}

function remaining(hole, play) {
  const yards = yardsToCup(hole, play.ball);
  return play.lie === LIE.GREEN ? `${Math.max(1, Math.round(yards * 3))} ft` : `${Math.round(yards)}y`;
}

/** The two header rows. `round` is `roundLine(...)`, possibly ''. */
export function headerLines({ hole, par, lengthYards, play, best, weatherShort, round }) {
  const right = [best === null ? '' : `Best ${best}`, round].filter(Boolean).join(' · ');
  return {
    title: `Hole ${hole.id} · Par ${par} · ${Math.round(lengthYards)}y`,
    right,
    status: `Stroke ${play.strokes + 1} · ${remaining(hole, play)} · ${LIE_WORD[play.lie] ?? ''}`,
    weather: weatherShort,
  };
}

/** What the caddie says while the player aims. */
export function caddieLine(plan) {
  if (plan.kind === 'putt') return `${plan.club.name} · ${Math.max(1, Math.round(plan.yards * 3))} ft`;
  return `${plan.club.name} · ${Math.round(plan.yards)}y`;
}

/**
 * What happened to the stroke just played. `after` is the play state once
 * the stroke has been applied (so a penalised ball is already back where
 * it was hit from); `swing` is the finished swing from the meter.
 */
export function strokeLine(hole, outcome, after, swing) {
  if (outcome.penalty === 'water') return 'In the water. One-stroke penalty — play it again.';
  if (outcome.penalty === 'lost') return 'Lost in the woods. One-stroke penalty — play it again.';

  const left = yardsToCup(hole, after.ball);
  if (after.lie === LIE.GREEN) {
    return outcome.kind === 'putt' ? `${feet(left)} left.` : `${praise(swing, outcome)}On the green, ${feet(left)}.`;
  }
  return `${praise(swing, outcome)}${RESTING[after.lie] ?? ''} ${Math.round(left)}y to the pin.`;
}

function praise(swing, outcome) {
  return swing?.perfect && outcome.kind === 'swing' ? 'Perfect strike. ' : '';
}

/** The line shown when the hole is over. */
export function finishLine(play, par, isNewBest) {
  if (play.pickedUp) return `Picked up after ${MAX_STROKES}. It happens.`;
  const gimme = play.conceded ? 'Gimme. ' : '';
  return `${gimme}${scoreName(play.strokes, par)} — ${play.strokes} on a par ${par}.${isNewBest ? ' New best.' : ''}`;
}

/** "Round: +1 thru 3" for the holes played this visit; '' before the first. */
export function roundLine(holes) {
  if (!holes.length) return '';
  const diff = holes.reduce((sum, h) => sum + h.strokes - h.par, 0);
  const text = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  return `Round: ${text} thru ${holes.length}`;
}

/** The prompt under the meter while a swing is under way. */
export function meterHint(swingPhase) {
  if (swingPhase === 'rising') return 'Tap at the mark';
  if (swingPhase === 'falling') return 'Tap on the line';
  return '';
}
