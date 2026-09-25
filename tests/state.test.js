import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDay } from '../src/sim/day.js';
import { GATE_THRESHOLDS } from '../src/sim/acts.js';
import { openHoles, newGame, serialize, deserialize, defaultMenuFor } from '../src/sim/state.js';
import { MENU_SLOTS, ITEMS, itemsFor } from '../src/sim/menu.js';

test('a new game starts on day one of act one', () => {
  const s = newGame(1234);
  assert.equal(s.day, 1);
  assert.equal(s.act, 1);
  assert.equal(s.seed, 1234);
});

test('a new game starts with the spec cash and three open holes', () => {
  const s = newGame(1);
  assert.equal(s.money, 25000);
  assert.equal(s.resort.courses[0].holes.filter((h) => h.open).length, 3);
});

test('there are eighteen hole slots, three of them actually built', () => {
  // The back nine is laid out as ground from day one rather than created
  // in Act II, because economy.js has always priced a round against
  // eighteen — Act I's nine is half a golf course and is meant to feel
  // like one.
  const s = newGame(1);
  const holes = s.resort.courses[0].holes;
  assert.equal(holes.length, 18);
  assert.equal(holes.filter((h) => h.open).length, 3);
  assert.equal(holes.filter((h) => !h.open).length, 15);
});

test('the back nine is ground, not golf', () => {
  const s = newGame(1);
  for (const hole of s.resort.courses[0].holes.slice(9)) {
    assert.equal(hole.open, false);
    assert.deepEqual(hole.corridor, []);
    assert.equal(hole.teePos, null);
  }
  // openHoles requires geometry, so a bare plot can never make a day NaN.
  assert.ok(openHoles(s).every((h) => h.corridor.length > 1));
});

test('an Act I save grows the ground for a back nine when it loads', () => {
  const short = JSON.parse(serialize(newGame(2)));
  short.resort.courses[0].holes = short.resort.courses[0].holes.slice(0, 9);
  const loaded = deserialize(JSON.stringify(short));
  assert.equal(loaded.resort.courses[0].holes.length, 18);
  assert.equal(loaded.resort.courses[0].holes[12].open, false);
  assert.equal(loaded.resort.courses[0].holes[12].id, 13);
});

test('Act I does not get harder because Act II was written', () => {
  assert.equal(GATE_THRESHOLDS.holesOpen, 9);
});

test('the wide data model fields are present and narrow', () => {
  const s = newGame(1);
  assert.equal(s.resort.zones.length, 1);
  assert.equal(s.resort.zones[0].id, 'near');
  assert.equal(s.resort.courses.length, 1);
  assert.equal(s.properties.length, 1);
  // The hotel was `{ count, quality }` while it was a placeholder. Act II
  // gave it two kinds, because a hotel carries the same crowd tension
  // everything else in this game does.
  assert.equal(s.resort.rooms.standard, 0);
  assert.equal(s.resort.rooms.suite, 0);
  assert.deepEqual(s.resort.shuttles, []);
  assert.equal(s.resort.pricing.roomRate, 0);
});

test('pricing starts at the spec defaults', () => {
  const s = newGame(1);
  assert.equal(s.resort.pricing.greenFee, 22);
  assert.equal(s.resort.pricing.teeInterval, 16);
});

test('a round trip through serialize and deserialize preserves the state', () => {
  const s = newGame(77);
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
});

test('serialize produces a string', () => {
  assert.equal(typeof serialize(newGame(1)), 'string');
});

test('deserialize rejects malformed input rather than returning junk', () => {
  assert.throws(() => deserialize('not json'), /save/i);
  assert.throws(() => deserialize(JSON.stringify({ nope: true })), /save/i);
});

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

test('a save made before championship targets existed defaults to zero', () => {
  // Mirrors how tournamentsHosted and resort.setup were back-filled when
  // Act III landed: an old save simply lacks the field, and loading it
  // must not crash or leave setupTarget undefined for day.js to read.
  const old = JSON.stringify({
    version: 1,
    day: 4, money: 1000, prestige: 10, turfQuality: 50,
    resort: {
      courses: [{ holes: [] }],
      amenities: [], staff: [], pricing: { greenFee: 40, teeInterval: 10 },
      setup: 30,
    },
    history: [], satisfactionHistory: [],
  });
  const loaded = deserialize(old);
  assert.equal(loaded.resort.setupTarget, 0);
});

test('a save made before menus existed gets one', () => {
  // Never make an old save unloadable. The author plays on a phone and on
  // a desktop, and a save code moves between them.
  const old = JSON.stringify({
    version: 1,
    day: 4, money: 1000, prestige: 10, turfQuality: 50,
    resort: {
      courses: [{ holes: [] }],
      amenities: [{ type: 'halfwayHouse' }, { type: 'restrooms' }],
      staff: [], pricing: { greenFee: 40, teeInterval: 10 },
    },
    history: [], satisfactionHistory: [],
  });
  const loaded = deserialize(old);
  const halfway = loaded.resort.amenities.find((a) => a.type === 'halfwayHouse');
  assert.ok(Array.isArray(halfway.menu) && halfway.menu.length > 0,
    'an existing halfway house should come back with a board on it');
  const restrooms = loaded.resort.amenities.find((a) => a.type === 'restrooms');
  assert.deepEqual(restrooms.menu, []);
});

test('a hole flagged open but never built is not played', () => {
  // Flipping `open` on one of the unbuilt stubs used to make the entire
  // day NaN — money, round time, satisfaction, all of it — and the report
  // looked plausible right up until the numbers came out. The editor can
  // never do this, but tooling and tests have three times.
  const state = newGame(1);
  for (const h of state.resort.courses[0].holes) h.open = true;
  const playable = openHoles(state);
  assert.equal(playable.length, 3, 'only the three real holes should be playable');
  for (const h of playable) {
    assert.ok(h.corridor.length > 1 && h.teePos, 'a playable hole has geometry');
  }
});

test('a day with stubs forced open still produces real numbers', () => {
  const state = newGame(1);
  for (const h of state.resort.courses[0].holes) h.open = true;
  const { report } = runDay(state, 5);
  assert.ok(Number.isFinite(report.groupsPlayed), `groupsPlayed was ${report.groupsPlayed}`);
  assert.ok(Number.isFinite(report.revenue.total), `revenue was ${report.revenue.total}`);
  assert.ok(Number.isFinite(report.averageRoundMinutes), `round time was ${report.averageRoundMinutes}`);
});
