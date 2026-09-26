import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS, RUNG_IDS } from '../src/sim/tournaments.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import {
  CHAMPIONSHIP_BUILDINGS, CHAMPIONSHIP_BUILDING_IDS,
  championshipUpkeep, galleryCapacity, galleryFor, crowdHandledFor,
} from '../src/sim/championshipBuildings.js';

test('there are four, each fully specified', () => {
  assert.equal(CHAMPIONSHIP_BUILDING_IDS.length, 4);
  for (const id of CHAMPIONSHIP_BUILDING_IDS) {
    const b = CHAMPIONSHIP_BUILDINGS[id];
    assert.equal(b.id, id, `${id}: id does not match its key`);
    assert.ok(b.label && b.blurb && b.blurb.length > 30, `${id}: thin copy`);
    assert.ok(b.build > 0 && b.upkeep > 0, `${id}: must cost something`);
    assert.ok(b.gallery > 0, `${id}: must hold some of the gallery`);
  }
});

test('every building a rung requires actually exists', () => {
  // The rungs already name their requirements and `eligibleFor` already
  // checks them. If a name there and a name here drift apart, the rung
  // becomes permanently unreachable and nothing else would say so.
  for (const id of RUNG_IDS) {
    for (const needed of RUNGS[id].requires) {
      assert.ok(CHAMPIONSHIP_BUILDINGS[needed],
        `${id} requires "${needed}", which no building provides`);
    }
  }
});

test('upkeep sums, and a hotel amenity is not billed here', () => {
  assert.equal(championshipUpkeep([]), 0);
  assert.equal(championshipUpkeep([{ type: 'grandstands' }]),
    CHAMPIONSHIP_BUILDINGS.grandstands.upkeep);
  assert.equal(championshipUpkeep([{ type: 'pool' }]), 0,
    'hotelUpkeep bills the pool; billing it here too would bill it twice');
});

test('a county open needs no buildings, and a national needs the whole property', () => {
  assert.ok(crowdHandledFor([], 'countyOpen'),
    'a county open draws a crowd the resort already has room for');

  const pair = [{ type: 'grandstands' }, { type: 'overflowParking' }];
  assert.ok(!crowdHandledFor(pair, 'regional'),
    'the two buildings a regional REQUIRES must not by themselves handle its '
    + 'gallery, or the crowd bonus is free the moment the rung is biddable');
  assert.ok(crowdHandledFor([...pair, { type: 'hospitalityPavilion' }], 'regional'),
    'and buying a national building early must be one way to solve it');

  const all = CHAMPIONSHIP_BUILDING_IDS.map((type) => ({ type }));
  assert.ok(!crowdHandledFor(all, 'national'),
    'even all four must not cover a national on their own');
  assert.ok(crowdHandledFor([...all,
    { type: 'shortCourse' }, { type: 'brewPub' }, { type: 'functionRoom' }], 'national'),
    'a national should need the rest of the property pitching in');
});

test('gallery capacity rises with what is built, and starts above zero', () => {
  assert.ok(galleryCapacity([]) > 0, 'a clubhouse and a car park hold somebody');
  assert.ok(galleryCapacity([{ type: 'grandstands' }]) > galleryCapacity([]));
  assert.ok(galleryFor('national') > galleryFor('regional'));
  assert.ok(galleryFor('regional') > galleryFor('countyOpen'));
  assert.equal(galleryFor('nonsense'), 0);
});

test('championship buildings cost money every day', () => {
  // Through the real day loop, because they share the amenities array
  // with the hotel's and `hotelUpkeep` deliberately ignores them.
  function dailyCost(types) {
    const state = newGame(61);
    for (const type of types) state.resort.amenities.push({ id: type, type, menu: [] });
    return runDay(state, 61).report.costs.total;
  }
  assert.ok(dailyCost(['grandstands']) > dailyCost([]),
    'grandstands must show up on the bill');
});

test('upkeep is a mothball rate, not a hotel rate', () => {
  // Measured: at $1,050/day across the four, a resort that hosted all
  // three rungs and hit every band still lost money against never bidding
  // in five runs of eight, because upkeep over a run swamped the prize
  // money for buildings used on three days.
  const all = CHAMPIONSHIP_BUILDING_IDS.map((type) => ({ type }));
  assert.ok(championshipUpkeep(all) < 400,
    `the four together run at $${championshipUpkeep(all)}/day, which is a running cost `
    + 'rather than a mothball one');
  // But not free -- a stand standing empty still gets inspected.
  for (const id of CHAMPIONSHIP_BUILDING_IDS) {
    assert.ok(CHAMPIONSHIP_BUILDINGS[id].upkeep > 0, `${id} must cost something to hold`);
  }
});

test('only the pavilion earns between championships, and badly', async () => {
  const { championshipTrade } = await import('../src/sim/championshipBuildings.js');
  assert.equal(championshipTrade([{ type: 'grandstands' }]), 0,
    'a grandstand earns nothing in February, which is the point of dead capital');
  const pavilion = championshipTrade([{ type: 'hospitalityPavilion' }]);
  assert.ok(pavilion > 0, 'the pavilion holds weddings');

  // Deliberately a poor return on its own terms. If it ever pays back
  // faster than the function room it stops being a championship building
  // that happens to pay rent and becomes a function room with a silly
  // price, and the decision to build it disappears.
  const spec = CHAMPIONSHIP_BUILDINGS.hospitalityPavilion;
  const netPerDay = pavilion - spec.upkeep;
  const paybackDays = spec.build / netPerDay;
  assert.ok(paybackDays > 300,
    `the pavilion pays for itself in ${Math.round(paybackDays)} days, which is too good `
    + 'for a building whose real job is one week a year');
});
