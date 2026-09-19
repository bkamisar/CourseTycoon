import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';

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
    'averageSatisfaction', 'averageRoundMinutes', 'courseRating', 'prestige',
    'complaints', 'gate']) {
    assert.ok(key in report, `report missing: ${key}`);
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
