import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, MENU_SLOTS, itemsFor } from '../src/sim/menu.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import {
  menuPull, menuBasket, menuCogs, menuPrep, menuBestEnergy, menuSatisfaction,
} from '../src/sim/menu.js';

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
