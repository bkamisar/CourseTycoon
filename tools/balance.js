import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

const SEEDS = 60;
const DAYS = 60;

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
function runSeason(seed) {
  let state = newGame(seed);
  let bankrupt = false;
  let gateDay = null;
  let peakMoney = state.money;

  for (let day = 0; day < DAYS; day++) {
    const result = runDay(state, seed * 1000 + day);
    state = result.state;
    peakMoney = Math.max(peakMoney, state.money);
    if (state.money < 0 && !bankrupt) bankrupt = true;
    if (result.report.gate.passed && gateDay === null) gateDay = day + 1;
  }

  const last = state.history[state.history.length - 1];
  return {
    bankrupt,
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
