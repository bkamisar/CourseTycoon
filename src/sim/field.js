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
import { scheduleRounds } from './schedule.js';

/** Players in the field. Enough that an average means something and few
 * enough that a week is not a thousand simulated rounds. */
export const FIELD_SIZE = 60;

/** A championship tees off in threeballs, not one at a time. Playing the
 * field solo (as this once did) hands `playHole` a one-person group, which
 * plays an unrealistically quick hole and, worse, has nobody ahead of it to
 * queue behind — so pace of play could never actually fail. */
const GROUP_SIZE = 3;
const FIELD_GROUPS = FIELD_SIZE / GROUP_SIZE;

/** Default gap between tee times, in minutes. A standing setting the
 * player sets on resort ops and can widen for a championship week — see
 * `src/sim/schedule.js` for what it costs to get this wrong. */
const DEFAULT_TEE_INTERVAL = 11;

/** A championship field is not the resort's usual Tuesday crowd. */
const FIELD_HANDICAP_LOW = 0;
const FIELD_HANDICAP_HIGH = 6;

/**
 * Plays one round of a championship and reports how the course played.
 *
 * `setup` and `turfQuality` are the two things the player controls; the
 * rng carries everything else, so the same seed replays identically.
 */
export function playField(rng, holes, {
  setup = 0, turfQuality = 100, teeInterval = DEFAULT_TEE_INTERVAL,
} = {}) {
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
  // Minutes a group spends on each hole, summed across every group so the
  // average below is the clean per-hole time `scheduleRounds` expects —
  // the same shape `day.js` builds for the resort's own tee sheet.
  const holeMinutesTotal = holes.map(() => 0);

  for (let g = 0; g < FIELD_GROUPS; g++) {
    const groupStrokes = new Array(GROUP_SIZE).fill(0);
    const guests = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      const id = g * GROUP_SIZE + i;
      const handicap = FIELD_HANDICAP_LOW
        + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1);
      guests.push({
        id, name: 'competitor', handicap, wallet: 0,
        segment: 'serious', patience: 100, energy: 100,
      });
    }
    const group = { id: g, guests };

    holes.forEach((hole, i) => {
      const played = playHole(rng, hole, group, {
        carts: false, handicapAdjust, puttAdjust, spread: 1,
      });
      holeMinutesTotal[i] += played.minutes;
      holeStrokes[i] += played.totalStrokes;
      played.scores.forEach((score, idx) => { groupStrokes[idx] += score.strokes; });
    });

    groupStrokes.forEach((strokes) => toPar.push(strokes - par));
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

  // The field's own congestion: 20 threeballs sent off `teeInterval` apart
  // down holes that take as long as they just took. This is what makes
  // pace failable — a hole slower than the gap between tee times backs
  // the whole field up behind it, exactly as `day.js` models the resort's
  // ordinary tee sheet.
  const averageHoleMinutes = holeMinutesTotal.map((total) => total / FIELD_GROUPS);
  const schedule = scheduleRounds({
    groupCount: FIELD_GROUPS,
    teeInterval,
    holeMinutes: averageHoleMinutes,
  });
  const slowestRoundMinutes = schedule.rounds.reduce(
    (max, round) => Math.max(max, round.roundMinutes), 0
  );

  return {
    players: FIELD_SIZE,
    par,
    averageToPar: Number(average.toFixed(2)),
    best: toPar[0],
    worst: toPar[toPar.length - 1],
    underPar: toPar.filter((v) => v < 0).length,
    hardestHole: hardest + 1,
    hardestHoleOverPar: Number(hardestOver.toFixed(2)),
    averageRoundMinutes: Number(schedule.averageRoundMinutes.toFixed(1)),
    slowestRoundMinutes: Number(slowestRoundMinutes.toFixed(1)),
    bottleneckHole: schedule.bottleneckHoleIndex === null
      ? null
      : schedule.bottleneckHoleIndex + 1,
  };
}
