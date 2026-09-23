import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/fakeDom.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { startingInvestors, payBuyout, SETTLEMENT_DAYS } from '../src/sim/investors.js';
import { makeRng } from '../src/sim/rng.js';
import { totalRooms } from '../src/sim/rooms.js';

const { openHotelSheet } = await import('../src/ui/hotel.js');
const { fakeSheetHost } = await import('./helpers/fakeDom.js');

/**
 * Act II's two endings.
 *
 * `payBuyout` and `forceLiquidation` were both written, both tested as
 * pure functions, and **neither was ever called**. `settlementDue` raised
 * a demand, the day recap announced it, and then the due day came and
 * went with nothing happening on either side of it. The act had no
 * ending: the good one was unreachable and the bad one never fired.
 *
 * The asymmetry below is the part most likely to be broken by a later
 * edit that tidies the two kinds into one branch. A `demand` is the
 * investors calling in a debt and letting it lapse costs rooms. An
 * `offer` is a well-run resort earning the right to own itself, and the
 * penalty for not having the cash to hand cannot be losing the hotel.
 */

/**
 * `dueIn` is days from today. Zero means the deadline is today, and the
 * settlement resolves at the END of the day being played -- so the player
 * gets the whole of the due day to find the money, and a single runDay
 * from here is the day it runs out.
 */
function withSettlement(kind, { money = 0, amount = 50000, dueIn = 0 } = {}) {
  const state = newGame(31);
  state.act = 2;
  state.day = 40;
  state.money = money;
  state.resort.rooms = { standard: 14, suite: 6 };
  state.resort.pricing.roomRate = 120;
  state.investors = startingInvestors(state, makeRng(31));
  state.investors.confidence = kind === 'offer' ? 95 : 0;
  state.investors.buyoutDemand = {
    kind, amount, dueDay: state.day + dueIn,
  };
  return state;
}

test('an unpaid demand sells rooms when the deadline passes', () => {
  const state = withSettlement('demand', { money: 0, amount: 60000 });
  const roomsBefore = totalRooms(state.resort.rooms);

  const { state: after, report } = runDay(state, 3100);
  assert.ok(report.investors.liquidated, 'the deadline has to actually fire');
  assert.ok(totalRooms(after.resort.rooms) < roomsBefore,
    'they have to sell something to get their money back');
  assert.equal(after.investors.buyoutDemand, null, 'and the demand is settled');
  assert.ok(after.investors.bought, 'the act is over either way');
});

test('an unpaid OFFER does not cost the player a single room', () => {
  // The asymmetry. A resort good enough to be offered a buyout must not
  // be liquidated for failing to have the cash on the day.
  const state = withSettlement('offer', { money: 0, amount: 60000 });
  const roomsBefore = totalRooms(state.resort.rooms);

  const { state: after, report } = runDay(state, 3100);
  assert.ok(!report.investors.liquidated,
    'a lapsed offer must never liquidate a resort that earned it');
  assert.equal(totalRooms(after.resort.rooms), roomsBefore, 'no rooms sold');
  assert.ok(report.investors.offerLapsed, 'but it does lapse');
  assert.equal(after.investors.buyoutDemand, null);
  assert.ok(!after.investors.bought, 'and the investors are still there');
});

test('a lapsed offer does not come straight back the next morning', () => {
  const state = withSettlement('offer', { money: 0 });
  const { state: after } = runDay(state, 3100);
  assert.equal(after.investors.goodReviews, 0,
    'the streak has to restart, or the deadline means nothing');
  const { state: nextDay } = runDay(after, 3101);
  assert.equal(nextDay.investors.buyoutDemand, null,
    'the offer must not be raised again the very next day');
});

test('paying a demand ends the act instead of losing rooms', () => {
  const state = withSettlement('demand', { money: 80000, amount: 60000 });
  const paid = payBuyout(state);
  assert.ok(paid.investors.bought, 'paying has to settle it');
  assert.equal(paid.money, 20000, 'and cost exactly what was owed');

  const roomsBefore = totalRooms(paid.resort.rooms);
  const { state: after, report } = runDay(paid, 3100);
  assert.equal(totalRooms(after.resort.rooms), roomsBefore,
    'a paid-off resort must not be liquidated by the deadline it already met');
  assert.ok(!report.investors?.liquidated);
});

test('once bought out there are no more targets or reviews', () => {
  const state = withSettlement('offer', { money: 80000, amount: 60000 });
  let current = payBuyout(state);
  assert.ok(current.investors.bought);
  for (let d = 0; d < 20; d++) {
    const { state: next, report } = runDay(current, 3200 + d);
    current = next;
    assert.equal(report.investors?.target ?? null, null,
      `day ${d}: a bought-out resort must not be given a new target`);
  }
  assert.equal(current.investors.buyoutDemand ?? null, null);
});

// --- The button that does it -------------------------------------------

function sheetFor(state) {
  const host = fakeSheetHost();
  let latest = state;
  openHotelSheet(host, { state, onChange: (next) => { latest = next; } });
  return { body: host.body, get state() { return latest; } };
}

test('the hotel sheet offers a way to settle, and it works', () => {
  const state = withSettlement('demand', { money: 80000, amount: 60000 });
  const sheet = sheetFor(state);

  const pay = sheet.body.findAll((n) => n.tagName === 'button')
    .find((b) => /^Pay \$/.test(b.textContent));
  assert.ok(pay, 'a standing demand has to be payable from somewhere');
  assert.equal(pay.disabled, false);

  pay.click();
  assert.ok(sheet.state.investors.bought, 'the button has to actually pay them');
  assert.equal(sheet.state.money, 20000);
});

test('a player who cannot afford it is told the gap, not given a dead button', () => {
  const state = withSettlement('demand', { money: 10000, amount: 60000 });
  const sheet = sheetFor(state);
  const pay = sheet.body.findAll((n) => n.tagName === 'button')
    .find((b) => /short$/.test(b.textContent));
  assert.ok(pay, 'the shortfall should be named');
  assert.equal(pay.disabled, true);
  assert.ok(pay.textContent.includes('50,000'), `got "${pay.textContent}"`);
});

test('a resort with no standing demand shows no settlement card', () => {
  const state = newGame(9);
  state.act = 2;
  state.resort.rooms = { standard: 4, suite: 1 };
  const sheet = sheetFor(state);
  assert.ok(!sheet.body.textContent.includes('Pay $'),
    'the card must not appear when nothing is owed');
});

test('the deadline is a fortnight, not a surprise', () => {
  assert.ok(SETTLEMENT_DAYS >= 10,
    `${SETTLEMENT_DAYS} days is not long enough to raise real money against`);
});
