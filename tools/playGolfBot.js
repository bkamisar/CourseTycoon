/**
 * Plays the playable-golf mode with a robot, to answer the one question
 * the constants in src/sim/playGolf.js, src/sim/putting.js and
 * src/play/swingMeter.js exist to answer: does a person with ordinary
 * timing score about par on this game's holes?
 *
 * The robot uses the real swing meter — it "taps" at the ideal instants
 * plus a normally distributed error of `--sd` milliseconds — and the real
 * stroke resolver. It aims where the caddie points. On the green it can
 * either aim straight at the cup (`read: false`, a player who ignores the
 * slope) or solve the break first (`read: true`, a player who reads it
 * perfectly). A person lands between the two.
 *
 *   node tools/playGolfBot.js            # the table below
 *   node tools/playGolfBot.js --rounds 2000 --sd 35
 *
 * MEASURED 2026-11-16, 400 plays per hole, strokes against par per hole
 * across the six templates:
 *
 *   tap error   reads the green   aims at the cup   putts   fairways   greens
 *      0 ms         -2.17             -2.17          0.00     100%      100%
 *     20 ms         -0.80             -0.64          1.19      85%       89%
 *     35 ms         -0.11             -0.06          1.50      61%       64%
 *     60 ms         +0.82             +0.84          1.97      37%       31%
 *
 * 35 ms is a person paying attention, and plays to par: that is the
 * target. 0 ms holes every full shot and is not a person; it is in the
 * table to show that the game has no dice, only timing.
 *
 * The first constants tried (strike window 0.10, 10 degrees, putts at 3
 * degrees into a 0.2-yard cup) put 35 ms at -0.74 a hole with 1.12 putts:
 * everything inside eight yards was a gimme.
 */
import { TEMPLATES, TEMPLATE_NAMES } from '../src/sim/templates.js';
import { makeHole, greenCentre } from '../src/sim/hole.js';
import { LIE } from '../src/sim/terrain.js';
import { makeRng } from '../src/sim/rng.js';
import {
  startHole, isFinished, defaultTarget, planShot, resolveStroke, applyStroke, parOf,
} from '../src/sim/playGolf.js';
import { newSwing, tapSwing, idealTaps } from '../src/play/swingMeter.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}

/** One swing through the real meter, with `sd` ms of error on each tap. */
export function botSwing(rng, needed, sd) {
  const ideal = idealTaps(needed);
  let swing = tapSwing(newSwing(), 0);
  const powerAt = Math.max(1, ideal.powerAt + rng.normal(0, sd));
  swing = tapSwing(swing, powerAt);
  if (swing.phase === 'done') return swing;
  const strikeAt = powerAt + swing.power / 0.001 + rng.normal(0, sd);
  swing = tapSwing(swing, Math.max(powerAt + 1, strikeAt));
  return swing;
}

/** Where a perfect reader aims a putt: correct the aim by the miss, a few times. */
function readPutt(hole, play) {
  const cup = greenCentre(hole);
  let aim = { ...cup };
  for (let i = 0; i < 6; i++) {
    const plan = planShot(hole, play, aim);
    const out = resolveStroke(hole, play, aim, { power: plan.needed, accuracy: 0 });
    if (out.holed) break;
    aim = { x: aim.x - (out.to.x - cup.x) * 0.8, y: aim.y - (out.to.y - cup.y) * 0.8 };
  }
  return aim;
}

export function botHole(rng, hole, { sd, read, spread = 1 }) {
  let play = startHole(hole);
  const tally = { putts: 0, fairway: null, gir: false, penalties: 0 };
  const par = parOf(hole);
  while (!isFinished(play)) {
    const onGreen = play.lie === LIE.GREEN;
    let target = onGreen && read ? readPutt(hole, play) : defaultTarget(hole, play);
    let plan = planShot(hole, play, target);
    // A putt aimed to die at the hole never gets there half the time:
    // every golfer is told to hit it a foot and a half past.
    let needed = plan.needed;
    if (onGreen) needed = Math.min(1, (plan.yards + 0.5) / plan.full);
    const swing = botSwing(rng, needed, sd);
    const out = resolveStroke(hole, play, target, swing, spread);
    if (onGreen) tally.putts += 1;
    if (play.strokes === 0 && par > 3) tally.fairway = out.lie === LIE.FAIRWAY;
    if (out.penalty) tally.penalties += 1;
    play = applyStroke(play, out);
    if (!onGreen && play.lie === LIE.GREEN && play.strokes <= par - 2) tally.gir = true;
  }
  return { strokes: play.strokes, par, holed: play.holed, ...tally };
}

function main() {
  const rounds = arg('rounds', 1000);
  const sds = process.argv.includes('--sd') ? [arg('sd', 35)] : [0, 20, 35, 60];
  for (const read of [true, false]) {
    console.log(`\n${read ? 'READS THE GREEN' : 'AIMS AT THE CUP'}  (${rounds} plays per hole)`);
    console.log('sd ms | ' + TEMPLATE_NAMES.map((n) => n.padEnd(13)).join(' | ') + ' | all: vs par, putts, fwy%, gir%, pen');
    for (const sd of sds) {
      const cells = [];
      let over = 0, putts = 0, fw = 0, fwN = 0, gir = 0, pen = 0, n = 0;
      TEMPLATE_NAMES.forEach((name, t) => {
        const hole = { ...makeHole(name, t + 1), open: true };
        let total = 0;
        for (let i = 0; i < rounds; i++) {
          const r = botHole(makeRng(1000 * (t + 1) + i), hole, { sd, read });
          total += r.strokes; over += r.strokes - r.par; putts += r.putts;
          if (r.fairway !== null) { fwN++; if (r.fairway) fw++; }
          if (r.gir) gir++;
          pen += r.penalties; n++;
        }
        cells.push(`${(total / rounds).toFixed(2)} (par ${parOf(hole)})`.padEnd(13));
      });
      console.log(`${String(sd).padStart(5)} | ${cells.join(' | ')} | ${(over / n >= 0 ? '+' : '') + (over / n).toFixed(2)}, ${(putts / n).toFixed(2)}, ${Math.round(100 * fw / fwN)}%, ${Math.round(100 * gir / n)}%, ${(pen / n).toFixed(2)}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('playGolfBot.js')) main();
