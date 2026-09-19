import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleRounds } from '../src/sim/schedule.js';

/** Nine holes that each take a fixed time, for arithmetic we can check by hand. */
const flat = (minutes) => Array.from({ length: 9 }, () => minutes);

test('a single group is never delayed', () => {
  const r = scheduleRounds({ groupCount: 1, teeInterval: 10, holeMinutes: flat(12), dayStart: 420 });
  assert.equal(r.rounds[0].waitMinutes, 0);
  assert.equal(r.rounds[0].startMinute, 420);
  assert.equal(r.rounds[0].finishMinute, 420 + 9 * 12);
});

test('a generous tee interval produces no waiting', () => {
  const r = scheduleRounds({ groupCount: 6, teeInterval: 15, holeMinutes: flat(12), dayStart: 420 });
  for (const round of r.rounds) assert.equal(round.waitMinutes, 0);
});

test('a tight tee interval backs the course up', () => {
  const r = scheduleRounds({ groupCount: 6, teeInterval: 6, holeMinutes: flat(14), dayStart: 420 });
  assert.equal(r.rounds[0].waitMinutes, 0, 'the first group never waits');
  assert.ok(r.rounds[5].waitMinutes > 20, `last group waited ${r.rounds[5].waitMinutes}`);
});

test('waiting grows monotonically down the field', () => {
  const r = scheduleRounds({ groupCount: 8, teeInterval: 7, holeMinutes: flat(13), dayStart: 420 });
  for (let i = 1; i < r.rounds.length; i++) {
    assert.ok(
      r.rounds[i].waitMinutes >= r.rounds[i - 1].waitMinutes,
      `group ${i} waited less than group ${i - 1}`
    );
  }
});

test('one slow hole is identified as the bottleneck', () => {
  const holes = flat(10);
  holes[3] = 26; // the 4th takes forever
  const r = scheduleRounds({ groupCount: 8, teeInterval: 10, holeMinutes: holes, dayStart: 420 });
  assert.equal(r.bottleneckHoleIndex, 3);
});

test('no bottleneck is reported when nothing queues', () => {
  const r = scheduleRounds({ groupCount: 3, teeInterval: 20, holeMinutes: flat(10), dayStart: 420 });
  assert.equal(r.bottleneckHoleIndex, null);
});

test('groups finishing after the day ends are reported', () => {
  // With teeInterval (8) < holeMinutes (16), the queue saturates almost
  // immediately and each group's finish time grows by exactly one hole's
  // playing time (16 min) per additional group: finish(g) = dayStart +
  // holeMinutes * (holeCount + g). Over a 420-1080 (7am-6pm) day that needs
  // at least 34 groups before the last one crosses dayEnd; groupCount: 30
  // (as originally specified) never overruns, so this uses 40 for margin.
  const r = scheduleRounds({
    groupCount: 40, teeInterval: 8, holeMinutes: flat(16), dayStart: 420, dayEnd: 1080,
  });
  assert.ok(r.overrunGroups > 0);
});

test('average round time reflects waiting', () => {
  const quick = scheduleRounds({ groupCount: 6, teeInterval: 18, holeMinutes: flat(12), dayStart: 420 });
  const jammed = scheduleRounds({ groupCount: 6, teeInterval: 5, holeMinutes: flat(12), dayStart: 420 });
  assert.ok(jammed.averageRoundMinutes > quick.averageRoundMinutes);
});

test('per-hole waits are recorded so complaints can name a hole', () => {
  const holes = flat(10);
  holes[6] = 24;
  const r = scheduleRounds({ groupCount: 8, teeInterval: 10, holeMinutes: holes, dayStart: 420 });
  const lastGroup = r.rounds[r.rounds.length - 1];
  assert.equal(lastGroup.waitByHole.length, 9);
  assert.ok(lastGroup.waitByHole[6] > 0);
});
