import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENT_KEYS, SEGMENTS } from '../src/sim/segments.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import {
  HOTEL_AMENITIES, HOTEL_AMENITY_IDS,
  hotelUpkeep, extraNightsFrom, divertedShare, hasWeatherProofDraw, hotelAppeal,
} from '../src/sim/hotelAmenities.js';

const all = HOTEL_AMENITY_IDS.map((type) => ({ type }));

test('there are fourteen, each fully specified', () => {
  assert.equal(HOTEL_AMENITY_IDS.length, 14);
  for (const id of HOTEL_AMENITY_IDS) {
    const a = HOTEL_AMENITIES[id];
    assert.equal(a.id, id, `${id}: id does not match its key`);
    assert.ok(a.label && a.blurb && a.blurb.length > 30, `${id}: thin copy`);
    assert.ok(a.build > 0 && a.upkeep > 0, `${id}: must cost something`);
    assert.ok(['overnight', 'day', 'both'].includes(a.serves), `${id}: bad serves "${a.serves}"`);
    for (const key of SEGMENT_KEYS) {
      const draw = a.appeal[key];
      assert.ok(draw >= 0 && draw <= 1, `${id}.appeal.${key} out of range: ${draw}`);
    }
  }
});

test('NO HOTEL AMENITY PLEASES EVERY CROWD', () => {
  // The guarantee holes, menu items and course amenities all carry. A new
  // surface does not get an exemption — the moment one building suits
  // everybody, the crowd tension that this whole game rests on has a hole
  // in it.
  for (const id of HOTEL_AMENITY_IDS) {
    const a = HOTEL_AMENITIES[id];
    const universal = SEGMENT_KEYS.every((k) => a.appeal[k] >= 0.8);
    assert.ok(!universal, `${id} pleases everybody: ${JSON.stringify(a.appeal)}`);
  }
});

test('no combination of them pleases every crowd either', () => {
  // Items can be individually narrow and collectively universal — that is
  // exactly what happened with menus, where 87% of five-item boards
  // pleased all three crowds while no single item did.
  function* combinations(pool, size, start = 0, acc = []) {
    if (acc.length === size) { yield acc; return; }
    for (let i = start; i < pool.length; i++) yield* combinations(pool, size, i + 1, [...acc, pool[i]]);
  }
  let checked = 0;
  for (const combo of combinations(HOTEL_AMENITY_IDS, 4)) {
    checked++;
    const amenities = combo.map((type) => ({ type }));
    const worst = Math.min(...SEGMENT_KEYS.map((k) => hotelAppeal(amenities, k)));
    assert.ok(worst < 0.85,
      `${combo.join(' + ')} pleases every crowd (worst ${worst.toFixed(2)})`);
  }
  assert.ok(checked > 800, `only ${checked} combinations swept`);
});

test('something here is really for each crowd', () => {
  for (const key of SEGMENT_KEYS) {
    const forThem = HOTEL_AMENITY_IDS.filter((id) => HOTEL_AMENITIES[id].appeal[key] >= 0.7);
    assert.ok(forThem.length >= 2,
      `only ${forThem.length} things in the hotel are really for ${SEGMENTS[key].shortLabel}`);
  }
});

test('locals never book a room, so something must serve them without one', () => {
  const dayOnly = HOTEL_AMENITY_IDS.filter((id) => HOTEL_AMENITIES[id].serves === 'day');
  assert.ok(dayOnly.length >= 2, 'the hotel must earn from people who never sleep in it');
  for (const id of dayOnly) {
    assert.ok(HOTEL_AMENITIES[id].appeal.locals > 0.25,
      `${id} serves day visitors but appeals to no locals, which is nobody`);
  }
});

test('the indoor range earns when the weather closes the course', () => {
  // The best mechanical idea in the act. Weather swings demand from 1.12
  // to 0.10 in a storm and leaves every other building idle, so a range
  // under a roof smooths the variance rather than merely adding revenue.
  assert.equal(HOTEL_AMENITIES.indoorRange.weatherProof, true);
  assert.equal(HOTEL_AMENITIES.pool.weatherProof, false, 'an outdoor pool is not weather-proof');
  assert.equal(hasWeatherProofDraw([{ type: 'pool' }, { type: 'spa' }]), false);
  assert.equal(hasWeatherProofDraw([{ type: 'pool' }, { type: 'indoorRange' }]), true);
  assert.equal(hasWeatherProofDraw([]), false);
});

test('the short course helps pace by subtraction', () => {
  // The only thing in the game that improves pace by taking golfers off
  // the course rather than by speeding them up.
  assert.ok(HOTEL_AMENITIES.shortCourse.divertsGroups > 0);
  assert.equal(HOTEL_AMENITIES.pool.divertsGroups, 0);
  assert.ok(divertedShare(all) <= 0.35, 'a short course takes the beginners, not the field');
  assert.equal(divertedShare([]), 0);
});

test('the kids club and spa lengthen stays rather than drawing more', () => {
  assert.ok(HOTEL_AMENITIES.kidsClub.extraNights > 0);
  assert.ok(HOTEL_AMENITIES.spa.extraNights > 0);
  assert.equal(HOTEL_AMENITIES.brewPub.extraNights, 0);
  // Modest on purpose: two of them extend a trip, they do not double it.
  assert.ok(extraNightsFrom(all) < 2, `everything at once adds ${extraNightsFrom(all)} nights`);
  assert.equal(extraNightsFrom([]), 0);
});

test('upkeep sums, and an unknown building costs nothing', () => {
  assert.equal(hotelUpkeep([]), 0);
  assert.equal(hotelUpkeep([{ type: 'gym' }]), HOTEL_AMENITIES.gym.upkeep);
  assert.equal(hotelUpkeep([{ type: 'nonsense' }]), 0);
  assert.ok(hotelUpkeep(all) > 3000, 'the full hotel should be expensive to run');
});

test('appeal is zero with nothing built, and rises with the right things', () => {
  assert.equal(hotelAppeal([], 'destination'), 0);
  const forGuests = hotelAppeal([{ type: 'pool' }, { type: 'spa' }, { type: 'fineDining' }], 'destination');
  const forLocals = hotelAppeal([{ type: 'pool' }, { type: 'spa' }, { type: 'fineDining' }], 'locals');
  assert.ok(forGuests > 0.7, 'a resort hotel should suit destination guests');
  assert.ok(forLocals < forGuests, 'and suit locals rather less');
});

// --- Through the real day loop ---------------------------------------

test('hotel buildings cost money every day', () => {
  function dailyCost(amenities) {
    const state = newGame(41);
    state.resort.amenities.push(...amenities.map((type) => ({ id: type, type, menu: [] })));
    return runDay(state, 7).report.costs.rooms;
  }
  assert.ok(dailyCost(['spa', 'pool']) > dailyCost([]),
    'a spa and a pool must show up on the bill');
});

test('a kids club lengthens stays rather than drawing more guests', () => {
  // Measured on DEMAND rather than on beds sold, because a full hotel
  // cannot show the difference — the first version of this test used a
  // 60-room hotel that was already 60/60 with eighteen turned away, and
  // reported "no effect" for a mechanic that was working fine. The club
  // took turned-away from 18 to 39.
  function demand(extra) {
    const state = newGame(42);
    state.prestige = 75;
    state.resort.rooms = { standard: 40, suite: 20 };
    state.resort.pricing.roomRate = 70;
    for (const type of extra) state.resort.amenities.push({ id: type, type, menu: [] });
    const { report } = runDay(state, 8);
    return report.hotel.sold + report.hotel.turnedAway;
  }
  assert.ok(demand(['kidsClub']) > demand([]),
    'a kids club should lengthen stays and so want more room-nights');
});

test('no amenity can talk a local into a bed', () => {
  // extraNights multiplies a crowd's nights, and locals have zero of
  // them. Nothing in the hotel may route around that.
  const state = newGame(46);
  state.resort.rooms = { standard: 30, suite: 10 };
  state.resort.pricing.roomRate = 5;
  for (const type of HOTEL_AMENITY_IDS) {
    state.resort.amenities.push({ id: type, type, menu: [] });
  }
  const { report } = runDay(state, 11);
  const stayers = (report.crowd.serious?.count ?? 0) + (report.crowd.destination?.count ?? 0);
  if (stayers === 0) assert.equal(report.hotel.sold, 0);
});

test('a short course takes groups off the main course', () => {
  function played(extra) {
    const state = newGame(43);
    state.prestige = 70;
    for (const type of extra) state.resort.amenities.push({ id: type, type, menu: [] });
    const { report } = runDay(state, 9);
    return report;
  }
  const plain = played([]);
  const withShort = played(['shortCourse']);
  assert.equal(plain.divertedGroups, 0, 'nothing diverts without somewhere to divert to');
  assert.ok(withShort.divertedGroups > 0, 'the short course should take some groups');
  assert.ok(withShort.groupsPlayed < plain.groupsPlayed,
    'and the main course should be quieter for it');
});

test('an indoor range earns on a day the course is unplayable', () => {
  // Find a storm, then check the range takes money on it.
  function onBadDay(extra) {
    let state = newGame(44);
    for (const type of extra) state.resort.amenities.push({ id: type, type, menu: [] });
    for (let d = 0; d < 60; d++) {
      const r = runDay(state, 4400 + d);
      state = r.state;
      if (r.report.weather.key === 'storm' || r.report.weather.key === 'rain') {
        return r.report.revenue.indoors;
      }
    }
    return null;
  }
  const bare = onBadDay([]);
  const sheltered = onBadDay(['indoorRange']);
  assert.equal(bare, 0, 'a resort with no roof earns nothing in a storm');
  assert.ok(sheltered > 0, 'a range under a roof should take money anyway');
});

test('a fine day earns nothing extra indoors', () => {
  let state = newGame(45);
  state.resort.amenities.push({ id: 'indoorRange', type: 'indoorRange', menu: [] });
  for (let d = 0; d < 40; d++) {
    const r = runDay(state, 4500 + d);
    state = r.state;
    if (r.report.weather.key === 'clear') {
      assert.equal(r.report.revenue.indoors, 0,
        'nobody hits balls under a roof when the sun is out');
      return;
    }
  }
});
