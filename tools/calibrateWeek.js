/**
 * Where a championship's winning score lands, and how often each way of
 * playing the week hits the target.
 *
 * The spec's criteria (§8, "Target ranges"):
 *
 *   band midpoint, reacting to the leader   >= 80%
 *   band midpoint, fair pins all week        >= 60%
 *   setup 0, brutal pins all week            <= 15%
 *   setup 100, easy pins -- County, Regional <= 25%
 *
 * The National's reacting rate is an accepted miss (about 78%); the
 * results and why are recorded above RUNGS in src/sim/tournaments.js.
 *
 * Plays the week through `playField` and `recordRound` directly rather
 * than through `runDay`: the field is the whole question, and a resort
 * around it would only add noise and minutes. Weather is the real
 * weather for each day, handed over raw exactly as day.js does, and
 * `playField` damps it to the field's strength -- so wind and rain are in
 * the numbers the way they are in the game.
 *
 * Short-running (about 20 seconds at 120 seeds), so no checkpointing.
 *
 *   node tools/calibrateWeek.js
 */
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNG_IDS, RUNGS, withinTarget } from '../src/sim/tournaments.js';
import { playField, drawFieldHandicaps } from '../src/sim/field.js';
import { weatherOn, effectsOf } from '../src/sim/weather.js';
import { newWeek, recordRound, winningTotal, withPins } from '../src/sim/championshipWeek.js';
import { pathToFileURL } from 'node:url';
import { narrowToDifficulty, reactivePins } from './championshipPolicy.js';

/**
 * A hundred and twenty seeds. Twenty-four were tried first and were a
 * lottery: on a second set of twenty-four the same configuration's rates
 * moved by twenty to forty points (the County free ride read 38% on one
 * set and 8% on the other). At 120 a rate is good to about four points.
 */
export const SEEDS = Array.from({ length: 120 }, (_, i) => (i + 1) * 101);

/** The template rotation an untouched resort is built from, narrowed to a
 * rung's minimum the way a host would. */
export function courseFor(rungId) {
  const holes = Array.from({ length: 18 }, (_, i) => ({
    ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], i + 1), open: true,
  }));
  narrowToDifficulty(holes, RUNGS[rungId].minDifficulty);
  return holes;
}

export const POLICIES = {
  reacting: reactivePins,
  fair: () => 'fair',
  brutal: () => 'brutal',
  easy: () => 'easy',
};

/** One week, start to finish. Returns the winning total. */
export function simulateWeek(holes, {
  rungId, setup, policy, seed, turfQuality = 90, teeInterval = 14,
}) {
  const rng = makeRng(seed);
  const handicaps = drawFieldHandicaps(rng);
  let week = newWeek(rungId, 100);
  for (let r = 0; r < week.rounds; r++) {
    const sky = effectsOf(weatherOn(seed, 100 + r));
    week = withPins(week, policy({ week, spread: sky.spread }));
    const { playerToPar } = playField(rng, holes, {
      setup, turfQuality, teeInterval, handicaps,
      pins: week.roundSettings.pins, spread: sky.spread, pace: sky.pace,
    });
    week = recordRound(week, { handicaps, playerToPar, entry: { pins: week.roundSettings.pins } });
  }
  return winningTotal(week);
}

/** Share of seeds whose winner lands in the rung's target. */
export function hitRate(rungId, { setup, policy, seeds = SEEDS, holes = courseFor(rungId) }) {
  const hits = seeds.filter((seed) => withinTarget(
    simulateWeek(holes, { rungId, setup, policy, seed }), RUNGS[rungId].target,
  )).length;
  return hits / seeds.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function main() {
  for (const rungId of RUNG_IDS) {
    const rung = RUNGS[rungId];
    const holes = courseFor(rungId);
    const mid = Math.round((rung.band.low + rung.band.high) / 2);
    const centre = median(SEEDS.map((seed) =>
      simulateWeek(holes, { rungId, setup: mid, policy: POLICIES.fair, seed })));
    const rate = (setup, policy) => `${Math.round(100 * hitRate(rungId, { setup, policy, holes }))}%`;
    console.log(`\n${rung.label}: target ${rung.target.low} to ${rung.target.high}, `
      + `measured centre ${centre} (fair pins at setup ${mid})`);
    console.log(`  midpoint, reacting  ${rate(mid, POLICIES.reacting)}   (want >= 80%)`);
    console.log(`  midpoint, fair      ${rate(mid, POLICIES.fair)}   (want >= 60%)`);
    console.log(`  setup 0, brutal     ${rate(0, POLICIES.brutal)}   (want <= 15%)`);
    console.log(`  setup 100, easy     ${rate(100, POLICIES.easy)}   (want <= 25%, County and Regional)`);
  }
}

// Run as a script, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
