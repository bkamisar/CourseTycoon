/**
 * Measures Act III end to end: a resort played through Acts I and II by
 * the operator, then the ladder hosted against the same resort never
 * bidding.
 *
 *   node tools/actThree.js [--seeds 8] [--samples 4] [--force[=settled,hosted,neverBid]]
 *
 * Two kinds of phase, cached differently, in tools/.cache/act-three/:
 *
 *   settled  -- Acts I and II, one resort per seed. The slow, expensive
 *               thing, and the only cache reused across code changes:
 *               each file records a fingerprint of the code and levers
 *               that made it, and a mismatch is WARNED about, not acted
 *               on. Act I and II are usually not what changed, and
 *               rebuilding them is the author's call (`--force=settled`).
 *   hosted / neverBid -- 240 days of Act III from a settled resort, run
 *               `--samples` times per seed with a different Act III seed
 *               each (the same resort and its weather, different days).
 *               Checkpointed too, because the author's rule is that a
 *               kill must not lose finished work, but keyed to the
 *               fingerprint AND the settled resort they started from, so
 *               a stale sample is rerun rather than reused. That is the
 *               failure the first version had: it served hosted results
 *               from before a purse change unless somebody remembered to
 *               delete them by hand.
 *
 * `--force` alone redoes every phase; `--force=hosted` (a comma list of
 * phase names) redoes only those, keeping the settled resorts.
 *
 * Progress goes to stderr; the table, the summary and the rows as JSON go
 * to stdout.
 */
import {
  mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { serialize, deserialize } from '../src/sim/state.js';
import { openingResort } from './scenarios.js';
import { play, playActTwo, playActThree } from './operator.js';

const DIR = new URL('./.cache/act-three/', import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return (at >= 0 && Number(args[at + 1])) || fallback;
};
const seedCount = option('--seeds', 8);
const sampleCount = option('--samples', 4);
const PHASES = ['settled', 'hosted', 'neverBid'];
const forceArg = args.find((a) => a === '--force' || a.startsWith('--force='));
const forced = new Set(!forceArg ? []
  : forceArg === '--force' ? PHASES
    : forceArg.slice('--force='.length).split(',').filter(Boolean));
for (const p of forced) {
  if (!PHASES.includes(p)) throw new Error(`--force: unknown phase "${p}" (one of ${PHASES.join(', ')})`);
}

const LEVERS = { greenFee: 80, teeInterval: 14, roomRate: 300 };
const DAYS = { actOne: 200, actTwo: 300, actThree: 240 };

mkdirSync(DIR, { recursive: true });
const log = (...m) => process.stderr.write(`${m.join(' ')}\n`);
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Every .js file under `dir`, sorted, so the fingerprint is stable. */
function sources(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

/**
 * What a result depends on: the simulation, the operator and its shared
 * policy, the scenario it starts from, and the levers and spans. Not git
 * HEAD, which would miss an uncommitted edit -- the exact moment a stale
 * cache does the most damage.
 */
const FINGERPRINT = hash([
  ...sources(join(ROOT, 'src', 'sim')),
  join(ROOT, 'tools', 'operator.js'),
  join(ROOT, 'tools', 'championshipPolicy.js'),
  join(ROOT, 'tools', 'scenarios.js'),
].map((f) => `${f.slice(ROOT.length)}\n${readFileSync(f, 'utf8')}`).join('\n')
  + JSON.stringify({ LEVERS, DAYS }));

/** Writes aside and renames into place, so a kill mid-write cannot leave a
 * half-file that the next launch takes for a finished phase. */
function save(file, value) {
  const partial = new URL(`${file.href}.partial`);
  writeFileSync(partial, JSON.stringify(value));
  renameSync(partial, file);
}

function settledFor(seed) {
  const file = new URL(`settled-${seed}.json`, DIR);
  if (existsSync(file) && !forced.has('settled')) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (cached.fingerprint !== FINGERPRINT) {
      log(`seed ${seed}: WARNING settled resort was made by different code or levers `
        + `(${cached.fingerprint ?? 'no fingerprint'} vs ${FINGERPRINT}); reusing it. `
        + 'Rebuild with --force=settled if Act I or II changed.');
    }
    return cached;
  }
  const started = Date.now();
  log(`seed ${seed}: settled ...`);
  const one = play(openingResort(seed), { ...LEVERS, days: DAYS.actOne, seed });
  let result;
  if (!one.gateDay) {
    result = { skipped: 'Act I gate never opened' };
  } else {
    const two = playActTwo(one.state, { ...LEVERS, days: DAYS.actTwo, seed });
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
    result = state.act === 3
      ? { state: serialize(state) }
      : { skipped: `Act II ended ${two.ending ?? 'unsettled'}` };
  }
  const value = { fingerprint: FINGERPRINT, ...result };
  save(file, value);
  log(`seed ${seed}: settled done in ${Math.round((Date.now() - started) / 1000)}s`);
  return value;
}

/** 240 days of Act III from one settled resort, hosting or not. */
function sample(phase, seed, k, settled) {
  const file = new URL(`${phase}-${seed}-${k}.json`, DIR);
  const key = hash(`${FINGERPRINT}:${hash(settled.state)}`);
  if (existsSync(file) && !forced.has(phase)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (cached.key === key) return cached.result;
    log(`seed ${seed}.${k}: ${phase} cached under other code; rerunning`);
  }
  const { state, ...result } = playActThree(deserialize(settled.state), {
    ...LEVERS, days: DAYS.actThree, seed: seed * 100 + k, host: phase === 'hosted',
  });
  save(file, { key, result });
  return result;
}

const rows = [];
for (let seed = 1; seed <= seedCount; seed++) {
  const settled = settledFor(seed);
  if (settled.skipped) {
    rows.push({ seed, skipped: settled.skipped });
    continue;
  }
  for (let k = 1; k <= sampleCount; k++) {
    const started = Date.now();
    const hosted = sample('hosted', seed, k, settled);
    const neverBid = sample('neverBid', seed, k, settled);
    log(`seed ${seed}.${k}: done in ${Math.round((Date.now() - started) / 1000)}s`);
    const weeks = hosted.tournaments.map((t) => ({
      rung: t.rung,
      winningTotal: t.winningTotal,
      target: t.target,
      inTarget: t.inTarget,
      difficulty: t.difficulty,
      difficultyMet: t.difficultyMet,
      turf: t.turf,
      met: t.met,
      paid: t.paid,
      pins: t.pins,
    }));
    rows.push({
      seed,
      sample: k,
      hosted: hosted.hosted,
      weeks,
      allHit: hosted.hosted.length === 3 && weeks.every((w) => w.inTarget),
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
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const money = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const SHORT = { countyOpen: 'County', regional: 'Regional', national: 'National' };
const MET = { target: 'T', turf: 'u', pace: 'p', crowd: 'c' };

for (const r of rows) {
  if (r.skipped) {
    console.log(`seed ${r.seed}: skipped -- ${r.skipped}`);
    continue;
  }
  const weeks = r.weeks.map((w) => `${SHORT[w.rung]} ${signed(w.winningTotal)} `
    + `${w.inTarget ? 'HIT' : w.difficultyMet ? 'miss' : 'FLOOR'} `
    + `[${w.met.map((m) => MET[m]).join('')}]`).join(' | ');
  console.log(`${`${r.seed}.${r.sample}`.padEnd(5)} ${weeks.padEnd(64)} `
    + `paid $${r.contractIncome.toLocaleString('en-US').padStart(9)}  worth ${money(r.hostingWorth).padStart(11)}`
    + `${r.bankrupt ? '  BANKRUPT' : ''}`);
}

const done = rows.filter((r) => !r.skipped);
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return s[lo] + (s[Math.ceil(at)] - s[lo]) * (at - lo);
};
const describe = (label, group) => {
  if (!group.length) return console.log(`${label}: none`);
  const w = group.map((r) => r.hostingWorth);
  console.log(`${label}: n=${group.length}  median ${money(quantile(w, 0.5))}  `
    + `quartiles ${money(quantile(w, 0.25))} .. ${money(quantile(w, 0.75))}  `
    + `range ${money(Math.min(...w))} .. ${money(Math.max(...w))}  `
    + `losing ${w.filter((x) => x < 0).length}/${w.length}`);
};
console.log('');
describe('all three targets hit', done.filter((r) => r.allHit));
describe('a week missed       ', done.filter((r) => !r.allHit));
describe('every sample        ', done);

/*
 * The purse multiplier that would put the median all-hit sample at zero.
 * Valid because the purse moves nothing but money: every week's score,
 * pins and turf, and every per-day profit, came out identical when the
 * purses doubled (2026-10-03). So each sample's worth at multiplier m is
 * worth + (m - 1) x contractIncome, and the median is found by bisection.
 */
const allHit = done.filter((r) => r.allHit);
if (allHit.length) {
  const medianAt = (m) => quantile(allHit.map((r) => r.hostingWorth + (m - 1) * r.contractIncome), 0.5);
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (medianAt(mid) < 0) lo = mid; else hi = mid;
  }
  console.log(`break-even multiplier on today's purses for the median all-hit sample: x${lo.toFixed(3)}`);
}
for (const rung of ['countyOpen', 'regional', 'national']) {
  const weeks = done.flatMap((r) => r.weeks.filter((w) => w.rung === rung));
  const rate = (pred) => `${weeks.filter(pred).length}/${weeks.length}`;
  console.log(`${SHORT[rung].padEnd(9)} target ${rate((w) => w.inTarget)}  floor ${rate((w) => w.difficultyMet)}  `
    + `turf ${rate((w) => w.met.includes('turf'))}  pace ${rate((w) => w.met.includes('pace'))}  `
    + `crowd ${rate((w) => w.met.includes('crowd'))}`);
}
console.log(JSON.stringify(rows, null, 2));
