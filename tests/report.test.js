import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, openHoles } from '../src/sim/state.js';
import { runDay } from '../src/sim/day.js';
import { computeReportData, paceVerdict, crowdRows } from '../src/ui/report.js';
import { ordinal } from '../src/sim/satisfaction.js';
import { TARGET_MINUTES_PER_HOLE } from '../src/sim/schedule.js';
import { SEGMENT_KEYS, SEGMENTS } from '../src/sim/segments.js';

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

test('the target round time is 16 minutes times however many holes are open', () => {
  const { state, report } = runDay(newGame(9), 1);
  const data = computeReportData(state, report);
  assert.equal(data.targetRoundMinutes, openHoles(state).length * TARGET_MINUTES_PER_HOLE);
  // Sanity: the starting resort has exactly 3 open holes.
  assert.equal(data.targetRoundMinutes, 3 * TARGET_MINUTES_PER_HOLE);
});

test('a round inside its target reads as on pace', () => {
  const r = paceVerdict({ avgMinutes: 44, targetMinutes: 48, hadWaits: false });
  assert.equal(r.kind, 'onPace');
});

test('over target with waiting is a backup, and points at the tee interval', () => {
  const r = paceVerdict({ avgMinutes: 210, targetMinutes: 144, hadWaits: true });
  assert.equal(r.kind, 'backedUp');
  assert.match(r.verdict, /tee interval/i);
});

test('over target with nobody waiting blames the holes, not a queue', () => {
  // The bug this covers: the report said "groups are backing up" on the same
  // screen as "nobody waited on anybody today". Long punishing holes exceed
  // the target with no queue at all, and the fix is the opposite one.
  const r = paceVerdict({ avgMinutes: 210, targetMinutes: 144, hadWaits: false });
  assert.equal(r.kind, 'slowHoles');
  assert.doesNotMatch(r.verdict, /backing up/i);
});

// --- Task 8: the crowd section -----------------------------------------

test('crowdRows reads count and satisfaction straight from report.crowd, and covers every segment', () => {
  const { report } = runDay(newGame(20), 1);
  const rows = crowdRows(report, null);
  assert.equal(rows.length, SEGMENT_KEYS.length);
  const total = SEGMENT_KEYS.reduce((s, key) => s + report.crowd[key].count, 0);
  for (const key of SEGMENT_KEYS) {
    const row = rows.find((r) => r.key === key);
    assert.ok(row, `missing crowd row for ${key}`);
    assert.equal(row.label, SEGMENTS[key].label);
    assert.equal(row.count, report.crowd[key].count);
    assert.equal(row.satisfaction, report.crowd[key].averageSatisfaction);
    const expectedShare = total > 0 ? report.crowd[key].count / total : 0;
    assert.ok(Math.abs(row.share - expectedShare) < 1e-9);
  }
});

test('crowd shares sum to 1 when anybody came at all', () => {
  const { report } = runDay(newGame(21), 1);
  const rows = crowdRows(report, null);
  const totalShare = rows.reduce((s, r) => s + r.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-9, `shares summed to ${totalShare}`);
});

test('with no previous day, every crowd row has no delta to show', () => {
  const { report } = runDay(newGame(22), 1);
  const rows = crowdRows(report, null);
  for (const row of rows) {
    assert.equal(row.shareDelta, null);
    assert.equal(row.satisfactionDelta, null);
  }
});

test('a segment nobody visited reads as absent, not as zero satisfaction', () => {
  // Built directly rather than hunting for a seed that draws nobody from a
  // segment: crowdRows only ever looks at report.crowd, so a synthetic
  // report exercises the same code the real one does.
  const report = {
    crowd: {
      locals: { count: 20, averageSatisfaction: 61 },
      serious: { count: 0, averageSatisfaction: null },
      destination: { count: 5, averageSatisfaction: 74 },
    },
  };
  const rows = crowdRows(report, null);
  const serious = rows.find((r) => r.key === 'serious');
  assert.equal(serious.count, 0);
  assert.equal(serious.satisfaction, null, 'an absent segment must not report a satisfaction figure');
  assert.equal(serious.share, 0, 'a genuine zero share is fine -- it is satisfaction that must not be faked');
  assert.equal(serious.satisfactionDelta, null);
});

test('crowdRows measures the change since yesterday from the previous report\'s crowd', () => {
  const yesterday = {
    crowd: {
      locals: { count: 30, averageSatisfaction: 70 },
      serious: { count: 10, averageSatisfaction: 40 },
      destination: { count: 0, averageSatisfaction: null },
    },
  };
  const today = {
    crowd: {
      locals: { count: 20, averageSatisfaction: 60 },
      serious: { count: 20, averageSatisfaction: 55 },
      destination: { count: 0, averageSatisfaction: null },
    },
  };
  const rows = crowdRows(today, yesterday);

  const locals = rows.find((r) => r.key === 'locals');
  // Yesterday: 30/40 = 75% locals. Today: 20/40 = 50% locals. Down 25pp.
  assert.ok(Math.abs(locals.shareDelta - (-0.25)) < 1e-9, `locals shareDelta ${locals.shareDelta}`);
  assert.ok(Math.abs(locals.satisfactionDelta - (-10)) < 1e-9);

  const serious = rows.find((r) => r.key === 'serious');
  // Yesterday: 10/40 = 25% serious. Today: 20/40 = 50% serious. Up 25pp --
  // the locals-to-serious drift a player most needs to be able to read.
  assert.ok(Math.abs(serious.shareDelta - 0.25) < 1e-9, `serious shareDelta ${serious.shareDelta}`);
  assert.ok(Math.abs(serious.satisfactionDelta - 15) < 1e-9);

  const destination = rows.find((r) => r.key === 'destination');
  assert.equal(destination.satisfaction, null);
  assert.equal(destination.satisfactionDelta, null);
  assert.equal(destination.shareDelta, 0, 'absent both days is no change, not "New"');
});

test('computeReportData wires the crowd rows in, matching crowdRows directly', () => {
  let state = newGame(23);
  ({ state } = runDay(state, 1));
  const day2 = runDay(state, 2);
  const data = computeReportData(day2.state, day2.report);
  const previous = day2.state.history[day2.state.history.length - 2];
  assert.deepEqual(data.crowd, crowdRows(day2.report, previous));
});

// --- Act III ----------------------------------------------------------

test('a championship day puts the tournament on the report', () => {
  const { state, report } = runDay(newGame(71), 71);
  report.tournament = {
    rung: 'countyOpen',
    met: ['band', 'turf'],
    missed: ['pace', 'crowd'],
    paid: 61000, prestige: 4, barDays: 0,
    setup: 52, band: { low: 45, high: 60 }, turfQuality: 88,
    field: {
      averageToPar: 5.4, underPar: 2, best: -2, worst: 14,
      hardestHole: 14, hardestHoleOverPar: 1.4,
      averageRoundMinutes: 268, players: 60, par: 72,
    },
  };
  const data = computeReportData(state, report);
  assert.ok(data.tournament, 'the report must carry the championship');
  assert.equal(data.tournament.paid, 61000, 'read from the report, not recomputed');
  assert.equal(data.tournament.conditions.length, 4, 'all four named, met or not');
  assert.equal(data.tournament.field.averageToPar, 5.4);
});

test('an ordinary day has no tournament section', () => {
  const { state, report } = runDay(newGame(72), 72);
  const data = computeReportData(state, report);
  assert.equal(data.tournament ?? null, null);
});

test('the report distinguishes a condition earned from one that paid', () => {
  // Band gates the rest. A section showing turf as simply "missed" when
  // the player held it at 94 would be the interface disagreeing with the
  // simulation; showing it as paid would disagree with the bank.
  const { state, report } = runDay(newGame(73), 73);
  report.tournament = {
    rung: 'countyOpen',
    met: ['turf', 'pace', 'crowd'],
    missed: ['band'],
    paid: 18000, prestige: 2, barDays: 0,
    setup: 12, band: { low: 45, high: 60 }, turfQuality: 94,
    field: {
      averageToPar: 1.1, underPar: 17, best: -8, worst: 9,
      hardestHole: 2, hardestHoleOverPar: 0.6,
      averageRoundMinutes: 241, players: 60, par: 72,
    },
  };
  const data = computeReportData(state, report);
  const turf = data.tournament.conditions.find((c) => c.id === 'turf');
  assert.equal(turf.met, true, 'the turf was held');
  assert.equal(turf.paid, false, 'and it paid nothing, because the band was missed');
  assert.equal(data.tournament.conditions.filter((c) => c.paid).length, 0);
});
