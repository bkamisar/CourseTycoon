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
    roundSettings: { pins: 'fair' },
    // Drawn on the first round, from that day's rng, then carried.
    field: null,
    roundLog: [],
    // Measured on the first morning: the course the field meets is the one
    // judged against the rung's minimum.
    difficulty: null,
    difficultyMet: null,
  };
}

/**
 * Fills in a booking from before the week existed.
 *
 * Saves and a great many tests carry `{ rung, day, resolved }` and nothing
 * else. Filling them in here, once, beats every reader guarding against a
 * missing field.
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
 * A round played, added to the week.
 *
 * `playerToPar` is indexed by player, the same order every round, so a
 * total is one player's week rather than whoever happened to be fifth.
 * `entry` is whatever the day wants remembered about the round; the
 * leader's total is added here so it cannot disagree with the totals.
 */
export function recordRound(week, { handicaps, playerToPar, entry = {} }) {
  const totals = week.field?.totals ?? new Array(playerToPar.length).fill(0);
  const nextTotals = totals.map((total, i) => total + (playerToPar[i] ?? 0));
  const roundsPlayed = week.roundsPlayed + 1;
  return {
    ...week,
    roundsPlayed,
    field: {
      handicaps: week.field?.handicaps ?? handicaps,
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
  return week.roundsPlayed >= week.rounds;
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
