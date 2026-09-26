import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandGroups, dailyRevenue, dailyCosts, perceivedValue, WAGES, menuRevenue, MENU_RATE, AMENITIES } from '../src/sim/economy.js';
import { demolitionRefund } from '../src/sim/economy.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { catchmentBySegment, catchmentGroups } from '../src/sim/catchment.js';
import { menuPrep } from '../src/sim/menu.js';
import { BASE_CAPACITY, PER_COOK } from '../src/sim/kitchen.js';

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

test('an upmarket board earns more and keeps less, on a real crowd', () => {
  // The decision this whole slice exists to create, tested the way the
  // player actually faces it.
  //
  // This test has been wrong twice. It first compared REVENUE alone on a
  // mixed crowd, and on that measure the luxury board wins easily — which
  // looked like a design failure and is not one. It is not one because a
  // luxury board is prep 12 and needs three cooks at $540/day where the
  // locals board is prep 5 and needs one at $180. The kitchen is not a
  // side-constraint on menu choice; it is the entire reason menu choice
  // has a wrong answer. Comparing revenue without wages measures half a
  // decision.
  //
  // The crowd below is measured, not invented: a real forty-day Act I game
  // settles around 55% locals / 17% serious / 27% destination.
  const crowd = { locals: 55, serious: 17, destination: 27 };
  const cooksFor = (menu) =>
    Math.max(0, Math.ceil((menuPrep(menu) - BASE_CAPACITY) / PER_COOK));
  const net = (menu) => {
    const { revenue, foodCost } = menuRevenue({
      amenities: [{ type: 'halfwayHouse', menu }], crowd, serviceFactor: 1,
    });
    return revenue - foodCost - cooksFor(menu) * WAGES.kitchenStaff;
  };
  const locals = ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'];
  const luxury = ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'];

  const luxuryRevenue = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: luxury }], crowd, serviceFactor: 1,
  }).revenue;
  const localsRevenue = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: locals }], crowd, serviceFactor: 1,
  }).revenue;
  assert.ok(luxuryRevenue > localsRevenue,
    'the luxury board should take more across the counter — that is what makes it tempting');
  assert.ok(net(locals) > net(luxury),
    `and keep less once the kitchen is paid: locals net ${net(locals)}, luxury net ${net(luxury)}`);
});

test('a board nobody on the course wants earns almost nothing', () => {
  // The simpler half of the promise, and the one that holds without any
  // reference to wages: serve destination food to a crowd with no
  // destination guests in it and the counter stays quiet.
  const localsOnly = { locals: 100, serious: 0, destination: 0 };
  const matched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] }],
    crowd: localsOnly, serviceFactor: 1,
  }).revenue;
  const mismatched = menuRevenue({
    amenities: [{ type: 'halfwayHouse', menu: ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'] }],
    crowd: localsOnly, serviceFactor: 1,
  }).revenue;
  assert.ok(mismatched < matched * 0.5,
    `a destination board on a pure locals crowd took ${mismatched} against ${matched}`);
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

test('demolishing an amenity returns most of what it cost, not all', () => {
  // A full refund would make "build everything, sell what does not help"
  // risk-free, and what helps depends on what else you own — the second
  // order measurements exist because of exactly that.
  for (const type of Object.keys(AMENITIES)) {
    const build = AMENITIES[type].build;
    if (build === 0) continue;
    const back = demolitionRefund(type);
    assert.ok(back < build, `${type}: demolition should not be free`);
    assert.ok(back > build * 0.5, `${type}: losing over half is punitive for a mistake`);
  }
});

test('demolishing something that was free returns nothing', () => {
  assert.equal(demolitionRefund('clubhouse'), 0);
  assert.equal(demolitionRefund('nonsense'), 0);
});

// --- Each crowd is drawn from its own population ----------------------

test('NO CROWD MAY EXCEED THE POPULATION IT IS DRAWN FROM', () => {
  // The fault this fixes: every segment's interest was measured against
  // the whole catchment and `allocateByWeight` then split a fixed total
  // by appeal, so pleasing one crowd took the others' seats one for one.
  // Emptying the town was therefore free -- and conditioning a course for
  // a championship, which is supposed to cost a resort its everyday
  // trade, made it money instead.
  //
  // Swept across the difficulty range, because the whole question is what
  // happens when a course stops suiting the people who live near it.
  const rooms = { standard: 44, suite: 18 };
  const pools = catchmentBySegment(88, rooms);
  for (const courseDifficulty of [20, 35, 50, 65, 80, 95]) {
    const d = demandGroups({
      courseRating: 85, prestige: 88, amenities, greenFee: 80, teeInterval: 14,
      recentSatisfaction: 60, holesOpen: 18, courseDifficulty, scenery: 60,
      turfQuality: 95, hasRooms: true, rooms,
    });
    for (const key of SEGMENT_KEYS) {
      assert.ok(d.bySegment[key] <= Math.ceil(pools[key]),
        `at difficulty ${courseDifficulty}, ${d.bySegment[key]} groups of ${key} came from a `
        + `population of ${pools[key].toFixed(1)} -- golfers are being conjured from nowhere`);
    }
  }
});

test('a course built for one crowd loses the others for good', () => {
  // The other direction. A cap nothing ever reaches would pass the test
  // above while changing nothing about the game, so this asserts that the
  // total actually falls -- the locals lost are NOT replaced.
  const rooms = { standard: 44, suite: 18 };
  const common = {
    courseRating: 85, prestige: 88, amenities, greenFee: 80, teeInterval: 14,
    recentSatisfaction: 60, holesOpen: 18, scenery: 60, turfQuality: 95,
    hasRooms: true, rooms,
  };
  const gentle = demandGroups({ ...common, courseDifficulty: 30 });
  const brutal = demandGroups({ ...common, courseDifficulty: 90 });

  assert.ok(brutal.bySegment.locals < gentle.bySegment.locals * 0.5,
    `locals barely noticed: ${brutal.bySegment.locals} against ${gentle.bySegment.locals}`);
  assert.ok(brutal.bySegment.serious > gentle.bySegment.serious,
    'and the golfers who want a test should turn up for one');
  assert.ok(brutal.total < gentle.total,
    `a course nobody local wants drew ${brutal.total} groups against ${gentle.total} -- `
    + 'the crowd it drove away is being replaced, which is the bug this guards');
});

test('the three populations still sum to the catchment they replaced', () => {
  // The split has to be invisible to anything tuned against the old
  // total, or every balance figure in the game quietly moves.
  for (const [prestige, rooms] of [[10, null], [45, null], [70, null], [95, { standard: 50, suite: 22 }]]) {
    const pools = catchmentBySegment(prestige, rooms);
    const sum = pools.locals + pools.serious + pools.destination;
    assert.ok(Math.abs(sum - catchmentGroups(prestige, rooms)) < 1e-9,
      `at prestige ${prestige} the pools sum to ${sum} but the catchment is ${catchmentGroups(prestige, rooms)}`);
  }
});
