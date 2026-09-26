import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSheetHost } from './helpers/fakeDom.js';
import { newGame, amenity } from '../src/sim/state.js';
import {
  HOTEL_AMENITIES, HOTEL_AMENITY_IDS, hotelUpkeep,
} from '../src/sim/hotelAmenities.js';
import { nightlyUpkeep, roomDemand } from '../src/sim/rooms.js';

const { openHotelSheet } = await import('../src/ui/hotel.js');

/**
 * The hotel sheet.
 *
 * Two failures this file exists to prevent, both of which have already
 * happened here at least once:
 *
 * 1. **A building the simulation knows about and no screen offers.** All
 *    fourteen hotel amenities were written, tested and shipped with no
 *    way to build one. The simulation charged their upkeep, resolved
 *    their appeal and diverted groups onto a short course that could not
 *    exist. The first test below fails the moment a fifteenth is added
 *    to `hotelAmenities.js` without a way to reach it.
 *
 * 2. **The screen quoting a number the simulation disagrees with.** This
 *    project's most frequent bug by a distance. `day.js` charges
 *    `nightlyUpkeep(rooms) + hotelUpkeep(amenities)`; the sheet showed
 *    only the first half, so the quoted bill drifted further from the
 *    real one with every building bought.
 */

function act2(money = 500000) {
  const state = newGame(5);
  state.act = 2;
  state.money = money;
  state.resort.rooms = { standard: 10, suite: 3 };
  state.resort.pricing.roomRate = 120;
  return state;
}

/** Opens the sheet and hands back the rendered body plus the last state
 * the sheet pushed through `onChange`. */
function render(state) {
  const host = fakeSheetHost();
  let latest = state;
  openHotelSheet(host, { state, onChange: (next) => { latest = next; } });
  return { body: host.body, get state() { return latest; }, host };
}

function buttonsIn(body) {
  return body.findAll((n) => n.tagName === 'button');
}

test('every hotel amenity the simulation knows about can be built from the sheet', () => {
  const { body } = render(act2());
  const text = body.textContent;
  for (const id of HOTEL_AMENITY_IDS) {
    assert.ok(text.includes(HOTEL_AMENITIES[id].label),
      `${id} exists in hotelAmenities.js and cannot be reached from any screen`);
  }
});

test('no amenity row renders an undefined label, cost or audience', () => {
  // "Needs undefined" shipped once, from a blurb landing inside the wrong
  // map. A row that says `undefined` is a row describing a building that
  // does not exist.
  const { body } = render(act2());
  assert.ok(!body.textContent.includes('undefined'),
    'a hotel row rendered the word "undefined"');
  assert.ok(!body.textContent.includes('NaN'), 'a hotel row rendered NaN');
});

test('the quoted nightly bill is the one the simulation actually charges', () => {
  const state = act2();
  for (const id of ['pool', 'spa', 'brewPub']) state.resort.amenities.push(amenity(id));

  const { body } = render(state);
  const expected = nightlyUpkeep(state.resort.rooms) + hotelUpkeep(state.resort.amenities);
  const figure = body.findAll((n) => n.className === 'hotel-bill-figure')[0];

  assert.ok(figure, 'the sheet has to show a nightly bill at all');
  assert.equal(figure.textContent, `$${expected.toLocaleString()} a night`,
    'the bill on screen must equal rooms + buildings, which is what day.js bills');
  assert.ok(expected > nightlyUpkeep(state.resort.rooms),
    'this test is worthless unless the buildings actually add to the bill');
});

test('building an amenity writes a type the simulation recognises', () => {
  // The UI and the simulation have to agree on the key. A row that
  // pushes `{ type: "Pool" }` builds nothing and bills nothing, and
  // every screen would still look right.
  const before = act2();
  const sheet = render(before);
  const { body } = sheet;
  const build = buttonsIn(body).find((b) => b.textContent.startsWith('Build'));
  assert.ok(build, 'there has to be something to build');
  build.click();

  const after = sheet.state;
  assert.ok(hotelUpkeep(after.resort.amenities) > 0,
    'the built amenity is not one hotelAmenities.js can resolve');
  assert.ok(after.money < before.money, 'building it has to cost money');
});

test('demolishing asks twice and refunds', () => {
  const state = act2();
  state.resort.amenities.push(amenity('pool'));
  const sheet = render(state);
  const { body } = sheet;

  const sell = buttonsIn(body).find((b) => b.textContent.startsWith('Demolish'));
  assert.ok(sell, 'a built amenity has to be removable');

  sell.click();
  assert.ok(sheet.state.resort.amenities.some((a) => a.type === 'pool'),
    'one tap must not demolish anything');
  assert.match(sell.textContent, /again/i, 'and it has to say it wants confirming');

  sell.click();
  assert.equal(hotelUpkeep(sheet.state.resort.amenities), 0, 'the second tap demolishes');
  assert.ok(sheet.state.money > state.money, 'and refunds something');
});

test('an amenity too expensive to afford says how short you are', () => {
  const { body } = render(act2(1000));
  const short = buttonsIn(body).filter((b) => /short$/.test(b.textContent));
  assert.ok(short.length > 0, 'a broke player should be told the gap, not just find a dead button');
  for (const b of short) assert.equal(b.disabled, true, 'and it must not be clickable');
});

test('hotel amenities and Act I amenities share one list without colliding', () => {
  // They live in the same `resort.amenities` array, keyed by the same
  // `type` field, each resolver ignoring the other's ids.
  const state = act2();
  state.resort.amenities.push(amenity('proShop'), amenity('pool'));
  assert.equal(hotelUpkeep(state.resort.amenities), HOTEL_AMENITIES.pool.upkeep,
    'hotelUpkeep must charge for the pool and ignore the pro shop');
});

test('NO PRICE IS IMMUNE: room demand reaches zero', () => {
  // The floor on priceFit used to be 0.05, so five per cent of guests
  // booked whatever was asked and `rooms sold x rate` grew without bound.
  // Measured on a mature 70-room resort before the fix: occupancy sat at
  // exactly 14 rooms from $700 a night upwards, and at $1,000,000 a night
  // those same 14 rooms took $28,400,000 in one evening.
  const crowd = { locals: 64, serious: 16, destination: 96 };
  const silly = roomDemand({ crowd, roomRate: 1000000, valuePerRound: 60, valueBonus: 120 });
  for (const key of Object.keys(silly)) {
    assert.equal(silly[key], 0, `${key} still wanted a room at a million a night`);
  }

  // And the other direction, because a curve that is always zero would
  // pass the assertion above and break the entire act.
  const fair = roomDemand({ crowd, roomRate: 150, valuePerRound: 60, valueBonus: 120 });
  assert.ok(fair.destination > 0, 'a fair price must still fill beds');
  assert.equal(fair.locals, 0, 'and locals still never book one');
});

test('there is a best nightly rate, and the buildings move it', () => {
  // What valueBonus was always for -- "a spa and a dining room are the
  // reason a room is worth $160 rather than $120". It could not have been
  // true while the best price was unbounded.
  function bestRate(valueBonus) {
    const crowd = { locals: 64, serious: 16, destination: 96 };
    let top = { rate: 0, take: -1 };
    for (let rate = 50; rate <= 1200; rate += 25) {
      const wanted = roomDemand({ crowd, roomRate: rate, valuePerRound: 60, valueBonus });
      const nights = Object.values(wanted).reduce((s, v) => s + v, 0);
      const take = Math.min(nights, 70) * rate;
      if (take > top.take) top = { rate, take };
    }
    return top.rate;
  }
  const bare = bestRate(0);
  const kitted = bestRate(160);
  assert.ok(bare > 50 && bare < 1200, `a bare hotel's best rate is ${bare}, which is an edge not an optimum`);
  assert.ok(kitted > bare,
    `a hotel with a spa and a dining room should carry a higher rate, got ${kitted} against ${bare}`);
});
