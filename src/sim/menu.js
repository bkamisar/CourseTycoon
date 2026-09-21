/**
 * What the resort serves, and what that is worth.
 *
 * The decision here is the same one the course already asks, in a
 * different accent: locals want a cheap beer and something hot, guests
 * want a proper lunch, and the crowd was decided hours earlier by the
 * holes the player built. Food must never become a second optimisation
 * problem sitting beside the golf, which is why nothing in this file
 * rewards a menu on its own terms — only on how well it fits who turned
 * up (see spec §2).
 *
 * Pure data and pure maths. No randomness, no clock, no DOM.
 */
import { clamp } from './hole.js';
import { SEGMENT_KEYS } from './segments.js';

/**
 * The catalogue.
 *
 * `prep` is kitchen-line load during service, not effort in general: a
 * wrap assembled at seven in the morning is prep 0, a sandwich cooked to
 * order is not. `cartable` means it can be handed over from a moving cart,
 * held hot in a warmer or cold in a cooler - so a hot dog qualifies and an
 * espresso does not. The two are independent: a hot dog on the cart still
 * has to be cooked, which is what stops the cart being kitchen-free by
 * nature rather than by the player's choice.
 *
 * `energy` is how much of a tiring golfer the item gives back. It is the
 * reason hot food is worth carrying: appeal barely moves when you add a
 * hot dog to a cart that is already full of things locals like, but the
 * people who buy one play faster afterwards, and pace is what this game
 * is about (spec §7.1).
 */
const ITEM_LIST = [
  // id, name, kind, price, cost, prep, cartable, L, S, G, sat, energy
  ['domesticCan',       'Can of domestic',    'drink',  5,  1.5, 0, true,  1.00, 0.40, 0.15, 1,  4],
  ['draught',           'Cold draught',       'drink',  7,  2,   0, true,  1.00, 0.60, 0.40, 2,  4],
  ['craftAle',          'Craft ale',          'drink', 11,  4,   0, true,  0.50, 0.80, 0.70, 3,  4],
  ['arnoldPalmer',      'Arnold Palmer',      'drink',  5,  1,   0, true,  0.80, 0.70, 0.60, 2,  5],
  ['bottledWater',      'Bottled water',      'drink',  3,  0.5, 0, true,  0.60, 0.90, 0.50, 1,  5],
  ['transfusion',       'Transfusion',        'drink', 12,  5,   0, true,  0.90, 0.80, 0.70, 4,  5],
  ['espresso',          'Espresso',           'drink',  4,  1,   1, false, 0.30, 0.60, 0.90, 2,  6],
  ['wineByGlass',       'Wine by the glass',  'drink', 14,  5,   0, false, 0.10, 0.30, 1.00, 3,  3],
  ['candyBar',          'Candy bar',          'food',   3,  1,   0, true,  0.80, 0.50, 0.20, 1,  6],
  ['trailMix',          'Trail mix',          'food',   5,  2,   0, true,  0.40, 0.80, 0.40, 2,  7],
  ['turkeyWrap',        'Turkey wrap',        'food',  12,  4,   0, true,  0.50, 0.80, 0.60, 3,  9],
  ['chickenCaesarWrap', 'Chicken Caesar wrap','food',  14,  5,   0, true,  0.60, 0.85, 0.60, 3,  9],
  ['hotDog',            'Hot dog',            'food',   9,  3,   1, true,  1.00, 0.50, 0.20, 2, 12],
  ['breakfastSandwich', 'Breakfast sandwich', 'food',   8,  2.5, 2, true,  0.90, 0.80, 0.40, 3, 13],
  ['chiliBowl',         'Bowl of chili',      'food',  10,  3,   2, false, 0.90, 0.50, 0.30, 3, 13],
  ['burgerFries',       'Burger and fries',   'food',  15,  5,   2, false, 0.90, 0.60, 0.40, 4, 14],
  ['clubSandwich',      'Club sandwich',      'food',  16,  5,   2, false, 0.60, 0.80, 0.70, 4, 11],
  ['seasonalSalad',     'Seasonal salad',     'food',  14,  4,   2, false, 0.20, 0.50, 0.80, 3,  7],
  ['oysters',           'Half dozen oysters', 'food',  24,  9,   3, false, 0.05, 0.25, 1.00, 5,  6],
  ['lobsterRoll',       'Lobster roll',       'food',  28, 11,   3, false, 0.10, 0.40, 1.00, 6, 11],
  ['steakFrites',       'Steak frites',       'food',  42, 16,   4, false, 0.05, 0.30, 1.00, 7, 15],
];

export const ITEMS = Object.freeze(Object.fromEntries(
  ITEM_LIST.map(([id, name, kind, price, cost, prep, cartable, l, s, d, sat, energy]) => [
    id,
    Object.freeze({
      id, name, kind, price, cost, prep, cartable,
      appeal: Object.freeze({ locals: l, serious: s, destination: d }),
      satisfaction: sat, energy,
    }),
  ])
));

/** Catalogue order, which is also the order the board offers them in. */
export const ITEM_IDS = Object.freeze(ITEM_LIST.map(([id]) => id));

/** How many things each amenity can put on its board. */
export const MENU_SLOTS = Object.freeze({
  snackShack: 3,
  halfwayHouse: 5,
  restaurant: 7,
  beverageCart: 4,
});

/** Which amenities serve food at all. Order matters: it is the order the
 * Amenities sheet lists their menus in. */
export const FOOD_AMENITIES = Object.freeze(Object.keys(MENU_SLOTS));

/**
 * What `type` is allowed to serve. A snack shack has a microwave and a
 * cooler, not a line; a cart can only carry what survives the trip.
 */
export function itemsFor(type) {
  if (!MENU_SLOTS[type]) return [];
  return ITEM_IDS.filter((id) => {
    const item = ITEMS[id];
    if (type === 'snackShack') return item.prep <= 1;
    if (type === 'beverageCart') return item.cartable;
    return true;
  });
}

/** Every item on `menu` that the catalogue actually knows about. A saved
 * game can name an item a later catalogue removed, and a menu board that
 * throws is worse than one that quietly serves less. */
function resolve(menu) {
  return (menu ?? []).map((id) => ITEMS[id]).filter(Boolean);
}

/**
 * How much of this board a crowd actually wants, 0..1.
 *
 * The mean decides it, lifted halfway toward the best thing on the menu.
 * Reading only the best item - which an earlier draft did - let a single
 * burger on a board of oysters and steak score 1.00 with locals, and 87%
 * of five-slot menus then pleased all three crowds at once. A golfer
 * looking at a board where one item in five is for them is not being
 * catered to, and the mean is what says so.
 */
export function menuPull(menu, segment) {
  const items = resolve(menu);
  if (items.length === 0) return 0;
  const appeals = items.map((i) => i.appeal[segment] ?? 0);
  const best = Math.max(...appeals);
  const mean = appeals.reduce((s, a) => s + a, 0) / appeals.length;
  return clamp(mean + 0.5 * (best - mean), 0, 1);
}

/** Weighted by appetite rather than by menu position: what they would pick
 * decides the average, not what happens to be listed. */
function weightedAverage(menu, segment, field) {
  const items = resolve(menu);
  let numerator = 0;
  let weight = 0;
  for (const item of items) {
    const a = item.appeal[segment] ?? 0;
    numerator += item[field] * a;
    weight += a;
  }
  return weight > 0 ? numerator / weight : 0;
}

/** The average price of what this crowd would actually buy. */
export function menuBasket(menu, segment) {
  return weightedAverage(menu, segment, 'price');
}

/** The same average over what those items cost the resort to serve. */
export function menuCogs(menu, segment) {
  return weightedAverage(menu, segment, 'cost');
}

/** Kitchen-line load, summed. See kitchen.js for what it is measured against. */
export function menuPrep(menu) {
  return resolve(menu).reduce((s, i) => s + i.prep, 0);
}

/** What the most restorative thing on the board gives a tiring golfer back. */
export function menuBestEnergy(menu) {
  const items = resolve(menu);
  return items.length ? Math.max(...items.map((i) => i.energy)) : 0;
}

/** What having this board at all is worth to a guest of `segment`, as a
 * satisfaction contribution: a board they want counts, one they do not
 * barely registers. Used by day.js's satisfaction pass (Task 6). */
export function menuSatisfaction(menu, segment) {
  const items = resolve(menu);
  if (!items.length) return 0;
  return items.reduce(
    (s, i) => Math.max(s, i.satisfaction * (i.appeal[segment] ?? 0)), 0
  );
}

