import { newGame } from '../src/sim/state.js';
import { runDay, applyEventChoice } from '../src/sim/day.js';
import { EVENTS, STANCES } from '../src/sim/events.js';
import { play } from './operator.js';
import { openingResort } from './scenarios.js';

const SEEDS = 60;
const DAYS = 60;

/**
 * How an operator answers decision events.
 *
 * The passive floor below never answers at all, which is the honest
 * baseline but also means the entire events slice is invisible to it.
 * These are the policies that make it visible, and they answer the one
 * question a unit test cannot: the dominated-choice-set test proves no
 * single option beats its siblings on every axis, but a stance could
 * still quietly win over sixty days by being right slightly more often
 * than it is wrong. If one of these comes out clearly ahead of the rest,
 * that stance is the autopilot the whole slice exists to remove.
 *
 * Each returns the index of the choice to take.
 */
const moneyOf = (choice) => choice.effects?.money ?? 0;

const POLICIES = {
  // Never answers. The existing baseline, kept so its numbers stay
  // comparable with every balance run before events existed.
  ignore: null,
  // Spends the least (often the do-nothing option).
  cheapest: (event) => indexOfBest(event, (c) => moneyOf(c)),
  // Spends the most, which is usually also the most thorough.
  dearest: (event) => indexOfBest(event, (c) => -moneyOf(c)),
};
for (const key of Object.keys(STANCES)) {
  // Prefer this stance wherever the event offers it; where it does not,
  // fall back to spending the least, so the fallback is the same for
  // every stance policy and cannot flatter one of them.
  POLICIES[key] = (event) => {
    const i = event.choices.findIndex((c) => c.stance === key);
    return i >= 0 ? i : indexOfBest(event, (c) => moneyOf(c));
  };
}

function indexOfBest(event, score) {
  let best = 0;
  for (let i = 1; i < event.choices.length; i++) {
    if (score(event.choices[i]) > score(event.choices[best])) best = i;
  }
  return best;
}

/**
 * Runs many resorts through many days and reports whether the economy is
 * sound. This catches the failures a script can catch - runaway money,
 * unavoidable bankruptcy, a gate that never fires or fires instantly -
 * so that playtesting can be spent on whether the game is fun.
 *
 * It plays a deliberately passive operator: no building, no price changes.
 * That is the floor. A thinking player should do better than this, so if
 * the passive operator is already rich, the economy is too generous.
 */
function runSeason(seed, policy = null) {
  let state = newGame(seed);
  let bankrupt = false;
  let gateDay = null;
  let peakMoney = state.money;
  let answered = 0;
  let onStance = 0;

  for (let day = 0; day < DAYS; day++) {
    const result = runDay(state, seed * 1000 + day);
    state = result.state;
    const pending = result.report.pendingEvent;
    if (policy && pending) {
      // The report carries only what the card needs to render. The
      // effects live in the library, so look the event up there — the
      // same route applyEventChoice takes.
      const event = EVENTS.find((e) => e.id === pending.id);
      const index = policy(event);
      state = applyEventChoice(state, pending.id, index);
      answered += 1;
      if (event.choices[index].stance === policy.stanceKey) onStance += 1;
    }
    peakMoney = Math.max(peakMoney, state.money);
    if (state.money < 0 && !bankrupt) bankrupt = true;
    if (result.report.gate.passed && gateDay === null) gateDay = day + 1;
  }

  const last = state.history[state.history.length - 1];
  return {
    bankrupt,
    answered,
    onStance,
    gateDay,
    peakMoney,
    finalMoney: state.money,
    finalPrestige: state.prestige,
    finalTurf: state.turfQuality,
    groupsPlayed: last.groupsPlayed,
    averageSatisfaction: last.averageSatisfaction,
    averageRoundMinutes: last.averageRoundMinutes,
  };
}

const results = [];
for (let seed = 1; seed <= SEEDS; seed++) results.push(runSeason(seed));

const mean = (fn) => results.reduce((s, r) => s + fn(r), 0) / results.length;
const pct = (fn) => (results.filter(fn).length / results.length) * 100;

console.log(`\nCourse Tycoon balance — ${SEEDS} seeds x ${DAYS} days, passive operator\n`);
console.log(`  Bankrupt at any point   ${pct((r) => r.bankrupt).toFixed(0)}%`);
console.log(`  Gate reached            ${pct((r) => r.gateDay !== null).toFixed(0)}%`);
console.log(`  Mean day gate reached   ${
  results.some((r) => r.gateDay)
    ? (results.filter((r) => r.gateDay).reduce((s, r) => s + r.gateDay, 0) /
       results.filter((r) => r.gateDay).length).toFixed(1)
    : 'never'
}`);
console.log(`  Mean final money        $${Math.round(mean((r) => r.finalMoney)).toLocaleString()}`);
console.log(`  Mean final prestige     ${mean((r) => r.finalPrestige).toFixed(1)}`);
console.log(`  Mean final turf         ${mean((r) => r.finalTurf).toFixed(1)}`);
console.log(`  Mean groups per day     ${mean((r) => r.groupsPlayed).toFixed(1)}`);
console.log(`  Mean satisfaction       ${mean((r) => r.averageSatisfaction).toFixed(1)}`);
console.log(`  Mean round time         ${mean((r) => r.averageRoundMinutes).toFixed(0)} min`);
console.log('');

// ---------------------------------------------------------------------
// Decision policies. Same passive operator in every other respect — no
// building, no pricing, no hiring — so the only thing separating these
// rows is how the events were answered.
// ---------------------------------------------------------------------

const policyRows = [];
for (const [name, policy] of Object.entries(POLICIES)) {
  if (policy) policy.stanceKey = STANCES[name] ? name : null;
  const rows = [];
  for (let seed = 1; seed <= SEEDS; seed++) rows.push(runSeason(seed, policy));
  const avg = (fn) => rows.reduce((s, r) => s + fn(r), 0) / rows.length;
  policyRows.push({
    name,
    money: avg((r) => r.finalMoney),
    prestige: avg((r) => r.finalPrestige),
    turf: avg((r) => r.finalTurf),
    sat: avg((r) => r.averageSatisfaction),
    answered: avg((r) => r.answered),
    onStance: avg((r) => r.onStance),
    bankrupt: (rows.filter((r) => r.bankrupt).length / rows.length) * 100,
  });
}

const baseline = policyRows.find((r) => r.name === 'ignore');
console.log(`How the events are answered — ${SEEDS} seeds x ${DAYS} days, otherwise the same passive operator
`);
console.log('  policy        money    vs base  prestige   turf    happy   answered  on-stance');
for (const r of policyRows) {
  const delta = r.name === 'ignore' ? '' :
    `${r.money - baseline.money >= 0 ? '+' : '-'}$${Math.abs(Math.round(r.money - baseline.money)).toLocaleString()}`;
  console.log(
    `  ${r.name.padEnd(12)}$${Math.round(r.money).toLocaleString().padStart(8)}` +
    `${delta.padStart(10)}  ${r.prestige.toFixed(1).padStart(6)}  ${r.turf.toFixed(1).padStart(5)}` +
    `  ${r.sat.toFixed(1).padStart(6)}  ${r.answered.toFixed(1).padStart(8)}  ${
      r.name === 'ignore' || r.name === 'cheapest' || r.name === 'dearest'
        ? '     —' : `${((r.onStance / Math.max(1, r.answered)) * 100).toFixed(0)}%`.padStart(6)}`
  );
}

const spread = Math.max(...policyRows.map((r) => r.money)) - Math.min(...policyRows.map((r) => r.money));
console.log(`
  Spread between best and worst policy: $${Math.round(spread).toLocaleString()}`);
console.log('');

// ---------------------------------------------------------------------
// The other end: somebody who actually plays.
//
// Everything above measures a passive operator who never builds, prices
// or hires. That was the right floor when the green fee was the only
// thing to get wrong, and it had quietly stopped measuring the game — it
// never builds a food amenity, so menus are invisible to it; never hires,
// so the whole staffing layer is invisible; never buys, so every price is
// invisible. It reported the same six numbers through four slices of work
// that should have moved them.
//
// This asks the question the floor cannot: can a reasonable player reach
// Act II, how long does it take, and does more than one strategy work?
// The last part matters most. A game with a single winning line is a
// puzzle with an answer rather than a game with strategies, and this
// harness reported exactly that until it was pointed out that the
// operator being measured could not hire a marshal.
// ---------------------------------------------------------------------

const STRATEGIES = [
  { label: 'cheap and busy',   greenFee: 65,  teeInterval: 14 },
  { label: 'balanced',         greenFee: 80,  teeInterval: 14 },
  { label: 'quiet and pricey', greenFee: 80,  teeInterval: 18 },
  { label: 'premium',          greenFee: 95,  teeInterval: 18 },
  { label: 'bargain basement', greenFee: 50,  teeInterval: 12 },
  { label: 'luxury',           greenFee: 110, teeInterval: 20 },
];

console.log(`A competent operator — ${SEEDS >= 8 ? 8 : SEEDS} seeds, 150 days, from day one
`);
console.log('  strategy             fee  interval   reaches Act II   mean day   bankrupt');
let viable = 0;
for (const strat of STRATEGIES) {
  const runs = [];
  for (let seed = 1; seed <= 8; seed++) {
    runs.push(play(openingResort(seed), { ...strat, seed }));
  }
  const reached = runs.filter((r) => r.gateDay);
  const broke = runs.filter((r) => r.bankrupt).length;
  const meanDay = reached.length
    ? (reached.reduce((s, r) => s + r.gateDay, 0) / reached.length).toFixed(0) : '-';
  if (reached.length === 8 && broke === 0) viable += 1;
  console.log(
    `  ${strat.label.padEnd(20)}$${String(strat.greenFee).padStart(3)}`
    + `${String(strat.teeInterval).padStart(8)}min${String(reached.length).padStart(12)}/8`
    + `${String(meanDay).padStart(11)}${String(broke).padStart(11)}/8`
  );
}
console.log(`
  ${viable} of ${STRATEGIES.length} strategies reach Act II cleanly.`);
if (viable <= 1) {
  console.log('  ONE OR FEWER IS A PUZZLE, NOT A GAME. Before concluding that, check the');
  console.log('  operator can actually play the strategies being tested — it once could');
  console.log('  not hire a marshal, and reported a game with one winning line.');
}
console.log('');
