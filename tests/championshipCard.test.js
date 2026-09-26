import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNGS } from '../src/sim/tournaments.js';
import { championshipCards } from '../src/ui/championshipCard.js';

test('no cards on an ordinary evening', () => {
  assert.deepEqual(championshipCards({ day: 40 }, {}), []);
});

test('the invitation arrives as its own card', () => {
  const cards = championshipCards({ day: 60, actThreeArrived: true }, { act: 3 });
  assert.equal(cards.length, 1);
  assert.match(cards[0].id, /invit/i);
  assert.ok(cards[0].prompt.length > 80, 'a letter from a governing body deserves words');
  assert.equal(cards[0].choices.length, 1, 'an announcement, not a decision');
});

test('the result names every condition, met or missed', () => {
  // The whole point of four named conditions is that the player can see
  // which one cost them. A card showing only the total would make the
  // contract an opaque score again.
  const report = {
    day: 90,
    tournament: {
      rung: 'countyOpen',
      met: ['band', 'turf'],
      missed: ['pace', 'crowd'],
      paid: 61000, prestige: 4, barDays: 0,
      setup: 52, band: RUNGS.countyOpen.band, turfQuality: 88,
      field: {
        averageToPar: 5.4, underPar: 2, best: -2,
        hardestHole: 14, averageRoundMinutes: 268,
      },
    },
  };
  const cards = championshipCards(report, { act: 3 });
  assert.equal(cards.length, 1);
  const card = cards[0];
  for (const condition of ['band', 'turf', 'pace', 'crowd']) {
    assert.ok(card.conditions.some((c) => c.id === condition),
      `${condition} must appear on the result card`);
  }
  assert.equal(card.conditions.filter((c) => c.met).length, 2);
  assert.match(card.prompt, /61,000/, 'the money must be in the words');
});

test('the card and the payout cannot disagree', () => {
  // A card is built from the contract's own line items and the report's
  // met list, so what it shows as earned has to add up to what was
  // actually banked. This is the bug species this project produces more
  // than any other, on the one surface where it would be loudest.
  const report = {
    day: 91,
    tournament: {
      rung: 'regional', met: ['band', 'turf', 'pace'], missed: ['crowd'],
      paid: 0, prestige: 6, barDays: 0,
      setup: 70, band: RUNGS.regional.band, turfQuality: 84,
      field: { averageToPar: 7.1, underPar: 1, best: -1, hardestHole: 9, averageRoundMinutes: 279 },
    },
  };
  const contract = championshipCards(report, { act: 3 })[0];
  const earned = contract.conditions
    .filter((c) => c.met)
    .reduce((sum, c) => sum + c.amount, RUNGS.regional.baseFee);
  assert.equal(earned, contract.wouldPay,
    'the line items the card shows as met must sum to what it says was earned');
});

test('a missed band says the other conditions were earned but not paid', () => {
  // Band gates the rest. The card must not silently drop three conditions
  // the player genuinely met -- that reads as the game losing them.
  const report = {
    day: 92,
    tournament: {
      rung: 'countyOpen', met: ['turf', 'pace', 'crowd'], missed: ['band'],
      paid: RUNGS.countyOpen.baseFee, prestige: 2, barDays: 0,
      setup: 12, band: RUNGS.countyOpen.band, turfQuality: 94,
      field: { averageToPar: 1.1, underPar: 17, best: -8, hardestHole: 2, averageRoundMinutes: 241 },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.equal(card.conditions.filter((c) => c.met).length, 3);
  assert.equal(card.conditions.filter((c) => c.paid).length, 0,
    'nothing pays without the band');
  assert.match(card.prompt, /band|set/i, 'and the card has to say why');
});

test('a barred rung says so, because a setback the player cannot see is a dead end', () => {
  const report = {
    day: 93,
    tournament: {
      rung: 'countyOpen', met: [], missed: ['band', 'turf', 'pace', 'crowd'],
      paid: RUNGS.countyOpen.baseFee, prestige: -6, barDays: 120,
      setup: 5, band: RUNGS.countyOpen.band, turfQuality: 40,
      field: { averageToPar: 1.2, underPar: 19, best: -7, hardestHole: 3, averageRoundMinutes: 240 },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.match(card.prompt, /120|season/i, 'the bar has to be stated');
});

test('the field is described, since it is what the dial was for', () => {
  const report = {
    day: 94,
    tournament: {
      rung: 'national', met: ['band', 'turf', 'pace', 'crowd'], missed: [],
      paid: 500000, prestige: 18, barDays: 0,
      setup: 86, band: RUNGS.national.band, turfQuality: 90,
      field: { averageToPar: 9.1, underPar: 0, best: 1, hardestHole: 17, averageRoundMinutes: 284 },
    },
  };
  const [card] = championshipCards(report, { act: 3 });
  assert.match(card.field, /9\.1|nine/i, 'what the field averaged');
  assert.match(card.field, /17/, 'and which hole took the most off them');
});
