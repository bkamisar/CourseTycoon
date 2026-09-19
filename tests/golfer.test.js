import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeGuest, makeGroup } from '../src/sim/golfer.js';

test('a guest has every field the spec requires', () => {
  const g = makeGuest(makeRng(1), { prestige: 40, greenFee: 45 });
  for (const key of ['id', 'name', 'handicap', 'wallet', 'patience', 'energy', 'satisfaction', 'stayNights', 'nightsRemaining', 'zonePreference']) {
    assert.ok(key in g, `missing field: ${key}`);
  }
});

test('stayNights is always 1 in Act I', () => {
  const rng = makeRng(2);
  for (let i = 0; i < 50; i++) {
    assert.equal(makeGuest(rng, { prestige: 60, greenFee: 80 }).stayNights, 1);
  }
});

test('patience and energy start full', () => {
  const g = makeGuest(makeRng(3), { prestige: 40, greenFee: 45 });
  assert.equal(g.patience, 100);
  assert.equal(g.energy, 100);
});

test('handicaps stay within 0 and 36', () => {
  const rng = makeRng(4);
  for (let i = 0; i < 500; i++) {
    const h = makeGuest(rng, { prestige: 50, greenFee: 60 }).handicap;
    assert.ok(h >= 0 && h <= 36, `handicap out of range: ${h}`);
  }
});

test('higher prestige attracts better golfers on average', () => {
  const low = averageHandicap({ prestige: 10, greenFee: 30 });
  const high = averageHandicap({ prestige: 90, greenFee: 30 });
  assert.ok(high < low - 1.5, `low ${low} vs high ${high}`);
});

test('higher green fees attract deeper wallets on average', () => {
  const cheap = averageWallet({ prestige: 50, greenFee: 30 });
  const dear = averageWallet({ prestige: 50, greenFee: 120 });
  assert.ok(dear > cheap, `cheap ${cheap} vs dear ${dear}`);
});

test('makeGroup returns four guests with unique ids', () => {
  const group = makeGroup(makeRng(9), { prestige: 40, greenFee: 45 }, 7);
  assert.equal(group.guests.length, 4);
  assert.equal(group.id, 7);
  assert.equal(new Set(group.guests.map((g) => g.id)).size, 4);
});

function averageHandicap(conditions) {
  const rng = makeRng(77);
  let total = 0;
  for (let i = 0; i < 400; i++) total += makeGuest(rng, conditions).handicap;
  return total / 400;
}

function averageWallet(conditions) {
  const rng = makeRng(78);
  let total = 0;
  for (let i = 0; i < 400; i++) total += makeGuest(rng, conditions).wallet;
  return total / 400;
}
