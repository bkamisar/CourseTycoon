import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay, marshalPaceFactor, applyEventChoice, halfwayRestoreTo, cartRestoreTo } from '../src/sim/day.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { emptyGoodwill, applyGoodwill } from '../src/sim/goodwill.js';
import { EVENTS, STANCES } from '../src/sim/events.js';
import { playHole } from '../src/sim/round.js';
import { makeGroup, resetGuestIds } from '../src/sim/golfer.js';
import { makeRng } from '../src/sim/rng.js';
import { menuPrep } from '../src/sim/menu.js';
import { BASE_CAPACITY, PER_COOK } from '../src/sim/kitchen.js';
import { TEMPLATES } from '../src/sim/templates.js';

test('runDay returns a next state, a report and a timeline', () => {
  const { state, report, timeline } = runDay(newGame(1), 1);
  assert.ok(state && report && timeline);
  assert.ok(Array.isArray(timeline));
});

test('runDay does not mutate the state it was given', () => {
  const before = newGame(2);
  const snapshot = JSON.stringify(before);
  runDay(before, 2);
  assert.equal(JSON.stringify(before), snapshot);
});

test('the same state and seed produce an identical day', () => {
  const a = runDay(newGame(3), 99);
  const b = runDay(newGame(3), 99);
  assert.deepEqual(a.report, b.report);
  assert.equal(a.timeline.length, b.timeline.length);
});

test('different seeds produce different days', () => {
  const a = runDay(newGame(4), 1);
  const b = runDay(newGame(4), 2);
  assert.notDeepEqual(a.report, b.report);
});

test('the day advances and history grows', () => {
  const { state } = runDay(newGame(5), 1);
  assert.equal(state.day, 2);
  assert.equal(state.history.length, 1);
  assert.equal(state.satisfactionHistory.length, 1);
});

test('money changes by exactly profit', () => {
  const before = newGame(6);
  const { state, report } = runDay(before, 1);
  assert.equal(state.money, before.money + report.profit);
});

test('profit is revenue minus costs', () => {
  const { report } = runDay(newGame(7), 1);
  assert.equal(report.profit, report.revenue.total - report.costs.total);
});

test('the report carries everything the evening screen needs', () => {
  const { report } = runDay(newGame(8), 1);
  for (const key of ['day', 'groupsPlayed', 'revenue', 'costs', 'profit',
    'averageSatisfaction', 'averageRoundMinutes', 'courseRating', 'courseDifficulty',
    'prestige', 'crowd', 'complaints', 'gate']) {
    assert.ok(key in report, `report missing: ${key}`);
  }
});

test('crowd segment counts sum to the total golfers', () => {
  const { report } = runDay(newGame(14), 1);
  const total = SEGMENT_KEYS.reduce((s, key) => s + report.crowd[key].count, 0);
  assert.equal(total, report.groupsPlayed * 4,
    `crowd counts summed to ${total}, expected ${report.groupsPlayed * 4} golfers`);
});

test('the crowd breakdown covers every segment with a count and a satisfaction figure', () => {
  const { report } = runDay(newGame(15), 1);
  for (const key of SEGMENT_KEYS) {
    assert.ok(key in report.crowd, `crowd missing segment: ${key}`);
    assert.equal(typeof report.crowd[key].count, 'number');
    assert.ok(report.crowd[key].count >= 0);
    // No guests of a segment on a given day means nothing to average.
    if (report.crowd[key].count === 0) {
      assert.equal(report.crowd[key].averageSatisfaction, null);
    } else {
      assert.equal(typeof report.crowd[key].averageSatisfaction, 'number');
    }
  }
});

test('the same state and seed produce an identical crowd breakdown', () => {
  const a = runDay(newGame(16), 42).report.crowd;
  const b = runDay(newGame(16), 42).report.crowd;
  assert.deepEqual(a, b);
});

test('courseDifficulty is the mean difficulty across the open holes, zero with none open', () => {
  const closed = newGame(17);
  for (const h of closed.resort.courses[0].holes) h.open = false;
  const { report } = runDay(closed, 1);
  assert.equal(report.courseDifficulty, 0);

  const open = runDay(newGame(17), 1).report;
  assert.ok(open.courseDifficulty > 0, `expected a positive difficulty, got ${open.courseDifficulty}`);
});

test('a course priced far above what anyone thinks it is worth draws nobody, without crashing', () => {
  const state = newGame(18);
  state.resort.pricing.greenFee = 5000;
  const { report } = runDay(state, 1);
  assert.equal(report.groupsPlayed, 0);
  for (const key of SEGMENT_KEYS) {
    assert.equal(report.crowd[key].count, 0);
    assert.equal(report.crowd[key].averageSatisfaction, null);
  }
});

test('timeline events are ordered by time', () => {
  const { timeline } = runDay(newGame(9), 1);
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(timeline[i].minute >= timeline[i - 1].minute,
      `event ${i} went backwards in time`);
  }
});

test('every timeline event carries a minute and a type', () => {
  const { timeline } = runDay(newGame(10), 1);
  for (const e of timeline) {
    assert.equal(typeof e.minute, 'number');
    assert.equal(typeof e.type, 'string');
  }
});

test('turf decays without enough groundskeepers and recovers with them', () => {
  const neglected = newGame(11);
  neglected.resort.staff = [];
  const understaffed = runDay(neglected, 1).state.turfQuality;

  const tended = newGame(11);
  tended.resort.staff = [
    { role: 'groundskeeper' }, { role: 'groundskeeper' }, { role: 'groundskeeper' },
  ];
  const wellKept = runDay(tended, 1).state.turfQuality;

  assert.ok(understaffed < neglected.turfQuality, 'turf should decay when nobody tends it');
  assert.ok(wellKept > understaffed);
});

test('a resort with no open holes does not crash and earns nothing', () => {
  const closed = newGame(12);
  for (const h of closed.resort.courses[0].holes) h.open = false;
  const { report } = runDay(closed, 1);
  assert.equal(report.groupsPlayed, 0);
  assert.equal(report.revenue.total, 0);
});

test('ten consecutive days run without error and keep state coherent', () => {
  let state = newGame(13);
  for (let i = 0; i < 10; i++) state = runDay(state, 100 + i).state;
  assert.equal(state.day, 11);
  assert.equal(state.history.length, 10);
  assert.ok(state.prestige >= 0 && state.prestige <= 100);
  assert.ok(Number.isFinite(state.money));
});

test('marshals shorten hole times on a capped curve', () => {
  // The pricing sheet forecasts pace from this same function, so that the
  // prediction and the day agree. It used to ignore marshals entirely.
  assert.equal(marshalPaceFactor(0), 1);
  assert.ok(marshalPaceFactor(1) < marshalPaceFactor(0));
  assert.ok(marshalPaceFactor(3) < marshalPaceFactor(1));
  // Capped: a fourth marshal buys nothing, deliberately, so staffing cannot
  // undo a badly designed course.
  assert.equal(marshalPaceFactor(4), marshalPaceFactor(3));
  assert.equal(marshalPaceFactor(50), marshalPaceFactor(3));
});

// --- Task 4: goodwill decay and decision events wired into the day -------

test('goodwill decays every day', () => {
  const state = newGame(200);
  state.goodwill = applyGoodwill(emptyGoodwill(), { locals: 20, serious: -15 });
  const { state: next } = runDay(state, 1);
  assert.ok(Math.abs(next.goodwill.locals) < 20, 'locals goodwill should have faded');
  assert.ok(Math.abs(next.goodwill.serious) < 15, 'serious goodwill should have faded');
  // Sign preserved — decay fades toward zero, it does not flip sides.
  assert.ok(next.goodwill.locals > 0);
  assert.ok(next.goodwill.serious < 0);
});

test('a segment with no goodwill stays at zero after decay', () => {
  const { state: next } = runDay(newGame(201), 1);
  assert.equal(next.goodwill.destination, 0);
});

test('runDay copes with a save that predates goodwill and eventsSeen', () => {
  const legacy = newGame(202);
  delete legacy.goodwill;
  delete legacy.eventsSeen;
  const { state: next, report } = runDay(legacy, 1);
  assert.ok(next.goodwill, 'goodwill should default safely rather than crash');
  for (const key of SEGMENT_KEYS) assert.equal(typeof next.goodwill[key], 'number');
  assert.ok(Array.isArray(next.eventsSeen));
  assert.ok('pendingEvent' in report);
});

test('the report carries a pending event field, present or explicitly null', () => {
  const { report } = runDay(newGame(203), 1);
  assert.ok('pendingEvent' in report);
  assert.ok(report.pendingEvent === null || typeof report.pendingEvent === 'object');
});

test('a pending event, when offered, carries a speaker, a prompt and choices with costs', () => {
  // Sweep enough seeds that at least one day offers an event.
  let found = null;
  for (let seed = 0; seed < 60 && !found; seed++) {
    const { report } = runDay(newGame(300), seed);
    if (report.pendingEvent) found = report.pendingEvent;
  }
  assert.ok(found, 'no seed in the sweep offered an event — cadence may be broken');
  assert.ok(found.speaker && found.speaker.length > 0);
  assert.ok(found.prompt && found.prompt.length > 0);
  assert.ok(Array.isArray(found.choices) && found.choices.length >= 2);
  for (const choice of found.choices) {
    assert.ok(choice.label);
    assert.ok(choice.cost);
    // The stance has to survive the trip onto the report, or the card
    // renders choices with no labelling and the player is back to
    // comparing raw numbers.
    assert.ok(STANCES[choice.stance], `unknown stance "${choice.stance}"`);
  }
});

test("runDay's report IS the entry it pushed onto history, not a copy", () => {
  // src/main.js settles an answered decision by mutating the report it
  // was handed, and relies on that reaching the state it saves. If runDay
  // ever starts cloning on the way into history, that write lands on an
  // object nobody keeps and saved games quietly carry answered events
  // around as though they were still open.
  const { state: next, report } = runDay(newGame(42), 5);
  assert.equal(next.history.at(-1), report);
});

test('an event is offered roughly weekly, over many days, and never more than one on a single day', () => {
  let state = newGame(9001);
  let offered = 0;
  const days = 140; // twenty weeks
  for (let i = 0; i < days; i++) {
    const { state: next, report } = runDay(state, 5000 + i);
    assert.ok(report.pendingEvent === null || typeof report.pendingEvent === 'object',
      'never more than a single pending event on any one day');
    if (report.pendingEvent) offered += 1;
    state = next;
  }
  const expected = days / 7;
  // Loose band around "roughly weekly" — this is a statistical cadence, not
  // a magic number, so it is checked as a shape rather than an exact count.
  assert.ok(offered >= expected * 0.3 && offered <= expected * 2.2,
    `expected roughly ${expected.toFixed(0)} events over ${days} days, got ${offered}`);
});

test('selection of the pending event is deterministic for the same state and seed', () => {
  const state = newGame(400);
  const a = runDay(state, 77).report.pendingEvent;
  const b = runDay(state, 77).report.pendingEvent;
  assert.deepEqual(a, b);
});

test('an offered event does not repeat while other eligible events remain unseen', () => {
  // Run many days so the cadence fires repeatedly, and collect which event
  // ids get offered before any id repeats.
  let state = newGame(500);
  const offeredIds = [];
  for (let i = 0; i < 400 && offeredIds.length < 3; i++) {
    const { state: next, report } = runDay(state, 6000 + i);
    if (report.pendingEvent) {
      assert.ok(!offeredIds.includes(report.pendingEvent.id) || offeredIds.length >= EVENTS.length,
        `repeated ${report.pendingEvent.id} before the pool was exhausted`);
      offeredIds.push(report.pendingEvent.id);
    }
    state = next;
  }
  assert.ok(offeredIds.length >= 2, 'expected at least a couple of events over 400 days');
});

test('applyEventChoice moves money, prestige, turf and goodwill exactly as the choice specifies', () => {
  const event = EVENTS.find((e) => e.id === 'tournament-invite');
  const choice = event.choices[0]; // Host it: money -2500, turf -12, prestige +10, goodwill serious +8 locals -6
  const state = newGame(600);
  const next = applyEventChoice(state, event.id, 0);

  assert.equal(next.money, state.money + choice.effects.money);
  assert.equal(next.prestige, state.prestige + choice.effects.prestige);
  assert.equal(next.turfQuality, state.turfQuality + choice.effects.turf);
  assert.equal(next.goodwill.serious, choice.effects.goodwill.serious);
  assert.equal(next.goodwill.locals, choice.effects.goodwill.locals);
  assert.equal(next.goodwill.destination, 0);
});

test('applyEventChoice does not mutate the state it was given', () => {
  const state = newGame(601);
  const snapshot = JSON.stringify(state);
  applyEventChoice(state, 'tournament-invite', 0);
  assert.equal(JSON.stringify(state), snapshot);
});

test('applyEventChoice clamps prestige and turf to their bounds', () => {
  const event = EVENTS.find((e) => e.id === 'storm-bunker-damage');
  const choice = event.choices[0]; // Full rebuild: turf +8
  const state = newGame(602);
  state.turfQuality = 98;
  state.prestige = 97;
  const next = applyEventChoice(state, event.id, 0);
  assert.ok(next.turfQuality <= 100, `turf exceeded 100: ${next.turfQuality}`);
  assert.ok(next.prestige <= 100, `prestige exceeded 100: ${next.prestige}`);
});

test('applyEventChoice throws on an unknown event id', () => {
  assert.throws(() => applyEventChoice(newGame(603), 'not-a-real-event', 0));
});

test('applyEventChoice throws on an out-of-range choice index', () => {
  assert.throws(() => applyEventChoice(newGame(604), 'tournament-invite', 99));
});

test('ten consecutive days run coherently with goodwill and events wired in', () => {
  let state = newGame(700);
  let eventsOffered = 0;
  for (let i = 0; i < 10; i++) {
    const { state: next, report } = runDay(state, 800 + i);
    state = report.pendingEvent
      ? applyEventChoice(next, report.pendingEvent.id, 0)
      : next;
    if (report.pendingEvent) eventsOffered += 1;
  }
  assert.equal(state.day, 11);
  for (const key of SEGMENT_KEYS) assert.equal(typeof state.goodwill[key], 'number');
  assert.ok(Number.isFinite(state.money));
  assert.ok(state.prestige >= 0 && state.prestige <= 100);
  assert.ok(state.turfQuality >= 0 && state.turfQuality <= 100);
});

test('what the halfway house serves decides how much of a round it gives back', () => {
  assert.ok(halfwayRestoreTo(['draught', 'bottledWater']) < halfwayRestoreTo(['burgerFries', 'draught']),
    'a board of beer should restore less than one with a hot meal on it');
});

test('a sensible halfway house menu lands near the old flat refuel', () => {
  // It was a flat 82 regardless of what was served. Near-neutral for a
  // player who stocks something hot; a real penalty for one who does not.
  const sensible = halfwayRestoreTo(['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries']);
  assert.ok(Math.abs(sensible - 82) <= 6, `sensible menu restores to ${sensible}, expected near 82`);
});

test('the halfway house restore is bounded at both ends', () => {
  assert.ok(halfwayRestoreTo([]) >= 60);
  assert.ok(halfwayRestoreTo(['steakFrites']) <= 88);
});

test('a day reports what food earned and what it cost to serve', () => {
  const { report } = runDay(newGame(11), 3);
  assert.equal(typeof report.revenue.food, 'number');
  assert.ok(report.costs.foodCost >= 0, 'the cost of goods belongs on the report');
  assert.ok(report.kitchen && typeof report.kitchen.load === 'number');
  assert.ok(typeof report.kitchen.capacity === 'number');
  assert.ok(report.kitchen.serviceFactor > 0 && report.kitchen.serviceFactor <= 1);
});

test('an overloaded kitchen makes guests unhappier, not just poorer', () => {
  // Spec §5: service slowing down is felt, not only accounted for. Without
  // this the kitchen is a pure revenue tax and hiring a cook is a spreadsheet
  // decision rather than something the player sees in the complaints.
  function run(staffCooks) {
    let state = newGame(21);
    state.resort.amenities.push({
      type: 'restaurant',
      menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'],
    });
    state.resort.staff = [
      ...state.resort.staff.filter((m) => m.role !== 'kitchenStaff'),
      ...Array.from({ length: staffCooks }, () => ({ role: 'kitchenStaff' })),
    ];
    return runDay(state, 6).report;
  }
  // This board's prep sums to 18 (steakFrites 4 + oysters 3 + lobsterRoll 3
  // + seasonalSalad 2 + clubSandwich 2 + burgerFries 2 + chiliBowl 2).
  // kitchen.js's already-committed capacity is BASE_CAPACITY(3) + cooks x
  // PER_COOK(4), so three cooks only reach 15 and still leave the kitchen
  // overloaded (serviceFactor 0.83, not 1 as the plan's comment assumed) —
  // four cooks are needed to reach 19 >= 18 and actually cover it.
  const starved = run(0);
  const staffed = run(4);
  assert.ok(starved.kitchen.serviceFactor < 1, 'an unstaffed kitchen should be overloaded by that board');
  assert.equal(staffed.kitchen.serviceFactor, 1, 'four cooks should cover it');
  assert.ok(starved.averageSatisfaction < staffed.averageSatisfaction,
    `queueing for food should hurt: ${starved.averageSatisfaction} vs ${staffed.averageSatisfaction}`);
});

test('a kitchen that cannot keep up says so, in words the player gets', () => {
  let state = newGame(22);
  state.resort.amenities.push({
    type: 'restaurant',
    menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'],
  });
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'kitchenStaff');
  const { report } = runDay(state, 7);
  assert.ok(report.complaints.some((c) => /wait|kitchen|food|order/i.test(c)),
    `no complaint mentioned the kitchen: ${JSON.stringify(report.complaints)}`);
});

test('an overloaded kitchen shows up on the report', () => {
  let state = newGame(12);
  state.resort.amenities.push({ type: 'restaurant', menu: ['steakFrites', 'oysters', 'lobsterRoll', 'seasonalSalad', 'clubSandwich', 'burgerFries', 'chiliBowl'] });
  state.resort.staff = state.resort.staff.filter((m) => m.role !== 'kitchenStaff');
  const { report } = runDay(state, 4);
  assert.ok(report.kitchen.load > report.kitchen.capacity, 'that board should overload an unstaffed kitchen');
  assert.ok(report.kitchen.serviceFactor < 1, 'and it should slow service down');
});

test('changing nothing but the menu changes the day', () => {
  // The whole slice in one assertion.
  const a = newGame(13);
  const halfway = { type: 'halfwayHouse', menu: ['hotDog', 'draught', 'candyBar', 'chiliBowl', 'burgerFries'] };
  a.resort.amenities.push(halfway);
  const b = structuredClone(a);
  b.resort.amenities.at(-1).menu = ['oysters', 'lobsterRoll', 'steakFrites', 'wineByGlass', 'seasonalSalad'];
  const ra = runDay(a, 5).report;
  const rb = runDay(b, 5).report;
  assert.notEqual(ra.revenue.food, rb.revenue.food, 'the same course with a different board must earn differently');
});

// --- The beverage cart ------------------------------------------------

test('the cart restores less than the halfway house, whatever is on the board', () => {
  // She costs no time at all. If she could also match a sit-down stop for
  // energy she would simply beat the halfway house and there would be no
  // decision between them.
  for (const menu of [[], ['draught'], ['hotDog'], ['burgerFries'], ['chiliBowl', 'hotDog']]) {
    assert.ok(cartRestoreTo(menu) < halfwayRestoreTo(menu),
      `${menu.join('+') || 'empty'}: cart ${cartRestoreTo(menu)} vs halfway ${halfwayRestoreTo(menu)}`);
  }
});

test('hot food on the cart is worth carrying', () => {
  // The whole reason §7.1 exists. Appeal barely moves when a hot dog joins
  // a cart that already suits locals, so if energy did not move either,
  // putting food on the cart would be pointless.
  const dry = cartRestoreTo(['draught', 'transfusion', 'arnoldPalmer', 'candyBar']);
  const hot = cartRestoreTo(['draught', 'transfusion', 'arnoldPalmer', 'hotDog']);
  // Lower than it was: the cart's ceiling came down when her job became
  // money rather than refreshment. It still has to be worth carrying.
  assert.ok(hot - dry >= 8, `a hot dog added only ${hot - dry} points of energy`);
});

test('a cart costs no time, and a halfway house does', () => {
  const hole = { ...structuredClone(TEMPLATES.straightPar4), id: 1 };
  const group = makeGroup(makeRng(1), { prestige: 40, greenFee: 50, share: { locals: 1, serious: 0, destination: 0 } }, 0);
  const cartGroup = structuredClone(group);
  const stopGroup = structuredClone(group);
  for (const g of [...cartGroup.guests, ...stopGroup.guests]) g.energy = 40;

  const viaCart = playHole(makeRng(2), hole, cartGroup, { carts: false, cartStop: true, cartStopTo: 74 });
  const viaStop = playHole(makeRng(2), hole, stopGroup, { carts: false, refuel: true, refuelTo: 74 });

  assert.ok(viaCart.minutes < viaStop.minutes,
    `the cart should not cost the group time: ${viaCart.minutes} vs ${viaStop.minutes}`);
  assert.equal(
    Math.round(cartGroup.guests[0].energy),
    Math.round(stopGroup.guests[0].energy),
    'both should restore the same energy — only the clock differs'
  );
});

test('the cart reaches a group repeatedly, the halfway house once', () => {
  // Coverage against a stop. She is the amenity that scales with a course,
  // which is what makes her worth running alongside the halfway house
  // rather than instead of it.
  const state = newGame(77);
  state.resort.amenities.push(
    { id: 'cart-t', type: 'beverageCart', menu: ['draught', 'hotDog'] },
    { id: 'hh-t', type: 'halfwayHouse', menu: ['burgerFries', 'draught'] },
  );
  const { timeline } = runDay(state, 3);
  const cartStops = timeline.filter((e) => e.type === 'cartStop').length;
  const refuels = timeline.filter((e) => e.type === 'refuel').length;
  assert.ok(refuels > 0, 'the halfway house should have served somebody');
  assert.ok(cartStops >= refuels,
    `cart stops ${cartStops} should at least match halfway stops ${refuels}`);
});

test('the cart and the halfway house never catch the same group on the same hole', () => {
  // A group that has just sat down for a burger does not need a drink
  // handed to them thirty seconds later, and stacking the two would make
  // the pair look better together than either is apart.
  const state = newGame(78);
  state.resort.amenities.push(
    { id: 'cart-t', type: 'beverageCart', menu: ['draught', 'hotDog'] },
    { id: 'hh-t', type: 'halfwayHouse', menu: ['burgerFries', 'draught'] },
  );
  const { timeline } = runDay(state, 4);
  const at = (type) => new Set(
    timeline.filter((e) => e.type === type).map((e) => `${e.groupIndex}:${e.holeId}`)
  );
  const overlap = [...at('cartStop')].filter((k) => at('refuel').has(k));
  assert.equal(overlap.length, 0, `both served the same group on the same hole: ${overlap.join(', ')}`);
});

test('an empty cart still restores something, but barely', () => {
  assert.equal(cartRestoreTo([]), 48);
  assert.ok(cartRestoreTo(['draught']) > cartRestoreTo([]));
  // And she can never rival sitting down, whatever she carries.
  assert.ok(cartRestoreTo(['burgerFries']) < halfwayRestoreTo(['burgerFries']) - 15,
    'the gap to a seated stop should be wide, not marginal');
});

test('neither the cart nor the halfway house dominates the other', () => {
  // The spec flagged this as the likeliest place for a dominant option to
  // hide, and it was right: at the first-pass numbers the cart beat the
  // halfway house by $3,000-$5,000 over twenty days and the halfway house
  // barely beat building nothing at all.
  //
  // Each is played to its own strength — cooks hired only as the board
  // actually needs, which is the cart's real edge since a drinks-only
  // board needs none. Comparing them with the same staffing measures a
  // kitchen shortage instead of the amenity.
  function season(build, teeInterval) {
    let state = newGame(404);
    state.money = 80000;
    state.resort.pricing.teeInterval = teeInterval;
    if (build) state.resort.amenities.push(build);
    const load = state.resort.amenities.reduce((t, a) => t + menuPrep(a.menu), 0);
    const cooks = Math.max(0, Math.ceil((load - BASE_CAPACITY) / PER_COOK));
    for (let i = 0; i < cooks; i++) state.resort.staff.push({ role: 'kitchenStaff' });
    for (let d = 0; d < 20; d++) state = runDay(state, 4000 + d).state;
    return state.money;
  }
  const halfway = { id: 'h', type: 'halfwayHouse', menu: ['burgerFries', 'draught', 'hotDog', 'chiliBowl', 'candyBar'] };
  const cart = { id: 'c', type: 'beverageCart', menu: ['draught', 'transfusion', 'hotDog', 'breakfastSandwich'] };

  for (const tee of [9, 11, 14]) {
    const none = season(null, tee);
    const h = season(halfway, tee);
    const c = season(cart, tee);
    assert.ok(h > none, `${tee}min: the halfway house must beat building nothing (${h} vs ${none})`);
    assert.ok(c > none, `${tee}min: the cart must beat building nothing (${c} vs ${none})`);
    // Neither may run away with it. Twelve percent over twenty days is
    // the line: a real edge is fine, a foregone conclusion is not.
    const gap = Math.abs(h - c) / Math.min(h, c);
    assert.ok(gap < 0.12,
      `${tee}min: one dominates — halfway ${h}, cart ${c} (${(gap * 100).toFixed(1)}% apart)`);
  }
});

test('on a nine the cart is the better buy, and neither is a trap', () => {
  // The deliberate outcome, not an accident. A nine-hole course does not
  // tire anybody out - golfers finish one with about 30% left - so the
  // halfway house's whole proposition is thin here and the cart's money
  // wins. That flips on an eighteen; see the energy test below.
  function season(build) {
    let state = newGame(404);
    state.money = 80000;
    state.resort.pricing.teeInterval = 11;
    if (build) state.resort.amenities.push(build);
    const load = state.resort.amenities.reduce((t, a) => t + menuPrep(a.menu), 0);
    const cooks = Math.max(0, Math.ceil((load - BASE_CAPACITY) / PER_COOK));
    for (let i = 0; i < cooks; i++) state.resort.staff.push({ role: 'kitchenStaff' });
    for (let d = 0; d < 20; d++) state = runDay(state, 4000 + d).state;
    return state.money;
  }
  const none = season(null);
  const halfway = season({ id: 'h', type: 'halfwayHouse', menu: ['burgerFries', 'draught', 'hotDog', 'chiliBowl', 'candyBar'] });
  const cart = season({ id: 'c', type: 'beverageCart', menu: ['draught', 'transfusion', 'hotDog', 'breakfastSandwich'] });

  assert.ok(halfway > none, `the halfway house must still beat nothing (${halfway} vs ${none})`);
  assert.ok(cart > halfway, `on a nine the cart should out-earn the halfway house (${cart} vs ${halfway})`);
  assert.ok((cart - halfway) / halfway < 0.12,
    `but not run away with it: ${((cart - halfway) / halfway * 100).toFixed(1)}% apart`);
});

test('a halfway house pays for itself on eighteen holes and not on nine', () => {
  // The mechanism behind the whole halfway-house-versus-cart question, and
  // the reason the nine-hole answer is allowed to be "not really".
  //
  // Golfers finish a nine on about 30% energy: they do not need feeding,
  // so a stop costs more time than the restore saves. Over eighteen they
  // are flat by the fourteenth and crawl the rest, so the same stop wins
  // several minutes back. This is what gives the back nine in a later act
  // something to change besides the hole count.
  const built = newGame(1).resort.courses[0].holes
    .filter((h) => h.corridor && h.corridor.length > 1);

  function walk(holeCount, refuelAt) {
    resetGuestIds();
    const group = makeGroup(
      makeRng(7), { prestige: 40, greenFee: 50, share: { locals: 1, serious: 0, destination: 0 } }, 0
    );
    let minutes = 0;
    for (let i = 0; i < holeCount; i++) {
      const hole = { ...structuredClone(built[i % built.length]), id: i + 1 };
      minutes += playHole(makeRng(100 + i), hole, group, {
        carts: false, refuel: refuelAt === i, refuelTo: 88,
      }).minutes;
    }
    return { minutes, energy: group.guests.reduce((a, g) => a + g.energy, 0) / group.guests.length };
  }

  const nineAlone = walk(9, null);
  const nineFed = walk(9, 3);
  const eighteenAlone = walk(18, null);
  const eighteenFed = walk(18, 8);

  assert.ok(nineAlone.energy > 20,
    `golfers should finish a nine with something left, got ${nineAlone.energy.toFixed(0)}`);
  assert.ok(eighteenAlone.energy < 5,
    `golfers should be empty by the end of an eighteen, got ${eighteenAlone.energy.toFixed(0)}`);

  const savedOnNine = nineAlone.minutes - nineFed.minutes;
  const savedOnEighteen = eighteenAlone.minutes - eighteenFed.minutes;
  assert.ok(savedOnNine < 1,
    `a stop should not pay on a nine, saved ${savedOnNine.toFixed(1)} minutes`);
  assert.ok(savedOnEighteen > 4,
    `a stop should clearly pay on an eighteen, saved only ${savedOnEighteen.toFixed(1)} minutes`);
});
