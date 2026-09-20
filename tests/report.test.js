import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { computeReportData } from '../src/ui/report.js';
import { ordinal } from '../src/sim/satisfaction.js';

test('computeReportData reads profit and the revenue/cost breakdown straight from the report', () => {
  const { state, report } = runDay(newGame(1), 1);
  const data = computeReportData(state, report);
  assert.equal(data.profit, report.profit);
  assert.deepEqual(data.revenue, report.revenue);
  assert.deepEqual(data.costs, report.costs);
});

test('on day one there is no previous day, so ratings show no movement', () => {
  const { state, report } = runDay(newGame(2), 1);
  const data = computeReportData(state, report);
  assert.equal(state.history.length, 1, 'sanity: day one has exactly one history entry');
  for (const rating of data.ratings) {
    assert.equal(rating.delta, null, `${rating.label} should have no delta on day one`);
  }
});

test('on day two, rating movement is measured against state.history[length - 2]', () => {
  let state = newGame(3);
  ({ state } = runDay(state, 1));
  const day2 = runDay(state, 2);
  const data = computeReportData(day2.state, day2.report);

  const previous = day2.state.history[day2.state.history.length - 2];
  // runDay clones the state it's given (see src/sim/day.js), so this is a
  // deep-equality check, not an object-identity one -- the report itself
  // is unchanged, just a different clone of it.
  assert.deepEqual(previous, state.history[state.history.length - 1], 'sanity: that is indeed yesterday\'s report');

  const cr = data.ratings.find((r) => r.key === 'courseRating');
  assert.ok(Math.abs(cr.delta - (day2.report.courseRating - previous.courseRating)) < 1e-9);
  const prestige = data.ratings.find((r) => r.key === 'prestige');
  assert.ok(Math.abs(prestige.delta - (day2.report.prestige - previous.prestige)) < 1e-9);
  const turf = data.ratings.find((r) => r.key === 'turfQuality');
  assert.ok(Math.abs(turf.delta - (day2.report.turfQuality - previous.turfQuality)) < 1e-9);
});

test('the bottleneck hole is named with its 1-based ordinal when there is one', () => {
  const { state, report } = runDay(newGame(4), 1);
  const data = computeReportData(state, report);
  if (report.bottleneckHoleIndex === null) {
    assert.equal(data.bottleneckHoleName, null);
  } else {
    assert.equal(data.bottleneckHoleName, ordinal(report.bottleneckHoleIndex + 1));
  }
});

test('a resort with no waiting at all names no bottleneck', () => {
  // No open holes -> no groups -> no wait -> bottleneckHoleIndex is null.
  const state = newGame(5);
  for (const h of state.resort.courses[0].holes) h.open = false;
  const { state: next, report } = runDay(state, 1);
  assert.equal(report.bottleneckHoleIndex, null);
  const data = computeReportData(next, report);
  assert.equal(data.bottleneckHoleName, null);
});

test('complaints pass through verbatim, in the guests\' own words', () => {
  const { state, report } = runDay(newGame(6), 1);
  const data = computeReportData(state, report);
  assert.deepEqual(data.complaints, report.complaints);
});

test('gate checklist lists every condition with its met/unmet state, from report.gate.conditions', () => {
  const { state, report } = runDay(newGame(7), 1);
  const data = computeReportData(state, report);
  assert.equal(data.gate.items.length, report.gate.conditions.length);
  for (let i = 0; i < data.gate.items.length; i++) {
    assert.equal(data.gate.items[i].label, report.gate.conditions[i].label);
    assert.equal(data.gate.items[i].met, report.gate.conditions[i].met);
  }
  assert.deepEqual(data.gate.outstanding, report.gate.outstanding);
  assert.equal(data.gate.passed, report.gate.passed);
});

test('average round minutes is read straight from the report, never recomputed', () => {
  const { state, report } = runDay(newGame(8), 1);
  const data = computeReportData(state, report);
  assert.equal(data.averageRoundMinutes, report.averageRoundMinutes);
});
