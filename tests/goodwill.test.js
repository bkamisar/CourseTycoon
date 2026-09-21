import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import {
  emptyGoodwill,
  applyGoodwill,
  decayGoodwill,
  goodwillFactor,
  GOODWILL_MIN,
  GOODWILL_MAX,
} from '../src/sim/goodwill.js';

test('emptyGoodwill is zero for every segment', () => {
  const gw = emptyGoodwill();
  for (const key of SEGMENT_KEYS) assert.equal(gw[key], 0);
});

test('applying a change moves that segment and leaves the others alone', () => {
  const before = emptyGoodwill();
  const after = applyGoodwill(before, { locals: 8 });
  assert.equal(after.locals, 8);
  assert.equal(after.serious, 0);
  assert.equal(after.destination, 0);
});

test('applying several changes at once moves each segment independently', () => {
  const before = emptyGoodwill();
  const after = applyGoodwill(before, { locals: 5, serious: -3 });
  assert.equal(after.locals, 5);
  assert.equal(after.serious, -3);
  assert.equal(after.destination, 0);
});

test('applyGoodwill does not mutate the goodwill it was given', () => {
  const before = emptyGoodwill();
  const snapshot = JSON.stringify(before);
  applyGoodwill(before, { locals: 10 });
  assert.equal(JSON.stringify(before), snapshot);
});

test('values clamp at the upper bound', () => {
  const after = applyGoodwill(emptyGoodwill(), { serious: GOODWILL_MAX + 50 });
  assert.equal(after.serious, GOODWILL_MAX);
});

test('values clamp at the lower bound', () => {
  const after = applyGoodwill(emptyGoodwill(), { destination: GOODWILL_MIN - 50 });
  assert.equal(after.destination, GOODWILL_MIN);
});

test('repeated applications clamp too, not just a single large one', () => {
  let gw = emptyGoodwill();
  for (let i = 0; i < 20; i++) gw = applyGoodwill(gw, { locals: 5 });
  assert.equal(gw.locals, GOODWILL_MAX);
});

test('decay moves every segment toward zero and never overshoots past it', () => {
  let gw = { locals: 20, serious: -14, destination: 3 };
  for (let day = 0; day < 40; day++) {
    const next = decayGoodwill(gw);
    for (const key of SEGMENT_KEYS) {
      if (gw[key] > 0) {
        assert.ok(next[key] <= gw[key] && next[key] >= 0,
          `${key} overshot zero on day ${day}: ${gw[key]} -> ${next[key]}`);
      } else if (gw[key] < 0) {
        assert.ok(next[key] >= gw[key] && next[key] <= 0,
          `${key} overshot zero on day ${day}: ${gw[key]} -> ${next[key]}`);
      } else {
        assert.equal(next[key], 0);
      }
    }
    gw = next;
  }
});

test('a segment already at zero stays at zero through decay', () => {
  const gw = { locals: 0, serious: 12, destination: -12 };
  const next = decayGoodwill(gw);
  assert.equal(next.locals, 0);
});

test('decay does not touch other segments', () => {
  const gw = { locals: 25, serious: 0, destination: 0 };
  const next = decayGoodwill(gw);
  assert.ok(next.locals < 25);
  assert.equal(next.serious, 0);
  assert.equal(next.destination, 0);
});

test('decay from +25 becomes negligible within one to three weeks, not sooner and not never', () => {
  let gw = { locals: 25, serious: 0, destination: 0 };
  let daysToNegligible = null;
  for (let day = 1; day <= 30; day++) {
    gw = decayGoodwill(gw);
    if (daysToNegligible === null && Math.abs(gw.locals) < 1) daysToNegligible = day;
  }
  assert.ok(daysToNegligible !== null, 'never became negligible within 30 days');
  assert.ok(daysToNegligible >= 7 && daysToNegligible <= 21,
    `took ${daysToNegligible} days, expected one to three weeks`);
});

test('goodwillFactor is neutral at zero goodwill', () => {
  const gw = emptyGoodwill();
  for (const key of SEGMENT_KEYS) assert.equal(goodwillFactor(gw, key), 1);
});

test('goodwillFactor rises with positive goodwill and falls with negative', () => {
  const positive = goodwillFactor({ locals: 20, serious: 0, destination: 0 }, 'locals');
  const negative = goodwillFactor({ locals: -20, serious: 0, destination: 0 }, 'locals');
  assert.ok(positive > 1, `expected > 1, got ${positive}`);
  assert.ok(negative < 1, `expected < 1, got ${negative}`);
});

test('goodwillFactor is monotonic in goodwill', () => {
  const values = [-25, -10, 0, 10, 25];
  const factors = values.map((v) => goodwillFactor({ locals: v, serious: 0, destination: 0 }, 'locals'));
  for (let i = 1; i < factors.length; i++) {
    assert.ok(factors[i] > factors[i - 1], `factors not increasing: ${factors}`);
  }
});

test('goodwillFactor copes with a missing segment (treats it as zero)', () => {
  assert.equal(goodwillFactor({}, 'locals'), 1);
  assert.equal(goodwillFactor(undefined, 'locals'), 1);
});

test('goodwillFactor never turns appeal negative even at the minimum', () => {
  const factor = goodwillFactor({ locals: GOODWILL_MIN, serious: 0, destination: 0 }, 'locals');
  assert.ok(factor > 0, `factor must stay positive, got ${factor}`);
});
