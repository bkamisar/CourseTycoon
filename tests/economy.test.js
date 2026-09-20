import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, WAGES } from '../src/sim/economy.js';

const amenities = [{ type: 'clubhouse' }, { type: 'proShop' }];
const staff = [{ role: 'groundskeeper' }, { role: 'marshal' }];

test('perceived value rises with rating and prestige', () => {
  const poor = perceivedValue({ courseRating: 20, prestige: 10, amenities: [] });
  const good = perceivedValue({ courseRating: 80, prestige: 70, amenities });
  assert.ok(good > poor);
});

test('demand falls as the green fee climbs past perceived value', () => {
  const conditions = { courseRating: 50, prestige: 40, amenities, teeInterval: 10 };
  const cheap = demandGroups({ ...conditions, greenFee: 25 });
  const dear = demandGroups({ ...conditions, greenFee: 200 });
  assert.ok(dear < cheap, `cheap ${cheap} dear ${dear}`);
});

test('demand is capped by the tee sheet, not just by appetite', () => {
  const groups = demandGroups({
    courseRating: 95, prestige: 95, amenities, greenFee: 5, teeInterval: 60,
  });
  assert.ok(groups <= 11, `a 60 minute interval cannot fit ${groups} groups`);
});

test('demand is never negative', () => {
  const groups = demandGroups({
    courseRating: 5, prestige: 0, amenities: [], greenFee: 500, teeInterval: 10,
  });
  assert.ok(groups >= 0);
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
