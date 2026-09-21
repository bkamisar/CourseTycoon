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
