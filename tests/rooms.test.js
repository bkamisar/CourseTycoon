import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, serialize } from '../src/sim/state.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import {
  ROOM_TYPES, ROOM_KINDS, STAY_BEHAVIOUR,
  roomCounts, totalRooms, nightlyUpkeep, nightlyRate,
  roomDemand, occupancyFor, roomRevenue,
} from '../src/sim/rooms.js';

const crowd = { locals: 60, serious: 25, destination: 35 };

test('both room kinds are fully specified', () => {
  for (const kind of ROOM_KINDS) {
    const t = ROOM_TYPES[kind];
    assert.ok(t.label && t.blurb, `${kind} is missing copy`);
    assert.ok(t.build > 0 && t.upkeep > 0, `${kind} must cost something`);
    assert.ok(t.rateMultiple > 0);
  }
  assert.ok(ROOM_TYPES.suite.build > ROOM_TYPES.standard.build,
    'a suite should cost more to build than a room');
  assert.ok(ROOM_TYPES.suite.upkeep > ROOM_TYPES.standard.upkeep,
    'and more to run');
});

test('LOCALS NEVER BOOK A ROOM, at any price', () => {
  // The rule Act II is built on. A model that let a regular who plays
  // three times a week book a hotel bed in his own town would be the
  // first dishonest thing in this simulation, and it would dissolve the
  // act's central squeeze: the course that wins Act I is not the course
  // that fills a hotel.
  assert.equal(STAY_BEHAVIOUR.locals.chance, 0);
  assert.equal(STAY_BEHAVIOUR.locals.nights, 0);
  for (const rate of [0, 10, 40, 120, 400]) {
    const wanted = roomDemand({ crowd: { locals: 500, serious: 0, destination: 0 }, roomRate: rate });
    assert.equal(wanted.locals, 0, `locals booked a room at $${rate}`);
  }
});

test('a room costs its upkeep whether anyone sleeps in it or not', () => {
  // The other load-bearing rule. Without it occupancy is a vanity figure
  // and building more rooms is a ratchet rather than a decision.
  const hotel = { standard: 10, suite: 4 };
  const cost = nightlyUpkeep(hotel);
  assert.equal(cost, 10 * ROOM_TYPES.standard.upkeep + 4 * ROOM_TYPES.suite.upkeep);

  const empty = occupancyFor({ rooms: hotel, crowd: { locals: 100, serious: 0, destination: 0 }, roomRate: 90 });
  assert.equal(empty.sold, 0, 'a locals-only crowd fills nothing');
  assert.equal(nightlyUpkeep(hotel), cost, 'and the bill is the same either way');
});

test('no hotel means no upkeep and no occupancy rate', () => {
  assert.equal(nightlyUpkeep({ standard: 0, suite: 0 }), 0);
  assert.equal(nightlyUpkeep(undefined), 0);
  const none = occupancyFor({ rooms: { standard: 0, suite: 0 }, crowd, roomRate: 80 });
  // A resort with no rooms is not running at 0% occupancy — it is not in
  // the hotel business, and an investor target must not read it as failure.
  assert.equal(none.capacity, 0);
  assert.equal(none.rate, 0);
});

test('destination guests fill a hotel and serious golfers half-fill one', () => {
  assert.ok(STAY_BEHAVIOUR.destination.chance > STAY_BEHAVIOUR.serious.chance);
  assert.ok(STAY_BEHAVIOUR.destination.nights > STAY_BEHAVIOUR.serious.nights);
  const guests = roomDemand({ crowd: { locals: 0, serious: 0, destination: 50 }, roomRate: 80 });
  const golfers = roomDemand({ crowd: { locals: 0, serious: 50, destination: 0 }, roomRate: 80 });
  assert.ok(guests.destination > golfers.serious * 2,
    'a destination crowd should want far more room-nights than a serious one');
});

test('a dear room puts people off, but less than a dear round would', () => {
  const cheap = roomDemand({ crowd, roomRate: 40, valuePerRound: 60 });
  const dear = roomDemand({ crowd, roomRate: 200, valuePerRound: 60 });
  assert.ok(dear.destination < cheap.destination, 'price should bite');
  assert.ok(dear.destination > 0,
    'somebody who drove three hours does not sleep in the car over the rate');
});

test('occupancy never exceeds the rooms you built', () => {
  for (const rooms of [{ standard: 1, suite: 0 }, { standard: 5, suite: 5 }, { standard: 40, suite: 20 }]) {
    const o = occupancyFor({ rooms, crowd: { locals: 0, serious: 200, destination: 400 }, roomRate: 30 });
    assert.ok(o.sold <= o.capacity, 'sold more nights than rooms');
    assert.ok(o.rate <= 1, `occupancy rate ${o.rate} above 100%`);
    assert.ok(o.turnedAway >= 0);
  }
});

test('overbuilding shows up as empty rooms rather than as nothing', () => {
  const modest = occupancyFor({ rooms: { standard: 6, suite: 2 }, crowd, roomRate: 80 });
  const bloated = occupancyFor({ rooms: { standard: 60, suite: 40 }, crowd, roomRate: 80 });
  assert.ok(bloated.sold >= modest.sold, 'more rooms cannot sell fewer nights');
  assert.ok(bloated.rate < modest.rate,
    'but the occupancy rate must fall, or overbuilding is free');
  assert.ok(nightlyUpkeep({ standard: 60, suite: 40 }) > nightlyUpkeep({ standard: 6, suite: 2 }) * 5,
    'and it must cost a great deal more to run');
});

test('guests who wanted a suite will take a room, and it is noticed', () => {
  const o = occupancyFor({
    rooms: { standard: 20, suite: 0 },
    crowd: { locals: 0, serious: 0, destination: 40 }, roomRate: 60,
  });
  assert.ok(o.standardSold > 0, 'they would rather have a room than drive home');
  assert.ok(o.unmetSuiteDemand > 0, 'but the game should know they settled');
});

test('a suite charges a multiple of the same rate, not a second price', () => {
  assert.equal(nightlyRate('standard', 100), 100);
  assert.equal(nightlyRate('suite', 100), Math.round(100 * ROOM_TYPES.suite.rateMultiple));
  const o = { suitesSold: 2, standardSold: 3 };
  assert.equal(roomRevenue({ occupancy: o, roomRate: 100 }),
    2 * nightlyRate('suite', 100) + 3 * nightlyRate('standard', 100));
});

test('counts tolerate a resort with no hotel at all', () => {
  assert.deepEqual(roomCounts(undefined), { standard: 0, suite: 0 });
  assert.equal(totalRooms(undefined), 0);
});

test('a save from before Act II loads with an empty hotel', () => {
  const before = JSON.parse(serialize(newGame(4)));
  before.resort.rooms = { count: 0, quality: 0 }; // the old placeholder shape
  const loaded = deserialize(JSON.stringify(before));
  assert.equal(loaded.resort.rooms.standard, 0);
  assert.equal(loaded.resort.rooms.suite, 0);
  assert.equal(totalRooms(loaded.resort.rooms), 0);
});

test('every crowd has stay behaviour, so none is silently ignored', () => {
  for (const key of SEGMENT_KEYS) {
    assert.ok(STAY_BEHAVIOUR[key], `${key} has no stay behaviour`);
  }
});
