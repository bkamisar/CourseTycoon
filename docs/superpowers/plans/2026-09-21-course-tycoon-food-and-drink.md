# Course Tycoon — Food and Drink Implementation Plan (stages 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make what a player puts on the menu decide what the resort earns and how fast a round plays, on a screen that is mostly pixel art.

**Architecture:** A pure item catalogue and menu maths in `src/sim/menu.js`, read by `economy.js` for revenue and by `day.js` for kitchen load and refuel energy. Menus live on `state.resort.amenities[i].menu`. Art is grid data in `src/render/food.js`, rendered into small canvases inside a DOM sheet — the same split `sprites.js` and `panels.js` already use.

**Tech Stack:** Vanilla ES modules, `node --test`, canvas 2D, no build step.

**Spec:** `docs/superpowers/specs/2026-09-21-course-tycoon-food-and-drink-design.md`
**Scope:** Stages 1–4 of spec §11. The beverage cart, Dee, the cart on canvas and the balance pass are a separate later plan.

**Commits:** End every commit message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never `git push`, `git fetch` or `git pull`. **Stage by naming paths** — never `git add -A`.

---

## Hard rules

- `src/sim/` stays pure: no `Math.random`, no `Date.now`, no DOM, no imports from `render`/`ui`/`audio`. `tests/purity.test.js` enforces it.
- The UI never computes game outcomes, and **never retypes a price**. Every number on the menu board comes from `src/sim/menu.js`. The recurring bug on this project is the interface disagreeing with the simulation, and a menu is a screen made entirely of prices.
- No raw hex outside `src/render/palette.js`.
- Touch targets ≥44px; works at **375×812 and 390×664**.
- All 417 existing tests stay green. **Never weaken an assertion to make something pass.**
- **Read the failure count** from `node --test`'s summary. Run bare `node --test` — `node --test tests/` fails on this machine (Node 24 + Windows, MODULE_NOT_FOUND).
- Gate commits with `node --test > /dev/null 2>&1 && git commit ...`. Never pipe to `grep` and then `&&` — the pipe reports grep's exit code and commits over failures.

## File structure

| File | Responsibility |
|---|---|
| `src/sim/menu.js` | **New.** Item catalogue, slots, pull/basket/cogs/prep/energy. Pure data + maths. |
| `src/sim/kitchen.js` | **New.** Load, capacity, `serviceFactor`. Separate from `menu.js` because it is about staffing, not food. |
| `src/sim/economy.js` | *Modify.* `dailyRevenue` reads menus instead of flat `spendPerGuest`. |
| `src/sim/state.js` | *Modify.* Amenities carry a `menu`; saves without one get a default. |
| `src/sim/day.js` | *Modify.* Kitchen load, menu-driven refuel energy, food cost on the report. |
| `src/sim/satisfaction.js` | *Modify.* A penalty and a complaint when the kitchen cannot keep up. |
| `src/sim/round.js` | *Modify.* `refuel` takes a target rather than using a constant. |
| `src/render/palette.js` | *Modify.* Five food colours. |
| `src/render/food.js` | **New.** Twenty-one 12×12 sprites + a canvas renderer. |
| `src/ui/menuBoard.js` | **New.** The board sheet. |
| `src/ui/panels.js` | *Modify.* A "Menu" button on each food amenity row. |
| `tests/menu.test.js`, `tests/kitchen.test.js`, `tests/food.test.js` | New suites. |

---

## Task 1: The item catalogue — TEST FIRST

**Files:** Create `src/sim/menu.js`, `tests/menu.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, MENU_SLOTS, itemsFor } from '../src/sim/menu.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';

test('there are twenty-one items, each fully specified', () => {
  assert.equal(ITEM_IDS.length, 21);
  for (const id of ITEM_IDS) {
    const item = ITEMS[id];
    assert.ok(item, `${id} missing`);
    assert.equal(item.id, id, `${id}: id does not match its key`);
    assert.ok(item.name && item.name.length > 2, `${id}: no name`);
    assert.ok(item.kind === 'food' || item.kind === 'drink', `${id}: bad kind`);
    assert.ok(item.price > 0, `${id}: no price`);
    assert.ok(item.cost > 0 && item.cost < item.price, `${id}: cost must be positive and under price`);
    assert.ok(Number.isInteger(item.prep) && item.prep >= 0, `${id}: bad prep`);
    assert.equal(typeof item.cartable, 'boolean', `${id}: cartable must be explicit`);
    assert.ok(item.energy > 0, `${id}: no energy`);
    assert.ok(item.satisfaction > 0, `${id}: no satisfaction`);
    for (const key of SEGMENT_KEYS) {
      const a = item.appeal[key];
      assert.ok(a >= 0 && a <= 1, `${id}: appeal.${key} out of range`);
    }
  }
});

test('no item is good for every crowd', () => {
  // The guarantee one level down from segments: if any single item pleased
  // all three, stocking it would end the decision this whole slice exists for.
  for (const id of ITEM_IDS) {
    const a = ITEMS[id].appeal;
    const universal = SEGMENT_KEYS.every((k) => a[k] >= 0.8);
    assert.ok(!universal, `${id} pleases every crowd: ${JSON.stringify(a)}`);
  }
});

test('nothing that needs a plate rides on a cart', () => {
  // The line between grab-and-go and table service. Without it the cart
  // quietly becomes a restaurant on wheels.
  for (const id of ITEM_IDS) {
    if (ITEMS[id].prep >= 3) {
      assert.equal(ITEMS[id].cartable, false, `${id} has prep 3+ and is cartable`);
    }
  }
});

test('a kitchen-free cart is always possible', () => {
  // The all-drinks board is the choice that makes the cart interesting.
  // It must not silently stop existing next time the catalogue is edited.
  const free = ITEM_IDS.filter((id) => ITEMS[id].cartable && ITEMS[id].prep === 0);
  assert.ok(free.length >= MENU_SLOTS.beverageCart,
    `only ${free.length} prep-free cartable items for ${MENU_SLOTS.beverageCart} cart slots`);
});

test('every crowd has enough it wants that a menu is never forced', () => {
  for (const key of SEGMENT_KEYS) {
    const wanted = ITEM_IDS.filter((id) => ITEMS[id].appeal[key] >= 0.6);
    assert.ok(wanted.length >= MENU_SLOTS.restaurant + 2,
      `${key} wants only ${wanted.length} items; the ${MENU_SLOTS.restaurant}-slot restaurant would be nearly forced`);
  }
});

test('each amenity accepts the right items', () => {
  const shack = itemsFor('snackShack');
  assert.ok(shack.every((id) => ITEMS[id].prep <= 1), 'snack shack has no line cook');
  const cart = itemsFor('beverageCart');
  assert.ok(cart.every((id) => ITEMS[id].cartable), 'cart got something it cannot carry');
  assert.equal(itemsFor('restaurant').length, 21, 'the restaurant can serve anything');
  assert.deepEqual(itemsFor('proShop'), [], 'the pro shop sells no food');
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `Cannot find module '../src/sim/menu.js'`.

- [ ] **Step 3: Write `src/sim/menu.js`.**

```js
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
```

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS. Failure count 0.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/menu.js tests/menu.test.js && git commit -m "Write the food and drink catalogue: twenty-one items, none good for everybody

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Pull, basket and the no-universal-menu guarantee — TEST FIRST

**Files:** Modify `src/sim/menu.js`; extend `tests/menu.test.js`

This task contains the single most important assertion in the slice. An
earlier formula let 87% of menus please every crowd and every individual
number still looked reasonable, so the sweep is the only thing that catches it.

- [ ] **Step 1: Write the failing tests.** Append to `tests/menu.test.js`:

```js
import {
  menuPull, menuBasket, menuCogs, menuPrep, menuBestEnergy, menuSatisfaction,
} from '../src/sim/menu.js';

const LOCALS = ['hotDog', 'draught', 'candyBar'];
const GUESTS = ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'];

test('an empty menu pulls nobody and costs nothing', () => {
  for (const key of SEGMENT_KEYS) {
    assert.equal(menuPull([], key), 0);
    assert.equal(menuBasket([], key), 0);
    assert.equal(menuCogs([], key), 0);
  }
  assert.equal(menuPrep([]), 0);
  assert.equal(menuBestEnergy([]), 0);
});

test('a menu pulls the crowd it was built for and not the others', () => {
  assert.ok(menuPull(LOCALS, 'locals') > 0.9, 'locals menu should pull locals');
  assert.ok(menuPull(LOCALS, 'destination') < 0.4, 'locals menu should not pull guests');
  assert.ok(menuPull(GUESTS, 'destination') > 0.9, 'guest menu should pull guests');
  assert.ok(menuPull(GUESTS, 'locals') < 0.3, 'guest menu should not pull locals');
});

test('a mostly-wrong menu reads as wrong, however good its best item is', () => {
  // The bug the first formula had: one burger on a board of oysters and
  // steak scored 1.00 with locals, because only the best item was read.
  const oneBurger = ['burgerFries', 'oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass'];
  assert.ok(menuPull(oneBurger, 'locals') < 0.6,
    `one locals item in five should not satisfy locals, got ${menuPull(oneBurger, 'locals')}`);
});

test('basket is the average price of what that crowd would actually buy', () => {
  // Locals: hot dog $9 x1.0, draught $7 x1.0, candy $3 x0.8
  //         = (9 + 7 + 2.4) / 2.8 = 6.571...
  assert.ok(Math.abs(menuBasket(LOCALS, 'locals') - 6.571) < 0.01);
  // Guests barely want any of it, but the weighting still works.
  assert.ok(menuBasket(LOCALS, 'destination') > 0);
});

test('cogs tracks basket, always below it', () => {
  for (const key of SEGMENT_KEYS) {
    assert.ok(menuCogs(GUESTS, key) < menuBasket(GUESTS, key),
      `${key}: serving cost must be under the price`);
  }
});

test('prep sums, and the best energy on the board is what a stop gives back', () => {
  assert.equal(menuPrep(LOCALS), 1);                 // hot dog 1, others 0
  assert.equal(menuBestEnergy(LOCALS), 12);          // the hot dog
  assert.equal(menuBestEnergy(['draught', 'candyBar']), 6);
});

test('NO MENU PLEASES EVERY CROWD — swept exhaustively', () => {
  // The guarantee the whole design rests on. Sweeping is the only way to
  // find a failure here: a formula that breaks this still produces
  // individually sensible-looking numbers for every menu you spot-check.
  function* combinations(pool, size, start = 0, acc = []) {
    if (acc.length === size) { yield acc; return; }
    for (let i = start; i < pool.length; i++) {
      yield* combinations(pool, size, i + 1, [...acc, pool[i]]);
    }
  }
  for (const type of ['snackShack', 'halfwayHouse', 'restaurant', 'beverageCart']) {
    const pool = itemsFor(type);
    let checked = 0;
    for (const menu of combinations(pool, MENU_SLOTS[type])) {
      checked++;
      const worst = Math.min(...SEGMENT_KEYS.map((k) => menuPull(menu, k)));
      assert.ok(worst < 0.85,
        `${type}: ${menu.join(' + ')} pleases every crowd (worst pull ${worst.toFixed(2)})`);
    }
    assert.ok(checked > 200, `${type}: only ${checked} menus swept — pool or slots wrong?`);
  }
});

test('a cart can never satisfy destination guests', () => {
  // Not declared anywhere — it falls out of the fact that what guests want
  // is exactly what cannot ride on a cart. Pinned because it is what gives
  // the restaurant and the cart distinct jobs.
  function* combinations(pool, size, start = 0, acc = []) {
    if (acc.length === size) { yield acc; return; }
    for (let i = start; i < pool.length; i++) yield* combinations(pool, size, i + 1, [...acc, pool[i]]);
  }
  let best = 0;
  for (const menu of combinations(itemsFor('beverageCart'), MENU_SLOTS.beverageCart)) {
    best = Math.max(best, menuPull(menu, 'destination'));
  }
  assert.ok(best < 0.75, `a cart reached ${best.toFixed(2)} pull with guests; it should top out near 0.68`);
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `menuPull is not a function`.

- [ ] **Step 3: Append the maths to `src/sim/menu.js`.**

```js
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
```

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS. The sweep test checks 286 + 20,349 + 116,280 + 495 menus and takes a second or two.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/menu.js tests/menu.test.js && git commit -m "Decide what a menu is worth by how much of it the crowd wants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: The kitchen — TEST FIRST

**Files:** Create `src/sim/kitchen.js`, `tests/kitchen.test.js`

`kitchenStaff` has existed in `economy.js` as a $180/day wage that nothing
reads. This is what reads it.

- [ ] **Step 1: Write the failing tests.**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitchenCapacity, kitchenLoad, serviceFactor, BASE_CAPACITY, PER_COOK } from '../src/sim/kitchen.js';

test('an unstaffed kitchen still does a little', () => {
  assert.equal(kitchenCapacity([]), BASE_CAPACITY);
});

test('each cook adds capacity', () => {
  const staff = [{ role: 'kitchenStaff' }, { role: 'kitchenStaff' }];
  assert.equal(kitchenCapacity(staff), BASE_CAPACITY + 2 * PER_COOK);
});

test('only cooks count toward the kitchen', () => {
  const staff = [{ role: 'groundskeeper' }, { role: 'marshal' }, { role: 'shopStaff' }];
  assert.equal(kitchenCapacity(staff), BASE_CAPACITY);
});

test('load sums prep across every menu in the resort', () => {
  const amenities = [
    { type: 'halfwayHouse', menu: ['hotDog', 'draught'] },   // 1 + 0
    { type: 'restaurant', menu: ['steakFrites', 'oysters'] }, // 4 + 3
  ];
  assert.equal(kitchenLoad(amenities), 8);
});

test('amenities without a menu contribute nothing', () => {
  assert.equal(kitchenLoad([{ type: 'restrooms' }, { type: 'proShop', menu: undefined }]), 0);
});

test('a kitchen inside its capacity serves at full speed', () => {
  assert.equal(serviceFactor(4, 10), 1);
  assert.equal(serviceFactor(10, 10), 1);
});

test('an overloaded kitchen slows down, proportionally', () => {
  assert.ok(Math.abs(serviceFactor(20, 10) - 0.5) < 1e-9);
});

test('service never collapses entirely, however overloaded', () => {
  // A floor, because a resort that serves literally nobody is a bug report
  // rather than a difficulty setting.
  assert.equal(serviceFactor(1000, 3), 0.45);
});

test('a kitchen with no load is not a division by zero', () => {
  assert.equal(serviceFactor(0, 3), 1);
  assert.equal(serviceFactor(0, 0), 1);
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `Cannot find module '../src/sim/kitchen.js'`.

- [ ] **Step 3: Write `src/sim/kitchen.js`.**

```js
/**
 * How much food the resort can actually get out, and what happens when it
 * cannot keep up.
 *
 * This is the cost of breadth. A wide menu pleases every crowd a little
 * (see menu.js) and would otherwise be a free hedge against guessing the
 * clientele wrong; here it carries a wage bill instead. A narrow menu
 * aimed at the crowd the course actually draws runs on nobody.
 *
 * It is also what finally makes `kitchenStaff` mean something. The role
 * has existed in economy.js as a $180/day wage that no part of the game
 * read.
 */
import { menuPrep } from './menu.js';
import { clamp } from './hole.js';

/** What a resort manages with no cooks at all: a microwave and a cooler. */
export const BASE_CAPACITY = 3;

/** Prep capacity each kitchen hire adds. */
export const PER_COOK = 4;

/** Slowest the kitchen is allowed to get. A resort that serves nobody
 * reads as broken rather than as difficult. */
export const SERVICE_FLOOR = 0.45;

export function kitchenCapacity(staff = []) {
  const cooks = staff.filter((m) => m.role === 'kitchenStaff').length;
  return BASE_CAPACITY + cooks * PER_COOK;
}

export function kitchenLoad(amenities = []) {
  return amenities.reduce((s, a) => s + menuPrep(a.menu), 0);
}

/**
 * How much of what guests want to order actually reaches them. Scales both
 * revenue and the cost of goods - a kitchen that cannot cook it does not
 * buy it either - and drives the satisfaction penalty in day.js.
 */
export function serviceFactor(load, capacity) {
  if (load <= 0) return 1;
  if (load <= capacity) return 1;
  return clamp(capacity / load, SERVICE_FLOOR, 1);
}
```

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/kitchen.js tests/kitchen.test.js && git commit -m "Give kitchenStaff something to do: menu breadth now costs capacity

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Menus on the state — TEST FIRST

**Files:** Modify `src/sim/state.js`; extend `tests/state.test.js`

- [ ] **Step 1: Write the failing tests.** Append to `tests/state.test.js`:

```js
import { defaultMenuFor } from '../src/sim/state.js';
import { MENU_SLOTS, ITEMS, itemsFor } from '../src/sim/menu.js';

test('a newly built food amenity opens with a sensible default board', () => {
  for (const type of Object.keys(MENU_SLOTS)) {
    const menu = defaultMenuFor(type);
    assert.equal(menu.length, MENU_SLOTS[type], `${type}: wrong slot count`);
    const allowed = itemsFor(type);
    for (const id of menu) {
      assert.ok(ITEMS[id], `${type}: default names unknown item ${id}`);
      assert.ok(allowed.includes(id), `${type}: default serves something it cannot`);
    }
    assert.equal(new Set(menu).size, menu.length, `${type}: default repeats an item`);
  }
});

test('a non-food amenity has no menu', () => {
  assert.deepEqual(defaultMenuFor('restrooms'), []);
});

test('a save made before menus existed gets one', () => {
  // Never make an old save unloadable. The author plays on a phone and on
  // a desktop, and a save code moves between them.
  const old = JSON.stringify({
    day: 4, money: 1000, prestige: 10, turfQuality: 50,
    resort: {
      courses: [{ holes: [] }],
      amenities: [{ type: 'halfwayHouse' }, { type: 'restrooms' }],
      staff: [], pricing: { greenFee: 40, teeInterval: 10 },
    },
    history: [], satisfactionHistory: [],
  });
  const loaded = fromJSON(old);
  const halfway = loaded.resort.amenities.find((a) => a.type === 'halfwayHouse');
  assert.ok(Array.isArray(halfway.menu) && halfway.menu.length > 0,
    'an existing halfway house should come back with a board on it');
  const restrooms = loaded.resort.amenities.find((a) => a.type === 'restrooms');
  assert.deepEqual(restrooms.menu, []);
});
```

> If `tests/state.test.js` does not already import `fromJSON`, add it to that
> file's existing import from `../src/sim/state.js`.

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `defaultMenuFor is not a function`.

- [ ] **Step 3: Add to `src/sim/state.js`.** Import at the top:

```js
import { MENU_SLOTS, itemsFor, ITEMS } from './menu.js';
```

Then add:

```js
/**
 * The board a food amenity opens with.
 *
 * Deliberately a decent, obvious menu rather than an empty one: a newly
 * built halfway house that sells nothing looks broken, and the player
 * should discover the menu screen by improving something, not by
 * repairing it. Picked by appeal to locals, because locals are who a new
 * resort draws before it has a reputation.
 */
export function defaultMenuFor(type) {
  const slots = MENU_SLOTS[type];
  if (!slots) return [];
  return itemsFor(type)
    .slice()
    .sort((a, b) => ITEMS[b].appeal.locals - ITEMS[a].appeal.locals)
    .slice(0, slots);
}
```

In `newGame`, wherever an amenity object is created, give it
`menu: defaultMenuFor(type)`. In `fromJSON`, after the existing
back-compatibility block that fills in `goodwill` and `eventsSeen`, add:

```js
  // Saves from before menus existed have amenities with no board. Give
  // every one of them the default rather than leaving the field missing —
  // menuPrep and the menu board both read it, and an absent menu would
  // silently serve nothing.
  for (const amenity of parsed.resort?.amenities ?? []) {
    if (!Array.isArray(amenity.menu)) amenity.menu = defaultMenuFor(amenity.type);
  }
```

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/state.js tests/state.test.js && git commit -m "Put a board on every food amenity, including in old saves

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Revenue from menus — TEST FIRST

**Files:** Modify `src/sim/economy.js`; extend `tests/economy.test.js`

**The calibration rule governs this task.** A well-matched menu must earn
roughly what today's flat `spendPerGuest` earns. Menus add a way to be
wrong, not a way to earn more — otherwise every build cost and wage in the
game is retroactively too cheap and the Act I gate arrives early.

- [ ] **Step 1: Write the failing tests.** Append to `tests/economy.test.js`:

```js
import { menuRevenue, MENU_RATE, AMENITIES } from '../src/sim/economy.js';

const crowd = { locals: 60, serious: 25, destination: 15 }; // golfers, not groups

test('a matched menu earns about what the old flat rate did', () => {
  // The calibration rule: neutral for a player who chooses well.
  const amenities = [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }];
  const { revenue } = menuRevenue({ amenities, crowd, serviceFactor: 1 });
  const golfers = 60 + 25 + 15;
  const oldFlat = golfers * AMENITIES.halfwayHouse.spendPerGuest;
  assert.ok(Math.abs(revenue - oldFlat) / oldFlat < 0.25,
    `matched menu earned ${revenue.toFixed(0)} against the old flat ${oldFlat} — calibration drifted`);
});

test('a mismatched menu earns far less', () => {
  const matched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd, serviceFactor: 1,
  }).revenue;
  const mismatched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'] }],
    crowd, serviceFactor: 1,
  }).revenue;
  assert.ok(mismatched < matched * 0.7,
    `a destination board on a locals crowd earned ${mismatched.toFixed(0)} against ${matched.toFixed(0)}`);
});

test('an empty board earns nothing', () => {
  const { revenue, foodCost } = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: [] }], crowd, serviceFactor: 1,
  });
  assert.equal(revenue, 0);
  assert.equal(foodCost, 0);
});

test('the cost of goods is always well under the revenue', () => {
  const { revenue, foodCost } = menuRevenue({
    amenities: [{ type: 'restaurant', menu: ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad', 'clubSandwich', 'craftAle'] }],
    crowd, serviceFactor: 1,
  });
  assert.ok(foodCost > 0, 'serving food costs something');
  assert.ok(foodCost < revenue * 0.6, `margin too thin: ${foodCost} of ${revenue}`);
});

test('a slow kitchen cuts what is sold and what it cost to buy, together', () => {
  const full = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd, serviceFactor: 1,
  });
  const half = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd, serviceFactor: 0.5,
  });
  assert.ok(Math.abs(half.revenue - full.revenue / 2) < 1);
  assert.ok(Math.abs(half.foodCost - full.foodCost / 2) < 1,
    'food you could not cook is food you did not buy');
});

test('amenities that serve no food are skipped', () => {
  const { revenue } = menuRevenue({
    amenities: [{ type: 'restrooms', menu: [] }, { type: 'proShop' }], crowd, serviceFactor: 1,
  });
  assert.equal(revenue, 0);
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `menuRevenue is not a function`.

- [ ] **Step 3: Add to `src/sim/economy.js`.** Import at the top:

```js
import { MENU_SLOTS, menuPull, menuBasket, menuCogs } from './menu.js';
```

Then:

```js
/**
 * How much custom each food amenity generates per guest.
 *
 * Calibrated so a well-matched menu earns roughly what the flat
 * `spendPerGuest` it replaces already earned. That neutrality matters
 * more than any individual value: the whole economy - build costs, wages,
 * the Act I gate - was balanced against the old flat numbers, so if menus
 * were a revenue increase every cost in the game would be retroactively
 * too cheap. Menus add a way to be wrong, not a way to earn more.
 */
export const MENU_RATE = Object.freeze({
  snackShack: 1.3,
  halfwayHouse: 1.3,
  restaurant: 1.25,
  beverageCart: 1.3,
});

/**
 * What the resort's food and drink takes, and what it cost to serve.
 *
 * `crowd` is golfers per segment, not groups. Each segment is charged its
 * own pull and its own basket, because the whole point is that the same
 * board is worth different amounts to different people.
 */
export function menuRevenue({ amenities, crowd, serviceFactor = 1 }) {
  let revenue = 0;
  let foodCost = 0;
  for (const amenity of amenities) {
    const rate = MENU_RATE[amenity.type];
    if (!rate || !MENU_SLOTS[amenity.type]) continue;
    for (const key of SEGMENT_KEYS) {
      const heads = crowd?.[key] ?? 0;
      if (heads <= 0) continue;
      const pull = menuPull(amenity.menu, key);
      if (pull <= 0) continue;
      revenue += heads * pull * menuBasket(amenity.menu, key) * rate * serviceFactor;
      foodCost += heads * pull * menuCogs(amenity.menu, key) * rate * serviceFactor;
    }
  }
  return { revenue: Math.round(revenue), foodCost: Math.round(foodCost) };
}
```

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS. If the calibration test fails, adjust `MENU_RATE` for that
amenity — **do not** relax the 25% tolerance.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/economy.js tests/economy.test.js && git commit -m "Earn from what is on the board, calibrated to be revenue-neutral

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Wire menus into the day — TEST FIRST

**Files:** Modify `src/sim/day.js`, `src/sim/round.js`; extend `tests/day.test.js`

Two jobs: food revenue replaces the flat contribution, and **the best thing
on the halfway house board decides how much energy a stop gives back**,
which is what ties food to pace of play.

- [ ] **Step 1: Write the failing tests.** Append to `tests/day.test.js`:

```js
import { halfwayRestoreTo } from '../src/sim/day.js';
import { newGame } from '../src/sim/state.js';

test('what the halfway house serves decides how much of a round it gives back', () => {
  assert.ok(halfwayRestoreTo(['draught', 'bottledWater']) < halfwayRestoreTo(['burgerFries', 'draught']),
    'a board of beer should restore less than one with a hot meal on it');
});

test('a sensible halfway house menu lands near the old flat refuel', () => {
  // It was a flat 82 regardless of what was served. Near-neutral for a
  // player who stocks something hot; a real penalty for one who does not.
  const sensible = halfwayRestoreTo(['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries']);
  assert.ok(Math.abs(sensible - 82) <= 6, `sensible menu restores to ${sensible}, expected near 82`);
});

test('the halfway house restore is bounded at both ends', () => {
  assert.ok(halfwayRestoreTo([]) >= 60);
  assert.ok(halfwayRestoreTo(['steakFrites']) <= 88);
});

test('a day reports what food earned and what it cost to serve', () => {
  const { report } = runDay(newGame(11), 3);
  assert.equal(typeof report.revenue.food, 'number');
  assert.ok(report.costs.foodCost >= 0, 'the cost of goods belongs on the report');
  assert.ok(report.kitchen && typeof report.kitchen.load === 'number');
  assert.ok(typeof report.kitchen.capacity === 'number');
  assert.ok(report.kitchen.serviceFactor > 0 && report.kitchen.serviceFactor <= 1);
});

test('an overloaded kitchen makes guests unhappier, not just poorer', () => {
  // Spec §5: service slowing down is felt, not only accounted for. Without
  // this the kitchen is a pure revenue tax and hiring a cook is a spreadsheet
  // decision rather than something the player sees in the complaints.
  function run(staffCooks) {
    let state = newGame(21);
    state.resort.amenities.push({
      type: 'restaurant',
      menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'],
    });
    state.resort.staff = [
      ...state.resort.staff.filter((m) => m.role !== 'kitchenStaff'),
      ...Array.from({ length: staffCooks }, () => ({ role: 'kitchenStaff' })),
    ];
    return runDay(state, 6).report;
  }
  const starved = run(0);
  const staffed = run(3);
  assert.ok(starved.kitchen.serviceFactor < 1, 'an unstaffed kitchen should be overloaded by that board');
  assert.equal(staffed.kitchen.serviceFactor, 1, 'three cooks should cover it');
  assert.ok(starved.averageSatisfaction < staffed.averageSatisfaction,
    `queueing for food should hurt: ${starved.averageSatisfaction} vs ${staffed.averageSatisfaction}`);
});

test('a kitchen that cannot keep up says so, in words the player gets', () => {
  let state = newGame(22);
  state.resort.amenities.push({
    type: 'restaurant',
    menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'],
  });
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'kitchenStaff');
  const { report } = runDay(state, 7);
  assert.ok(report.complaints.some((c) => /wait|kitchen|food|order/i.test(c)),
    `no complaint mentioned the kitchen: ${JSON.stringify(report.complaints)}`);
});

test('an overloaded kitchen shows up on the report', () => {
  let state = newGame(12);
  state.resort.amenities.push({ type: 'restaurant', menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'] });
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'kitchenStaff');
  const { report } = runDay(state, 4);
  assert.ok(report.kitchen.load > report.kitchen.capacity, 'that board should overload an unstaffed kitchen');
  assert.ok(report.kitchen.serviceFactor < 1, 'and it should slow service down');
});

test('changing nothing but the menu changes the day', () => {
  // The whole slice in one assertion.
  const a = newGame(13);
  const halfway = { type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] };
  a.resort.amenities.push(halfway);
  const b = structuredClone(a);
  b.resort.amenities.at(-1).menu = ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'];
  const ra = runDay(a, 5).report;
  const rb = runDay(b, 5).report;
  assert.notEqual(ra.revenue.food, rb.revenue.food, 'the same course with a different board must earn differently');
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `halfwayRestoreTo is not a function`.

- [ ] **Step 3: Implement.**

In `src/sim/round.js`, replace the fixed refuel constant with a parameter.
Change the destructure on the `playHole` signature from
`{ carts, handicapAdjust = 0, puttAdjust = 0, refuel = false }` to
`{ carts, handicapAdjust = 0, puttAdjust = 0, refuel = false, refuelTo = REFUEL_TO }`,
and change the body of the `if (refuel)` block to use `refuelTo`:

```js
  if (refuel) {
    for (const guest of group.guests) {
      guest.energy = Math.max(guest.energy, refuelTo);
    }
    events.push({ type: 'refuel', holeId: hole.id });
  }
```

Leave `REFUEL_TO` exported as the default so nothing that does not pass a
target changes behaviour.

In `src/sim/day.js`, add imports:

```js
import { menuBestEnergy } from './menu.js';
import { kitchenCapacity, kitchenLoad, serviceFactor } from './kitchen.js';
import { menuRevenue } from './economy.js';
```

and:

```js
/**
 * How much of a tiring golfer a stop at the halfway house gives back,
 * decided by the best thing on its board.
 *
 * This was a flat 82 whatever it served. Menu-driven, it is what stops
 * food being a revenue system that happens to sit on a golf course:
 * energy feeds `tiredMinutes` in round.js, which feeds round time, which
 * feeds the flow-shop rule in schedule.js that is the entire pace-of-play
 * mechanic. A board with a hot meal on it lands near the old 82; a board
 * of nothing but beer does not.
 */
export function halfwayRestoreTo(menu) {
  return clamp(60 + menuBestEnergy(menu) * 2, 60, 88);
}
```

Where `hasHalfwayHouse` is computed, also find the amenity and its board:

```js
  const halfwayHouse = next.resort.amenities.find((a) => a.type === 'halfwayHouse');
  const hasHalfwayHouse = Boolean(halfwayHouse);
  const halfwayEnergy = halfwayRestoreTo(halfwayHouse?.menu);
```

and pass it through where `refuel` is already passed to `playHole`:

```js
        refuel: hasHalfwayHouse && holeIndex === turnHoleIndex(holes.length),
        refuelTo: halfwayEnergy,
```

Compute the kitchen once per day, before revenue:

```js
  const kitchen = {
    load: kitchenLoad(next.resort.amenities),
    capacity: kitchenCapacity(next.resort.staff),
  };
  kitchen.serviceFactor = serviceFactor(kitchen.load, kitchen.capacity);
```

Replace the food portion of the day's revenue with the menu figure. Where
`dailyRevenue` is called, pass the crowd and fold the result in:

```js
  const food = menuRevenue({
    amenities: next.resort.amenities,
    crowd: golfersBySegment,
    serviceFactor: kitchen.serviceFactor,
  });
  revenue.food = food.revenue;
  revenue.total = revenue.greenFees + revenue.merchandise + revenue.food;
  costs.foodCost = food.foodCost;
  costs.total += food.foodCost;
  report.kitchen = kitchen;
```

> `golfersBySegment` is `{ locals, serious, destination }` in **golfers**, so
> multiply the report's per-segment group counts by 4 — the same conversion
> `dailyRevenue` already does with `groupsPlayed * 4`.

Apply the service penalty to satisfaction. Where `guestSatisfaction` is
called, pass the menu contribution and the kitchen's state through, and in
`src/sim/satisfaction.js` subtract a penalty proportional to the shortfall:

```js
  // Queueing for food you were promised. Proportional to how far past
  // capacity the kitchen is, so one item over is a shrug and a full
  // restaurant with no cooks is a bad afternoon.
  const kitchenPenalty = (1 - kitchenServiceFactor) * 18;
```

and add a complaint beside the existing amenity complaints:

```js
  if (kitchenServiceFactor < 0.9) {
    complaints.push('Waited twenty minutes for food that never really arrived.');
  }
```

In `economy.js`, `dailyRevenue` must stop adding food: delete the `food`
accumulation from its amenity loop and return `food: 0`, leaving
merchandise (the pro shop) alone. Its own tests may need their expected
food figure changed to 0 — **that is a real behaviour change, not a test
being weakened.**

- [ ] **Step 4: Run and watch it pass.**

Run: `node --test`
Expected: PASS, 417 + the new tests.

- [ ] **Step 5: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/sim/day.js src/sim/round.js src/sim/economy.js src/sim/satisfaction.js tests/day.test.js tests/economy.test.js && git commit -m "Let the board decide the day's food takings and how fast the round plays

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Palette and sprites — TEST FIRST for coverage, eyes for the art

**Files:** Modify `src/render/palette.js`; create `src/render/food.js`, `tests/food.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { FOOD_SPRITES, FOOD_CHARS, SPRITE_SIZE } from '../src/render/food.js';
import { ITEM_IDS } from '../src/sim/menu.js';

test('every item on the menu has art', () => {
  // A catalogue entry with no sprite is a blank square on the board. This
  // exact failure shipped once already: SPRITES.tee was defined and never
  // registered, every test passed, and the render loop died on load.
  for (const id of ITEM_IDS) {
    assert.ok(FOOD_SPRITES[id], `no sprite for ${id}`);
  }
});

test('no sprite exists for an item that is not on the menu', () => {
  for (const id of Object.keys(FOOD_SPRITES)) {
    assert.ok(ITEM_IDS.includes(id), `${id} has art but is not in the catalogue`);
  }
});

test('every sprite is a well-formed square grid', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    assert.equal(grid.length, SPRITE_SIZE, `${id}: wrong height`);
    for (const [i, row] of grid.entries()) {
      assert.equal(row.length, SPRITE_SIZE, `${id}: row ${i} is ${row.length} wide`);
    }
  }
});

test('every pixel names a colour the palette actually has', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    for (const row of grid) {
      for (const ch of row) {
        if (ch === '.') continue;
        const key = FOOD_CHARS[ch];
        assert.ok(key, `${id}: unknown sprite character "${ch}"`);
        assert.ok(PALETTE[key], `${id}: "${ch}" maps to ${key}, which is not in the palette`);
      }
    }
  }
});

test('no sprite is blank', () => {
  for (const [id, grid] of Object.entries(FOOD_SPRITES)) {
    const painted = grid.join('').split('').filter((c) => c !== '.').length;
    assert.ok(painted > 20, `${id}: only ${painted} pixels — that will read as an empty square`);
  }
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test`
Expected: FAIL, `Cannot find module '../src/render/food.js'`.

- [ ] **Step 3: Add the five food colours to `src/render/palette.js`**, inside
the frozen object, named by role like everything else.

> Spec §6.6 asked for six. Five is right: bread is `SAND`, lettuce and lime
> are `FAIRWAY`, foam and ice are `WHITE`, glass is `UI_LIGHT`. Reusing an
> existing role rather than minting `FOOD_BREAD` keeps the palette honest —
> a bun really is the same colour as a bunker, and two names for one colour
> is how a palette starts drifting.

```js
  // Food and drink. Grass, sand and water do not make a hot dog, so these
  // are the only additions the menu art needs — bread borrows SAND,
  // lettuce borrows FAIRWAY, foam borrows WHITE, glass borrows UI_LIGHT.
  FOOD_MEAT: '#B5543A',    // sausage, patty, bacon
  FOOD_MEAT_PALE: '#E08878', // ham, cooked chicken
  FOOD_RED: '#C0392B',     // tomato, sauce
  FOOD_DRINK: '#E8A020',   // beer, iced tea, anything amber in a glass
  FOOD_BERRY: '#8E44AD',   // the Transfusion's grape
```

- [ ] **Step 4: Write `src/render/food.js`** with all twenty-one grids.

```js
/**
 * Food and drink sprites, 12x12, as pixel grids in source — the same
 * scheme as sprites.js, one character per pixel, `.` transparent,
 * everything else looked up in FOOD_CHARS and then in PALETTE. No raw hex.
 *
 * Bigger than the 8x8 objects because these are the whole point of the
 * menu screen rather than markers on a map, and because the author asked
 * for visual pop after three slices that were entirely words. They are
 * drawn at 2x on the board, so 12x12 is really 24px of screen.
 */
import { PALETTE } from './palette.js';

export const SPRITE_SIZE = 12;

export const FOOD_CHARS = {
  o: 'OUTLINE',
  B: 'SAND',            // bread, bun, pastry
  b: 'SAND_SHADOW',     // the shaded underside of bread
  s: 'FOOD_MEAT',
  h: 'FOOD_MEAT_PALE',
  M: 'ACCENT',          // mustard, egg yolk, butter
  R: 'FOOD_RED',
  L: 'FAIRWAY',         // lettuce, lime, herbs
  A: 'FOOD_DRINK',
  P: 'FOOD_BERRY',
  W: 'WHITE',           // foam, ice, chicken, plate
  G: 'UI_LIGHT',        // glass, shell, cutlery
  t: 'TEE',             // a straw, a wooden pick
  C: 'PATH',            // coffee, iced tea, cola
};
```

Then twenty-one `const` grids and a `FOOD_SPRITES` export. Ten are already
drawn and verified — use these exactly:

```js
const transfusion = [
  '......t.....', '...oooooo...', '...oWWWWoLL.', '...oPPPPo...',
  '...oPPPPo...', '...oPPPPo...', '...oPPPPo...', '...oPPPPo...',
  '...oPPPPo...', '...oPPPPo...', '...oooooo...', '............',
];
const arnoldPalmer = [
  '......t.....', '...oooooo...', '...oWWWWoMM.', '...oCCCCo...',
  '...oCCCCo...', '...oCCCCo...', '...oAAAAo...', '...oAAAAo...',
  '...oAAAAo...', '...oAAAAo...', '...oooooo...', '............',
];
const draught = [
  '............', '..oooooooo..', '..oWWWWWWo..', '..oWWWWWWo..',
  '..oAAAAAAo..', '..oABAAAAo..', '..oABAAAAo..', '..oAAAAAAo..',
  '..oAAAAAAo..', '..oAAAAAAo..', '..oooooooo..', '............',
];
const hotDog = [
  '............', '............', '............', '...oooooo...',
  '..oBBBBBBo..', '.oBssssssBo.', '.oBsMMMMsBo.', '.oBssssssBo.',
  '..oBBBBBBo..', '...oooooo...', '............', '............',
];
const breakfastSandwich = [
  '............', '............', '..oooooooo..', '.oBBBBBBBBo.',
  '.obbbbbbbbo.', '.oMMMMMMMMo.', '.osssssssso.', '.oBBBBBBBBo.',
  '.oBBBBBBBBo.', '..oooooooo..', '............', '............',
];
const chickenCaesarWrap = [
  '............', '.......oo...', '......oBBo..', '.....oBWLBo.',
  '....oBWLWBo.', '...oBWLWLBo.', '..oBWLWLWBo.', '.oBWLWLWLBo.',
  '.oBBBBBBBBo.', '..oooooooo..', '............', '............',
];
const clubSandwich = [
  '............', '.....oo.....', '....oBBo....', '...oBBBBo...',
  '...oLLLLo...', '..oBBBBBBo..', '..oRRRRRRo..', '.oBBBBBBBBo.',
  '.ohhhhhhhho.', '.oBBBBBBBBo.', '..oooooooo..', '............',
];
const burgerFries = [
  '............', '...oooooo...', '..oBBBBBBo..', '.oBBBBBBBBo.',
  '.oLLLLLLLLo.', '.oRRRRRRRRo.', '.osssssssso.', '.oBBBBBBBBo.',
  '..oooooooo..', '............', '............', '............',
];
const lobsterRoll = [
  '............', '............', '...oooooo...', '..oRRRRRRo..',
  '.oRRLRRLRRo.', '.oBRRRRRRBo.', '.oBBBBBBBBo.', '.oBBBBBBBBo.',
  '..oBBBBBBo..', '...oooooo...', '............', '............',
];
const oysters = [
  '............', '............', '.oooo..oooo.', 'oGGGGooGGGGo',
  'oGWWGooGWWGo', 'oGWWGooGWWGo', 'oGGGGooGGGGo', '.oooo..oooo.',
  '............', '............', '............', '............',
];
```

Here are three more, to pin the idiom for the drinks and the plated food:

```js
const domesticCan = [
  '............', '...oooooo...', '...oGGGGGo..', '...oRRRRRo..',
  '...oRWWWRo..', '...oRWWWRo..', '...oRRRRRo..', '...oGGGGGo..',
  '...oGGGGGo..', '...oooooo...', '............', '............',
];
const bottledWater = [
  '.....oo.....', '.....GG.....', '....oGGo....', '...oGWWGo...',
  '...oGWWGo...', '...oGWWGo...', '...oGWWGo...', '...oGWWGo...',
  '...oGWWGo...', '...oGWWGo...', '....oooo....', '............',
];
const steakFrites = [
  '............', '..oooooooo..', '.oWWWWWWWWo.', '.oWssssssWo.',
  '.oWssssssWo.', '.oWsssssssWo'.slice(0, 12), '.oWMMWMMWWo.', '.oWMMWMMWWo.',
  '.oWWWWWWWWo.', '..oooooooo..', '............', '............',
];
```

> `steakFrites` above deliberately shows the trap: the sixth row is 13
> characters before the `.slice`. **Write it as a plain 12-character string
> instead** — the slice is there only to make the failure mode visible.
> Count every row.

**This is the one step in this plan that is authoring rather than
transcription.** The remaining eight — `craftAle`, `espresso`,
`wineByGlass`, `candyBar`, `trailMix`, `turkeyWrap`, `chiliBowl`,
`seasonalSalad` — have to be drawn, and no amount of specification
substitutes for looking at them. The guardrails are exact: every row is
exactly 12 characters, every character is `.` or a key in `FOOD_CHARS`,
every sprite has more than 20 painted pixels, and Step 1's tests check all
three, so a miscounted row fails the suite rather than rendering as a
smear. Step 6 is where you find out whether they actually read as food.

Two of the drawn ten are known-weak and should be redrawn while you are in
here: **`oysters` reads as two grey rectangles**, and **`lobsterRoll` is too
close to `hotDog`** at a glance. Give the oysters a visible shell fan and
the lobster roll a paler bun so the silhouettes differ.

Finish with the registry and renderer:

```js
export const FOOD_SPRITES = {
  domesticCan, draught, craftAle, arnoldPalmer, bottledWater, transfusion,
  espresso, wineByGlass, candyBar, trailMix, turkeyWrap, chickenCaesarWrap,
  hotDog, breakfastSandwich, chiliBowl, burgerFries, clubSandwich,
  seasonalSalad, oysters, lobsterRoll, steakFrites,
};

/**
 * Draws an item's sprite into its own canvas at `scale` device pixels per
 * sprite pixel, for embedding in the DOM menu board. Returns the canvas.
 *
 * `imageSmoothingEnabled = false` is not optional: the board draws these
 * at 2x, and a smoothed 12x12 blown up reads as a smudge rather than as
 * pixel art. Gradients and smoothing have both been caught softening this
 * game's art before.
 */
export function foodSpriteCanvas(id, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE * scale;
  canvas.height = SPRITE_SIZE * scale;
  canvas.style.width = `${SPRITE_SIZE * scale}px`;
  canvas.style.height = `${SPRITE_SIZE * scale}px`;
  canvas.style.imageRendering = 'pixelated';
  const grid = FOOD_SPRITES[id];
  if (!grid) return canvas;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < SPRITE_SIZE; row++) {
    for (let col = 0; col < SPRITE_SIZE; col++) {
      const ch = grid[row][col];
      if (ch === '.') continue;
      const key = FOOD_CHARS[ch];
      if (!key) continue;
      ctx.fillStyle = PALETTE[key];
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  return canvas;
}
```

- [ ] **Step 5: Run and watch it pass.**

Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Look at them.** Add a throwaway page at the project root
that imports `FOOD_SPRITES` and draws every one at 8x with its name under
it, serve with `npx --yes http-server -p 4173 -c-1`, and open it. **It is
wrong if** any two sprites are hard to tell apart at 24px, since that is the
size the board actually uses. Delete the throwaway page before committing.

- [ ] **Step 7: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/render/palette.js src/render/food.js tests/food.test.js && git commit -m "Draw all twenty-one items, and five food colours to draw them with

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: The menu board — visual checkpoint

**Files:** Create `src/ui/menuBoard.js`

The board is the answer to "everything's getting kinda text heavy". It must
read as a thing a golfer would look at, not as a settings list.

- [ ] **Step 1: Implement.** `openMenuBoard(sheetHost, { state, amenityType, onChange })`
opens a sheet whose body is, per row: **the item's sprite at 2x**, its name,
its price, and **three small bars** for locals / serious / destination,
filled in proportion to that item's appeal and drawn dark when the crowd
will not buy it. Tapping a row on the board removes it; tapping one in the
list below adds it, disabled when the slots are full.

Hard requirements:

- **Appeal is bars, never words.** It is the one piece of information that
  decides every choice on this screen, so it must be readable without a tap.
- **Every number comes from `src/sim/menu.js`** — price, slots, prep. Never
  retype a price into the UI. A menu is a screen made entirely of prices,
  and the interface disagreeing with the simulation is this project's
  recurring bug.
- A footer showing kitchen load against capacity (from `src/sim/kitchen.js`)
  and, in a plain sentence, which crowd this board actually suits, using the
  same `shortLabel` values `segments.js` already exports.
- Touch targets ≥44px. Rows are tappable, so the row *is* the target.
- No raw hex: colours from `PALETTE`.

- [ ] **Step 2: Look at it** at 375×812 **and 390×664**, in a fresh tab.
**It is wrong if** the appeal bars are not legible at arm's length, or if a
7-slot restaurant board pushes the kitchen footer off screen — the footer is
how the player learns breadth costs money.

- [ ] **Step 3: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/ui/menuBoard.js && git commit -m "Build the menu board: sprites, prices, and who each item is for

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Reach the board from the game — visual checkpoint

**Files:** Modify `src/ui/panels.js`

- [ ] **Step 1: Implement.** In `openBuildSheet`, every amenity row whose
type is in `FOOD_AMENITIES` and which the player already owns gets a second
button, **Menu**, beside the existing `Built` label, opening
`openMenuBoard` for that amenity. Rows for amenities that serve no food are
unchanged.

The amenity's value line should also say what its board currently earns per
guest, quoted from the simulation rather than recomputed — the same
anti-drift rule the existing `amenityPerceivedValue` line already follows.

- [ ] **Step 2: Look at it.** Build a halfway house, open its menu, change
it, close the sheet, open it again. **It is wrong if** a change does not
survive closing the sheet, or if the Amenities row still shows the old
per-guest figure.

- [ ] **Step 3: Commit.**

```bash
node --test > /dev/null 2>&1 && git add src/ui/panels.js && git commit -m "Put a Menu button on every food amenity you own

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Play it

- [ ] **Step 1: Play ten days** at 390×664 with a halfway house and a
restaurant built. Change the menus between days and report **whether the
report's food line visibly moves**, and whether the kitchen footer ever
told you something you did not already know.

- [ ] **Step 2: Run `npm run balance`** and report it verbatim. Compare
against the last recorded run: money $81,526, prestige 58.8, turf 35.2,
groups 25.6, happiness 50.7, round 64 min. **Food should be near-neutral**
— that is §4.1. A large move means `MENU_RATE` is wrong, not that the
economy changed.

- [ ] **Step 3: Record anything you tuned** in the spec's §8, with the
numbers that prompted it, and commit.

---

## Definition of done

- [ ] All 417 prior tests green, plus the new suites
- [ ] `tests/purity.test.js` passes — `src/sim/` stayed pure
- [ ] No menu pleases every crowd, swept exhaustively across all four amenities
- [ ] No item pleases every crowd
- [ ] Nothing with `prep ≥ 3` is cartable, and a kitchen-free cart is still possible
- [ ] Every one of the twenty-one items has art, and no sprite is blank
- [ ] A save made before this slice loads and has boards on its amenities
- [ ] The balance run is near-neutral against the figures above
- [ ] Nothing pushed

## Out of scope

The beverage cart amenity, Dee joining the narration cast, the cart drawn
on the canvas during playback, and the full balance pass including the
cart-versus-halfway-house and hot-cart-versus-dry-cart comparisons. Those
are stages 5–7 and get their own plan.
