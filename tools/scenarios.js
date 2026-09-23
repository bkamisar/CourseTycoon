/**
 * Named resorts to measure things on, and what each one can and cannot
 * tell you.
 *
 * This exists because of a mistake made six times on this project, each
 * time looking authoritative, each time producing a confident and wrong
 * conclusion:
 *
 *   - "Marshals are a bad buy at every level."      Measured on three
 *     holes with eight groups: nothing to marshal.
 *   - "A cook costs its wage and returns nothing."  Measured on a resort
 *     with no kitchen.
 *   - "A shop hire does nothing."                   Measured with no
 *     counter. (This one was true for a different reason, which is worse:
 *     a real bug hid behind a bad measurement.)
 *   - "The halfway house is worse than nothing."    Measured against
 *     revenue with the wages left out.
 *   - "A mismatched menu earns more."               Measured with an
 *     overloaded kitchen on one side and not the other.
 *   - "The cart beats the halfway house."           Measured charging a
 *     drinks-only cart for a cook it does not need.
 *
 * The shape is always the same: **a thing measured where it cannot work,
 * and the result reported as a property of the thing.** Every one of them
 * came from a script that invented its own baseline inline, in a hurry,
 * with the baseline chosen to be easy rather than representative.
 *
 * So the baselines live here, named, with their limits written down next
 * to them. A measurement that names its scenario is a measurement whose
 * assumptions can be checked by someone else — including by whoever
 * reads the number in six weeks and does not remember how it was taken.
 *
 * The rule this encodes: **never measure a purchase on the opening
 * three-hole course.** It has no congestion, no clientele and no
 * amenities, so every hire and every building measures as worthless on
 * it. That configuration produced four of the six errors above.
 *
 * A seventh, found later and worth its own paragraph because it happened
 * *in this file*: every fixture below was named "Nine" and built
 * eighteen. `newGame` lays out eighteen hole slots -- the data model was
 * widened for Act II's back nine long before Act II existed -- and
 * `finishTheCourse` opened all of them. The difference is not cosmetic:
 *
 *     nine holes    +$598/day profit   satisfaction 41   round 181 min
 *     eighteen      -$2,072/day        satisfaction 33   round 356 min
 *
 * So every amenity price in `tools/effects.js` was set against a
 * loss-making resort with a six-hour round, and the "a finished nine runs
 * at about 35 satisfaction" quoted in `src/sim/acts.js` is the eighteen's
 * number. A fixture that lies in its own name is worse than one with
 * documented limits, because nobody thinks to check it.
 */
import { newGame, amenity } from '../src/sim/state.js';
import { makeHole } from '../src/sim/hole.js';
import { TEMPLATE_NAMES } from '../src/sim/templates.js';
import { menuPrep } from '../src/sim/menu.js';
import { BASE_CAPACITY, PER_COOK } from '../src/sim/kitchen.js';
import { GATE_THRESHOLDS } from '../src/sim/acts.js';

/**
 * Builds and opens the first `count` holes, leaving the rest as stubs.
 *
 * Defaults to a nine, taken from the gate itself rather than from a
 * literal or from the renderer's grid -- the gate is what defines a
 * finished Act I course, so a fixture claiming to be one should be
 * whatever the gate currently asks for. It used to build every slot
 * `newGame` lays out, which is eighteen.
 */
function finishTheCourse(state, count = GATE_THRESHOLDS.holesOpen) {
  const holes = state.resort.courses[0].holes;
  for (let i = 0; i < Math.min(count, holes.length); i++) {
    holes[i] = { ...makeHole(TEMPLATE_NAMES[i % TEMPLATE_NAMES.length], holes[i].id), open: true };
  }
  return state;
}

/**
 * Hires exactly the cooks the current boards need, and no more.
 *
 * Call this after adding food amenities in any comparison involving them.
 * Comparing a staffed kitchen against an unstaffed one measures the
 * kitchen, not whatever you thought you were measuring — which is how a
 * destination menu came to look like it out-earned a locals one.
 */
export function staffTheKitchen(state) {
  const load = state.resort.amenities.reduce((t, a) => t + menuPrep(a.menu), 0);
  const needed = Math.max(0, Math.ceil((load - BASE_CAPACITY) / PER_COOK));
  const have = state.resort.staff.filter((m) => m.role === 'kitchenStaff').length;
  for (let i = have; i < needed; i++) state.resort.staff.push({ role: 'kitchenStaff' });
  return state;
}

/**
 * Day one. Three modest holes, a clubhouse, nobody much.
 *
 * **Measures:** the opening experience, and only that.
 * **Cannot measure:** the worth of anything you buy. There is no
 * congestion for a marshal to relieve, no crowd for an amenity to serve
 * and no kitchen for a cook to run, so every purchase comes back
 * worthless. Four of the six errors in this file's header came from here.
 */
export function openingResort(seed = 1) {
  return newGame(seed);
}

/**
 * A finished nine with a real crowd, an empty amenity list and enough
 * groundskeepers to hold the turf.
 *
 * **Measures:** what one purchase is worth in isolation — the first thing
 * a player builds.
 * **Cannot measure:** what anything is worth alongside the rest. Every
 * amenity raises perceived value, which raises demand, which congests the
 * course, so they interact strongly. Use `builtOutNine` for that.
 */
export function bareNine(seed = 1) {
  const state = finishTheCourse(newGame(seed));
  state.money = 150000;
  state.prestige = 60;
  state.resort.pricing.greenFee = 80;
  state.resort.pricing.teeInterval = 13;
  for (let i = 0; i < 3; i++) state.resort.staff.push({ role: 'groundskeeper' });
  return state;
}

/**
 * The same nine with every amenity on it and the staff to run them.
 *
 * **Measures:** marginal value — what a thing is worth as the last
 * purchase rather than the first, which is how a player late in an act
 * actually experiences it.
 * **Cannot measure:** the early game. Everything here is already paid for.
 */
export function builtOutNine(seed = 1, { except = null } = {}) {
  const state = bareNine(seed);
  for (const type of ['proShop', 'snackShack', 'halfwayHouse', 'restaurant',
    'restrooms', 'drivingRange', 'practiceGreen', 'cartBarn', 'beverageCart']) {
    if (type === except) continue;
    state.resort.amenities.push(amenity(type));
  }
  state.resort.staff.push({ role: 'shopStaff' });
  return staffTheKitchen(state);
}

/**
 * A finished nine deliberately jammed: a tight tee sheet and a crowd that
 * cannot get round.
 *
 * **Measures:** anything whose job is pace — marshals, the cart barn, the
 * beverage cart's time-free stop. These are worth nothing on an empty
 * course and that is correct, not a fault.
 * **Cannot measure:** amenities whose value is revenue per head, which
 * this configuration depresses by making everybody miserable.
 */
export function jammedNine(seed = 1) {
  const state = bareNine(seed);
  state.prestige = 75;
  state.resort.pricing.teeInterval = 9;
  return state;
}

/**
 * Every scenario, for tools that want to sweep them, with a one-line
 * summary of what a number taken here is worth.
 */
export const SCENARIOS = {
  openingResort: { build: openingResort, use: 'the opening experience, and nothing else' },
  bareNine: { build: bareNine, use: 'one purchase in isolation' },
  builtOutNine: { build: builtOutNine, use: 'marginal value alongside everything else' },
  jammedNine: { build: jammedNine, use: 'anything whose job is pace' },
};
