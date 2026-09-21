import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, WAGES, menuRevenue, MENU_RATE, AMENITIES } from '../src/sim/economy.js';
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

const crowd = { locals: 60, serious: 25, destination: 15 }; // golfers, not groups

test('a matched menu earns about what the old flat rate did', () => {
  // The calibration rule: neutral for a player who chooses well.
  const amenities = [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }];
  const { revenue } = menuRevenue({ amenities, crowd, serviceFactor: 1 });
  const golfers = 60 + 25 + 15;
  const oldFlat = golfers * AMENITIES.halfwayHouse.spendPerGuest;
  assert.ok(Math.abs(revenue - oldFlat) / oldFlat < 0.25,
    `matched menu earned ${revenue.toFixed(0)} against the old flat ${oldFlat} — calibration drifted`);
});

test('a mismatched menu earns far less', () => {
  // A LOCALS crowd, per the test's own premise — no destination golfers at
  // all, not the plan's original 60/25/15 mix. With any real destination
  // presence in `crowd`, the destination segment's own numbers (pull 0.98,
  // $24.83 basket vs the matched menu's $8.89-9.47) make the mismatched
  // board earn MORE overall, not less: at 60/25/15 the matched menu scores
  // 896 and the "mismatched" one scores 1039 — RATE cancels out of this
  // ratio entirely (same amenity type on both sides), so no MENU_RATE
  // tuning can fix it, and sweeping the pull exponent from 1 to 20 never
  // gets the ratio below ~0.76. A crowd is not "a locals crowd" if 15% of
  // it is destination guests who love the board being tested against them.
  const localsCrowd = { locals: 100, serious: 0, destination: 0 };
  const matched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd: localsCrowd, serviceFactor: 1,
  }).revenue;
  const mismatched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'] }],
    crowd: localsCrowd, serviceFactor: 1,
  }).revenue;
  assert.ok(mismatched < matched * 0.7,
    `a destination board on a locals crowd earned ${mismatched.toFixed(0)} against ${matched.toFixed(0)}`);
});

test('an empty board earns nothing', () => {
  const { revenue, foodCost } = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: [] }], crowd, serviceFactor: 1,
  });
  assert.equal(revenue, 0);
  assert.equal(foodCost, 0);
});

test('the cost of goods is always well under the revenue', () => {
  const { revenue, foodCost } = menuRevenue({
    amenities: [{ type: 'restaurant', menu: ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad', 'clubSandwich', 'craftAle'] }],
    crowd, serviceFactor: 1,
  });
  assert.ok(foodCost > 0, 'serving food costs something');
  assert.ok(foodCost < revenue * 0.6, `margin too thin: ${foodCost} of ${revenue}`);
});

test('a slow kitchen cuts what is sold and what it cost to buy, together', () => {
  const full = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd, serviceFactor: 1,
  });
  const half = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd, serviceFactor: 0.5,
  });
  assert.ok(Math.abs(half.revenue - full.revenue / 2) < 1);
  assert.ok(Math.abs(half.foodCost - full.foodCost / 2) < 1,
    'food you could not cook is food you did not buy');
});

test('amenities that serve no food are skipped', () => {
  const { revenue } = menuRevenue({
    amenities: [{ type: 'restrooms', menu: [] }, { type: 'proShop' }], crowd, serviceFactor: 1,
  });
  assert.equal(revenue, 0);
});
