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
