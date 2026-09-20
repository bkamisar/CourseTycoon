import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  interpolateAt,
  groupCourseKeyframes,
  groupCourseProgressAt,
  guestBallKeyframes,
  guestBallPositionAt,
} from '../src/play/interpolate.js';

// --- interpolateAt: the generic keyframe interpolator ----------------------

test('interpolateAt: a position between two keyframes falls between their positions', () => {
  const kf = [{ minute: 0, x: 0, y: 0 }, { minute: 10, x: 100, y: 50 }];
  const pos = interpolateAt(kf, 5, ['x', 'y']);
  assert.equal(pos.x, 50);
  assert.equal(pos.y, 25);
});

test('interpolateAt: exactly on a keyframe returns that keyframe', () => {
  const kf = [{ minute: 0, x: 0, y: 0 }, { minute: 10, x: 100, y: 50 }];
  assert.deepEqual(interpolateAt(kf, 10, ['x', 'y']), { x: 100, y: 50 });
  assert.deepEqual(interpolateAt(kf, 0, ['x', 'y']), { x: 0, y: 0 });
});

test('interpolateAt: before the first keyframe yields no position at all', () => {
  const kf = [{ minute: 10, x: 0, y: 0 }, { minute: 20, x: 10, y: 10 }];
  assert.equal(interpolateAt(kf, 5, ['x', 'y']), null);
});

test('interpolateAt: after the last keyframe yields no position at all', () => {
  const kf = [{ minute: 10, x: 0, y: 0 }, { minute: 20, x: 10, y: 10 }];
  assert.equal(interpolateAt(kf, 25, ['x', 'y']), null);
});

test('interpolateAt: an empty keyframe list yields no position', () => {
  assert.equal(interpolateAt([], 5, ['x', 'y']), null);
});

test('interpolateAt: interpolates across the correct pair among several keyframes', () => {
  const kf = [
    { minute: 0, x: 0 },
    { minute: 10, x: 10 },
    { minute: 20, x: 40 },
  ];
  assert.equal(interpolateAt(kf, 15, ['x']).x, 25);
});

// --- group course progress: token-level playback ---------------------------
//
// Real event shapes, trimmed to what buildTimeline actually stamps (see
// src/sim/day.js#buildTimeline): teeOff and finish carry no holeId; every
// other event carries { holeId, groupIndex }. holes[i].id need not equal i.

const holes = [{ id: 1 }, { id: 2 }, { id: 3 }];

function fakeTimeline() {
  return [
    { minute: 420, type: 'teeOff', groupIndex: 0 },
    { minute: 430, type: 'shot', holeId: 1, groupIndex: 0 },
    { minute: 435, type: 'holed', holeId: 1, groupIndex: 0 },
    { minute: 445, type: 'shot', holeId: 2, groupIndex: 0 },
    { minute: 450, type: 'holed', holeId: 2, groupIndex: 0 },
    { minute: 460, type: 'shot', holeId: 3, groupIndex: 0 },
    { minute: 465, type: 'holed', holeId: 3, groupIndex: 0 },
    { minute: 470, type: 'finish', groupIndex: 0 },
  ];
}

test('groupCourseKeyframes: one keyframe at tee-off, one per hole entered, one at finish', () => {
  const kf = groupCourseKeyframes(fakeTimeline(), 0, holes);
  assert.deepEqual(
    kf.map((k) => [k.minute, k.holeIndex]),
    [[420, 0], [430, 0], [445, 1], [460, 2], [470, 3]]
  );
});

test('a group’s course position at a minute between two of its events falls between those events’ hole positions', () => {
  const timeline = fakeTimeline();
  // Halfway (by time) between the hole-2 keyframe (445, index 1) and the
  // hole-3 keyframe (460, index 2) must fall strictly between 1 and 2.
  const p = groupCourseProgressAt(timeline, 0, holes, 452.5);
  assert.ok(p > 1 && p < 2, `expected progress strictly between 1 and 2, got ${p}`);
  assert.ok(Math.abs(p - 1.5) < 1e-9);
});

test('a minute before tee-off yields no position at all', () => {
  const timeline = fakeTimeline();
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 419), null);
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 419.999), null);
});

test('a minute after finish yields no position at all', () => {
  const timeline = fakeTimeline();
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 470.001), null);
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 600), null);
});

test('at the exact tee-off minute the group is on course, at the first hole', () => {
  const timeline = fakeTimeline();
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 420), 0);
});

test('at the exact finish minute the group is still resolvable (last instant on course)', () => {
  const timeline = fakeTimeline();
  assert.equal(groupCourseProgressAt(timeline, 0, holes, 470), 3);
});

test('progress never goes backwards across the day', () => {
  const timeline = fakeTimeline();
  const minutes = [420, 423, 429, 430, 438, 445, 448, 455, 460, 463, 468, 470];
  let prev = -Infinity;
  for (const m of minutes) {
    const p = groupCourseProgressAt(timeline, 0, holes, m);
    assert.ok(p >= prev, `progress went backwards at minute ${m}: ${p} < ${prev}`);
    prev = p;
  }
});

test('an unknown group index yields no position', () => {
  const timeline = fakeTimeline();
  assert.equal(groupCourseProgressAt(timeline, 5, holes, 440), null);
});

// --- single-guest ball flight: the zoomed single-hole view -----------------

test('guestBallPositionAt interpolates a ball between two shots, before holing out', () => {
  const timeline = [
    { minute: 100, type: 'teeOff', groupIndex: 0 },
    {
      minute: 110, type: 'shot', holeId: 1, groupIndex: 0, guestId: 7,
      from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, lie: 'fairway',
    },
    {
      minute: 114, type: 'shot', holeId: 1, groupIndex: 0, guestId: 7,
      from: { x: 200, y: 0 }, to: { x: 380, y: 10 }, lie: 'green',
    },
    { minute: 116, type: 'holed', holeId: 1, groupIndex: 0, guestId: 7, strokes: 2, putts: 1 },
  ];
  const pos = guestBallPositionAt(timeline, 0, 7, 1, 112);
  assert.ok(Math.abs(pos.x - 290) < 1e-9, `x: ${pos.x}`);
  assert.ok(Math.abs(pos.y - 5) < 1e-9, `y: ${pos.y}`);
});

test('guestBallPositionAt yields nothing before the first shot and after the last', () => {
  const timeline = [
    {
      minute: 110, type: 'shot', holeId: 1, groupIndex: 0, guestId: 7,
      from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, lie: 'fairway',
    },
  ];
  assert.equal(guestBallPositionAt(timeline, 0, 7, 1, 109), null);
  assert.equal(guestBallPositionAt(timeline, 0, 7, 1, 111), null);
});

test('guestBallKeyframes ignores other guests, groups and holes', () => {
  const timeline = [
    { minute: 10, type: 'shot', holeId: 1, groupIndex: 0, guestId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    { minute: 10, type: 'shot', holeId: 1, groupIndex: 0, guestId: 2, from: { x: 9, y: 9 }, to: { x: 8, y: 8 } },
    { minute: 10, type: 'shot', holeId: 2, groupIndex: 0, guestId: 1, from: { x: 5, y: 5 }, to: { x: 6, y: 6 } },
    { minute: 10, type: 'shot', holeId: 1, groupIndex: 1, guestId: 1, from: { x: 7, y: 7 }, to: { x: 3, y: 3 } },
  ];
  const kf = guestBallKeyframes(timeline, 0, 1, 1);
  for (const k of kf) {
    assert.ok((k.x === 0 && k.y === 0) || (k.x === 1 && k.y === 1), `unexpected keyframe ${JSON.stringify(k)}`);
  }
});
