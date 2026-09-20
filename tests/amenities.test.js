import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeHole } from '../src/sim/hole.js';
import { makeGroup, resetGuestIds } from '../src/sim/golfer.js';
import { playHole } from '../src/sim/round.js';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

function group(seed = 1) {
  resetGuestIds();
  return makeGroup(makeRng(seed), { prestige: 50, greenFee: 45 }, 1);
}

function totalStrokes(result) {
  return result.scores.reduce((s, x) => s + x.strokes, 0);
}

test('a warmed-up group scores better than a cold one', () => {
  const hole = makeHole('straightPar4', 1);
  let cold = 0;
  let warm = 0;
  for (let seed = 1; seed <= 40; seed++) {
    cold += totalStrokes(playHole(makeRng(seed), hole, group(seed), { carts: false }));
    warm += totalStrokes(
      playHole(makeRng(seed), hole, group(seed), { carts: false, handicapAdjust: -4 })
    );
  }
  assert.ok(warm < cold, `cold ${cold} warm ${warm}`);
});

test('a putting adjustment reduces putts', () => {
  const hole = makeHole('straightPar4', 1);
  let plain = 0;
  let helped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    plain += playHole(makeRng(seed), hole, group(seed), { carts: false })
      .scores.reduce((s, x) => s + x.putts, 0);
    helped += playHole(makeRng(seed), hole, group(seed), { carts: false, puttAdjust: -5 })
      .scores.reduce((s, x) => s + x.putts, 0);
  }
  assert.ok(helped < plain, `plain ${plain} helped ${helped}`);
});

test('a refuel stop restores energy', () => {
  const hole = makeHole('straightPar4', 1);
  const tired = group(3);
  for (const g of tired.guests) g.energy = 15;
  playHole(makeRng(3), hole, tired, { carts: false, refuel: true });
  assert.ok(tired.guests.every((g) => g.energy > 40), 'energy should be restored');
});

test('a refuel stop costs time on the hole it happens', () => {
  const hole = makeHole('straightPar4', 1);

  const a = group(5);
  for (const g of a.guests) g.energy = 100;
  const without = playHole(makeRng(5), hole, a, { carts: false });

  const b = group(5);
  for (const g of b.guests) g.energy = 100;
  const withStop = playHole(makeRng(5), hole, b, { carts: false, refuel: true });

  assert.ok(withStop.minutes > without.minutes,
    `without ${without.minutes} withStop ${withStop.minutes}`);
});

test('handicapAdjust never pushes a handicap below zero', () => {
  const hole = makeHole('shortPar3', 1);
  const scratch = group(4);
  for (const g of scratch.guests) g.handicap = 1;
  const r = playHole(makeRng(4), hole, scratch, { carts: false, handicapAdjust: -20 });
  assert.ok(r.scores.every((s) => s.strokes >= 1));
});

test('a driving range improves satisfaction when the tee sheet has room', () => {
  // Only when there is room. See the next test for why that matters.
  const without = newGame(21);
  without.resort.pricing.teeInterval = 30;
  const withRange = newGame(21);
  withRange.resort.pricing.teeInterval = 30;
  withRange.resort.amenities.push({ type: 'drivingRange' });
  const a = runDay(without, 5).report.averageSatisfaction;
  const b = runDay(withRange, 5).report.averageSatisfaction;
  assert.ok(b > a, `no range ${a} vs range ${b}`);
});

test('an amenity that draws a crowd onto a full tee sheet makes things worse', () => {
  // An improvement raises what a round here is worth, which draws more
  // golfers, which queues them on a course that was already at capacity.
  // Measured: at the default interval the driving range adds a group,
  // stretches the round from 61 to 67 minutes, and drops satisfaction.
  // That is a real trade, not a bug - an amenity only pays if there is
  // room to absorb the crowd it attracts - and it is pinned here so it
  // cannot quietly disappear in a future tuning pass.
  const without = newGame(21);
  const withRange = newGame(21);
  withRange.resort.amenities.push({ type: 'drivingRange' });
  const a = runDay(without, 5).report;
  const b = runDay(withRange, 5).report;
  assert.ok(b.groupsPlayed >= a.groupsPlayed, 'the amenity should draw at least as many');
  assert.ok(
    b.averageRoundMinutes > a.averageRoundMinutes,
    `a fuller tee sheet should play slower: ${a.averageRoundMinutes} vs ${b.averageRoundMinutes}`
  );
});

test('marshals shorten the average round', () => {
  const without = newGame(22);
  without.resort.pricing.teeInterval = 7;
  const withMarshals = structuredClone(without);
  withMarshals.resort.staff.push({ role: 'marshal' }, { role: 'marshal' });

  const a = runDay(without, 6).report.averageRoundMinutes;
  const b = runDay(withMarshals, 6).report.averageRoundMinutes;
  assert.ok(b < a, `no marshals ${a} vs marshals ${b}`);
});

test('marshal benefit is capped so it cannot erase a bad design', () => {
  const few = newGame(23);
  few.resort.pricing.teeInterval = 7;
  few.resort.staff.push({ role: 'marshal' });

  const many = structuredClone(few);
  for (let i = 0; i < 20; i++) many.resort.staff.push({ role: 'marshal' });

  const a = runDay(few, 7).report.averageRoundMinutes;
  const b = runDay(many, 7).report.averageRoundMinutes;
  assert.ok(a - b < a * 0.15, 'twenty marshals should not halve the round time');
});
