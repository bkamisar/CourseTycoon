/**
 * The championship week: what lasts from the first round to the last.
 *
 * A championship used to be a single day: the setup was checked against a
 * band, a cheque arrived, and the playback showed an empty course. The
 * author's verdict was "very anticlimactic". So it is now two, three or
 * four rounds by rung, each one an ordinary closed day in `runDay`, and
 * this file holds what has to carry from one to the next: the same sixty
 * players and their running totals, the pins the player has set for the
 * next round, and a log of how each round went.
 *
 * `day.js` plays a round and hands the result here. Nothing in this file
 * plays golf.
 *
 * Pure. Nothing here computes with a DOM or a clock.
 */
import { RUNGS } from './tournaments.js';
import { courseDifficultyOf } from './hole.js';
// A cycle with state.js, harmless: each side only uses the other's
// exports inside functions, at call time (see the note in state.js).
import { playableHoles } from './state.js';

/**
 * Where the holes are cut, the one call the player makes each morning.
 *
 * Handicap points added to the field, on the same scale as the setup dial
 * (`setupDifficultyBonus(setup) / 3`, worth 0-8.7), so pins and setup are
 * one lever at two timescales.
 *
 * Measured 2026-10-03, and the first values were wrong. At -1.5 / 0 / +1.5
 * / +3, brutal pins on a course nobody had conditioned put the County Open
 * winner at -3 against -2 for a course set properly -- the free ride the
 * band gate was built to close, back through a new door. At a third of
 * that (below), an unconditioned course with brutal pins every round hit
 * the County target in 13% of 24 seeds and the Regional and National in
 * none, while a player reacting to the leader each morning still moved the
 * winning total by a stroke or so a round.
 */
export const PINS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', handicap: -0.75,
    blurb: 'Centre of the greens. Birdies, and a crowd that enjoys itself.' }),
  fair: Object.freeze({ id: 'fair', label: 'Fair', handicap: 0,
    blurb: 'Where the governing body would put them if you did not ask.' }),
  tough: Object.freeze({ id: 'tough', label: 'Tough', handicap: 0.75,
    blurb: 'Tucked behind the bunkers. Pars are a good score.' }),
  brutal: Object.freeze({ id: 'brutal', label: 'Brutal', handicap: 1.5,
    blurb: 'On the slopes. Slow, and somebody will complain to a newspaper.' }),
});

export const PIN_IDS = Object.freeze(['easy', 'fair', 'tough', 'brutal']);

/** Handicap points for a pin setting. Unknown plays as fair. */
export function pinHandicap(id) {
  return PINS[id]?.handicap ?? 0;
}

/** A booked championship, before a ball is struck. */
export function newWeek(rungId, day) {
  return {
    rung: rungId,
    day,
    resolved: false,
    rounds: RUNGS[rungId]?.rounds ?? 1,
    roundsPlayed: 0,
    // Tomorrow's calls. A later lever -- green speed, tee placement -- is a
    // new key here rather than a new code path.
    //
    // `eventHandicap` and `eventPace` are not the player's calls but what
    // tonight's championship events did to the next round
    // (championshipEvents.js): handicap points summed on the pins' scale,
    // and a multiplier on the round's time. `applyEventChoice` adds to
    // them, `runDay` plays the round with them and sets them back to
    // nothing once it is recorded, so they last exactly one round.
    roundSettings: { pins: 'fair', eventHandicap: 0, eventPace: 1 },
    // Drawn on the first round, from that day's rng, then carried.
    field: null,
    roundLog: [],
    // Measured on the first morning: the course the field meets is the one
    // judged against the rung's minimum.
    difficulty: null,
    difficultyMet: null,
    // The officials' practice round, once it has been played eleven days
    // out: { day, setupAtRoundOne, difficulty, median, low, high, samples }
    // (practiceRound.js). Null until then, and for good on a booking made
    // too late to have one. Kept, not recomputed, so the sheet shows what
    // the card said.
    practice: null,
  };
}

/**
 * Fills in a booking from before the week existed.
 *
 * Saves carry `{ rung, day, resolved }` from before the week and are
 * normalised on load (`deserialize`). Readers still normalise too, because
 * tests and older code build those short bookings directly on state.
 * Filling them in here beats every reader guarding against a missing field.
 */
export function normaliseWeek(t) {
  if (!t) return t;
  const base = newWeek(t.rung, t.day);
  return {
    ...base,
    ...t,
    roundSettings: { ...base.roundSettings, ...(t.roundSettings ?? {}) },
    roundLog: t.roundLog ?? [],
  };
}

/** The same week with tomorrow's pins changed. Refuses a setting that is
 * not one of the four rather than storing it. */
export function withPins(week, id) {
  if (!PIN_IDS.includes(id)) return week;
  return { ...week, roundSettings: { ...week.roundSettings, pins: id } };
}

/**
 * The same week with a championship event's effect on the next round added
 * (championshipEvents.js): handicap points summed, pace multiplied, so two
 * calls both count. Normalises first, so an old-shaped booking gains the
 * defaults rather than adding to undefined.
 */
export function withEventEffect(week, { handicap = 0, pace = 1 } = {}) {
  const w = normaliseWeek(week);
  return {
    ...w,
    roundSettings: {
      ...w.roundSettings,
      eventHandicap: w.roundSettings.eventHandicap + handicap,
      eventPace: w.roundSettings.eventPace * pace,
    },
  };
}

/** The same week with no event effect pending: what a round leaves behind
 * once it has been played with one. The player's pins are kept. */
export function clearEventEffect(week) {
  return { ...week, roundSettings: { ...week.roundSettings, eventHandicap: 0, eventPace: 1 } };
}

/**
 * A round played, added to the week.
 *
 * `playerToPar` is indexed by player, the same order every round, so a
 * total is one player's week rather than whoever happened to be fifth.
 * `entry` is whatever the day wants remembered about the round; the
 * leader's total is added here so it cannot disagree with the totals.
 */
export function recordRound(week, { handicaps, playerToPar, entry = {} }) {
  if (!playerToPar?.length) throw new Error('recordRound: no players in the round');
  if (week.field && playerToPar.length !== week.field.totals.length) {
    throw new Error(`recordRound: ${playerToPar.length} scores for a field of ${week.field.totals.length}`);
  }
  if (weekFinished(week)) throw new Error('recordRound: the week has already finished');
  const totals = week.field?.totals ?? new Array(playerToPar.length).fill(0);
  const nextTotals = totals.map((total, i) => total + (playerToPar[i] ?? 0));
  const roundsPlayed = week.roundsPlayed + 1;
  return {
    ...week,
    roundsPlayed,
    field: {
      handicaps: week.field?.handicaps ?? [...handicaps],
      totals: nextTotals,
    },
    roundLog: [
      ...week.roundLog,
      { ...entry, round: roundsPlayed, leaderToPar: Math.min(...nextTotals) },
    ],
  };
}

/** The lowest total so far, or null before the first round is in. */
export function winningTotal(week) {
  const totals = week?.field?.totals;
  return totals?.length ? Math.min(...totals) : null;
}

export function weekFinished(week) {
  return Boolean(week) && week.roundsPlayed >= week.rounds;
}

/**
 * From the first round's morning until the week resolves.
 *
 * What the hole editor asks before it opens: the design the field meets
 * on the first morning is the design it plays all week, and reworking a
 * hole overnight to drag Sunday's scores up is not a lever.
 */
export function weekUnderWay(state) {
  const t = state?.tournament;
  return Boolean(t && !t.resolved && state.day >= t.day);
}

/**
 * The leader's pace carried over the whole week, rounded: -2 after one of
 * two rounds is -4. Null before there is a pace to carry (no leader yet, or
 * no round played).
 *
 * One definition because three screens project the winner -- the HUD, the
 * championship sheet and the evening report -- and a rounding that differed
 * between them would put "on target" and "heading over" on the same morning.
 */
export function projectTotal(leaderToPar, roundsPlayed, rounds) {
  if (leaderToPar === null || leaderToPar === undefined || !roundsPlayed) return null;
  return Math.round(leaderToPar * rounds / roundsPlayed);
}

/**
 * Everything the HUD and the championship sheet say about a booked
 * championship, worked out once.
 *
 * Both screens used to compute these separately, and the review found
 * three ways the interface could disagree with the judge: they measured
 * the difficulty over every open hole where the judge measures the
 * playable ones (a decision event can have closed some, `playableHoles`);
 * they kept re-measuring a live figure after the judge had settled it on
 * the first morning; and a leader's partial total sat beside a target
 * that is for the whole week. One selector, so there is one answer.
 *
 * `difficulty` is raw, not floored: callers floor it for display
 * (64.6 against a floor of 65 must not print as "65" beside a warning
 * colour) but compare it unfloored, as the judge does.
 *
 * Once the week has measured the course (`week.difficulty`, set on the
 * first round's day in `runDay`) that measurement is returned, frozen,
 * because it is the one the verdict will use; before that it is this
 * morning's measure of the holes the day would play.
 *
 * `projectedTotal` is the leader's pace over the full week, rounded --
 * null before a round is in, when there is no pace to project.
 *
 * Null when nothing is booked or the rung is unknown (a save from a future
 * version should not take down a screen that draws every frame).
 */
export function championshipStatus(state) {
  const booked = state?.tournament;
  if (!booked || booked.resolved) return null;
  const rung = RUNGS[booked.rung];
  if (!rung) return null;
  const week = normaliseWeek(booked);
  const frozen = week.difficulty != null;
  const difficulty = frozen
    ? week.difficulty
    : courseDifficultyOf(playableHoles(state));
  const leaderToPar = winningTotal(week);
  return {
    rungId: booked.rung,
    rung,
    week,
    inWeek: weekUnderWay(state),
    round: week.roundsPlayed + 1,
    roundsPlayed: week.roundsPlayed,
    rounds: week.rounds,
    leaderToPar,
    projectedTotal: projectTotal(leaderToPar, week.roundsPlayed, week.rounds),
    target: rung.target,
    minDifficulty: rung.minDifficulty,
    difficulty,
    difficultyMet: frozen ? Boolean(week.difficultyMet) : difficulty >= rung.minDifficulty,
    difficultyFrozen: frozen,
  };
}
