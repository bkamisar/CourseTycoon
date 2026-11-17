/**
 * Playing a hole yourself.
 *
 * Everything else in src/sim decides what four hundred guests do. This
 * file decides what happens to ONE ball when the player picks a target
 * and times a swing — and nothing else: it holds no clock, reads no
 * input and draws nothing. The swing meter (src/play/swingMeter.js) turns
 * taps into `{ power, accuracy }`; this turns those two numbers into
 * where the ball finishes.
 *
 * NO DICE. A guest's shot is `rng.normal` around an intention, because a
 * guest has a handicap instead of hands. The player has hands, so a
 * played shot is a pure function of the target and the two timings: the
 * same taps always produce the same shot. The course still plays by the
 * same rules a guest meets — the lie shortens the club by `LIE_RANGE` and
 * widens a mistimed strike by `LIE_SPREAD`, the day's weather widens it
 * by the same `spread` — it is only the source of the error that differs.
 *
 * NO MONEY. Playing a hole changes one thing in the save: the best score
 * on it (`state.playRecords`). It costs nothing, earns nothing and moves
 * no day forward, so nothing here can unbalance the economy.
 */
import { LIE, lieAt } from './terrain.js';
import { greenCentre, pointAtDistance, holeStats } from './hole.js';
import { LIE_RANGE, LIE_SPREAD, progressAlong, distanceToPath } from './shot.js';
import { rollPutt, puttSpeedFor } from './putting.js';

/** The bag, shortest first. `full` is the carry in yards at power 1.0
 * from a clean lie. The caddie always hands over the shortest club that
 * reaches the target, so the mark on the power bar sits in the top part
 * of the bar for nearly every shot and the rhythm stays the same. */
export const CLUBS = Object.freeze([
  { id: 'chip', name: 'Chip', full: 40 },
  { id: 'pitch', name: 'Pitch', full: 70 },
  { id: 'wedge', name: 'Wedge', full: 105 },
  { id: 'iron9', name: '9 iron', full: 135 },
  { id: 'iron7', name: '7 iron', full: 165 },
  { id: 'iron5', name: '5 iron', full: 195 },
  { id: 'wood3', name: '3 wood', full: 225 },
  { id: 'driver', name: 'Driver', full: 250 },
]);

/** The putter's "clubs": full-bar roll in yards, picked the same way. */
export const PUTT_RANGES = Object.freeze([4, 8, 16, 32]);
const PUTTER = Object.freeze({ id: 'putter', name: 'Putter' });

/** Direction error, in radians, of a swing struck at accuracy ±1 from a
 * clean lie in fair weather. Twelve degrees is 52 yards wide on a full
 * drive: off the fairway, through the rough and into the trees. */
export const MAX_SWING_ANGLE = (12 * Math.PI) / 180;
/** The same for a putt. Six degrees misses the cup from anything much
 * over a yard, so a badly timed strike costs even a short one. */
export const MAX_PUTT_ANGLE = (6 * Math.PI) / 180;

/** Swinging past 100% buys up to 10% more carry and makes the strike this
 * much wilder per unit of overswing: ×1.5 at the top of the bar. */
export const OVERSWING_WILD = 5;

/** A flown ball finishing this close to the cup has gone in. From 150
 * yards that is the power tap landing within about two milliseconds on
 * top of a perfect strike: possible, and rare enough to be a story. */
export const HOLE_OUT_RADIUS = 0.35;

/** A ball that comes to rest on the green this close to the cup is
 * conceded: it counts one more stroke and the hole is over. Three feet,
 * the gimme of a friendly round — the putt every player holes and nobody
 * enjoys tapping in on a phone. */
export const GIMME_YARDS = 1;

/** A ball this many yards beyond the rough is lost: stroke and distance. */
export const LOST_BALL_MARGIN = 40;
const ROUGH_MARGIN = 22; // mirrors terrain.js#lieAt

/** Pick up after this many. Matches a guest's MAX_STROKES in round.js. */
export const MAX_STROKES = 12;

const MIN_SWING_YARDS = 3;
const MIN_PUTT_YARDS = 0.3;

export function startHole(hole) {
  return {
    holeId: hole.id,
    ball: { ...hole.teePos },
    lie: LIE.TEE,
    strokes: 0,
    holed: false,
    pickedUp: false,
  };
}

/** Whether the hole is over, one way or the other. */
export function isFinished(play) {
  return play.holed || play.pickedUp;
}

/** The furthest the ball can be sent from this lie at power 1.0. */
export function reachFrom(lie) {
  if (lie === LIE.GREEN) return PUTT_RANGES[PUTT_RANGES.length - 1];
  return CLUBS[CLUBS.length - 1].full * (LIE_RANGE[lie] ?? 1);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Pulls a target back inside what can be played from here: no further
 * than `reachFrom`, no nearer than the shortest shot there is. A target
 * exactly on the ball is pointed at the cup instead, so there is always
 * a direction.
 */
export function clampTarget(hole, play, point) {
  const onGreen = play.lie === LIE.GREEN;
  const min = onGreen ? MIN_PUTT_YARDS : MIN_SWING_YARDS;
  const max = reachFrom(play.lie);
  let dx = point.x - play.ball.x;
  let dy = point.y - play.ball.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    const cup = greenCentre(hole);
    dx = cup.x - play.ball.x;
    dy = cup.y - play.ball.y;
    d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
    return { x: play.ball.x + (dx / d) * min, y: play.ball.y + (dy / d) * min };
  }
  const clamped = Math.max(min, Math.min(max, d));
  return { x: play.ball.x + (dx / d) * clamped, y: play.ball.y + (dy / d) * clamped };
}

/**
 * Where the caddie points before the player touches anything: the cup if
 * it is in reach, otherwise as far down the corridor as the longest club
 * goes — round the dogleg, the way `resolveShot` aims a guest.
 */
export function defaultTarget(hole, play) {
  const cup = greenCentre(hole);
  if (play.lie === LIE.GREEN) return clampTarget(hole, play, cup);
  const reach = reachFrom(play.lie);
  if (distance(play.ball, cup) <= reach) return clampTarget(hole, play, cup);
  const along = progressAlong(hole, play.ball) + reach;
  return clampTarget(hole, play, pointAtDistance(hole.corridor, along));
}

/**
 * What it takes to play to `target` from here: which club, how far, and
 * where the mark sits on the power bar (`needed`, 0–1).
 */
export function planShot(hole, play, target) {
  const aim = clampTarget(hole, play, target);
  const yards = distance(play.ball, aim);

  if (play.lie === LIE.GREEN) {
    const full = PUTT_RANGES.find((r) => r >= yards) ?? PUTT_RANGES[PUTT_RANGES.length - 1];
    return { kind: 'putt', club: PUTTER, target: aim, yards, full, needed: yards / full };
  }

  const lieRange = LIE_RANGE[play.lie] ?? 1;
  const club = CLUBS.find((c) => c.full * lieRange >= yards) ?? CLUBS[CLUBS.length - 1];
  const full = club.full * lieRange;
  return { kind: 'swing', club, target: aim, yards, full, needed: Math.min(1, yards / full) };
}

/** Rotates a direction clockwise as the player sees it (tee at the
 * bottom, +x to the right): a positive angle sends the ball right. */
function rotate(dx, dy, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

function isLost(hole, point, lie) {
  if (lie !== LIE.TREES) return false;
  // A tree clump inside the hole is trees, not lost.
  for (const f of hole.features) {
    if (f.type === 'trees' && Math.hypot(point.x - f.x, point.y - f.y) <= f.size) return false;
  }
  return distanceToPath(hole.corridor, point) > hole.corridorWidth / 2 + ROUGH_MARGIN + LOST_BALL_MARGIN;
}

/**
 * Resolves one stroke.
 *
 * `swing` is what the meter produced: `power` (0–1.1 of the bar) and
 * `accuracy` (−1 late/left … +1 early/right). `weatherSpread` is the
 * day's `effectsOf(...).spread`; it widens swings and leaves putts alone,
 * because wind does not blow a ball off a green in this game.
 *
 * Returns the outcome without touching `play`:
 *   { kind, club, from, to, lie, yards, angle, holed, gimme, penalty, path?, seconds? }
 * `penalty` is null, 'water' or 'lost'. `gimme` is true when the ball
 * stopped on the green within GIMME_YARDS of the cup without dropping. `to` is where the ball went (so
 * the renderer can show the splash); `applyStroke` is what sends a
 * penalised ball back.
 */
export function resolveStroke(hole, play, target, swing, weatherSpread = 1) {
  const plan = planShot(hole, play, target);
  const from = { ...play.ball };
  const dx = plan.target.x - from.x;
  const dy = plan.target.y - from.y;
  const cup = greenCentre(hole);

  if (plan.kind === 'putt') {
    const angle = swing.accuracy * MAX_PUTT_ANGLE;
    const roll = rollPutt(hole, from, rotate(dx, dy, angle), puttSpeedFor(plan.full * swing.power));
    const lie = roll.holed ? LIE.GREEN : lieAt(hole, roll.end);
    return {
      kind: 'putt', club: plan.club, from, to: roll.end, lie,
      yards: distance(from, roll.end), angle, holed: roll.holed,
      gimme: isGimme(lie, roll.holed, roll.end, cup),
      penalty: lie === LIE.WATER ? 'water' : null,
      path: roll.path, seconds: roll.seconds,
    };
  }

  const over = Math.max(0, swing.power - 1);
  const spread = (LIE_SPREAD[play.lie] ?? 1) * weatherSpread * (1 + over * OVERSWING_WILD);
  const angle = swing.accuracy * MAX_SWING_ANGLE * spread;
  const carry = Math.max(1, plan.full * swing.power);
  const length = Math.hypot(dx, dy) || 1;
  const heading = rotate(dx / length, dy / length, angle);
  const to = { x: from.x + heading.x * carry, y: from.y + heading.y * carry };
  const lie = lieAt(hole, to);
  const holed = lie === LIE.GREEN && distance(to, cup) <= HOLE_OUT_RADIUS;

  let penalty = null;
  if (lie === LIE.WATER) penalty = 'water';
  else if (isLost(hole, to, lie)) penalty = 'lost';

  const gimme = penalty === null && isGimme(lie, holed, to, cup);
  return { kind: 'swing', club: plan.club, from, to, lie, yards: carry, angle, holed, gimme, penalty };
}

function isGimme(lie, holed, at, cup) {
  return !holed && lie === LIE.GREEN && distance(at, cup) <= GIMME_YARDS;
}

/**
 * The hole after a stroke. A penalised ball costs a second stroke and is
 * replayed from where it was struck, in the lie it was struck from. A
 * gimme costs the one stroke it would have taken to tap in, and ends the
 * hole with the ball where it stopped (`conceded` says so).
 */
export function applyStroke(play, outcome) {
  const penalised = outcome.penalty !== null;
  const strokes = play.strokes + 1 + (penalised && !outcome.holed ? 1 : 0);
  const next = {
    ...play,
    strokes,
    ball: outcome.holed || !penalised ? { ...outcome.to } : { ...outcome.from },
    lie: outcome.holed || !penalised ? outcome.lie : play.lie,
    holed: outcome.holed,
  };
  if (outcome.gimme && !next.holed) {
    next.strokes = Math.min(MAX_STROKES, next.strokes + 1);
    next.holed = true;
    next.conceded = true;
  }
  if (!next.holed && next.strokes >= MAX_STROKES) {
    next.strokes = MAX_STROKES;
    next.pickedUp = true;
  }
  return next;
}

const SCORE_NAMES = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };

/** "Birdie", "Par", "+4" — and "Hole in one" where it is one. */
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one';
  const diff = strokes - par;
  return SCORE_NAMES[diff] ?? (diff > 0 ? `+${diff}` : `${diff}`);
}

/**
 * A short string that changes whenever the hole's design does. A best
 * score is only a best score on the hole it was made on: move a bunker
 * and the record no longer describes this hole, so it is not shown.
 */
export function holeFingerprint(hole) {
  const round = (n) => Math.round(n * 10) / 10;
  const parts = [
    hole.corridorWidth, hole.greenPreset,
    round(hole.teePos.x), round(hole.teePos.y),
    ...hole.corridor.flatMap((p) => [round(p.x), round(p.y)]),
    ...hole.features.flatMap((f) => [f.type, round(f.x), round(f.y), round(f.size)]),
  ];
  // djb2 over the joined text: short, stable, and good enough to tell two
  // designs apart — this is not a security boundary.
  let hash = 5381;
  for (const ch of parts.join('|')) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

/** The player's best on this hole AS IT IS DESIGNED NOW, or null. */
export function bestOn(state, hole) {
  const record = state.playRecords?.[hole.id];
  if (!record || record.design !== holeFingerprint(hole)) return null;
  return record.strokes;
}

/**
 * Records a finished hole. Returns the state to commit — a new object if
 * a record was set, the same object if not. A picked-up hole sets no
 * record: twelve is where the counting stopped, not what was scored.
 */
export function recordPlay(state, hole, play) {
  if (!play.holed) return state;
  const best = bestOn(state, hole);
  if (best !== null && best <= play.strokes) return state;
  return {
    ...state,
    playRecords: {
      ...(state.playRecords ?? {}),
      [hole.id]: { strokes: play.strokes, design: holeFingerprint(hole) },
    },
  };
}

/** Par for a played hole — the same par the editor and the report show. */
export function parOf(hole) {
  return holeStats(hole).par;
}
