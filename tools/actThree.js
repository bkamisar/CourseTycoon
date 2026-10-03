/**
 * Measures Act III end to end: a resort played through Acts I and II by
 * the operator, then the ladder hosted against the same resort never
 * bidding.
 *
 * Long-running (minutes per seed), so it checkpoints per phase per seed in
 * tools/.cache/act-three/, skips anything already done on relaunch, and
 * `--force` redoes everything. A kill loses at most the phase it was in.
 *
 *   node tools/actThree.js [--seeds 8] [--force]
 *
 * Progress goes to stderr; the table (and the rows as JSON) to stdout.
 */
import {
  mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync,
} from 'node:fs';
import { serialize, deserialize } from '../src/sim/state.js';
import { openingResort } from './scenarios.js';
import { play, playActTwo, playActThree } from './operator.js';

const DIR = new URL('./.cache/act-three/', import.meta.url);
const args = process.argv.slice(2);
const force = args.includes('--force');
const seedsAt = args.indexOf('--seeds');
const seedCount = (seedsAt >= 0 && Number(args[seedsAt + 1])) || 8;
const LEVERS = { greenFee: 80, teeInterval: 14, roomRate: 300 };

if (force && existsSync(DIR)) rmSync(DIR, { recursive: true });
mkdirSync(DIR, { recursive: true });

const log = (...m) => process.stderr.write(`${m.join(' ')}\n`);

/** Runs `run` once per seed per phase, ever, unless --force. */
function phase(name, seed, run) {
  const file = new URL(`${name}-${seed}.json`, DIR);
  if (existsSync(file)) {
    log(`seed ${seed}: ${name} (cached)`);
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  const started = Date.now();
  log(`seed ${seed}: ${name} ...`);
  const result = run();
  // Written aside and renamed into place, so a kill mid-write cannot leave
  // a half-file that the next launch would take for a finished phase.
  const partial = new URL(`${name}-${seed}.json.partial`, DIR);
  writeFileSync(partial, JSON.stringify(result));
  renameSync(partial, file);
  log(`seed ${seed}: ${name} done in ${Math.round((Date.now() - started) / 1000)}s`);
  return result;
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

const rows = [];
for (let seed = 1; seed <= seedCount; seed++) {
  const settled = phase('settled', seed, () => {
    const one = play(openingResort(seed), { ...LEVERS, days: 200, seed });
    if (!one.gateDay) return { skipped: 'Act I gate never opened' };
    const two = playActTwo(one.state, { ...LEVERS, days: 300, seed });
    let { state } = two;
    // Settled but not yet in Act III: the act opens on a day the full
    // eighteen are playing, and a decision event can close a hole on the
    // day of the buyout (seed 8 did). Play on a day at a time until it
    // opens. playActTwo plays one full ordinary day and stops once the
    // investors are settled; each day gets its own seed so the days are
    // not replays of one another.
    for (let extra = 1; state.act === 2 && two.ending && extra <= 30; extra++) {
      state = playActTwo(state, { ...LEVERS, days: 1, seed: seed * 1000 + extra }).state;
    }
    if (state.act !== 3) return { skipped: `Act II ended ${two.ending ?? 'unsettled'}` };
    return { state: serialize(state) };
  });
  if (settled.skipped) {
    rows.push({ seed, skipped: settled.skipped });
    continue;
  }
  const measure = (host) => phase(host ? 'hosted' : 'neverBid', seed, () => {
    const r = playActThree(deserialize(settled.state), { ...LEVERS, days: 240, seed, host });
    const { state, ...rest } = r;
    return rest;
  });
  const hosted = measure(true);
  const neverBid = measure(false);
  rows.push({
    seed,
    hosted: hosted.hosted.join(' > ') || 'none',
    weeks: hosted.tournaments.map((t) => ({
      rung: t.rung,
      winningTotal: t.winningTotal,
      target: t.target,
      inTarget: t.inTarget,
      difficultyMet: t.difficultyMet,
      turf: t.turf,
      turfMet: t.turfMet,
      met: t.met,
      paid: t.paid,
      pins: t.pins,
      keepers: t.keepers,
    })),
    contractIncome: hosted.contractIncome,
    hostedMoney: hosted.money,
    neverBidMoney: neverBid.money,
    hostingWorth: hosted.money - neverBid.money,
    weekProfitPerDay: hosted.weekProfitPerDay,
    runUpProfitPerDay: hosted.runUpProfitPerDay,
    ordinaryProfitPerDay: hosted.ordinaryProfitPerDay,
    neverBidProfitPerDay: neverBid.ordinaryProfitPerDay,
    bankrupt: hosted.bankrupt || neverBid.bankrupt,
  });
}

// The table first, for reading; the rows after, for anything that wants them.
for (const r of rows) {
  if (r.skipped) {
    console.log(`seed ${r.seed}: skipped -- ${r.skipped}`);
    continue;
  }
  console.log(`seed ${r.seed}: ${r.hosted}  worth ${signed(r.hostingWorth)}  `
    + `(hosted $${r.hostedMoney}, never bid $${r.neverBidMoney}, contracts $${r.contractIncome})`);
  for (const w of r.weeks) {
    console.log(`    ${w.rung.padEnd(10)} won ${signed(w.winningTotal).padStart(3)} `
      + `vs ${signed(w.target.low)}..${signed(w.target.high)} ${w.inTarget ? 'HIT ' : 'miss'}`
      + `  floor ${w.difficultyMet ? 'ok' : 'SHORT'}  turf ${w.turf} ${w.turfMet ? 'ok' : 'LOST'}`
      + `  paid $${w.paid}  pins ${w.pins.join(',')}  keepers ${w.keepers}`);
  }
  console.log(`    profit/day: round ${r.weekProfitPerDay}, run-up ${r.runUpProfitPerDay}, `
    + `ordinary ${r.ordinaryProfitPerDay} (never bid ${r.neverBidProfitPerDay})`
    + `${r.bankrupt ? '  BANKRUPT at some point' : ''}`);
}
console.log(JSON.stringify(rows, null, 2));
