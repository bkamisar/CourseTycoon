import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { makeGuest, makeGroup } from '../src/sim/golfer.js';
import { SEGMENTS, SEGMENT_KEYS } from '../src/sim/segments.js';

test('a guest has every field the spec requires', () => {
  const g = makeGuest(makeRng(1), { prestige: 40, greenFee: 45 });
  for (const key of ['id', 'name', 'handicap', 'wallet', 'segment', 'patience', 'energy', 'satisfaction', 'stayNights', 'nightsRemaining', 'zonePreference']) {
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

test('a guest carries a segment key', () => {
  const g = makeGuest(makeRng(20), { prestige: 40, greenFee: 45, share: { locals: 1 } });
  assert.ok(SEGMENT_KEYS.includes(g.segment), `unexpected segment: ${g.segment}`);
});

test('callers who never pass a share draw locals only, so existing behaviour is unaffected', () => {
  const rng = makeRng(21);
  for (let i = 0; i < 50; i++) {
    assert.equal(makeGuest(rng, { prestige: 40, greenFee: 45 }).segment, 'locals');
  }
});

test('drawing many guests from a share produces roughly that distribution', () => {
  const rng = makeRng(22);
  const share = { locals: 0.2, serious: 0.3, destination: 0.5 };
  const counts = { locals: 0, serious: 0, destination: 0 };
  const N = 6000;
  for (let i = 0; i < N; i++) {
    counts[makeGuest(rng, { prestige: 40, greenFee: 45, share }).segment]++;
  }
  for (const key of SEGMENT_KEYS) {
    const actual = counts[key] / N;
    assert.ok(Math.abs(actual - share[key]) < 0.03,
      `${key}: expected roughly ${share[key]}, got ${actual}`);
  }
});

test('a single-segment share touches the rng exactly like no share at all', () => {
  // A weighted draw over one option should never happen — it would shift
  // every random number downstream of guest generation (handicaps, shot
  // rolls, everything) for callers who never asked for segments, and once
  // silently flipped an unrelated seeded test far away in amenities.test.js.
  const withoutShare = [];
  const rngA = makeRng(30);
  for (let i = 0; i < 10; i++) withoutShare.push(makeGuest(rngA, { prestige: 40, greenFee: 45 }));

  const withShare = [];
  const rngB = makeRng(30);
  for (let i = 0; i < 10; i++) {
    withShare.push(makeGuest(rngB, { prestige: 40, greenFee: 45, share: { locals: 1 } }));
  }

  for (let i = 0; i < 10; i++) {
    assert.equal(withShare[i].name, withoutShare[i].name);
    assert.equal(withShare[i].handicap, withoutShare[i].handicap);
    assert.equal(withShare[i].wallet, withoutShare[i].wallet);
  }
});

test('a share of zero for a segment never draws it', () => {
  const rng = makeRng(23);
  const share = { locals: 1, serious: 0, destination: 0 };
  for (let i = 0; i < 200; i++) {
    assert.equal(makeGuest(rng, { prestige: 40, greenFee: 45, share }).segment, 'locals');
  }
});

test('serious golfers are markedly better players than locals', () => {
  const locals = averageHandicapForSegment('locals');
  const serious = averageHandicapForSegment('serious');
  assert.ok(serious < locals - 5, `locals ${locals} serious ${serious}`);
});

test('wallets scale by each segment\'s spendMultiplier', () => {
  const locals = averageWalletForSegment('locals');
  const destination = averageWalletForSegment('destination');
  const ratio = destination / locals;
  const expected = SEGMENTS.destination.spendMultiplier / SEGMENTS.locals.spendMultiplier;
  assert.ok(Math.abs(ratio - expected) < 0.3, `ratio ${ratio} expected roughly ${expected}`);
});

function averageHandicapForSegment(segment) {
  const rng = makeRng(90);
  const share = { [segment]: 1 };
  let total = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    total += makeGuest(rng, { prestige: 50, greenFee: 60, share }).handicap;
  }
  return total / N;
}

function averageWalletForSegment(segment) {
  const rng = makeRng(91);
  const share = { [segment]: 1 };
  let total = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    total += makeGuest(rng, { prestige: 50, greenFee: 60, share }).wallet;
  }
  return total / N;
}
