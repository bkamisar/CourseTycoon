import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/play/clock.js';

// The playing day runs 420 (7:00am) to 1080 (6:00pm), per src/sim/day.js.

test('a fresh clock starts at dayStart, paused, not finished', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080 });
  assert.equal(clock.minute, 420);
  assert.equal(clock.playing, false);
  assert.equal(clock.finished, false);
});

test('advancing while paused does not move the clock', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080, minutesPerSecond: 6 });
  clock.advance(5000);
  assert.equal(clock.minute, 420);
});

test('play() then advance() maps elapsed wall time to simulated minutes at the given speed', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080, speed: 1, minutesPerSecond: 6 });
  clock.play();
  clock.advance(1000); // 1 real second at 1x, 6 sim-minutes/sec
  assert.equal(clock.minute, 426);
  clock.advance(500);
  assert.equal(clock.minute, 429);
});

test('a faster speed advances the clock proportionally more per wall-clock ms', () => {
  const a = createClock({ dayStart: 420, dayEnd: 1080, speed: 1, minutesPerSecond: 6 });
  const b = createClock({ dayStart: 420, dayEnd: 1080, speed: 4, minutesPerSecond: 6 });
  a.play();
  b.play();
  a.advance(1000);
  b.advance(1000);
  assert.equal(a.minute, 426);
  assert.equal(b.minute, 444); // 4x the minutes for the same wall time
});

test('changing speed mid-playback does not itself move the clock, and does not jump simulated time', () => {
  // The clock must accumulate elapsed simulated minutes as it goes, never
  // recompute "minute" from (total elapsed wall time) x (current speed) --
  // that would retroactively apply the new speed to time already played
  // back at the old one.
  const clock = createClock({ dayStart: 420, dayEnd: 1080, speed: 1, minutesPerSecond: 6 });
  clock.play();
  clock.advance(1000); // +6 min at 1x -> 426
  assert.equal(clock.minute, 426);

  clock.setSpeed(4); // must not, by itself, change the minute
  assert.equal(clock.minute, 426, 'setSpeed alone must not move the clock');

  clock.advance(1000); // +24 min at 4x -> 450
  assert.equal(clock.minute, 450);

  // A naive implementation tracking total elapsed wall time (2000ms) and
  // recomputing from the CURRENT speed would land on
  // 420 + 2000 * 4 * 6 / 1000 = 468 instead -- 18 minutes fast.
  assert.notEqual(clock.minute, 468);
});

test('pausing stops accumulation; resuming continues from where it left off, not from the start', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080, speed: 1, minutesPerSecond: 6 });
  clock.play();
  clock.advance(1000); // -> 426
  clock.pause();
  clock.advance(10000); // ignored while paused
  assert.equal(clock.minute, 426);
  clock.play();
  clock.advance(1000); // -> 432, continuing, not restarting at dayStart
  assert.equal(clock.minute, 432);
});

test('the clock clamps at the end of the day and further advances have no further effect', () => {
  const clock = createClock({ dayStart: 1070, dayEnd: 1080, speed: 1, minutesPerSecond: 60 });
  clock.play();
  clock.advance(1_000_000); // wildly overshoots
  assert.equal(clock.minute, 1080);
  assert.equal(clock.finished, true);
  clock.advance(1000);
  assert.equal(clock.minute, 1080);
});

test('skip() moves straight to the final minute -- jumping a recording, not cancelling anything', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080 });
  clock.skip();
  assert.equal(clock.minute, 1080);
  assert.equal(clock.finished, true);
});

test('skip() works even when never played', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080, speed: 1 });
  assert.equal(clock.playing, false);
  clock.skip();
  assert.equal(clock.minute, 1080);
});

test('reset() returns the clock to dayStart, paused', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080, minutesPerSecond: 6 });
  clock.play();
  clock.advance(1000);
  clock.reset();
  assert.equal(clock.minute, 420);
  assert.equal(clock.playing, false);
});

test('default speeds are the documented 1x / 4x / 16x set', () => {
  const clock = createClock({ dayStart: 420, dayEnd: 1080 });
  assert.deepEqual(clock.speeds, [1, 4, 16]);
});
