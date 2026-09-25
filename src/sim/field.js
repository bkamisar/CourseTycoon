/**
 * What a championship field shoots, and nothing about who they are.
 *
 * This is the read-out for the setup dial, and without it the central
 * decision of Act III is a guess. A course set soft for its rung gets
 * shot to pieces and reads as a resort course that should not have bid;
 * one set past its band produces scores nobody can separate and greens
 * that die by Saturday. Between them is a test.
 *
 * Deliberately impersonal. No names, no leaderboard, no careers — the
 * field is weather with a scorecard. Simulating players is a different
 * game, and this one is about running the venue.
 *
 * Pure. Reuses `playHole` rather than reimplementing golf.
 */
import { playHole } from './round.js';
import { holeStats } from './hole.js';
import { setupDifficultyBonus } from './tournaments.js';

/** Players in the field. Enough that an average means something and few
 * enough that a week is not a thousand simulated rounds. */
export const FIELD_SIZE = 60;

/** A championship field is not the resort's usual Tuesday crowd. */
const FIELD_HANDICAP_LOW = 0;
const FIELD_HANDICAP_HIGH = 6;

/**
 * Plays one round of a championship and reports how the course played.
 *
 * `setup` and `turfQuality` are the two things the player controls; the
 * rng carries everything else, so the same seed replays identically.
 */
export function playField(rng, holes, { setup = 0, turfQuality = 100 } = {}) {
  const par = holes.reduce((sum, h) => sum + holeStats(h).par, 0);
  // A conditioned course plays longer and less forgiving. `playHole`
  // adds this to the golfer's handicap, and a HIGHER handicap is a worse
  // golfer, so a hard setup is a POSITIVE adjustment. The sign matters
  // more than it looks: negated, setup 95 made the field shoot 0.2 UNDER
  // par against 2.4 over at setup 0, with 29 of 60 breaking par on the
  // hardest course in the game, because 0-6 handicaps clamp at 0.
  //
  // The divisor is measured, not guessed. Across seven seeds /3 gives a
  // monotone ladder the player can actually read:
  //
  //   setup    0    20    45    60    70    95
  //   avg    1.2-3.1  2.1-3.8  4.7-5.9  5.9-7.9  6.5-7.8  8.8-10.4
  //
  // which puts a county setup (45-60) at five or six over and a national
  // (80-92) at nine or ten. /5 flattened it to a 4-stroke total spread;
  // /1 had the field 22 over and nobody near par.
  const handicapAdjust = setupDifficultyBonus(setup) / 3;
  // Worn greens putt less true. Honestly small: measured across the whole
  // turf range this moves the field 0.2 strokes, so it is texture rather
  // than a lever. Turf is judged as its own contract condition instead.
  const puttAdjust = (100 - turfQuality) / 100;

  const toPar = [];
  const holeStrokes = holes.map(() => 0);
  const holePar = holes.map((h) => holeStats(h).par);

  for (let p = 0; p < FIELD_SIZE; p++) {
    const handicap = FIELD_HANDICAP_LOW
      + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1);
    const player = {
      id: p,
      guests: [{
        id: p, name: 'competitor', handicap, wallet: 0,
        segment: 'serious', patience: 100, energy: 100,
      }],
    };
    let strokes = 0;
    holes.forEach((hole, i) => {
      const played = playHole(rng, hole, player, {
        carts: false, handicapAdjust, puttAdjust, spread: 1,
      });
      strokes += played.totalStrokes;
      holeStrokes[i] += played.totalStrokes;
    });
    toPar.push(strokes - par);
  }

  toPar.sort((a, b) => a - b);
  const average = toPar.reduce((s, v) => s + v, 0) / toPar.length;

  // Which hole took the most off the field, relative to its par.
  let hardest = 0;
  let hardestOver = -Infinity;
  holeStrokes.forEach((total, i) => {
    const over = total / FIELD_SIZE - holePar[i];
    if (over > hardestOver) { hardestOver = over; hardest = i; }
  });

  return {
    players: FIELD_SIZE,
    par,
    averageToPar: Number(average.toFixed(2)),
    best: toPar[0],
    worst: toPar[toPar.length - 1],
    underPar: toPar.filter((v) => v < 0).length,
    hardestHole: hardest + 1,
    hardestHoleOverPar: Number(hardestOver.toFixed(2)),
  };
}
