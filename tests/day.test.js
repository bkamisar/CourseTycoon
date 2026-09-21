import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay, marshalPaceFactor, applyEventChoice } from '../src/sim/day.js';
import { SEGMENT_KEYS } from '../src/sim/segments.js';
import { emptyGoodwill, applyGoodwill } from '../src/sim/goodwill.js';
import { EVENTS } from '../src/sim/events.js';

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
  }
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
