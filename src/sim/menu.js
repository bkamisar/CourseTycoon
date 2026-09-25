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

  // The brew pub's list. Nine of these do nothing the three above did not
  // already do mechanically -- they are here because a brew pub with
  // three beers is not a brew pub, and choosing between a cask bitter and
  // a sour is the kind of small decision this game is for. They still
  // carry real appeal profiles, because an item that pleased everyone
  // equally would be the one right answer and there are no others here.
  //
  // None of them is cartable. A cart carries cans and bottles; it does
  // not carry a stemmed goblet of sour ale. That is thematically obvious
  // and it is also load-bearing -- made cartable, the upmarket ones
  // pushed the beverage cart's pull with destination guests from 0.68 to
  // 0.84 and broke the ceiling the cart is supposed to have.
  ['pilsner',           'Crisp pilsner',      'drink',  6,  1.8, 0, false,  0.90, 0.55, 0.45, 2,  4],
  ['caskBitter',        'Cask bitter',        'drink',  8,  2.5, 0, false,  0.85, 0.80, 0.35, 3,  4],
  ['stout',             'Dry stout',          'drink',  9,  3,   0, false,  0.55, 0.75, 0.55, 3,  5],
  ['hazyIpa',           'Hazy IPA',           'drink', 12,  4.5, 0, false,  0.35, 0.85, 0.80, 3,  4],
  ['sourAle',           'Sour ale',           'drink', 13,  5,   0, false,  0.15, 0.60, 0.90, 3,  4],
  ['hefeweizen',        'Wheat beer',         'drink', 10,  3.5, 0, false,  0.60, 0.65, 0.75, 3,  4],
  ['brownAle',          'Brown ale',          'drink',  8,  2.8, 0, false,  0.80, 0.70, 0.40, 3,  4],
  ['porter',            'Porter',             'drink', 10,  3.5, 0, false,  0.45, 0.75, 0.65, 3,  5],
  ['beerFlight',        'Tasting flight',     'drink', 16,  6,   0, false, 0.40, 0.70, 0.95, 4,  3],

  // The cocktail list. Ten of these are the bar's alone; the Water Hazard
  // and the John Daly are not, because they are golf drinks before they
  // are cocktails and belong anywhere on the property that pours -- the
  // cart included, which is why those two are the only cartable ones.
  ['waterHazard',       'Water Hazard',       'drink', 12,  4,   0, true,  0.85, 0.70, 0.75, 4,  4],
  ['johnDaly',          'John Daly',          'drink', 11,  3.5, 0, true,  0.90, 0.75, 0.60, 4,  5],
  ['screwdriver',       'Screwdriver',        'drink', 10,  3,   0, false, 0.70, 0.40, 0.55, 3,  5],
  ['ginTonic',          'Gin and tonic',      'drink', 11,  3.5, 0, false, 0.60, 0.75, 0.75, 3,  4],
  ['azalea',            'Azalea',             'drink', 13,  4.5, 0, false, 0.30, 0.55, 0.95, 4,  4],
  ['margarita',         'Margarita',          'drink', 13,  4.5, 0, false, 0.65, 0.50, 0.80, 4,  4],
  ['whiskeySour',       'Whiskey sour',       'drink', 13,  4.5, 0, false, 0.55, 0.70, 0.80, 4,  4],
  ['oldFashioned',      'Old fashioned',      'drink', 14,  5,   0, false, 0.50, 0.80, 0.85, 4,  3],
  ['negroni',           'Negroni',            'drink', 14,  5,   0, false, 0.20, 0.60, 0.95, 4,  3],
  ['manhattan',         'Manhattan',          'drink', 15,  5.5, 0, false, 0.35, 0.75, 0.90, 4,  3],
  ['martini',           'Martini',            'drink', 15,  5.5, 0, false, 0.25, 0.65, 0.95, 4,  3],
  ['espressoMartini',   'Espresso martini',   'drink', 16,  6,   1, false, 0.30, 0.55, 1.00, 4,  5],
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
  // The hotel's three. Eleven of the fourteen hotel buildings were pure
  // appeal -- they made a crowd likelier to turn up and did nothing else
  // -- which made the hotel a second appeal slider rather than a place
  // with things in it. These three sell food and drink, so they get the
  // system that already exists for selling food and drink.
  fineDining: 5,
  // Eight, because the brew pub's whole point is the list. Four slots
  // against twelve styles meant most of them never got poured, and a
  // choice you make once and never revisit is not much of a choice.
  brewPub: 8,
  // Eight here too. Thirteen cocktails against four slots would mean most
  // of the list never gets poured, which is the same waste the brew pub
  // had.
  cocktailBar: 8,
});

/** Which amenities serve food at all. Order matters: it is the order the
 * Amenities sheet lists their menus in. */
export const FOOD_AMENITIES = Object.freeze(Object.keys(MENU_SLOTS));

/**
 * What `type` is allowed to serve. A snack shack has a microwave and a
 * cooler, not a line; a cart can only carry what survives the trip.
 */
/**
 * The brew pub's own list, poured nowhere else.
 *
 * Exclusivity is what makes the brew pub a place rather than a second
 * bar. Without it these nine simply widen every drinks board in the
 * resort, the cocktail bar ends up serving cask bitter, and building the
 * pub buys you nothing you could not already pour. With it, the pub is
 * the only way to get any of them, which is worth $24,000 of anybody's
 * money.
 */
export const BREW_PUB_ONLY = Object.freeze(new Set([
  'pilsner', 'caskBitter', 'stout', 'hazyIpa', 'sourAle',
  'hefeweizen', 'brownAle', 'porter', 'beerFlight',
]));

/**
 * The cocktail bar's own, on the same principle.
 *
 * The Water Hazard, the John Daly and the Transfusion are deliberately
 * NOT here. They are golf drinks before they are cocktails — the sort of
 * thing a halfway house pours and a cart carries — and locking them
 * behind a hotel bar would take three of the best drinks in the game away
 * from Act I entirely.
 */
export const COCKTAIL_BAR_ONLY = Object.freeze(new Set([
  'screwdriver', 'ginTonic', 'azalea', 'margarita', 'whiskeySour',
  'oldFashioned', 'negroni', 'manhattan', 'martini', 'espressoMartini',
]));

/** The list a venue owns outright, if it owns one. */
export function exclusiveTo(type) {
  if (type === 'brewPub') return BREW_PUB_ONLY;
  if (type === 'cocktailBar') return COCKTAIL_BAR_ONLY;
  return null;
}

export function itemsFor(type) {
  if (!MENU_SLOTS[type]) return [];
  return ITEM_IDS.filter((id) => {
    const item = ITEMS[id];
    if (BREW_PUB_ONLY.has(id)) return type === 'brewPub';
    if (COCKTAIL_BAR_ONLY.has(id)) return type === 'cocktailBar';
    if (type === 'snackShack') return item.prep <= 1;
    if (type === 'beverageCart') return item.cartable;
    // A dining room is not a place you order a hot dog, and price alone
    // does not say so -- a $15 burger and chips clears any sane price
    // line and does not belong. What belongs is what the people the room
    // exists for actually want, so the test is destination appeal.
    if (type === 'fineDining') return item.appeal.destination >= 0.7;
    // Beer and something to eat with it. Wine and espresso belong next
    // door; everything else a pub would pour is fair game, and the food
    // stops where a plate starts needing a tablecloth.
    if (type === 'brewPub') {
      if (item.kind === 'drink') return id !== 'wineByGlass' && id !== 'espresso';
      return item.price <= 16;
    }
    // Drinks only, which is the whole idea of a bar.
    if (type === 'cocktailBar') return item.kind === 'drink';
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


/**
 * Who a venue's opening board is aimed at.
 *
 * Every default used to be sorted by what locals want, which is right for
 * a hut on the ninth and wrong for a hotel dining room: a cocktail bar
 * opened stocked with domestic cans and an arnold palmer. A board the
 * player has to fix before it makes any sense teaches them the system is
 * broken rather than that it is theirs to set.
 */
export const MENU_AUDIENCE = Object.freeze({
  snackShack: 'locals',
  halfwayHouse: 'locals',
  restaurant: 'locals',
  beverageCart: 'locals',
  fineDining: 'destination',
  brewPub: 'locals',
  cocktailBar: 'destination',
});
