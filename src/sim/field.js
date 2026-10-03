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
import { pinHandicap } from './championshipWeek.js';

/** Players in the field. Enough that an average means something and few
 * enough that a week is not a thousand simulated rounds. */
export const FIELD_SIZE = 60;

/** A championship tees off in threeballs, not one at a time. Playing the
 * field solo (as this once did) hands `playHole` a one-person group, which
 * plays an unrealistically quick hole and, worse, has nobody ahead of it to
 * queue behind — so pace of play could never actually fail. */
const GROUP_SIZE = 3;
export const FIELD_GROUPS = FIELD_SIZE / GROUP_SIZE;

/** Default gap between tee times, in minutes. A standing setting the
 * player sets on resort ops and can widen for a championship week — see
 * `src/sim/schedule.js` for what it costs to get this wrong. */
const DEFAULT_TEE_INTERVAL = 11;

/**
 * How much of the day's weather reaches a championship field's scores:
 * half. Its pace gets all of it (below).
 *
 * The resort's own golfers play the full sky (day.js); this is only the
 * field. A tour pro flights the ball under the wind and has a caddie on
 * the yardage, so a gale that turns a Tuesday fourball into a lottery costs
 * the field less. That is the fiction. The reason is the judge.
 *
 * At full strength the weather doubled the spread of the winning total:
 * a County week with fair pins at the band's midpoint landed anywhere from
 * -6 to +6 across seeds, against -4 to +2 in calm, and the three ways of
 * playing a week the target has to tell apart -- a course set properly, an
 * unconditioned one with brutal pins, an overcooked one with easy pins --
 * smeared into each other. Chosen on 120 tuning seeds (2026-10-03), at the
 * best centre each rung could find there (criteria: free ride <= 15%,
 * overcooked <= 25%, reacting >= 80%; the host then eased its pins at two
 * strokes over, not one -- see reactivePins in tools/championshipPolicy.js),
 * and checked on 120 held-out seeds at the same centres:
 *
 *   weather at   County                       Regional
 *   full (1)     tuning: free ride 20% (0)    tuning: reacting 75% (+7), or
 *                                                     overcooked 49% (+8)
 *                held out: free ride 26%      held out: reacting 77%,
 *                                             fair 58%, overcooked 33% (+7)
 *   half (0.5)   tuning: all met (0)          tuning: all met (+5)
 *                held out: overcooked 30%     held out: reacting 77%
 *   a third      tuning: free ride 20% (-1)   tuning: reacting 73% (+4)
 *                or overcooked 29% (0)        or overcooked 34% (+5)
 *                held out: all met (0)        held out: reacting 74%,
 *                                             overcooked 31% (+5)
 *
 * Held out, half against full is clear -- the County free ride falls from
 * 26% to 8% and the Regional's overcooked week from 33-43% to 24% -- but
 * half against a third is a wash, each better at one rung. Half was kept.
 * Raising the County band to 55-70 instead was also tried and did not
 * help: the free-ride and overcooked weeks do not depend on the band, so
 * it only slid the well-run week toward the overcooked one.
 *
 * Turf is held at 90 in all of this. It moves the field about 0.2 strokes
 * across its whole range, so it is not worth a dimension.
 *
 * Applied here to whatever `spread` is passed, so every caller hands in
 * the raw sky and none can forget to damp it.
 *
 * `pace` is NOT damped. The judge needed the scoring spread tightened;
 * nothing asked for faster rounds, and damping pace as well (as this first
 * did) quietly made the pace condition far easier. At the Regional (setup
 * 70, 14-minute interval, 10 seeds) against a 288-minute target, a blowy
 * round averaged 302 minutes with pace damped and 321 with it whole, a
 * rainy one 313 against 347. Rain slows a championship as much as a
 * Tuesday, and the pace condition is there to feel it.
 */
export const FIELD_WEATHER_EFFECT = 0.5;

/** The day's spread as the field's scores feel it. */
function damped(multiplier) {
  return 1 + (multiplier - 1) * FIELD_WEATHER_EFFECT;
}

/** A championship field is not the resort's usual Tuesday crowd. */
const FIELD_HANDICAP_LOW = 0;
const FIELD_HANDICAP_HIGH = 6;

/**
 * Sixty championship handicaps, drawn once for a week.
 *
 * Drawn per round, the totals at the end of a four-round week would belong
 * to nobody -- player seven on Thursday and player seven on Sunday would be
 * different golfers. Still nameless: an index and a handicap.
 */
export function drawFieldHandicaps(rng) {
  return Array.from({ length: FIELD_SIZE }, () =>
    FIELD_HANDICAP_LOW + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1));
}

/**
 * Plays one round of a championship and reports how the course played.
 *
 * `setup`, `turfQuality` and `pins` are what the player controls. `spread`
 * and `pace` are the day's weather, the raw sky (spread is damped here,
 * pace is not: see FIELD_WEATHER_EFFECT), and `handicaps` is the week's fixed
 * field (sixty of them, from `drawFieldHandicaps`; omitted, a field is drawn
 * from the rng). The rng carries everything else, so the same seed replays
 * identically.
 */
export function playField(rng, holes, {
  setup = 0, turfQuality = 100, teeInterval = DEFAULT_TEE_INTERVAL,
  pins = 'fair', spread: skySpread = 1, pace = 1, handicaps = null,
} = {}) {
  // The wind as the field's scores feel it; pace stays whole. See
  // FIELD_WEATHER_EFFECT.
  const spread = damped(skySpread);
  if (handicaps && handicaps.length !== FIELD_SIZE) {
    throw new Error(`a field is ${FIELD_SIZE} handicaps, got ${handicaps.length}`);
  }
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
  //
  // Pins sit on the same scale, added on top: see PINS in
  // championshipWeek.js for why they are a third of what was first tried.
  const handicapAdjust = setupDifficultyBonus(setup) / 3 + pinHandicap(pins);
  // Worn greens putt less true. Honestly small: measured across the whole
  // turf range this moves the field 0.2 strokes, so it is texture rather
  // than a lever. Turf is judged as its own contract condition instead.
  const puttAdjust = (100 - turfQuality) / 100;

  // Indexed by player, in field order, so a week can add round to round.
  const playerToPar = new Array(FIELD_SIZE).fill(0);
  const holeStrokes = holes.map(() => 0);
  const holePar = holes.map((h) => holeStats(h).par);
  // Minutes a group spends on each hole, summed across every group so the
  // average below is the clean per-hole time `scheduleRounds` expects —
  // the same shape `day.js` builds for the resort's own tee sheet.
  const holeMinutesTotal = holes.map(() => 0);
  // Every shot, kept for the playback. This used to be thrown away, which
  // is why a championship played to an empty course on screen.
  const rawEvents = [];

  for (let g = 0; g < FIELD_GROUPS; g++) {
    const groupStrokes = new Array(GROUP_SIZE).fill(0);
    const guests = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      const id = g * GROUP_SIZE + i;
      // A field passed in is the week's; with none, draw one as before so
      // a single round still works on its own.
      const handicap = handicaps
        ? handicaps[id]
        : FIELD_HANDICAP_LOW + rng.int(FIELD_HANDICAP_HIGH - FIELD_HANDICAP_LOW + 1);
      guests.push({
        id, name: 'competitor', handicap, wallet: 0,
        segment: 'serious', patience: 100, energy: 100,
      });
    }
    const group = { id: g, guests };

    holes.forEach((hole, i) => {
      // `spread` is the day's weather, at half the strength the resort's
      // own golfers feel it (FIELD_WEATHER_EFFECT). It was always computed
      // on a championship day and the field once ignored it.
      const played = playHole(rng, hole, group, {
        carts: false, handicapAdjust, puttAdjust, spread,
      });
      holeMinutesTotal[i] += played.minutes;
      holeStrokes[i] += played.totalStrokes;
      played.scores.forEach((score, idx) => { groupStrokes[idx] += score.strokes; });
      rawEvents.push({ groupIndex: g, holeIndex: i, events: played.events });
    });

    groupStrokes.forEach((strokes, idx) => {
      playerToPar[g * GROUP_SIZE + idx] = strokes - par;
    });
  }

  const toPar = [...playerToPar].sort((a, b) => a - b);
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
  //
  // `pace` is the weather's: rain and wind slow a round, and nothing on a
  // championship day used to read it.
  const averageHoleMinutes = holeMinutesTotal.map((total) => (total / FIELD_GROUPS) * pace);
  // scheduleRounds' default day (07:00-18:00) matches day.js's DAY_START and
  // DAY_END; the field relies on that so the playback clock shows it.
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
    playerToPar,
    // For the renderer, and only the renderer. `day.js` strips this before
    // anything is saved: twenty threeballs' shots are thousands of events,
    // and the report history keeps fourteen days.
    playback: { schedule, rawEvents, holeMinutes: averageHoleMinutes },
  };
}
