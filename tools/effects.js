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
import { newGame, amenity, openHoles } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { AMENITIES, WAGES } from '../src/sim/economy.js';
import { menuPrep, MENU_SLOTS } from '../src/sim/menu.js';
import { kitchenCapacity, kitchenLoad, serviceFactor } from '../src/sim/kitchen.js';

const DAYS = 25;
const SEEDS = 4;

/** A finished nine with a crowd on it: the only fair place to measure. */
function baseResort(seed) {
  const state = newGame(seed);
  state.money = 150000;
  state.prestige = 60;
  state.resort.pricing.greenFee = 80;
  state.resort.pricing.teeInterval = 13;

  const holes = state.resort.courses[0].holes;
  for (let i = 0; i < holes.length; i++) {
    holes[i] = { ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], holes[i].id), open: true };
  }
  for (let i = 0; i < 3; i++) state.resort.staff.push({ role: 'groundskeeper' });
  return state;
}

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

console.log('AMENITIES                 cost   upkeep    $/day   happy   round  groups  rating');
console.log('-'.repeat(82));
for (const type of Object.keys(AMENITIES)) {
  if (type === 'clubhouse') continue; // you always have one
  const spec = AMENITIES[type];
  const d = delta(measure((s) => s.resort.amenities.push(amenity(type))));
  console.log(
    `  ${type.padEnd(22)}${cell('$' + (spec.build / 1000).toFixed(0) + 'k', 6)}`
    + `${cell('$' + spec.upkeep, 9)}${cell(money(d.money), 9)}`
    + `${cell(num(d.happy), 8)}${cell(num(d.round), 8)}${cell(num(d.groups), 8)}${cell(num(d.rating), 8)}`
  );
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

// The kitchen is the one constraint that is invisible until it binds.
const staffed = baseResort(1);
for (const t of Object.keys(MENU_SLOTS)) staffed.resort.amenities.push(amenity(t));
console.log(`\nKITCHEN: every food amenity built is ${kitchenLoad(staffed.resort.amenities)} prep `
  + `against a capacity of ${kitchenCapacity(staffed.resort.staff)} with no cooks `
  + `(service would run at ${(serviceFactor(kitchenLoad(staffed.resort.amenities), kitchenCapacity(staffed.resort.staff)) * 100).toFixed(0)}%).`);
console.log('');
