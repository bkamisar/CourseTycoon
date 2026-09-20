import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, WAGES } from '../src/sim/economy.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';

const amenities = [{ type: 'clubhouse' }, { type: 'proShop' }];
const staff = [{ role: 'groundskeeper' }, { role: 'marshal' }];

test('perceived value rises with rating and prestige', () => {
  const poor = perceivedValue({ courseRating: 20, prestige: 10, amenities: [] });
  const good = perceivedValue({ courseRating: 80, prestige: 70, amenities });
  assert.ok(good > poor);
});

test('demand falls as the green fee climbs past perceived value', () => {
  const conditions = { courseRating: 50, prestige: 40, amenities, teeInterval: 10 };
  const cheap = demandGroups({ ...conditions, greenFee: 25 }).total;
  const dear = demandGroups({ ...conditions, greenFee: 200 }).total;
  assert.ok(dear < cheap, `cheap ${cheap} dear ${dear}`);
});

test('demand is capped by the tee sheet, not just by appetite', () => {
  const { total } = demandGroups({
    courseRating: 95, prestige: 95, amenities, greenFee: 5, teeInterval: 60,
  });
  assert.ok(total <= 11, `a 60 minute interval cannot fit ${total} groups`);
});

test('demand is never negative', () => {
  const { total } = demandGroups({
    courseRating: 5, prestige: 0, amenities: [], greenFee: 500, teeInterval: 10,
  });
  assert.ok(total >= 0);
});

test('total demand is the sum of the per-segment breakdown', () => {
  const conditions = {
    courseRating: 60, prestige: 50, amenities, greenFee: 45, teeInterval: 10,
    courseDifficulty: 45, scenery: 60, turfQuality: 70, hasRooms: true,
  };
  const { total, bySegment } = demandGroups(conditions);
  const summed = SEGMENT_KEYS.reduce((s, k) => s + bySegment[k], 0);
  assert.equal(summed, total, `segments summed to ${summed}, total was ${total}`);
});

test('raising difficulty grows the serious share and shrinks the locals share', () => {
  const conditions = {
    courseRating: 60, prestige: 50, amenities, greenFee: 45, teeInterval: 30,
    scenery: 50, turfQuality: 60, hasRooms: true,
  };
  const easy = demandGroups({ ...conditions, courseDifficulty: 25 });
  const hard = demandGroups({ ...conditions, courseDifficulty: 75 });
  assert.ok(hard.share.serious > easy.share.serious,
    `easy serious share ${easy.share.serious}, hard ${hard.share.serious}`);
  assert.ok(hard.share.locals < easy.share.locals,
    `easy locals share ${easy.share.locals}, hard ${hard.share.locals}`);
});

test('raising price shrinks locals hardest', () => {
  const conditions = {
    courseRating: 60, prestige: 50, amenities, teeInterval: 30,
    courseDifficulty: 50, scenery: 50, turfQuality: 60, hasRooms: true,
  };
  const cheap = demandGroups({ ...conditions, greenFee: 30 });
  const dear = demandGroups({ ...conditions, greenFee: 140 });

  const drop = (key) => cheap.bySegment[key] - dear.bySegment[key];
  const localsDrop = drop('locals');
  const seriousDrop = drop('serious');
  const destinationDrop = drop('destination');

  assert.ok(localsDrop >= seriousDrop, `locals drop ${localsDrop} serious drop ${seriousDrop}`);
  assert.ok(localsDrop >= destinationDrop, `locals drop ${localsDrop} destination drop ${destinationDrop}`);
  assert.ok(localsDrop > 0, `locals should lose groups as price rises, drop was ${localsDrop}`);
});

test('demand is still capped by the tee sheet at maximal appeal', () => {
  const { total } = demandGroups({
    courseRating: 95, prestige: 95, amenities, greenFee: 1, teeInterval: 60,
    courseDifficulty: 52, scenery: 100, turfQuality: 100, amenityScore: 1, hasRooms: true,
  });
  assert.ok(total <= 11, `a 60 minute interval cannot fit ${total} groups`);
});

test('revenue counts green fees for every golfer', () => {
  const r = dailyRevenue({
    groupsPlayed: 10, greenFee: 50, amenities: [], averageSatisfaction: 50,
  });
  assert.equal(r.greenFees, 10 * 4 * 50);
});

test('a pro shop adds merchandise revenue', () => {
  const base = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [], averageSatisfaction: 50 });
  const shop = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 50 });
  assert.ok(shop.total > base.total);
  assert.ok(shop.merchandise > 0);
});

test('happier guests spend more in the shop', () => {
  const sad = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 20 });
  const glad = dailyRevenue({ groupsPlayed: 10, greenFee: 50, amenities: [{ type: 'proShop' }], averageSatisfaction: 90 });
  assert.ok(glad.merchandise > sad.merchandise);
});

test('costs include hole upkeep, payroll and amenity upkeep', () => {
  const c = dailyCosts({ holeUpkeep: 500, staff, amenities });
  assert.equal(c.holeUpkeep, 500);
  assert.equal(c.payroll, WAGES.groundskeeper + WAGES.marshal);
  assert.ok(c.amenityUpkeep > 0);
  assert.equal(c.total, c.holeUpkeep + c.payroll + c.amenityUpkeep);
});

test('an empty resort still costs money', () => {
  const c = dailyCosts({ holeUpkeep: 360, staff: [], amenities: [] });
  assert.ok(c.total > 0);
});
