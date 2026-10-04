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
 * Prints two tables: the tuning seeds the centres and the host's pin
 * cut-offs were chosen on, and held-out seeds nothing was chosen on. Quote
 * the held-out one. On it (2026-10-03, 120 seeds):
 *
 *               reacting  fair  setup 0 brutal  setup 100 easy
 *   County         92%     83%        8%             30%
 *   Regional       76%     68%        0%             24%
 *   National       75%     53%        0%             62% (not judged)
 *
 * Four of those fall short of the criteria -- County overcooked, Regional
 * and National reacting, National fair -- and are stated limits in the
 * spec; the full record is above RUNGS in src/sim/tournaments.js.
 *
 * Plays the week through `playField` and `recordRound` directly rather
 * than through `runDay`: the field is the whole question, and a resort
 * around it would only add noise and minutes. Weather is the real
 * weather for each day, handed over raw exactly as day.js does, and
 * `playField` damps its spread to the field's strength -- so wind and rain
 * are in the numbers the way they are in the game. Turf is held at 90: it
 * moves the field only about 0.2 strokes across its whole range.
 *
 * Short-running (about 40 seconds for both tables), so no checkpointing.
 *
 *   node tools/calibrateWeek.js
 */
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { RUNG_IDS, RUNGS, withinTarget } from '../src/sim/tournaments.js';
import { simulateWeek } from '../src/sim/practiceRound.js';
import { pathToFileURL } from 'node:url';
import { narrowToDifficulty, reactivePins } from './championshipPolicy.js';

/**
 * The tuning seeds: the centres and the host's pin cut-offs were chosen on
 * these, so rates read on them flatter. A hundred and twenty, because
 * twenty-four were a lottery: on a second set of twenty-four the same
 * configuration's rates moved by twenty to forty points (the County free
 * ride read 38% on one set and 8% on the other).
 */
export const SEEDS = Array.from({ length: 120 }, (_, i) => (i + 1) * 101);

/**
 * A hundred and twenty seeds nothing was chosen on: the rates to quote.
 * Even these are only good to about four points (one standard error of
 * one fixed configuration on 120 seeds). Never re-tune a centre or a
 * cut-off against them, or they stop being held out.
 */
export const HOLDOUT = Array.from({ length: 120 }, (_, i) => (i + 121) * 101);

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

/** One week, start to finish. Returns the winning total. Lives in
 * src/sim/practiceRound.js since 2026-10-04, so the officials' practice
 * round and this calibration play the same week; re-exported here so the
 * tool's surface is unchanged. Its defaults (weather seed = seed, first
 * day 100, turf 90, interval 14) are what this tool always measured. */
export { simulateWeek };

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

function table(label, seeds) {
  console.log(`\n=== ${label} (${seeds.length} seeds)`);
  for (const rungId of RUNG_IDS) {
    const rung = RUNGS[rungId];
    const holes = courseFor(rungId);
    const mid = Math.round((rung.band.low + rung.band.high) / 2);
    const centre = median(seeds.map((seed) =>
      simulateWeek(holes, { rungId, setup: mid, policy: POLICIES.fair, seed })));
    const rate = (setup, policy) => `${Math.round(100 * hitRate(rungId, { setup, policy, seeds, holes }))}%`;
    console.log(`\n${rung.label}: target ${rung.target.low} to ${rung.target.high}, `
      + `median winner ${centre} (fair pins at setup ${mid})`);
    console.log(`  midpoint, reacting  ${rate(mid, POLICIES.reacting)}   (want >= 80%)`);
    console.log(`  midpoint, fair      ${rate(mid, POLICIES.fair)}   (want >= 60%)`);
    console.log(`  setup 0, brutal     ${rate(0, POLICIES.brutal)}   (want <= 15%)`);
    console.log(`  setup 100, easy     ${rate(100, POLICIES.easy)}   (want <= 25%, County and Regional)`);
  }
}

function main() {
  table('Tuning seeds -- the centres were chosen here, so these flatter', SEEDS);
  table('Held-out seeds -- the rates to quote', HOLDOUT);
}

// Run as a script, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
