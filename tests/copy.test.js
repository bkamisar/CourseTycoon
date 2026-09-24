import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { AMENITIES, WAGES } from '../src/sim/economy.js';
import { MENU_SLOTS, itemsFor } from '../src/sim/menu.js';
import { HOTEL_AMENITIES } from '../src/sim/hotelAmenities.js';
import { SEGMENTS, SEGMENT_KEYS } from '../src/sim/segments.js';
import { buildComplaints } from '../src/sim/satisfaction.js';
import { amenityBlurb, roleBlurb, STAFF_ROLES } from '../src/ui/panels.js';

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
    return last;
  }
  // Per golfer, not in total: hiring brings more people as well as
  // serving them faster, and the total would rise either way.
  const soldPerGolfer = (hires) => {
    const r = happyWith(hires);
    return r.revenue.merchandise / Math.max(1, r.groupsPlayed * 4);
  };
  // Compared on service and takings rather than on the day's average
  // satisfaction, which cannot answer this question any more.
  //
  // Hiring improves service, which makes guests happier, which brings
  // MORE of them -- 64 golfers against 76 in this fixture -- and on a
  // three-hole course the extra crowd costs more satisfaction than the
  // queue did. The net came out lower with staff than without, which
  // says nothing about whether the counter matters. The direct question,
  // "does shopServiceFactor reach the score at all", is asked
  // unconfounded in tests/calibration.test.js.
  assert.ok(soldPerGolfer(2) > soldPerGolfer(0) * 1.2,
    'a staffed counter has to sell each golfer meaningfully more than a queue does');
});

test('every crowd the HUD shows has a name the glossary could use', () => {
  for (const key of SEGMENT_KEYS) {
    assert.ok(SEGMENTS[key].shortLabel, `${key} has no short label for the HUD`);
    assert.ok(SEGMENTS[key].shortLabel.length <= 8, `${key}'s label will not fit`);
  }
});

test('every food amenity the copy can mention has slots to fill', () => {
  // Buildable from EITHER list. The hotel's dining room, brew pub and
  // cocktail bar sell food and drink and therefore carry menus, and they
  // live in HOTEL_AMENITIES rather than the Act I catalogue. This guard
  // caught them the moment they were given slots, which is exactly its
  // job -- a venue with a menu and no way to build it would be a board
  // the player could never see.
  for (const type of Object.keys(MENU_SLOTS)) {
    assert.ok(AMENITIES[type] || HOTEL_AMENITIES[type],
      `${type} has menu slots but cannot be built from either catalogue`);
    assert.ok(MENU_SLOTS[type] > 0, `${type} has a menu of zero slots`);
    assert.ok(itemsFor(type).length >= MENU_SLOTS[type],
      `${type} has ${MENU_SLOTS[type]} slots and only ${itemsFor(type).length} things it may serve`);
  }
});

test('EVERY ROLE THE GAME PAYS A WAGE TO CAN ACTUALLY BE HIRED', () => {
  // shopStaff had a wage, a capacity mechanic, a guest complaint and an
  // Amenities line reading "Needs a shop hire" — and was missing from the
  // staff sheet, so there was no way to hire one. The player was told to
  // do something the game would not let them do.
  //
  // The test that existed asserted every role had a description. It
  // passed. It was checking the wrong thing.
  for (const role of Object.keys(WAGES)) {
    assert.ok(STAFF_ROLES.includes(role),
      `${role} is paid $${WAGES[role]}/day but cannot be hired from the staff sheet`);
  }
});

test('the game never offers to hire somebody it cannot pay', () => {
  for (const role of STAFF_ROLES) {
    assert.ok(WAGES[role], `the staff sheet offers ${role}, which has no wage`);
  }
});
