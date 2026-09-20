import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentAppeal, crowdMix, SEGMENTS, SEGMENT_KEYS } from '../src/sim/segments.js';

const base = {
  courseDifficulty: 50,
  scenery: 50,
  turfQuality: 50,
  amenityScore: 0.5,
  valueRatio: 1,
  hasRooms: true,
};

test('a short, easy, cheap, fast course appeals to locals far more than serious golfers', () => {
  const conditions = {
    ...base, courseDifficulty: 25, scenery: 30, turfQuality: 50,
    amenityScore: 0.2, valueRatio: 0.6,
  };
  const locals = segmentAppeal('locals', conditions);
  const serious = segmentAppeal('serious', conditions);
  assert.ok(locals > serious + 0.3, `locals ${locals} serious ${serious}`);
});

test('a long, hard, pristine, expensive course appeals to serious golfers far more than locals', () => {
  const conditions = {
    ...base, courseDifficulty: 75, scenery: 60, turfQuality: 95,
    amenityScore: 0.6, valueRatio: 1.1,
  };
  const locals = segmentAppeal('locals', conditions);
  const serious = segmentAppeal('serious', conditions);
  assert.ok(serious > locals + 0.3, `locals ${locals} serious ${serious}`);
});

test('a scenic, amenity-rich course appeals to destination guests most', () => {
  const conditions = {
    ...base, courseDifficulty: 52, scenery: 95, turfQuality: 70,
    amenityScore: 1, valueRatio: 0.9,
  };
  const { appeal } = crowdMix(conditions);
  assert.ok(appeal.destination > appeal.locals, `destination ${appeal.destination} locals ${appeal.locals}`);
  assert.ok(appeal.destination > appeal.serious, `destination ${appeal.destination} serious ${appeal.serious}`);
});

test('no course configuration pleases every segment', () => {
  // The anti-autopilot guarantee. Sweep a grid of difficulty x price x
  // scenery (holding other stats generously high, and rooms present, so
  // this is the best possible case for a universal course) and confirm no
  // combination puts every segment above 0.8.
  const difficulties = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const valueRatios = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4];
  const sceneries = [0, 20, 40, 60, 80, 100];

  let worstOffender = null;
  for (const courseDifficulty of difficulties) {
    for (const valueRatio of valueRatios) {
      for (const scenery of sceneries) {
        const conditions = {
          courseDifficulty, valueRatio, scenery,
          turfQuality: 100, amenityScore: 1, hasRooms: true,
        };
        const { appeal } = crowdMix(conditions);
        const min = Math.min(...SEGMENT_KEYS.map((k) => appeal[k]));
        if (min > 0.8) worstOffender = { conditions, appeal };
      }
    }
  }
  assert.equal(worstOffender, null,
    `a universal course exists: ${JSON.stringify(worstOffender)}`);
});

test('appeal is always within 0 and 1', () => {
  const extremes = [0, 25, 50, 75, 100];
  for (const key of SEGMENT_KEYS) {
    for (const courseDifficulty of extremes) {
      for (const scenery of extremes) {
        for (const turfQuality of extremes) {
          for (const valueRatio of [0, 0.5, 1, 1.5, 3]) {
            for (const hasRooms of [true, false]) {
              const a = segmentAppeal(key, {
                courseDifficulty, scenery, turfQuality,
                amenityScore: 1, valueRatio, hasRooms,
              });
              assert.ok(a >= 0 && a <= 1, `${key} appeal out of range: ${a}`);
            }
          }
        }
      }
    }
  }
});

test('destination appeal is heavily suppressed with no rooms', () => {
  const withRooms = segmentAppeal('destination', { ...base, hasRooms: true });
  const withoutRooms = segmentAppeal('destination', { ...base, hasRooms: false });
  assert.ok(withoutRooms < withRooms * 0.4, `with ${withRooms} without ${withoutRooms}`);
});

test('rooms do not affect locals or serious appeal', () => {
  for (const key of ['locals', 'serious']) {
    const withRooms = segmentAppeal(key, { ...base, hasRooms: true });
    const withoutRooms = segmentAppeal(key, { ...base, hasRooms: false });
    assert.equal(withRooms, withoutRooms);
  }
});

test('crowdMix shares sum to 1 when any segment has appeal', () => {
  const { share } = crowdMix(base);
  const total = SEGMENT_KEYS.reduce((s, k) => s + share[k], 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

test('SEGMENTS defines every segment with the fields appeal and satisfaction need', () => {
  for (const key of SEGMENT_KEYS) {
    const seg = SEGMENTS[key];
    for (const field of ['label', 'idealDifficulty', 'tolerance', 'priceSensitivity',
      'sceneryWeight', 'turfWeight', 'amenityWeight', 'waitWeight', 'spendMultiplier']) {
      assert.ok(field in seg, `${key} missing ${field}`);
    }
  }
});
