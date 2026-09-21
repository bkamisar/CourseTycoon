/**
 * What everything you can buy actually does.
 *
 * Every amenity and every hire, measured the same way: run a real resort
 * for N days without it, run the identical resort with it, print the
 * difference across every metric the player can see. Nothing here reads a
 * declared value — `AMENITIES.snackShack.satisfaction` said 3 for weeks
 * while the snack shack did nothing for a golfer's energy at all, and a
 * hand-written table would have repeated the claim rather than caught it.
 *
 * This exists because two balance conclusions on this project turned out
 * to be wrong in the same way: the marshal was declared a bad buy at
 * every level (measured on a three-hole course with nothing to marshal),
 * and the halfway house was declared worse than useless (measured with an
 * overloaded kitchen). Both looked authoritative. A table that recomputes
 * itself is the answer to that class of error.
 *
 * The baseline is deliberately a REAL resort — a finished nine, a crowd,
 * staff to match — because the opening three-hole course has no
 * congestion and no clientele, so every purchase measures as worthless on
 * it. That configuration is what produced both wrong answers.
 *
 * Run with `npm run effects`.
 */
import { amenity } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { bareNine, builtOutNine } from './scenarios.js';
import { AMENITIES, WAGES } from '../src/sim/economy.js';
import { menuPrep, MENU_SLOTS } from '../src/sim/menu.js';
import { kitchenCapacity, kitchenLoad, serviceFactor } from '../src/sim/kitchen.js';

const DAYS = 25;
const SEEDS = 4;

/**
 * The baseline, from `tools/scenarios.js` rather than invented here.
 *
 * That module exists because this exact measurement has been got wrong
 * six times by scripts that rolled their own baseline in a hurry, and
 * chose an easy one rather than a representative one. Naming the scenario
 * is what lets someone else — or this file in six weeks — check the
 * assumption instead of trusting the number.
 */
const baseResort = bareNine;

function season(mutate, seed) {
  let state = baseResort(seed);
  if (mutate) mutate(state);
  const opening = state.money;
  let last = null;
  for (let day = 0; day < DAYS; day++) {
    const result = runDay(state, seed * 977 + day);
    state = result.state;
    last = result.report;
  }
  return {
    perDay: (state.money - opening) / DAYS,
    happy: last.averageSatisfaction,
    round: last.averageRoundMinutes,
    groups: last.groupsPlayed,
    rating: last.courseRating,
    prestige: state.prestige,
    turf: state.turfQuality,
    food: last.revenue.food,
  };
}

/** Mean of a measurement across seeds, so one unlucky day cannot decide it. */
function measure(mutate) {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed++) runs.push(season(mutate, seed));
  const mean = (fn) => runs.reduce((s, r) => s + fn(r), 0) / runs.length;
  return {
    perDay: mean((r) => r.perDay),
    happy: mean((r) => r.happy),
    round: mean((r) => r.round),
    groups: mean((r) => r.groups),
    rating: mean((r) => r.rating),
    prestige: mean((r) => r.prestige),
    turf: mean((r) => r.turf),
    food: mean((r) => r.food),
  };
}

/**
 * What each hire needs to exist before it can possibly be worth anything.
 *
 * This tool was written to catch exactly one error — judging a purchase on
 * a resort that gives it nothing to do — and then made it twice itself: a
 * cook measured against a resort with no kitchen, and a shop hire against
 * one with no counter. Both came back "costs its wage and returns
 * nothing", which is true and useless, the same shape as declaring
 * marshals worthless on a three-hole course.
 *
 * So the context is declared rather than special-cased. Adding a role
 * means adding its prerequisite here, and the tool measures it somewhere
 * it can actually work.
 */
const STAFF_CONTEXT = {
  kitchenStaff: ['snackShack', 'halfwayHouse', 'restaurant'],
  shopStaff: ['proShop'],
  groundskeeper: [],
  marshal: [],
};

function withContext(role) {
  const needs = STAFF_CONTEXT[role] ?? [];
  if (needs.length === 0) return null;
  return (s) => { for (const t of needs) s.resort.amenities.push(amenity(t)); };
}

const base = measure(null);

function delta(after) {
  return {
    money: after.perDay - base.perDay,
    happy: after.happy - base.happy,
    round: after.round - base.round,
    groups: after.groups - base.groups,
    rating: after.rating - base.rating,
    prestige: after.prestige - base.prestige,
    turf: after.turf - base.turf,
  };
}

const money = (v) => `${v >= 0 ? '+' : '-'}$${Math.abs(Math.round(v)).toLocaleString()}`;
const num = (v, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}`;
const cell = (s, w) => String(s).padStart(w);

console.log(`\nWHAT EVERYTHING DOES — a finished nine, ${DAYS} days, ${SEEDS} seeds`);
console.log(`Baseline: $${Math.round(base.perDay).toLocaleString()}/day, happy ${base.happy.toFixed(0)}, `
  + `round ${base.round.toFixed(0)}m, ${base.groups.toFixed(0)} groups, rating ${base.rating.toFixed(0)}\n`);

/**
 * The staff an amenity needs before it can do its job.
 *
 * Measured both ways on purpose. Bare says what a player gets if they
 * build it and think no further, which is the mistake the game should
 * warn about rather than the number it should be balanced on. Staffed is
 * the real value, and payback is computed from it.
 */
/**
 * Amenities that are deliberately poor buys in Act I, so a long payback
 * here is the design rather than a mispricing.
 *
 * Both are about a nine having no turn and nowhere to linger: a halfway
 * house pays off at the turn of an eighteen (golfers finish a nine with a
 * third of the tank), and a restaurant pays off when there is a hotel
 * giving people a reason to stay for dinner. Without this list the tool
 * reports them as broken every run, and a tool that cries wolf gets
 * ignored the one time it is right.
 */
const LATER_ACT = {
  halfwayHouse: 'pays off at the turn of an eighteen, not on a nine',
  restaurant: 'pays off when a hotel gives guests a reason to stay for dinner',
};

const AMENITY_STAFF = {
  proShop: ['shopStaff'],
  snackShack: ['kitchenStaff'],
  halfwayHouse: ['kitchenStaff'],
  restaurant: ['kitchenStaff', 'kitchenStaff', 'kitchenStaff'],
  beverageCart: ['kitchenStaff'],
};

console.log('AMENITIES            build  upkeep     bare   staffed   payback   happy   round');
console.log('-'.repeat(82));
const rows = [];
for (const type of Object.keys(AMENITIES)) {
  if (type === 'clubhouse') continue; // you always have one
  const spec = AMENITIES[type];
  const bare = delta(measure((s) => s.resort.amenities.push(amenity(type))));
  const hires = AMENITY_STAFF[type] ?? [];
  const staffed = hires.length
    ? delta(measure((s) => {
      s.resort.amenities.push(amenity(type));
      for (const role of hires) s.resort.staff.push({ role });
    }))
    : bare;
  // Days to earn back what it cost to build, at its staffed rate.
  const payback = staffed.money > 0 ? spec.build / staffed.money : Infinity;
  rows.push({ type, spec, bare, staffed, payback });
  console.log(
    `  ${type.padEnd(17)}${cell('$' + (spec.build / 1000).toFixed(0) + 'k', 6)}`
    + `${cell('$' + spec.upkeep, 8)}${cell(money(bare.money), 9)}${cell(money(staffed.money), 10)}`
    + `${cell(Number.isFinite(payback) ? payback.toFixed(0) + 'd' : 'never', 10)}`
    + `${cell(num(staffed.happy), 8)}${cell(num(staffed.round), 8)}`
  );
}

// A purchase that pays for itself in a couple of days is not a decision.
const sane = rows.filter((r) => Number.isFinite(r.payback)).map((r) => r.payback);
if (sane.length) {
  const median = sane.slice().sort((a, b) => a - b)[Math.floor(sane.length / 2)];
  console.log(`
  Median payback ${median.toFixed(0)} days. Anything far under that is priced too cheap:`);
  let flagged = 0;
  for (const r of rows) {
    if (LATER_ACT[r.type]) continue;
    if (Number.isFinite(r.payback) && r.payback < median * 0.5) {
      console.log(`    ${r.type}: pays back in ${r.payback.toFixed(0)} days — less than half the median.`);
      flagged += 1;
    }
    if (!Number.isFinite(r.payback) || r.payback > median * 4) {
      console.log(`    ${r.type}: ${Number.isFinite(r.payback) ? r.payback.toFixed(0) + ' days' : 'never'} — nobody would build this.`);
      flagged += 1;
    }
  }
  if (flagged === 0) console.log('    Nothing. Every purchase is inside a sane band.');
  console.log('');
  console.log('  Deliberately poor in Act I, so a long payback here is the design:');
  for (const [type, why] of Object.entries(LATER_ACT)) {
    const r = rows.find((x) => x.type === type);
    console.log(`    ${type} (${r ? (Number.isFinite(r.payback) ? r.payback.toFixed(0) + 'd' : 'never') : '?'}): ${why}.`);
  }
}

console.log('\nSTAFF                     wage             $/day   happy   round  groups    turf');
console.log('-'.repeat(82));
for (const role of Object.keys(WAGES)) {
  // A cook is measured on a resort that actually has a kitchen to run.
  // Measuring one against a resort with no food amenities says only that
  // an idle cook is idle, which is the same false negative that made the
  // marshal look worthless on a three-hole course.
  const context = withContext(role);
  const before = context ? measure(context) : base;
  const after = measure((s) => { context?.(s); s.resort.staff.push({ role }); });
  const d = {
    money: after.perDay - before.perDay,
    happy: after.happy - before.happy,
    round: after.round - before.round,
    groups: after.groups - before.groups,
    turf: after.turf - before.turf,
  };
  console.log(
    `  ${role.padEnd(22)}${cell('$' + WAGES[role], 6)}${cell('', 9)}${cell(money(d.money), 9)}`
    + `${cell(num(d.happy), 8)}${cell(num(d.round), 8)}${cell(num(d.groups), 8)}${cell(num(d.turf), 8)}`
  );
}

// Anything that measures as doing nothing at all is either mis-wired or
// has no reason to exist. Both have happened here.
console.log('\nFLAGS');
let quiet = 0;
for (const type of Object.keys(AMENITIES)) {
  if (type === 'clubhouse') continue;
  const d = delta(measure((s) => s.resort.amenities.push(amenity(type))));
  const moves = Math.abs(d.happy) > 0.5 || Math.abs(d.round) > 0.5
    || Math.abs(d.groups) > 0.5 || Math.abs(d.rating) > 0.5;
  const pays = d.money > AMENITIES[type].upkeep * 0.25;
  if (!moves && !pays) {
    console.log(`  ${type}: moves nothing measurable and does not pay for itself.`);
    quiet += 1;
  }
}
for (const role of Object.keys(WAGES)) {
  const context = withContext(role);
  const before = context ? measure(context) : base;
  const after = measure((s) => { context?.(s); s.resort.staff.push({ role }); });
  if (after.perDay - before.perDay < -WAGES[role] * 0.9
    && Math.abs(after.happy - before.happy) < 1
    && Math.abs(after.round - before.round) < 1) {
    console.log(`  ${role}: costs its full wage and returns nothing, even where it should be useful.`);
    quiet += 1;
  }
}
if (quiet === 0) console.log('  Nothing measured as inert. Every purchase moves something.');

// ---------------------------------------------------------------------
// Second order: what is each thing worth when you ALREADY own the rest?
//
// Everything above is measured against a bare nine, one purchase at a
// time, which is the same isolation error that made marshals look
// worthless on three holes. Amenities do not act independently: they all
// raise perceived value, which raises demand, which fills the tee sheet,
// which congests the course and pushes satisfaction back down. The
// driving range has been caught doing exactly this — it lifts
// satisfaction at a generous tee interval and lowers it at a tight one,
// because it draws a crowd onto a sheet that was already full.
//
// So each amenity is measured again as the LAST thing bought rather than
// the first. A big drop means diminishing returns; a negative means the
// things already built are getting in each other's way.
// ---------------------------------------------------------------------
const ALL_AMENITIES = Object.keys(AMENITIES).filter((t) => t !== 'clubhouse');

/** `builtOutNine` minus one thing, so the missing one can be priced as
 * the last purchase rather than the first. */
function fullyBuilt(except) {
  return (s) => {
    const full = builtOutNine(1, { except });
    s.resort.amenities = full.resort.amenities;
    s.resort.staff = full.resort.staff;
  };
}

console.log('');
console.log('SECOND ORDER — worth as the LAST thing bought, not the first');
console.log('-'.repeat(82));
console.log('AMENITY            first      last    change   what that means');
for (const type of ALL_AMENITIES) {
  const withoutIt = measure(fullyBuilt(type));
  const withIt = measure((s) => { fullyBuilt(type)(s); s.resort.amenities.push(amenity(type)); });
  const last = withIt.perDay - withoutIt.perDay;
  const first = rows.find((r) => r.type === type)?.staffed.money ?? 0;
  const ratio = first !== 0 ? last / first : 0;
  const note = last < 0 ? 'NEGATIVE — fights what is already built'
    : first <= 0 ? ''
      : ratio < 0.3 ? 'heavy diminishing returns'
        : ratio > 1.3 ? 'worth MORE alongside the rest'
          : 'holds its value';
  console.log(
    `  ${type.padEnd(17)}${cell(money(first), 8)}${cell(money(last), 10)}`
    + `${cell(first !== 0 ? (ratio * 100).toFixed(0) + '%' : '-', 10)}   ${note}`
  );
}

// How long before a player owns the lot? If it is quick there is no
// scarcity, and without scarcity none of the prices above are a decision.
const everything = ALL_AMENITIES.reduce((sum, t) => sum + AMENITIES[t].build, 0);
const fullUpkeep = ALL_AMENITIES.reduce((sum, t) => sum + AMENITIES[t].upkeep, 0);
const builtOut = measure(fullyBuilt(null));
console.log(`
SCARCITY`);
console.log(`  Every amenity costs $${everything.toLocaleString()} to build and $${fullUpkeep.toLocaleString()}/day to run.`);
console.log(`  A fully built resort makes $${Math.round(builtOut.perDay).toLocaleString()}/day, so it buys itself back in `
  + `${builtOut.perDay > 0 ? Math.round(everything / builtOut.perDay) : '-'} days of operating profit.`);
console.log(`  The Act I gate asks for $50,000.`);

// The kitchen is the one constraint that is invisible until it binds.
const staffed = baseResort(1);
for (const t of Object.keys(MENU_SLOTS)) staffed.resort.amenities.push(amenity(t));
console.log(`\nKITCHEN: every food amenity built is ${kitchenLoad(staffed.resort.amenities)} prep `
  + `against a capacity of ${kitchenCapacity(staffed.resort.staff)} with no cooks `
  + `(service would run at ${(serviceFactor(kitchenLoad(staffed.resort.amenities), kitchenCapacity(staffed.resort.staff)) * 100).toFixed(0)}%).`);
console.log('');
