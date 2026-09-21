import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { AMENITIES, WAGES } from '../src/sim/economy.js';
import { MENU_SLOTS } from '../src/sim/menu.js';
import { SEGMENTS, SEGMENT_KEYS } from '../src/sim/segments.js';
import { buildComplaints } from '../src/sim/satisfaction.js';
import { amenityBlurb, roleBlurb } from '../src/ui/panels.js';

/**
 * The interface telling the player something the simulation disagrees
 * with is the bug this project produces most: the renderer against lieAt,
 * prices in the UI against the sim, marshals missing from the pace
 * forecast, a green button that charged you to look, a pro shop that
 * complained about a queue while costing the guest nothing.
 *
 * Prose cannot be tested. What can be tested is that every THING the
 * prose talks about still exists, and that no claim is made about a
 * mechanic that has since been rewired.
 */

test('every amenity the game can build has something to say about itself', () => {
  for (const type of Object.keys(AMENITIES)) {
    const words = amenityBlurb(type);
    assert.ok(words && words.length > 20,
      `${type} has no description — a row in a shop the player cannot evaluate`);
  }
});

test('every hire the game offers has something to say about itself', () => {
  // A wage with no description is how shopStaff existed for months against
  // a role that did nothing at all: there was nothing to contradict.
  for (const role of Object.keys(WAGES)) {
    const words = roleBlurb(role);
    assert.ok(words && words.length > 20, `${role} has no description`);
  }
});

test('a hire that is only worth it sometimes says so', () => {
  // The marshal and the two service roles are all situational, and the
  // measured difference between their best and worst case is thousands of
  // dollars a day. Copy that reads as an unconditional recommendation
  // would be actively misleading.
  for (const role of ['marshal', 'shopStaff', 'kitchenStaff']) {
    const words = roleBlurb(role).toLowerCase();
    assert.ok(/busy|quiet|past that|capacity|each|about/.test(words),
      `${role}'s description states no condition: "${roleBlurb(role)}"`);
  }
});

test('nobody complains about a missing drink when something sells drinks', () => {
  // The beverage cart was left out of this check when it was added, so a
  // player who had built Dee heard guests complain there was nowhere to
  // get a drink while watching her hand them out on the map.
  const base = {
    waitTotalsByHole: [0, 0, 0], groups: 5, turfQuality: 80,
    averageSatisfaction: 60, nearActGate: false,
  };
  const dry = buildComplaints({ ...base, amenityTypes: ['restrooms'] });
  assert.ok(dry.some((c) => /drink/i.test(c)), 'a resort with nothing to drink should be complained about');

  for (const type of ['snackShack', 'halfwayHouse', 'beverageCart', 'restaurant']) {
    const wet = buildComplaints({ ...base, amenityTypes: ['restrooms', type] });
    assert.ok(!wet.some((c) => /drink/i.test(c)),
      `${type} sells drinks, so nobody should say there are none`);
  }
});

test('a complaint never names a hole the course does not have', () => {
  // This shipped once: guests on a three-hole resort complained there was
  // no restroom "past the 6th".
  for (const holeCount of [1, 3, 9, 18]) {
    const complaints = buildComplaints({
      waitTotalsByHole: Array(holeCount).fill(0), groups: 4,
      amenityTypes: [], turfQuality: 80, averageSatisfaction: 60, nearActGate: false,
    });
    for (const line of complaints) {
      const named = line.match(/(\d+)(?:st|nd|rd|th)/);
      if (named) {
        assert.ok(Number(named[1]) <= holeCount,
          `a ${holeCount}-hole course produced "${line}"`);
      }
    }
  }
});

test('the queue at the counter costs the guest something, not just a sentence', () => {
  // The pro shop produced a complaint about a six-deep queue while the
  // satisfaction score ignored it entirely — shopServiceFactor was
  // accepted as a parameter and never used.
  function happyWith(shopHires) {
    let state = newGame(61);
    state.money = 150000;
    state.prestige = 70;
    state.resort.amenities.push({ id: 'p', type: 'proShop', menu: [] });
    for (let i = 0; i < shopHires; i++) state.resort.staff.push({ role: 'shopStaff' });
    let last = null;
    for (let d = 0; d < 8; d++) { const r = runDay(state, 6100 + d); state = r.state; last = r.report; }
    return last.averageSatisfaction;
  }
  assert.ok(happyWith(2) > happyWith(0),
    'a served guest should be happier than a queueing one');
});

test('every crowd the HUD shows has a name the glossary could use', () => {
  for (const key of SEGMENT_KEYS) {
    assert.ok(SEGMENTS[key].shortLabel, `${key} has no short label for the HUD`);
    assert.ok(SEGMENTS[key].shortLabel.length <= 8, `${key}'s label will not fit`);
  }
});

test('every food amenity the copy can mention has slots to fill', () => {
  for (const type of Object.keys(MENU_SLOTS)) {
    assert.ok(AMENITIES[type], `${type} has menu slots but cannot be built`);
    assert.ok(MENU_SLOTS[type] > 0, `${type} has a menu of zero slots`);
  }
});
