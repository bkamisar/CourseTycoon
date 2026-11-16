import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METER, newSwing, tapSwing, tickSwing, cursorAt, idealTaps } from '../src/play/swingMeter.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

/** How long the cursor takes to cross `bar` of the bar. Every instant
 * below is written with this, so retuning METER.SPEED changes how the
 * meter feels without changing what any of these tests say about it. */
const ms = (bar) => bar / METER.SPEED;

test('three taps make a swing: start, power, strike', () => {
  let s = tapSwing(newSwing(), 1000);
  assert.equal(s.phase, 'rising');
  s = tapSwing(s, 1000 + ms(0.8));
  assert.equal(s.phase, 'falling');
  near(s.power, 0.8);
  s = tapSwing(s, 1000 + ms(0.8) + ms(0.8));
  assert.equal(s.phase, 'done');
  near(s.power, 0.8);
  assert.equal(s.accuracy, 0);
  assert.equal(s.perfect, true);
});

test('the cursor climbs at METER.SPEED and runs back down from the power tap', () => {
  let s = tapSwing(newSwing(), 0);
  near(cursorAt(s, ms(0.25)), 0.25);
  near(cursorAt(s, 100), 100 * METER.SPEED);
  s = tapSwing(s, ms(0.9));
  near(cursorAt(s, ms(0.9)), 0.9);
  near(cursorAt(s, ms(0.9) + ms(0.4)), 0.5);
});

test('an early strike goes right (+), a late one left (-), scaled by ACC_WINDOW', () => {
  const rising = tapSwing(tapSwing(newSwing(), 0), ms(1)); // power 1.0, line reached at ms(2)
  const early = tapSwing(rising, ms(2) - ms(0.04));
  near(early.accuracy, 0.04 / METER.ACC_WINDOW);
  assert.equal(early.perfect, false);
  const late = tapSwing(rising, ms(2) + ms(0.04));
  near(late.accuracy, -0.04 / METER.ACC_WINDOW);
});

test('a strike far too early is the worst miss, not worse than the worst', () => {
  const rising = tapSwing(tapSwing(newSwing(), 0), ms(1));
  assert.equal(tapSwing(rising, ms(1.2)).accuracy, 1);
});

test('inside the PERFECT band the strike is exactly straight', () => {
  const rising = tapSwing(tapSwing(newSwing(), 0), ms(1));
  const s = tapSwing(rising, ms(2) + ms(METER.PERFECT * 0.8));
  assert.equal(s.accuracy, 0);
  assert.equal(s.perfect, true);
  assert.equal(tapSwing(rising, ms(2) + ms(METER.PERFECT * 1.6)).perfect, false);
});

test('left alone, the bar tops out as a full overswing and turns round by itself', () => {
  const toppedAt = METER.MAX / METER.SPEED;
  const s = tickSwing(tapSwing(newSwing(), 0), toppedAt + 5);
  assert.equal(s.phase, 'falling');
  assert.equal(s.power, METER.MAX);
  // Turned at the instant it topped out, not at the late frame that noticed.
  near(cursorAt(s, toppedAt + 5), METER.MAX - 5 * METER.SPEED);
});

test('never striking at all is a full late miss', () => {
  const rising = tapSwing(tapSwing(newSwing(), 0), ms(0.5));
  const s = tickSwing(rising, ms(0.5) + ms(0.7));
  assert.equal(s.phase, 'done');
  assert.equal(s.accuracy, -1);
  near(s.power, 0.5);
});

test('a tap that arrives after the swing ran out does not rescue it', () => {
  const rising = tapSwing(tapSwing(newSwing(), 0), ms(0.5));
  assert.equal(tapSwing(rising, ms(5)).accuracy, -1);
});

test('the softest accepted swing still has some power', () => {
  const s = tapSwing(tapSwing(newSwing(), 0), 1);
  assert.equal(s.power, METER.MIN_POWER);
});

test('a finished swing ignores further taps', () => {
  const done = tapSwing(tapSwing(tapSwing(newSwing(), 0), ms(0.8)), ms(1.6));
  assert.deepEqual(tapSwing(done, ms(9)), done);
});

test('idealTaps names the instants a perfect player taps', () => {
  const { powerAt, strikeAt } = idealTaps(0.9);
  let s = tapSwing(newSwing(), 0);
  s = tapSwing(s, powerAt);
  s = tapSwing(s, strikeAt);
  near(s.power, 0.9);
  assert.equal(s.accuracy, 0);
});
